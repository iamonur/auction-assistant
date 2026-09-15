import type Database from 'better-sqlite3'
import type { AppSettings, FarmingRouteResult, FarmingSpot, ImportedGatheringSpawn } from '@shared/types'
import { mapLabel } from '@shared/mapLabels'
import { getCheapestPriceMap } from './shared'

interface ReagentOption {
  itemId: number
  itemName: string
}

export function listFarmingReagentOptions(db: Database.Database): ReagentOption[] {
  return db
    .prepare(
      /* sql */ `
      SELECT DISTINCT i.id as itemId, i.name as itemName
      FROM items i
      WHERE i.id IN (SELECT item_id FROM farming_spots)
         OR i.id IN (SELECT item_id FROM gathering_node_spawns)
      ORDER BY i.name ASC
    `
    )
    .all() as ReagentOption[]
}

interface SpotRow {
  id: number
  itemId: number
  zone: string
  subZone: string | null
  mobOrNode: string
  minLevel: number | null
  maxLevel: number | null
  dropOrGatherChance: number
  estimatedNodesOrMobsPerHour: number
  notes: string | null
}

interface ImportedSpawnRow {
  nodeName: string
  kind: 'herb' | 'ore'
  mapId: number
  spawnCount: number
}

export function getFarmingSpotsForItem(
  db: Database.Database,
  itemId: number,
  settings: AppSettings
): FarmingRouteResult | null {
  const item = db.prepare('SELECT id, name FROM items WHERE id = ?').get(itemId) as
    | { id: number; name: string }
    | undefined
  if (!item) return null

  const rows = db
    .prepare(
      /* sql */ `
      SELECT id, item_id as itemId, zone, sub_zone as subZone, mob_or_node as mobOrNode,
             min_level as minLevel, max_level as maxLevel, drop_or_gather_chance as dropOrGatherChance,
             estimated_nodes_or_mobs_per_hour as estimatedNodesOrMobsPerHour, notes
      FROM farming_spots
      WHERE item_id = ?
      ORDER BY estimated_nodes_or_mobs_per_hour DESC
    `
    )
    .all(itemId) as SpotRow[]

  const importedRows = db
    .prepare(
      /* sql */ `
      SELECT node_name as nodeName, kind, map_id as mapId, SUM(spawn_count) as spawnCount
      FROM gathering_node_spawns
      WHERE item_id = ?
      GROUP BY node_name, kind, map_id
      ORDER BY spawnCount DESC
    `
    )
    .all(itemId) as ImportedSpawnRow[]

  const priceMap = getCheapestPriceMap(db, settings)
  const currentUnitPrice = priceMap.get(itemId) ?? null

  const spots: FarmingRouteResult['spots'] = rows.map((row) => {
    const spot: FarmingSpot = {
      id: row.id,
      itemId: row.itemId,
      zone: row.zone,
      subZone: row.subZone,
      mobOrNode: row.mobOrNode,
      minLevel: row.minLevel,
      maxLevel: row.maxLevel,
      dropOrGatherChance: row.dropOrGatherChance,
      estimatedNodesOrMobsPerHour: row.estimatedNodesOrMobsPerHour,
      notes: row.notes
    }
    const estimatedGoldPerHour =
      currentUnitPrice !== null
        ? Math.round(spot.estimatedNodesOrMobsPerHour * spot.dropOrGatherChance * currentUnitPrice)
        : null
    return { ...spot, estimatedGoldPerHour }
  })

  const importedSpawns: ImportedGatheringSpawn[] = importedRows.map((row) => ({
    nodeName: row.nodeName,
    kind: row.kind,
    mapId: row.mapId,
    mapLabel: mapLabel(row.mapId),
    spawnCount: row.spawnCount
  }))

  return {
    itemId,
    itemName: item.name,
    currentUnitPrice,
    spots,
    importedSpawns
  }
}
