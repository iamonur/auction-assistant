import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, testSettings } from '@test/db'
import { listZoneValueRows } from './zoneValue'

const REGION = 'us'
const REALM = 'test-realm'
const DATE = '2026-01-01'

function seedCreature(
  db: Database.Database,
  creatureId: number,
  itemId: number,
  price: number,
  zoneName: string,
  mapId: number,
  spawnCount: number
): void {
  db.prepare(
    `INSERT INTO mob_catalog (id, name, min_level, max_level, npc_rank, min_gold, max_gold, spawn_count) VALUES (?, ?, 1, 1, 0, 0, 0, ?)`
  ).run(creatureId, `Mob ${creatureId}`, spawnCount)

  db.prepare(
    `INSERT INTO mob_loot (creature_id, item_id, chance_percent, min_count, max_count) VALUES (?, ?, 100, 1, 1)`
  ).run(creatureId, itemId)

  db.prepare(
    `INSERT INTO item_price_stats (item_id, region, realm, date, avg_price, min_price, max_price, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(itemId, REGION, REALM, DATE, price, price, price, 10)

  db.prepare(
    `INSERT INTO mob_zone_spawns (creature_id, map_id, zone_name, zone_type, spawn_count) VALUES (?, ?, ?, 'open_world', ?)`
  ).run(creatureId, mapId, zoneName, spawnCount)
}

describe('listZoneValueRows', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  // Regression test: sub-zones (Elwynn Forest, Westfall, ...) share
  // Blizzard's continent-level map id (0 = Eastern Kingdoms). The query
  // used to group by map id, which silently merged every open-world
  // sub-zone on a continent into one row. It must group by zone name.
  it('keeps sub-zones that share a continent map id as separate rows', () => {
    seedCreature(db, 1, 101, 100, 'Elwynn Forest', 0, 5)
    seedCreature(db, 2, 102, 300, 'Westfall', 0, 50)

    const rows = listZoneValueRows(db, testSettings({ region: REGION, realmName: REALM }))
    expect(rows).toHaveLength(2)

    const elwynn = rows.find((r) => r.zoneName === 'Elwynn Forest')
    const westfall = rows.find((r) => r.zoneName === 'Westfall')
    expect(elwynn).toMatchObject({ avgMobValue: 100, mobCount: 1, totalSpawns: 5 })
    expect(westfall).toMatchObject({ avgMobValue: 300, mobCount: 1, totalSpawns: 50 })
  })

  it('averages Expected Value per mob, not weighted by spawn count', () => {
    // A mob with a huge spawn count must not drown out a rare mob's value.
    seedCreature(db, 1, 201, 100, 'Duskwood', 0, 1000)
    seedCreature(db, 2, 202, 300, 'Duskwood', 0, 1)

    const rows = listZoneValueRows(db, testSettings({ region: REGION, realmName: REALM }))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ avgMobValue: 200, mobCount: 2, totalSpawns: 1001 })
  })

  it('sorts zones by average Expected Value descending', () => {
    seedCreature(db, 1, 301, 50, 'Low Value Zone', 0, 1)
    seedCreature(db, 2, 302, 500, 'High Value Zone', 1, 1)

    const rows = listZoneValueRows(db, testSettings({ region: REGION, realmName: REALM }))
    expect(rows.map((r) => r.zoneName)).toEqual(['High Value Zone', 'Low Value Zone'])
  })

  // A creature the world-database import couldn't resolve past its
  // continent lands in a row named for that continent — real data, but a
  // whole-continent average, not a useful zone the way the rest of this
  // list is. Callers (the desktop UI, the addon export) need to be able
  // to tell the two apart rather than treating "Eastern Kingdoms" as if
  // it were a farming/questing zone on equal footing with "Elwynn Forest".
  it('flags the five continent-name rows as isContinentFallback, and nothing else', () => {
    seedCreature(db, 1, 401, 100, 'Eastern Kingdoms', 0, 5) // unresolved fallback
    seedCreature(db, 2, 402, 200, 'Elwynn Forest', 0, 5) // real sub-zone, same continent's map id
    seedCreature(db, 3, 403, 300, 'Some Unrelated Zone', 99, 5)

    const rows = listZoneValueRows(db, testSettings({ region: REGION, realmName: REALM }))
    const byName = new Map(rows.map((r) => [r.zoneName, r]))

    expect(byName.get('Eastern Kingdoms')?.isContinentFallback).toBe(true)
    expect(byName.get('Elwynn Forest')?.isContinentFallback).toBe(false)
    expect(byName.get('Some Unrelated Zone')?.isContinentFallback).toBe(false)
  })
})
