/**
 * SQLite DDL, executed idempotently on every app startup via db.exec().
 * SQLite has no native boolean/enum type: booleans are stored as 0/1
 * INTEGER, and "enum-like" fields (profession, category, region, ...) are
 * stored as TEXT and validated at the application boundary (shared/types.ts)
 * rather than with a CHECK constraint, so new professions/categories don't
 * require a migration.
 */
export const SCHEMA_SQL = /* sql */ `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS items (
  id                    INTEGER PRIMARY KEY,
  name                  TEXT NOT NULL,
  quality               INTEGER NOT NULL DEFAULT 1,
  icon                  TEXT,
  item_level            INTEGER,
  vendor_price          INTEGER,
  category              TEXT NOT NULL DEFAULT 'other',
  is_boe                INTEGER NOT NULL DEFAULT 0,
  gathering_profession  TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_gathering_profession ON items(gathering_profession);

CREATE TABLE IF NOT EXISTS recipes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  profession        TEXT NOT NULL,
  name              TEXT NOT NULL,
  result_item_id    INTEGER NOT NULL REFERENCES items(id),
  result_quantity   INTEGER NOT NULL DEFAULT 1,
  skill_level_req   INTEGER NOT NULL DEFAULT 1,
  source            TEXT NOT NULL DEFAULT 'trainer'
);
CREATE INDEX IF NOT EXISTS idx_recipes_profession ON recipes(profession);
CREATE INDEX IF NOT EXISTS idx_recipes_result_item ON recipes(result_item_id);

CREATE TABLE IF NOT EXISTS recipe_reagents (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id   INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES items(id),
  quantity    INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_recipe_reagents_recipe ON recipe_reagents(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_reagents_item ON recipe_reagents(item_id);

CREATE TABLE IF NOT EXISTS ah_snapshots (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  connected_realm_id    INTEGER NOT NULL,
  region                TEXT NOT NULL,
  fetched_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ah_snapshots_fetched_at ON ah_snapshots(fetched_at);
CREATE INDEX IF NOT EXISTS idx_ah_snapshots_realm ON ah_snapshots(connected_realm_id, region);

CREATE TABLE IF NOT EXISTS ah_listings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id   INTEGER NOT NULL REFERENCES ah_snapshots(id) ON DELETE CASCADE,
  item_id       INTEGER NOT NULL,
  unit_price    INTEGER NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  time_left     TEXT
);
CREATE INDEX IF NOT EXISTS idx_ah_listings_snapshot ON ah_listings(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_ah_listings_item ON ah_listings(item_id);

CREATE TABLE IF NOT EXISTS item_price_stats (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id       INTEGER NOT NULL,
  region        TEXT NOT NULL,
  realm         TEXT NOT NULL,
  date          TEXT NOT NULL,
  avg_price     INTEGER NOT NULL,
  min_price     INTEGER NOT NULL,
  max_price     INTEGER NOT NULL,
  volume        INTEGER NOT NULL,
  avg_7d        REAL,
  avg_30d       REAL,
  stddev_30d    REAL,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(item_id, region, realm, date)
);
CREATE INDEX IF NOT EXISTS idx_item_price_stats_item_date ON item_price_stats(item_id, date);
CREATE INDEX IF NOT EXISTS idx_item_price_stats_realm ON item_price_stats(region, realm);

-- Supports the "Farming Route Helper" module. Not part of the AH pipeline;
-- populated from seed data / user-curated community knowledge.
CREATE TABLE IF NOT EXISTS farming_spots (
  id                                  INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id                             INTEGER NOT NULL REFERENCES items(id),
  zone                                TEXT NOT NULL,
  sub_zone                            TEXT,
  mob_or_node                         TEXT NOT NULL,
  min_level                           INTEGER,
  max_level                           INTEGER,
  drop_or_gather_chance               REAL NOT NULL DEFAULT 1.0,
  estimated_nodes_or_mobs_per_hour    REAL NOT NULL DEFAULT 0,
  notes                               TEXT
);
CREATE INDEX IF NOT EXISTS idx_farming_spots_item ON farming_spots(item_id);

-- Supports the "Dungeon selecting" module. Entries can be hand-authored
-- (nothing pre-filled) or bulk-imported from real mob_catalog/mob_loot
-- data for a real dungeon/raid zone — see queries/dungeon.ts#importDungeonFromZone.
CREATE TABLE IF NOT EXISTS dungeon_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dungeon_entries (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  dungeon_run_id         INTEGER NOT NULL REFERENCES dungeon_runs(id) ON DELETE CASCADE,
  item_id                INTEGER REFERENCES items(id),
  item_name_override     TEXT,
  mob_count              INTEGER NOT NULL DEFAULT 1,
  drop_chance_percent    REAL NOT NULL DEFAULT 0,
  -- Average quantity per drop (e.g. a loot row good for 2-4 = 3 here).
  -- Hand-authored entries default to 1 (unchanged prior behavior); an
  -- import from real data carries the loot table's actual (min+max)/2.
  avg_drop_count         REAL NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_dungeon_entries_run ON dungeon_entries(dungeon_run_id);

-- The three tables below are populated from an open-source WoW server
-- core's world database (see main/db/importWorldData.ts) rather than
-- hand-curated — real drop chances, mob levels, and gathering-node spawn
-- density instead of a small seeded example set. Currently sourced for
-- Classic Progression (MoP) only; empty (harmless) for other versions
-- until an equivalent import is built for them.

-- One row per (gathering node, continent): herb/ore node yields resolved
-- by matching the node's own name against an item (its loot table isn't
-- data-driven for the guaranteed base yield — see importer for why).
CREATE TABLE IF NOT EXISTS gathering_node_spawns (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  gameobject_id     INTEGER NOT NULL,
  node_name         TEXT NOT NULL,
  item_id           INTEGER NOT NULL,
  kind              TEXT NOT NULL,
  map_id            INTEGER NOT NULL,
  spawn_count       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_gathering_node_spawns_item ON gathering_node_spawns(item_id);

-- One row per (creature, skinning drop) — the creature you kill and skin
-- to get item_id, at chance_percent.
CREATE TABLE IF NOT EXISTS skinning_drops (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  creature_id       INTEGER NOT NULL,
  creature_name     TEXT NOT NULL,
  min_level         INTEGER,
  max_level         INTEGER,
  item_id           INTEGER NOT NULL,
  chance_percent    REAL NOT NULL,
  spawn_count       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_skinning_drops_item ON skinning_drops(item_id);

-- Every creature with a loot table and/or a gold reward (not just
-- notable/rare-elite ones) — feeds both the Dungeon Selecting item
-- picker's "suggest a drop chance" assist and the Mob Value ranking
-- (Expected Value = sum of chance% x avg-count x current price, over
-- loot items with real trade volume, plus avg gold — see queries/mobValue.ts).
CREATE TABLE IF NOT EXISTS mob_catalog (
  id                INTEGER PRIMARY KEY,
  name              TEXT NOT NULL,
  min_level         INTEGER,
  max_level         INTEGER,
  npc_rank          INTEGER NOT NULL DEFAULT 0,
  min_gold          INTEGER NOT NULL DEFAULT 0,
  max_gold          INTEGER NOT NULL DEFAULT 0,
  spawn_count       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mob_loot (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  creature_id       INTEGER NOT NULL REFERENCES mob_catalog(id),
  item_id           INTEGER NOT NULL,
  chance_percent    REAL NOT NULL,
  min_count         INTEGER NOT NULL DEFAULT 1,
  max_count         INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_mob_loot_creature ON mob_loot(creature_id);
CREATE INDEX IF NOT EXISTS idx_mob_loot_item ON mob_loot(item_id);

-- One row per (creature, zone/instance) it spawns in — a creature can
-- legitimately appear in more than one (e.g. a reused template). map_id
-- is Blizzard's internal continent/instance map id; zone_type is derived
-- at import time from the world database (open_world = one of the 5
-- known continents, dungeon/raid = resolved via instance_template +
-- access_requirement, unknown = anything else, e.g. battlegrounds).
-- Feeds the Zone Value tab's spawn-weighted average — see
-- main/queries/zoneValue.ts.
CREATE TABLE IF NOT EXISTS mob_zone_spawns (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  creature_id       INTEGER NOT NULL REFERENCES mob_catalog(id),
  map_id            INTEGER NOT NULL,
  zone_name         TEXT NOT NULL,
  zone_type         TEXT NOT NULL,
  spawn_count       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mob_zone_spawns_creature ON mob_zone_spawns(creature_id);
CREATE INDEX IF NOT EXISTS idx_mob_zone_spawns_map ON mob_zone_spawns(map_id);

-- Battle pets live in a separate id space from items (petSpeciesId, not
-- itemId — caged pets of every species share one generic item id in the
-- item catalog), so they get their own small catalog + price-stats pair
-- mirroring items/item_price_stats. Populated by the TSM sync only (see
-- main/tsm/sync.ts) — pets.csv has no Battle.net AH API equivalent here.
CREATE TABLE IF NOT EXISTS battle_pets (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pet_price_stats (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_species_id    INTEGER NOT NULL REFERENCES battle_pets(id),
  region            TEXT NOT NULL,
  realm             TEXT NOT NULL,
  date              TEXT NOT NULL,
  avg_price         INTEGER NOT NULL,
  volume            INTEGER NOT NULL DEFAULT 0,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(pet_species_id, region, realm, date)
);
CREATE INDEX IF NOT EXISTS idx_pet_price_stats_species_date ON pet_price_stats(pet_species_id, date);
CREATE INDEX IF NOT EXISTS idx_pet_price_stats_realm ON pet_price_stats(region, realm);
`
