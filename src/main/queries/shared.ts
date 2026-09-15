import type Database from 'better-sqlite3'
import type { AppSettings } from '@shared/types'

export interface LatestSnapshotMeta {
  id: number
  region: string
  connectedRealmId: number
  fetchedAt: string
}

export function getLatestSnapshot(db: Database.Database): LatestSnapshotMeta | null {
  const row = db
    .prepare(
      'SELECT id, region, connected_realm_id as connectedRealmId, fetched_at as fetchedAt FROM ah_snapshots ORDER BY id DESC LIMIT 1'
    )
    .get() as LatestSnapshotMeta | undefined
  return row ?? null
}

/**
 * How fresh the addon's in-game AH scan has to be to be trusted over
 * item_price_stats (TSM/Battle.net) — "a day old or so." Past this, a
 * scan is more likely to be misleading than helpful (prices move, and a
 * scan that old is exactly the kind of stale data this whole precedence
 * rule exists to avoid surfacing as if it were current).
 */
export const AH_SCAN_FRESHNESS_HOURS = 24

interface ScanRow {
  itemId: number
  price: number
  volume: number
}

/** Every fresh-enough AH scan row for the app's active (region, realm), keyed by item id. See getCheapestPriceMap for how this gets layered over item_price_stats. */
function getFreshScanMap(db: Database.Database, settings: AppSettings): Map<number, ScanRow> {
  const rows = db
    .prepare(
      /* sql */ `
      SELECT item_id as itemId, price, volume
      FROM ah_scan_price_stats
      WHERE region = ? AND realm = ? AND scanned_at >= datetime('now', ?)
    `
    )
    .all(settings.region, settings.realmName, `-${AH_SCAN_FRESHNESS_HOURS} hours`) as ScanRow[]

  return new Map(rows.map((row) => [row.itemId, row]))
}

/**
 * Cheapest currently-available unit price per item, for the app's active
 * (region, realm). An item with a fresh AH scan (see
 * AH_SCAN_FRESHNESS_HOURS) reflects that scan; everything else falls back
 * to item_price_stats, populated identically by either pricing source
 * (see db/aggregate.ts#ingestDailyPriceRows) — so every feature query
 * below works the same regardless of which of the three sources actually
 * supplied a given item's price.
 */
export function getCheapestPriceMap(db: Database.Database, settings: AppSettings): Map<number, number> {
  const rows = db
    .prepare(
      /* sql */ `
      SELECT item_id as itemId, min_price as price
      FROM item_price_stats
      WHERE region = ? AND realm = ? AND date = (
        SELECT MAX(date) FROM item_price_stats WHERE region = ? AND realm = ?
      )
    `
    )
    .all(settings.region, settings.realmName, settings.region, settings.realmName) as {
    itemId: number
    price: number
  }[]

  const result = new Map(rows.map((row) => [row.itemId, row.price]))
  for (const [itemId, scan] of getFreshScanMap(db, settings)) {
    result.set(itemId, scan.price)
  }
  return result
}

/** Listed/tracked quantity per item for the app's active (region, realm), from the latest daily stat row — or a fresh AH scan, per the same precedence as getCheapestPriceMap. */
export function getSupplyVolumeMap(db: Database.Database, settings: AppSettings): Map<number, number> {
  const rows = db
    .prepare(
      /* sql */ `
      SELECT item_id as itemId, volume
      FROM item_price_stats
      WHERE region = ? AND realm = ? AND date = (
        SELECT MAX(date) FROM item_price_stats WHERE region = ? AND realm = ?
      )
    `
    )
    .all(settings.region, settings.realmName, settings.region, settings.realmName) as {
    itemId: number
    volume: number
  }[]

  const result = new Map(rows.map((row) => [row.itemId, row.volume]))
  for (const [itemId, scan] of getFreshScanMap(db, settings)) {
    result.set(itemId, scan.volume)
  }
  return result
}

/**
 * Cheapest price + volume for a single item, for the app's active (region,
 * realm) — the single-item counterpart to getCheapestPriceMap/
 * getSupplyVolumeMap above, for call sites (like the item detail popup)
 * that only need one item and shouldn't pay for a full-table scan. Same
 * AH-scan-over-item_price_stats precedence as the map versions.
 * Same liquidity gate as the rest of the app: price is null when volume
 * is 0, since a TSM region-wide marketValue with no backing sales isn't
 * a real observed price.
 */
export function getItemPriceInfo(
  db: Database.Database,
  settings: AppSettings,
  itemId: number
): { price: number | null; volume: number } {
  const scanRow = db
    .prepare(
      /* sql */ `
      SELECT price, volume
      FROM ah_scan_price_stats
      WHERE item_id = ? AND region = ? AND realm = ? AND scanned_at >= datetime('now', ?)
    `
    )
    .get(itemId, settings.region, settings.realmName, `-${AH_SCAN_FRESHNESS_HOURS} hours`) as
    | { price: number; volume: number }
    | undefined

  if (scanRow) {
    return { price: scanRow.volume > 0 ? scanRow.price : null, volume: scanRow.volume }
  }

  const row = db
    .prepare(
      /* sql */ `
      SELECT min_price as price, volume
      FROM item_price_stats
      WHERE item_id = ? AND region = ? AND realm = ? AND date = (
        SELECT MAX(date) FROM item_price_stats WHERE region = ? AND realm = ?
      )
    `
    )
    .get(itemId, settings.region, settings.realmName, settings.region, settings.realmName) as
    | { price: number; volume: number }
    | undefined

  if (!row) return { price: null, volume: 0 }
  return { price: row.volume > 0 ? row.price : null, volume: row.volume }
}

/** AH cut applied to every sale (5% in Classic). */
export const AH_CUT_RATE = 0.05
