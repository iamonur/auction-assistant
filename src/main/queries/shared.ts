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
 * Cheapest currently-available unit price per item, for the app's active
 * (region, realm). Reads from item_price_stats — populated identically by
 * either pricing source (see db/aggregate.ts#ingestDailyPriceRows) — so
 * every feature query below works the same whether the last sync came
 * from the Battle.net AH or TSM's crowd-sourced pricing.
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

  return new Map(rows.map((row) => [row.itemId, row.price]))
}

/** Listed/tracked quantity per item for the app's active (region, realm), from the latest daily stat row. */
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

  return new Map(rows.map((row) => [row.itemId, row.volume]))
}

/**
 * Cheapest price + volume for a single item, for the app's active (region,
 * realm) — the single-item counterpart to getCheapestPriceMap/
 * getSupplyVolumeMap above, for call sites (like the item detail popup)
 * that only need one item and shouldn't pay for a full-table scan.
 * Same liquidity gate as the rest of the app: price is null when volume
 * is 0, since a TSM region-wide marketValue with no backing sales isn't
 * a real observed price.
 */
export function getItemPriceInfo(
  db: Database.Database,
  settings: AppSettings,
  itemId: number
): { price: number | null; volume: number } {
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
