import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, testSettings } from '@test/db'
import { getMobDropTable, getSkinningExpectedValueMap, listMobValueRows, searchMobs } from './mobValue'

const REGION = 'us'
const REALM = 'test-realm'
const DATE = '2026-01-01'

function seedMob(db: Database.Database): void {
  db.prepare(
    /* sql */ `
    INSERT INTO mob_catalog (id, name, min_level, max_level, npc_rank, min_gold, max_gold, spawn_count)
    VALUES (1, 'Test Mob', 10, 10, 0, 100, 200, 5)
  `
  ).run()

  db.prepare(
    /* sql */ `
    INSERT INTO items (id, name, quality) VALUES (101, 'Common Loot', 1), (102, 'Frequent Loot', 1), (103, 'Illiquid Loot', 1)
  `
  ).run()

  const insertLoot = db.prepare(
    /* sql */ `INSERT INTO mob_loot (creature_id, item_id, chance_percent, min_count, max_count) VALUES (?, ?, ?, ?, ?)`
  )
  insertLoot.run(1, 101, 50, 1, 1) // 50% chance, 1x, priced
  insertLoot.run(1, 102, 100, 2, 4) // 100% chance, avg 3x, priced
  insertLoot.run(1, 103, 10, 1, 1) // 10% chance, but zero volume — must be excluded from EV

  const insertPrice = db.prepare(
    /* sql */ `INSERT INTO item_price_stats (item_id, region, realm, date, avg_price, min_price, max_price, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  insertPrice.run(101, REGION, REALM, DATE, 1000, 1000, 1000, 10)
  insertPrice.run(102, REGION, REALM, DATE, 500, 500, 500, 20)
  insertPrice.run(103, REGION, REALM, DATE, 99999, 99999, 99999, 0) // priced but illiquid
}

describe('listMobValueRows', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedMob(db)
  })

  afterEach(() => {
    db.close()
  })

  it('computes Expected Value as sum(chance% x avg-count x price) over liquid loot, plus average gold', () => {
    const rows = listMobValueRows(db, testSettings({ region: REGION, realmName: REALM }))
    expect(rows).toHaveLength(1)

    const mob = rows[0]
    // item 101: 0.5 * 1 * 1000 = 500
    // item 102: 1.0 * 3 * 500 = 1500
    // item 103: excluded (volume = 0)
    // avgGold: round((100 + 200) / 2) = 150
    expect(mob.avgGold).toBe(150)
    expect(mob.expectedValue).toBe(500 + 1500 + 150)
    expect(mob.lootItemsIncluded).toBe(2)
    expect(mob.lootItemsExcluded).toBe(1)
  })

  it('gives a mob with no gold reward an avgGold of zero, not a stray value', () => {
    const db2 = createTestDb()
    db2
      .prepare(
        `INSERT INTO mob_catalog (id, name, min_level, max_level, npc_rank, min_gold, max_gold, spawn_count) VALUES (1, 'No Gold Mob', 1, 1, 0, 0, 0, 1)`
      )
      .run()

    const rows = listMobValueRows(db2, testSettings({ region: REGION, realmName: REALM }))
    expect(rows[0].avgGold).toBe(0)
    expect(rows[0].expectedValue).toBe(0)
    db2.close()
  })
})

describe('getMobDropTable', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedMob(db)
  })

  afterEach(() => {
    db.close()
  })

  it('sorts by drop chance descending and gates price to null for illiquid items', () => {
    const entries = getMobDropTable(db, testSettings({ region: REGION, realmName: REALM }), 1)
    expect(entries.map((e) => e.itemId)).toEqual([102, 101, 103])

    const illiquid = entries.find((e) => e.itemId === 103)
    expect(illiquid?.volume).toBe(0)
    expect(illiquid?.price).toBeNull()

    const liquid = entries.find((e) => e.itemId === 101)
    expect(liquid?.price).toBe(1000)
  })
})

describe('getSkinningExpectedValueMap', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedMob(db)
  })

  afterEach(() => {
    db.close()
  })

  it('is independent of mob_loot Expected Value — skinning-only, liquidity-gated', () => {
    db.prepare(
      `INSERT INTO skinning_drops (creature_id, creature_name, item_id, chance_percent, spawn_count) VALUES (1, 'Test Mob', 101, 100, 5)`
    ).run()
    // A second, illiquid skinning drop — must be excluded, same rule as mob_loot.
    db.prepare(
      `INSERT INTO skinning_drops (creature_id, creature_name, item_id, chance_percent, spawn_count) VALUES (1, 'Test Mob', 103, 100, 5)`
    ).run()

    const map = getSkinningExpectedValueMap(db, testSettings({ region: REGION, realmName: REALM }))
    // item 101: 100% chance * 1000 price = 1000. item 103 excluded (illiquid).
    expect(map.get(1)).toBe(1000)
  })

  it('sums multiple skinning drops for the same creature', () => {
    db.prepare(
      `INSERT INTO skinning_drops (creature_id, creature_name, item_id, chance_percent, spawn_count) VALUES (1, 'Test Mob', 101, 50, 5)`
    ).run()
    db.prepare(
      `INSERT INTO skinning_drops (creature_id, creature_name, item_id, chance_percent, spawn_count) VALUES (1, 'Test Mob', 102, 25, 5)`
    ).run()

    const map = getSkinningExpectedValueMap(db, testSettings({ region: REGION, realmName: REALM }))
    // item 101: 0.5 * 1000 = 500. item 102: 0.25 * 500 = 125. total = 625.
    expect(map.get(1)).toBe(625)
  })

  it('returns an empty map when there are no skinning drops at all', () => {
    const map = getSkinningExpectedValueMap(db, testSettings({ region: REGION, realmName: REALM }))
    expect(map.size).toBe(0)
  })
})

describe('searchMobs', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    seedMob(db)
  })

  afterEach(() => {
    db.close()
  })

  it('returns nothing for an empty or whitespace-only query', () => {
    expect(searchMobs(db, '')).toEqual([])
    expect(searchMobs(db, '   ')).toEqual([])
  })

  it('finds a mob by case-insensitive substring match', () => {
    const results = searchMobs(db, 'test')
    expect(results).toEqual([{ creatureId: 1, name: 'Test Mob', npcRank: 0 }])
  })

  it('matches nothing for an unrelated query', () => {
    expect(searchMobs(db, 'nonexistent creature name')).toEqual([])
  })
})
