import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, testSettings } from '@test/db'
import { getCheapestPriceMap, getItemPriceInfo } from './shared'

const insertPriceStat = (
  db: Database.Database,
  row: { itemId: number; region: string; realm: string; date: string; minPrice: number; volume: number }
): void => {
  db.prepare(
    /* sql */ `
    INSERT INTO item_price_stats (item_id, region, realm, date, avg_price, min_price, max_price, volume)
    VALUES (@itemId, @region, @realm, @date, @minPrice, @minPrice, @minPrice, @volume)
  `
  ).run(row)
}

describe('getCheapestPriceMap', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('only returns the latest date for the matching region/realm', () => {
    const settings = testSettings({ region: 'us', realmName: 'grobbulus' })
    insertPriceStat(db, { itemId: 1, region: 'us', realm: 'grobbulus', date: '2026-01-01', minPrice: 100, volume: 5 })
    insertPriceStat(db, { itemId: 1, region: 'us', realm: 'grobbulus', date: '2026-01-02', minPrice: 200, volume: 5 })
    // A different realm's data must never leak into this realm's map.
    insertPriceStat(db, { itemId: 1, region: 'us', realm: 'other-realm', date: '2026-01-02', minPrice: 999, volume: 5 })

    const priceMap = getCheapestPriceMap(db, settings)
    expect(priceMap.get(1)).toBe(200)
  })
})

describe('getItemPriceInfo', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('returns null price and zero volume when no price row exists', () => {
    const settings = testSettings()
    expect(getItemPriceInfo(db, settings, 999)).toEqual({ price: null, volume: 0 })
  })

  it('gates price to null when volume is zero, even though a min_price value is stored', () => {
    const settings = testSettings({ region: 'us', realmName: 'grobbulus' })
    insertPriceStat(db, {
      itemId: 5,
      region: 'us',
      realm: 'grobbulus',
      date: '2026-01-01',
      minPrice: 123456,
      volume: 0
    })

    expect(getItemPriceInfo(db, settings, 5)).toEqual({ price: null, volume: 0 })
  })

  it('returns the real price when volume is positive', () => {
    const settings = testSettings({ region: 'us', realmName: 'grobbulus' })
    insertPriceStat(db, { itemId: 5, region: 'us', realm: 'grobbulus', date: '2026-01-01', minPrice: 250, volume: 3 })

    expect(getItemPriceInfo(db, settings, 5)).toEqual({ price: 250, volume: 3 })
  })
})
