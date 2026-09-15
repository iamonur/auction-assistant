import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from '@test/db'
import { ingestDailyPriceRows, ingestPetPriceRows } from './aggregate'

describe('ingestDailyPriceRows', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    db.close()
  })

  it('upserts one row per item per day, keyed by (item, region, realm, date)', () => {
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
    ingestDailyPriceRows(db, [{ itemId: 1, avgPrice: 100, minPrice: 90, maxPrice: 110, volume: 5 }], 'us', 'test-realm')

    const rows = db.prepare('SELECT * FROM item_price_stats WHERE item_id = 1').all()
    expect(rows).toHaveLength(1)

    // Re-ingesting the same day updates in place rather than creating a duplicate row.
    ingestDailyPriceRows(db, [{ itemId: 1, avgPrice: 150, minPrice: 90, maxPrice: 200, volume: 8 }], 'us', 'test-realm')
    const afterUpdate = db.prepare('SELECT avg_price as avgPrice, volume FROM item_price_stats WHERE item_id = 1').all()
    expect(afterUpdate).toEqual([{ avgPrice: 150, volume: 8 }])
  })

  it('computes 7d/30d rolling average and population stddev from real history, not just the latest day', () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    ingestDailyPriceRows(db, [{ itemId: 1, avgPrice: 100, minPrice: 100, maxPrice: 100, volume: 1 }], 'us', 'test-realm')

    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'))
    ingestDailyPriceRows(db, [{ itemId: 1, avgPrice: 200, minPrice: 200, maxPrice: 200, volume: 1 }], 'us', 'test-realm')

    vi.setSystemTime(new Date('2026-01-03T00:00:00Z'))
    ingestDailyPriceRows(db, [{ itemId: 1, avgPrice: 300, minPrice: 300, maxPrice: 300, volume: 1 }], 'us', 'test-realm')

    const latest = db
      .prepare(
        "SELECT avg_7d as avg7d, avg_30d as avg30d, stddev_30d as stddev30d FROM item_price_stats WHERE item_id = 1 AND date = '2026-01-03'"
      )
      .get() as { avg7d: number; avg30d: number; stddev30d: number }

    // mean(100, 200, 300) = 200 for both windows, since all three days fall inside them.
    expect(latest.avg7d).toBe(200)
    expect(latest.avg30d).toBe(200)
    // population stddev of [100, 200, 300] around mean 200.
    expect(latest.stddev30d).toBeCloseTo(81.6497, 3)
  })
})

describe('ingestPetPriceRows', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  // Regression test: pet_price_stats.pet_species_id is a foreign key into
  // battle_pets. main/tsm/sync.ts used to call this before upserting the
  // matching battle_pets row, which threw "FOREIGN KEY constraint failed"
  // for any pet not already known locally. The fix (see tsm/sync.ts) is
  // ordering, not schema — this test guards the assumption in the schema
  // that made the ordering matter in the first place.
  it('throws a foreign key error when the referenced battle_pets row does not exist yet', () => {
    expect(() =>
      ingestPetPriceRows(db, [{ petSpeciesId: 99, avgPrice: 500, volume: 3 }], 'us', 'test-realm')
    ).toThrow(/FOREIGN KEY constraint failed/)
  })

  it('succeeds once the battle_pets row exists first', () => {
    db.prepare('INSERT INTO battle_pets (id, name) VALUES (?, ?)').run(99, 'Test Pet')

    expect(() =>
      ingestPetPriceRows(db, [{ petSpeciesId: 99, avgPrice: 500, volume: 3 }], 'us', 'test-realm')
    ).not.toThrow()

    const row = db
      .prepare('SELECT avg_price as avgPrice, volume FROM pet_price_stats WHERE pet_species_id = 99')
      .get()
    expect(row).toEqual({ avgPrice: 500, volume: 3 })
  })
})
