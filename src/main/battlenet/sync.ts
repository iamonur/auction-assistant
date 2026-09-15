import type Database from 'better-sqlite3'
import type { ApiTestResult, AppSettings, GameVersion } from '@shared/types'
import { getAccessToken } from './oauth'
import { fetchConnectedRealmAuctions, fetchItemDetails, resolveConnectedRealmId, type RawAuction } from './client'
import { aggregateSnapshot } from '../db/aggregate'

/** Upper bound on how many never-seen-before items get resolved via the Item API per sync run. */
const MAX_ITEMS_RESOLVED_PER_SYNC = 75
const ITEM_RESOLVE_CONCURRENCY = 5

function auctionUnitPrice(auction: RawAuction): number | null {
  if (typeof auction.unit_price === 'number') return auction.unit_price
  if (typeof auction.buyout === 'number') {
    const quantity = auction.quantity && auction.quantity > 0 ? auction.quantity : 1
    return Math.round(auction.buyout / quantity)
  }
  if (typeof auction.bid === 'number') return auction.bid
  return null
}

/**
 * Full AH sync: authenticate, resolve the connected realm, pull every
 * active auction, persist a new snapshot + listings, resolve a bounded
 * number of previously-unknown items, then roll the snapshot into the
 * rolling price-stat aggregates.
 */
export async function runAhSync(
  db: Database.Database,
  settings: AppSettings,
  gameVersion: GameVersion
): Promise<ApiTestResult> {
  if (!settings.clientId || !settings.clientSecret) {
    return { success: false, message: 'Missing Battle.net Client ID / Client Secret.' }
  }
  if (!settings.realmSlug) {
    return { success: false, message: 'No realm configured.' }
  }

  const token = await getAccessToken(settings.clientId, settings.clientSecret, settings.region)
  const { connectedRealmId, realmName } = await resolveConnectedRealmId(
    settings.region,
    token,
    settings.realmSlug,
    gameVersion
  )
  const auctions = await fetchConnectedRealmAuctions(settings.region, token, connectedRealmId, gameVersion)

  const insertSnapshot = db.prepare(
    'INSERT INTO ah_snapshots (connected_realm_id, region) VALUES (?, ?)'
  )
  const insertListing = db.prepare(
    'INSERT INTO ah_listings (snapshot_id, item_id, unit_price, quantity, time_left) VALUES (?, ?, ?, ?, ?)'
  )
  const knownItemStmt = db.prepare('SELECT 1 FROM items WHERE id = ?')
  const insertResolvedItem = db.prepare(/* sql */ `
    INSERT INTO items (id, name, quality, icon, item_level, vendor_price, category)
    VALUES (@id, @name, @quality, @icon, @itemLevel, @vendorPrice, 'other')
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      quality = excluded.quality,
      icon = excluded.icon,
      item_level = excluded.item_level,
      vendor_price = excluded.vendor_price
  `)

  const snapshotId = Number(insertSnapshot.run(connectedRealmId, settings.region).lastInsertRowid)

  const insertListingsTx = db.transaction((rows: RawAuction[]) => {
    for (const auction of rows) {
      const unitPrice = auctionUnitPrice(auction)
      if (unitPrice === null) continue
      insertListing.run(snapshotId, auction.item.id, unitPrice, auction.quantity ?? 1, auction.time_left)
    }
  })
  insertListingsTx(auctions)

  const unknownItemIds = [...new Set(auctions.map((a) => a.item.id))]
    .filter((id) => !knownItemStmt.get(id))
    .slice(0, MAX_ITEMS_RESOLVED_PER_SYNC)

  await resolveItemsInBatches(unknownItemIds, ITEM_RESOLVE_CONCURRENCY, async (itemId) => {
    try {
      const details = await fetchItemDetails(settings.region, token, itemId, gameVersion)
      insertResolvedItem.run({
        id: details.id,
        name: details.name,
        quality: details.quality,
        icon: details.icon,
        itemLevel: details.itemLevel,
        vendorPrice: details.vendorPrice
      })
    } catch {
      // Best-effort enrichment — a failed lookup just leaves the item
      // unresolved until a future sync retries it.
    }
  })

  aggregateSnapshot(db, snapshotId, settings.region, realmName)

  return {
    success: true,
    message: `Synced ${auctions.length.toLocaleString()} auctions for ${realmName} (${settings.region.toUpperCase()}).`,
    listingsImported: auctions.length
  }
}

export async function testConnection(settings: AppSettings, gameVersion: GameVersion): Promise<ApiTestResult> {
  if (!settings.clientId || !settings.clientSecret) {
    return { success: false, message: 'Missing Battle.net Client ID / Client Secret.' }
  }
  try {
    const token = await getAccessToken(settings.clientId, settings.clientSecret, settings.region)
    if (!settings.realmSlug) {
      return { success: true, message: 'OAuth credentials valid. Select a realm to sync auction data.' }
    }
    const { realmName } = await resolveConnectedRealmId(settings.region, token, settings.realmSlug, gameVersion)
    return { success: true, message: `Connected. Resolved realm: ${realmName}.` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unknown connection error.' }
  }
}

async function resolveItemsInBatches(
  ids: number[],
  concurrency: number,
  worker: (id: number) => Promise<void>
): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
    while (cursor < ids.length) {
      const id = ids[cursor]
      cursor += 1
      await worker(id)
    }
  })
  await Promise.all(runners)
}
