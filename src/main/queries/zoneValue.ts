import type Database from 'better-sqlite3'
import type { AppSettings, ZoneType, ZoneValueRow } from '@shared/types'
import { getMobExpectedValueMap } from './mobValue'

interface ZoneSpawnRow {
  creatureId: number
  mapId: number
  zoneName: string
  zoneType: ZoneType
  spawnCount: number
}

/**
 * Average Expected Value (see mobValue.ts) across every distinct mob known
 * to spawn in each zone — a simple average over mobs, not spawn-weighted,
 * so a zone densely packed with one common mob doesn't drown out its
 * other inhabitants. totalSpawns is exposed separately as a density signal.
 */
export function listZoneValueRows(db: Database.Database, settings: AppSettings): ZoneValueRow[] {
  const spawns = db
    .prepare(
      /* sql */ `
      SELECT creature_id as creatureId, map_id as mapId, zone_name as zoneName,
             zone_type as zoneType, spawn_count as spawnCount
      FROM mob_zone_spawns
    `
    )
    .all() as ZoneSpawnRow[]

  const expectedValueByCreature = getMobExpectedValueMap(db, settings)

  interface ZoneAccumulator {
    mapId: number
    zoneType: ZoneType
    valueSum: number
    mobIds: Set<number>
    totalSpawns: number
  }

  // Keyed by zone *name*, not map id — many open-world sub-zones (Elwynn
  // Forest, Westfall, ...) share the same continent map id, so grouping by
  // map id would silently merge every sub-zone on a continent into one row.
  const zones = new Map<string, ZoneAccumulator>()

  for (const spawn of spawns) {
    const expectedValue = expectedValueByCreature.get(spawn.creatureId)
    if (expectedValue === undefined) continue

    let zone = zones.get(spawn.zoneName)
    if (!zone) {
      zone = { mapId: spawn.mapId, zoneType: spawn.zoneType, valueSum: 0, mobIds: new Set(), totalSpawns: 0 }
      zones.set(spawn.zoneName, zone)
    }

    // A creature can have multiple spawn rows for the same zone (rare, but
    // possible from the source data) — only count its value once per zone.
    if (!zone.mobIds.has(spawn.creatureId)) {
      zone.mobIds.add(spawn.creatureId)
      zone.valueSum += expectedValue
    }
    zone.totalSpawns += spawn.spawnCount
  }

  const rows = [...zones.entries()].map(([zoneName, zone]) => ({
    mapId: zone.mapId,
    zoneName,
    zoneType: zone.zoneType,
    avgMobValue: zone.mobIds.size > 0 ? Math.round(zone.valueSum / zone.mobIds.size) : 0,
    mobCount: zone.mobIds.size,
    totalSpawns: zone.totalSpawns
  }))

  return rows.sort((a, b) => b.avgMobValue - a.avgMobValue)
}
