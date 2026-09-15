import type Database from 'better-sqlite3'

interface ListingAggregate {
  item_id: number
  avg_price: number
  min_price: number
  max_price: number
  volume: number
}

export interface DailyPriceRow {
  itemId: number
  avgPrice: number
  minPrice: number
  maxPrice: number
  volume: number
}

/**
 * Rolls a freshly-fetched Battle.net AH snapshot into `item_price_stats`
 * by collapsing its raw listings into one (avg/min/max/volume) row per
 * item, then delegates to ingestDailyPriceRows for the rolling-stat pass.
 * TSM sync (main/tsm/sync.ts) skips this step and calls
 * ingestDailyPriceRows directly, since TSM already hands back
 * pre-aggregated per-item stats instead of raw listings.
 */
export function aggregateSnapshot(
  db: Database.Database,
  snapshotId: number,
  region: string,
  realm: string
): void {
  const listingAggregates = db
    .prepare(
      /* sql */ `
      SELECT
        item_id,
        CAST(ROUND(SUM(unit_price * quantity) * 1.0 / SUM(quantity)) AS INTEGER) AS avg_price,
        MIN(unit_price) AS min_price,
        MAX(unit_price) AS max_price,
        SUM(quantity) AS volume
      FROM ah_listings
      WHERE snapshot_id = ?
      GROUP BY item_id
    `
    )
    .all(snapshotId) as ListingAggregate[]

  ingestDailyPriceRows(
    db,
    listingAggregates.map((row) => ({
      itemId: row.item_id,
      avgPrice: row.avg_price,
      minPrice: row.min_price,
      maxPrice: row.max_price,
      volume: row.volume
    })),
    region,
    realm
  )
}

/**
 * Source-agnostic ingestion: upserts one "today" row per item into
 * item_price_stats, then recomputes each touched item's 7-day / 30-day
 * rolling average and 30-day population standard deviation from the
 * resulting daily history. Runs inside a single transaction so a crash
 * mid-ingestion can't leave item_price_stats half-updated.
 */
export function ingestDailyPriceRows(
  db: Database.Database,
  rows: DailyPriceRow[],
  region: string,
  realm: string
): void {
  const today = new Date().toISOString().slice(0, 10)

  const upsertDailyStat = db.prepare(/* sql */ `
    INSERT INTO item_price_stats (item_id, region, realm, date, avg_price, min_price, max_price, volume, updated_at)
    VALUES (@itemId, @region, @realm, @date, @avgPrice, @minPrice, @maxPrice, @volume, datetime('now'))
    ON CONFLICT(item_id, region, realm, date) DO UPDATE SET
      avg_price = excluded.avg_price,
      min_price = excluded.min_price,
      max_price = excluded.max_price,
      volume = excluded.volume,
      updated_at = excluded.updated_at
  `)

  const historyStmt = db.prepare(/* sql */ `
    SELECT avg_price FROM item_price_stats
    WHERE item_id = ? AND region = ? AND realm = ? AND date >= ?
    ORDER BY date ASC
  `)

  const updateRollingStmt = db.prepare(/* sql */ `
    UPDATE item_price_stats
    SET avg_7d = @avg7d, avg_30d = @avg30d, stddev_30d = @stddev30d, updated_at = datetime('now')
    WHERE item_id = @itemId AND region = @region AND realm = @realm AND date = @date
  `)

  const runIngestion = db.transaction((priceRows: DailyPriceRow[]) => {
    const sevenDaysAgo = shiftDate(today, -7)
    const thirtyDaysAgo = shiftDate(today, -30)

    for (const row of priceRows) {
      upsertDailyStat.run({
        itemId: row.itemId,
        region,
        realm,
        date: today,
        avgPrice: row.avgPrice,
        minPrice: row.minPrice,
        maxPrice: row.maxPrice,
        volume: row.volume
      })

      const last7 = (historyStmt.all(row.itemId, region, realm, sevenDaysAgo) as { avg_price: number }[]).map(
        (r) => r.avg_price
      )
      const last30 = (historyStmt.all(row.itemId, region, realm, thirtyDaysAgo) as { avg_price: number }[]).map(
        (r) => r.avg_price
      )

      const avg7d = mean(last7)
      const avg30d = mean(last30)
      const stddev30d = stddev(last30, avg30d)

      updateRollingStmt.run({
        avg7d,
        avg30d,
        stddev30d,
        itemId: row.itemId,
        region,
        realm,
        date: today
      })
    }
  })

  runIngestion(rows)
}

export interface PetPriceRow {
  petSpeciesId: number
  avgPrice: number
  volume: number
}

/** Simpler sibling of ingestDailyPriceRows for battle pets — no rolling 7d/30d stats, just today's price/volume (see pet_price_stats). */
export function ingestPetPriceRows(db: Database.Database, rows: PetPriceRow[], region: string, realm: string): void {
  const today = new Date().toISOString().slice(0, 10)

  const upsertDailyStat = db.prepare(/* sql */ `
    INSERT INTO pet_price_stats (pet_species_id, region, realm, date, avg_price, volume, updated_at)
    VALUES (@petSpeciesId, @region, @realm, @date, @avgPrice, @volume, datetime('now'))
    ON CONFLICT(pet_species_id, region, realm, date) DO UPDATE SET
      avg_price = excluded.avg_price,
      volume = excluded.volume,
      updated_at = excluded.updated_at
  `)

  const runIngestion = db.transaction((priceRows: PetPriceRow[]) => {
    for (const row of priceRows) {
      upsertDailyStat.run({ petSpeciesId: row.petSpeciesId, region, realm, date: today, avgPrice: row.avgPrice, volume: row.volume })
    }
  })

  runIngestion(rows)
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function stddev(values: number[], precomputedMean: number | null): number | null {
  if (values.length === 0 || precomputedMean === null) return null
  const variance = values.reduce((sum, v) => sum + (v - precomputedMean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function shiftDate(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
