import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, testSettings } from '@test/db'
import { getCheapestPriceMap, getItemPriceInfo, getSupplyVolumeMap } from './shared'

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

/** scannedAt accepts a raw SQL datetime() expression (e.g. "datetime('now', '-2 hours')") so tests can place a scan relative to "now" without depending on wall-clock timing. */
const insertAhScanStat = (
  db: Database.Database,
  row: { itemId: number; region: string; realm: string; price: number; volume: number; scannedAtSql: string }
): void => {
  db.prepare(
    /* sql */ `
    INSERT INTO ah_scan_price_stats (item_id, region, realm, price, volume, scanned_at)
    VALUES (?, ?, ?, ?, ?, ${row.scannedAtSql})
  `
  ).run(row.itemId, row.region, row.realm, row.price, row.volume)
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

  it('prefers a fresh AH scan over item_price_stats', () => {
    const settings = testSettings({ region: 'us', realmName: 'grobbulus' })
    insertPriceStat(db, { itemId: 5, region: 'us', realm: 'grobbulus', date: '2026-01-01', minPrice: 250, volume: 3 })
    insertAhScanStat(db, {
      itemId: 5,
      region: 'us',
      realm: 'grobbulus',
      price: 199,
      volume: 8,
      scannedAtSql: "datetime('now', '-2 hours')"
    })

    expect(getItemPriceInfo(db, settings, 5)).toEqual({ price: 199, volume: 8 })
  })

  it('falls back to item_price_stats when the AH scan is older than the freshness window', () => {
    const settings = testSettings({ region: 'us', realmName: 'grobbulus' })
    insertPriceStat(db, { itemId: 5, region: 'us', realm: 'grobbulus', date: '2026-01-01', minPrice: 250, volume: 3 })
    insertAhScanStat(db, {
      itemId: 5,
      region: 'us',
      realm: 'grobbulus',
      price: 199,
      volume: 8,
      scannedAtSql: "datetime('now', '-25 hours')"
    })

    expect(getItemPriceInfo(db, settings, 5)).toEqual({ price: 250, volume: 3 })
  })

  it('respects the liquidity gate on a fresh AH scan with zero volume', () => {
    const settings = testSettings({ region: 'us', realmName: 'grobbulus' })
    insertAhScanStat(db, {
      itemId: 5,
      region: 'us',
      realm: 'grobbulus',
      price: 199,
      volume: 0,
      scannedAtSql: "datetime('now', '-1 hours')"
    })

    expect(getItemPriceInfo(db, settings, 5)).toEqual({ price: null, volume: 0 })
  })

  it('an AH scan for a different realm never leaks into this realm', () => {
    const settings = testSettings({ region: 'us', realmName: 'grobbulus' })
    insertPriceStat(db, { itemId: 5, region: 'us', realm: 'grobbulus', date: '2026-01-01', minPrice: 250, volume: 3 })
    insertAhScanStat(db, {
      itemId: 5,
      region: 'us',
      realm: 'other-realm',
      price: 1,
      volume: 999,
      scannedAtSql: "datetime('now', '-1 hours')"
    })

    expect(getItemPriceInfo(db, settings, 5)).toEqual({ price: 250, volume: 3 })
  })
})

describe('getCheapestPriceMap / getSupplyVolumeMap AH scan precedence', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('layers a fresh AH scan over item_price_stats for both maps, leaving unscanned items untouched', () => {
    const settings = testSettings({ region: 'us', realmName: 'grobbulus' })
    insertPriceStat(db, { itemId: 1, region: 'us', realm: 'grobbulus', date: '2026-01-01', minPrice: 100, volume: 5 })
    insertPriceStat(db, { itemId: 2, region: 'us', realm: 'grobbulus', date: '2026-01-01', minPrice: 400, volume: 2 })
    insertAhScanStat(db, {
      itemId: 1,
      region: 'us',
      realm: 'grobbulus',
      price: 77,
      volume: 12,
      scannedAtSql: "datetime('now', '-1 hours')"
    })

    const priceMap = getCheapestPriceMap(db, settings)
    const volumeMap = getSupplyVolumeMap(db, settings)

    expect(priceMap.get(1)).toBe(77) // scanned, fresh — scan wins
    expect(priceMap.get(2)).toBe(400) // never scanned — untouched TSM value
    expect(volumeMap.get(1)).toBe(12)
    expect(volumeMap.get(2)).toBe(2)
  })

  it('an AH scan for an item with no item_price_stats row at all still surfaces', () => {
    const settings = testSettings({ region: 'us', realmName: 'grobbulus' })
    insertAhScanStat(db, {
      itemId: 42,
      region: 'us',
      realm: 'grobbulus',
      price: 500,
      volume: 4,
      scannedAtSql: "datetime('now', '-1 hours')"
    })

    expect(getCheapestPriceMap(db, settings).get(42)).toBe(500)
    expect(getSupplyVolumeMap(db, settings).get(42)).toBe(4)
  })
})
