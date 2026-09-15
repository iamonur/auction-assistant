import type Database from 'better-sqlite3'
import type {
  AppSettings,
  DungeonEntry,
  DungeonEntryInput,
  DungeonEntryWithValue,
  DungeonRun,
  DungeonRunWithValue,
  InstanceZoneOption
} from '@shared/types'
import { getCheapestPriceMap, getSupplyVolumeMap } from './shared'

interface EntryRow {
  id: number
  dungeonRunId: number
  itemId: number | null
  itemNameOverride: string | null
  mobCount: number
  dropChancePercent: number
  avgDropCount: number
  resolvedItemName: string | null
}

export function listDungeonRuns(db: Database.Database, settings: AppSettings): DungeonRunWithValue[] {
  const runs = db
    .prepare('SELECT id, name, notes, created_at as createdAt FROM dungeon_runs ORDER BY created_at DESC')
    .all() as DungeonRun[]

  const entryStmt = db.prepare(
    /* sql */ `
    SELECT de.id as id, de.dungeon_run_id as dungeonRunId, de.item_id as itemId,
           de.item_name_override as itemNameOverride, de.mob_count as mobCount,
           de.drop_chance_percent as dropChancePercent, de.avg_drop_count as avgDropCount,
           i.name as resolvedItemName
    FROM dungeon_entries de
    LEFT JOIN items i ON i.id = de.item_id
    WHERE de.dungeon_run_id = ?
  `
  )

  // Same liquidity gate as every other feature (Mob Value, Zone Value, Crafting
  // Sniper, ...): a price backed by zero real trade volume isn't trustworthy
  // enough to count toward an expected-value total.
  const priceMap = getCheapestPriceMap(db, settings)
  const volumeMap = getSupplyVolumeMap(db, settings)

  return runs.map((run) => {
    const rows = entryStmt.all(run.id) as EntryRow[]
    const entries: DungeonEntryWithValue[] = rows.map((row) => {
      const volume = row.itemId !== null ? volumeMap.get(row.itemId) ?? 0 : 0
      const currentPrice = row.itemId !== null && volume > 0 ? priceMap.get(row.itemId) ?? null : null
      const expectedValue =
        currentPrice !== null
          ? Math.round(row.mobCount * (row.dropChancePercent / 100) * row.avgDropCount * currentPrice)
          : null
      return {
        id: row.id,
        dungeonRunId: row.dungeonRunId,
        itemId: row.itemId,
        itemNameOverride: row.itemNameOverride,
        mobCount: row.mobCount,
        dropChancePercent: row.dropChancePercent,
        avgDropCount: row.avgDropCount,
        resolvedItemName: row.resolvedItemName ?? row.itemNameOverride ?? 'Unnamed item',
        currentPrice,
        expectedValue
      }
    })

    return {
      ...run,
      entries,
      totalExpectedValue: entries.reduce((sum, entry) => sum + (entry.expectedValue ?? 0), 0)
    }
  })
}

export function createDungeonRun(db: Database.Database, name: string, notes: string | null): DungeonRun {
  const result = db.prepare('INSERT INTO dungeon_runs (name, notes) VALUES (?, ?)').run(name, notes)
  return db
    .prepare('SELECT id, name, notes, created_at as createdAt FROM dungeon_runs WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as DungeonRun
}

export function updateDungeonRun(db: Database.Database, id: number, name: string, notes: string | null): void {
  db.prepare('UPDATE dungeon_runs SET name = ?, notes = ? WHERE id = ?').run(name, notes, id)
}

export function deleteDungeonRun(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM dungeon_runs WHERE id = ?').run(id)
}

export function upsertDungeonEntry(db: Database.Database, input: DungeonEntryInput): DungeonEntry {
  if (input.id) {
    db.prepare(
      /* sql */ `
      UPDATE dungeon_entries
      SET item_id = ?, item_name_override = ?, mob_count = ?, drop_chance_percent = ?, avg_drop_count = ?
      WHERE id = ?
    `
    ).run(input.itemId, input.itemNameOverride, input.mobCount, input.dropChancePercent, input.avgDropCount, input.id)
    return { ...input, id: input.id } as DungeonEntry
  }

  const result = db
    .prepare(
      /* sql */ `
      INSERT INTO dungeon_entries (dungeon_run_id, item_id, item_name_override, mob_count, drop_chance_percent, avg_drop_count)
      VALUES (?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      input.dungeonRunId,
      input.itemId,
      input.itemNameOverride,
      input.mobCount,
      input.dropChancePercent,
      input.avgDropCount
    )

  return { ...input, id: Number(result.lastInsertRowid) } as DungeonEntry
}

export function deleteDungeonEntry(db: Database.Database, id: number): void {
  db.prepare('DELETE FROM dungeon_entries WHERE id = ?').run(id)
}

/** Every real dungeon/raid instance with zone data, for the "Import from Zone" bulk-fill flow. */
export function listInstanceZones(db: Database.Database): InstanceZoneOption[] {
  return db
    .prepare(
      /* sql */ `
      SELECT DISTINCT map_id as mapId, zone_name as zoneName, zone_type as zoneType
      FROM mob_zone_spawns
      WHERE zone_type IN ('dungeon', 'raid')
      ORDER BY zone_type ASC, zone_name ASC
    `
    )
    .all() as InstanceZoneOption[]
}

interface ImportLootRow {
  creatureId: number
  itemId: number
  chancePercent: number
  minCount: number
  maxCount: number
  spawnCount: number
}

/**
 * Creates a new dungeon run pre-filled with real loot data for one
 * dungeon/raid zone: every (notable mob, loot item) pair with a currently
 * liquid price. Scoped to rare-elite/boss mobs (npc_rank >= 2) and priced
 * items only — same reasoning as getNotableLootSuggestions: an unfiltered
 * import (every trash mob's full loot table, including untradeable junk)
 * would bury the run in noise the user would just have to delete. The
 * user can still add anything this leaves out by hand, same as before.
 */
export function importDungeonFromZone(
  db: Database.Database,
  settings: AppSettings,
  mapId: number,
  zoneName: string
): DungeonRunWithValue {
  const lootRows = db
    .prepare(
      /* sql */ `
      SELECT mzs.creature_id as creatureId, ml.item_id as itemId, ml.chance_percent as chancePercent,
             ml.min_count as minCount, ml.max_count as maxCount, mzs.spawn_count as spawnCount
      FROM mob_zone_spawns mzs
      JOIN mob_catalog mc ON mc.id = mzs.creature_id
      JOIN mob_loot ml ON ml.creature_id = mzs.creature_id
      WHERE mzs.map_id = ? AND mc.npc_rank >= 2
    `
    )
    .all(mapId) as ImportLootRow[]

  const priceMap = getCheapestPriceMap(db, settings)
  const volumeMap = getSupplyVolumeMap(db, settings)

  const run = createDungeonRun(db, zoneName, `Imported from real drop data for ${zoneName}.`)

  const insertEntry = db.prepare(
    /* sql */ `
    INSERT INTO dungeon_entries (dungeon_run_id, item_id, item_name_override, mob_count, drop_chance_percent, avg_drop_count)
    VALUES (@dungeonRunId, @itemId, NULL, @mobCount, @dropChancePercent, @avgDropCount)
  `
  )

  const runImport = db.transaction((rows: ImportLootRow[]) => {
    for (const row of rows) {
      const volume = volumeMap.get(row.itemId) ?? 0
      if (volume === 0 || !priceMap.has(row.itemId)) continue

      insertEntry.run({
        dungeonRunId: run.id,
        itemId: row.itemId,
        mobCount: row.spawnCount > 0 ? row.spawnCount : 1,
        dropChancePercent: row.chancePercent,
        avgDropCount: (row.minCount + row.maxCount) / 2
      })
    }
  })

  runImport(lootRows)

  return listDungeonRuns(db, settings).find((r) => r.id === run.id) as DungeonRunWithValue
}
