import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, testSettings } from '@test/db'
import {
  createDungeonRun,
  importDungeonFromZone,
  listDungeonRuns,
  listInstanceZones,
  upsertDungeonEntry
} from './dungeon'

const REGION = 'us'
const REALM = 'test-realm'
const DATE = '2026-01-01'

function insertItem(db: Database.Database, id: number, name: string): void {
  db.prepare(`INSERT INTO items (id, name, quality) VALUES (?, ?, 1)`).run(id, name)
}

function insertPrice(db: Database.Database, itemId: number, price: number, volume: number): void {
  db.prepare(
    `INSERT INTO item_price_stats (item_id, region, realm, date, avg_price, min_price, max_price, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(itemId, REGION, REALM, DATE, price, price, price, volume)
}

describe('listInstanceZones', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('only returns dungeon/raid zones, not open_world or unknown', () => {
    db.prepare(
      `INSERT INTO mob_catalog (id, name, spawn_count) VALUES (1, 'A', 1), (2, 'B', 1), (3, 'C', 1), (4, 'D', 1)`
    ).run()
    const insertZone = db.prepare(
      `INSERT INTO mob_zone_spawns (creature_id, map_id, zone_name, zone_type, spawn_count) VALUES (?, ?, ?, ?, 1)`
    )
    insertZone.run(1, 0, 'Elwynn Forest', 'open_world')
    insertZone.run(2, 36, 'Deadmines', 'dungeon')
    insertZone.run(3, 409, 'Molten Core', 'raid')
    insertZone.run(4, 999, 'Unknown Zone (map 999)', 'unknown')

    const zones = listInstanceZones(db)
    expect(zones.map((z) => z.zoneName).sort()).toEqual(['Deadmines', 'Molten Core'])
  })
})

describe('importDungeonFromZone', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    // Boss (npc_rank 3) with a liquid-priced drop and an illiquid one.
    db.prepare(
      `INSERT INTO mob_catalog (id, name, npc_rank, spawn_count) VALUES (1, 'Ragnaros', 3, 1), (2, 'Trash Mob', 0, 50)`
    ).run()
    insertItem(db, 100, 'Sulfuras')
    insertItem(db, 101, 'Unpriced Trinket')
    insertPrice(db, 100, 500000, 3)
    // item 101 deliberately left unpriced (no item_price_stats row at all)

    db.prepare(
      `INSERT INTO mob_zone_spawns (creature_id, map_id, zone_name, zone_type, spawn_count) VALUES (1, 409, 'Molten Core', 'raid', 1)`
    ).run()
    db.prepare(
      `INSERT INTO mob_loot (creature_id, item_id, chance_percent, min_count, max_count) VALUES (1, 100, 5, 1, 1)`
    ).run()
    db.prepare(
      `INSERT INTO mob_loot (creature_id, item_id, chance_percent, min_count, max_count) VALUES (1, 101, 2, 1, 1)`
    ).run()

    // Trash mob (npc_rank 0) has its own liquid drop — must be excluded, only rank >= 2 is imported.
    insertItem(db, 200, 'Linen Cloth')
    insertPrice(db, 200, 100, 50)
    db.prepare(
      `INSERT INTO mob_zone_spawns (creature_id, map_id, zone_name, zone_type, spawn_count) VALUES (2, 409, 'Molten Core', 'raid', 50)`
    ).run()
    db.prepare(
      `INSERT INTO mob_loot (creature_id, item_id, chance_percent, min_count, max_count) VALUES (2, 200, 100, 1, 3)`
    ).run()
  })

  afterEach(() => {
    db.close()
  })

  it('imports only notable-mob drops with a current liquid price, skipping trash and unpriced items', () => {
    const run = importDungeonFromZone(db, testSettings({ region: REGION, realmName: REALM }), 409, 'Molten Core')

    expect(run.name).toBe('Molten Core')
    expect(run.entries).toHaveLength(1)
    expect(run.entries[0]).toMatchObject({
      itemId: 100,
      resolvedItemName: 'Sulfuras',
      mobCount: 1,
      dropChancePercent: 5,
      avgDropCount: 1,
      currentPrice: 500000
    })
  })

  it('carries the real average drop count into avg_drop_count', () => {
    insertItem(db, 300, 'Stack Drop')
    insertPrice(db, 300, 10, 5)
    db.prepare(
      `INSERT INTO mob_zone_spawns (creature_id, map_id, zone_name, zone_type, spawn_count) VALUES (1, 999, 'Test Zone', 'raid', 1)`
    ).run()
    db.prepare(
      `INSERT INTO mob_loot (creature_id, item_id, chance_percent, min_count, max_count) VALUES (1, 300, 100, 2, 6)`
    ).run()

    const run = importDungeonFromZone(db, testSettings({ region: REGION, realmName: REALM }), 999, 'Test Zone')
    const entry = run.entries.find((e) => e.itemId === 300)
    expect(entry?.avgDropCount).toBe(4) // (2 + 6) / 2
  })
})

describe('listDungeonRuns liquidity gating', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('nulls currentPrice/expectedValue for an entry whose item has zero trade volume', () => {
    insertItem(db, 100, 'Illiquid Item')
    insertPrice(db, 100, 99999, 0)
    const run = createDungeonRun(db, 'Test Run', null)
    upsertDungeonEntry(db, {
      dungeonRunId: run.id,
      itemId: 100,
      itemNameOverride: null,
      mobCount: 1,
      dropChancePercent: 100,
      avgDropCount: 1
    })

    const runs = listDungeonRuns(db, testSettings({ region: REGION, realmName: REALM }))
    const entry = runs[0].entries[0]
    expect(entry.currentPrice).toBeNull()
    expect(entry.expectedValue).toBeNull()
    expect(runs[0].totalExpectedValue).toBe(0)
  })

  it('computes expectedValue using avgDropCount, not just mobCount x chance x price', () => {
    insertItem(db, 100, 'Stacked Item')
    insertPrice(db, 100, 100, 5)
    const run = createDungeonRun(db, 'Test Run', null)
    upsertDungeonEntry(db, {
      dungeonRunId: run.id,
      itemId: 100,
      itemNameOverride: null,
      mobCount: 2,
      dropChancePercent: 50,
      avgDropCount: 3
    })

    const runs = listDungeonRuns(db, testSettings({ region: REGION, realmName: REALM }))
    // 2 mobs x 50% x 3 avg qty x 100 copper = 300
    expect(runs[0].entries[0].expectedValue).toBe(300)
  })
})
