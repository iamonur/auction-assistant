import fs from 'node:fs'
import zlib from 'node:zlib'
import type Database from 'better-sqlite3'
import { bundledDataPath } from './worldDataPaths'

interface SpawnByMap {
  mapId: number
  count: number
}

interface RawGatheringNode {
  gameobjectId: number
  nodeName: string
  itemId: number
  itemName: string
  kind: 'herb' | 'ore'
  spawnsByMap: SpawnByMap[]
}

interface RawSkinningDrop {
  creatureId: number
  creatureName: string
  minLevel: number
  maxLevel: number
  itemId: number
  itemName: string
  chancePercent: number
  spawnsByMap: SpawnByMap[]
}

interface RawMobLoot {
  itemId: number
  itemName: string
  chancePercent: number
  minCount: number
  maxCount: number
}

interface RawMob {
  creatureId: number
  name: string
  minLevel: number
  maxLevel: number
  npcRank: number
  minGold: number
  maxGold: number
  spawnCount: number
  loot: RawMobLoot[]
}

interface RawMobZoneSpawn {
  creatureId: number
  mapId: number
  zoneName: string
  zoneType: string
  spawnCount: number
}

function readJson<T>(subdir: string, fileName: string): T {
  return JSON.parse(fs.readFileSync(bundledDataPath(subdir, fileName), 'utf8')) as T
}

function readGzipJson<T>(subdir: string, fileName: string): T {
  const compressed = fs.readFileSync(bundledDataPath(subdir, fileName))
  return JSON.parse(zlib.gunzipSync(compressed).toString('utf8')) as T
}

function totalSpawnCount(spawnsByMap: SpawnByMap[]): number {
  return spawnsByMap.reduce((sum, s) => sum + s.count, 0)
}

/**
 * One-time import of a world database extract into the given (already
 * version-specific) database — see resources/mop-import/*.json(.gz)
 * (SkyFire, MoP 5.4.8) and resources/classic-import/*.json(.gz)
 * (cmangos/classic-db, 1.12.1) and THIRD_PARTY_NOTICES.md for provenance.
 * Populates gathering_node_spawns, skinning_drops, mob_catalog/mob_loot,
 * and mob_zone_spawns from real game data instead of the small
 * hand-curated farming_spots seed. Guarded the same way as runSeed: only
 * runs when the target tables are still empty. `subdir` selects which
 * resources/ bundle to read — see db/index.ts#getDb for the mapping from
 * game version to subdir.
 */
export function importWorldData(db: Database.Database, subdir: string): void {
  const alreadyImported = db.prepare('SELECT COUNT(*) as count FROM gathering_node_spawns').get() as {
    count: number
  }
  if (alreadyImported.count > 0) return

  const gatheringNodes = readJson<RawGatheringNode[]>(subdir, 'gathering-nodes.json')
  const skinningDrops = readJson<RawSkinningDrop[]>(subdir, 'skinning-drops.json')
  const mobs = readGzipJson<RawMob[]>(subdir, 'mobs.json.gz')
  const mobZoneSpawns = readGzipJson<RawMobZoneSpawn[]>(subdir, 'mob-zones.json.gz')

  const insertPlaceholderItem = db.prepare(/* sql */ `
    INSERT INTO items (id, name, quality, category, gathering_profession)
    VALUES (@id, @name, 1, @category, @gatheringProfession)
    ON CONFLICT(id) DO NOTHING
  `)

  const insertGatheringSpawn = db.prepare(/* sql */ `
    INSERT INTO gathering_node_spawns (gameobject_id, node_name, item_id, kind, map_id, spawn_count)
    VALUES (@gameobjectId, @nodeName, @itemId, @kind, @mapId, @spawnCount)
  `)

  const insertSkinningDrop = db.prepare(/* sql */ `
    INSERT INTO skinning_drops (creature_id, creature_name, min_level, max_level, item_id, chance_percent, spawn_count)
    VALUES (@creatureId, @creatureName, @minLevel, @maxLevel, @itemId, @chancePercent, @spawnCount)
  `)

  const insertMobCatalog = db.prepare(/* sql */ `
    INSERT INTO mob_catalog (id, name, min_level, max_level, npc_rank, min_gold, max_gold, spawn_count)
    VALUES (@id, @name, @minLevel, @maxLevel, @npcRank, @minGold, @maxGold, @spawnCount)
  `)

  const insertMobLoot = db.prepare(/* sql */ `
    INSERT INTO mob_loot (creature_id, item_id, chance_percent, min_count, max_count)
    VALUES (@creatureId, @itemId, @chancePercent, @minCount, @maxCount)
  `)

  const insertMobZoneSpawn = db.prepare(/* sql */ `
    INSERT INTO mob_zone_spawns (creature_id, map_id, zone_name, zone_type, spawn_count)
    VALUES (@creatureId, @mapId, @zoneName, @zoneType, @spawnCount)
  `)

  const runImport = db.transaction(() => {
    for (const node of gatheringNodes) {
      insertPlaceholderItem.run({
        id: node.itemId,
        name: node.itemName,
        category: 'gathered',
        gatheringProfession: node.kind === 'herb' ? 'Herbalism' : 'Mining'
      })
      for (const spawn of node.spawnsByMap) {
        insertGatheringSpawn.run({
          gameobjectId: node.gameobjectId,
          nodeName: node.nodeName,
          itemId: node.itemId,
          kind: node.kind,
          mapId: spawn.mapId,
          spawnCount: spawn.count
        })
      }
    }

    for (const drop of skinningDrops) {
      insertPlaceholderItem.run({
        id: drop.itemId,
        name: drop.itemName,
        category: 'gathered',
        gatheringProfession: 'Skinning'
      })
      insertSkinningDrop.run({
        creatureId: drop.creatureId,
        creatureName: drop.creatureName,
        minLevel: drop.minLevel,
        maxLevel: drop.maxLevel,
        itemId: drop.itemId,
        chancePercent: drop.chancePercent,
        spawnCount: totalSpawnCount(drop.spawnsByMap)
      })
    }

    for (const mob of mobs) {
      insertMobCatalog.run({
        id: mob.creatureId,
        name: mob.name,
        minLevel: mob.minLevel,
        maxLevel: mob.maxLevel,
        npcRank: mob.npcRank,
        minGold: mob.minGold,
        maxGold: mob.maxGold,
        spawnCount: mob.spawnCount
      })
      for (const loot of mob.loot) {
        insertPlaceholderItem.run({
          id: loot.itemId,
          name: loot.itemName,
          category: 'other',
          gatheringProfession: null
        })
        insertMobLoot.run({
          creatureId: mob.creatureId,
          itemId: loot.itemId,
          chancePercent: loot.chancePercent,
          minCount: loot.minCount,
          maxCount: loot.maxCount
        })
      }
    }

    for (const spawn of mobZoneSpawns) {
      insertMobZoneSpawn.run(spawn)
    }
  })

  runImport()
}
