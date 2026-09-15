import type Database from 'better-sqlite3'
import type { ApiTestResult, AppSettings, GameVersion } from '@shared/types'
import { TSM_SUPPORTED_GAME_VERSIONS } from '@shared/gameVersions'
import { fetchPublicDataCsv, type TsmCsvRow } from './client'
import { ingestDailyPriceRows, ingestPetPriceRows, type DailyPriceRow } from '../db/aggregate'

/**
 * Full TSM sync: fetch the free public-data CSVs (items + battle pets)
 * for the configured scope (one realm, or the whole region) and write
 * them straight into item_price_stats / pet_price_stats (TSM already
 * hands back per-item aggregates, so there's no ah_snapshot/ah_listings
 * step here). Both CSVs carry names directly, so — unlike the old
 * OAuth-based flow — this never needs Battle.net credentials just to
 * label a row.
 */
export async function runTsmSync(
  db: Database.Database,
  settings: AppSettings,
  gameVersion: GameVersion
): Promise<ApiTestResult> {
  if (!TSM_SUPPORTED_GAME_VERSIONS.includes(gameVersion)) {
    return { success: false, message: 'TSM pricing is not available for this game version.' }
  }
  if (settings.tsmScope === 'realm' && !settings.tsmRealmSlug) {
    return { success: false, message: 'No realm slug configured.' }
  }

  const realmSlug = settings.tsmScope === 'realm' ? settings.tsmRealmSlug : undefined
  const [itemCsvRows, petCsvRows] = await Promise.all([
    fetchPublicDataCsv(gameVersion, settings.region, settings.tsmScope, 'items', realmSlug),
    fetchPublicDataCsv(gameVersion, settings.region, settings.tsmScope, 'pets', realmSlug).catch(() => [])
  ])

  if (itemCsvRows.length === 0) {
    return { success: false, message: 'TSM returned no pricing data for this scope.' }
  }

  const itemRows: DailyPriceRow[] = itemCsvRows.map((row) => ({
    itemId: row.id,
    avgPrice: row.marketValue,
    minPrice: row.minBuyout ?? row.marketValue,
    maxPrice: row.marketValue,
    volume: row.volume
  }))
  ingestDailyPriceRows(db, itemRows, settings.region, settings.realmName)
  upsertItemNamesFromCsv(db, itemCsvRows)

  if (petCsvRows.length > 0) {
    // battle_pets rows must exist before pet_price_stats references them
    // (pet_species_id is a foreign key) — name upsert runs first.
    upsertPetNamesFromCsv(db, petCsvRows)
    ingestPetPriceRows(
      db,
      petCsvRows.map((row) => ({ petSpeciesId: row.id, avgPrice: row.marketValue, volume: row.volume })),
      settings.region,
      settings.realmName
    )
  }

  const scopeLabel =
    settings.tsmScope === 'realm' ? settings.tsmRealmSlug : `${settings.region.toUpperCase()} region (all realms)`

  return {
    success: true,
    message: `Synced ${itemRows.length.toLocaleString()} item prices and ${petCsvRows.length.toLocaleString()} pet prices from TSM (${scopeLabel}).`,
    listingsImported: itemRows.length + petCsvRows.length
  }
}

export async function testTsmConnection(settings: AppSettings, gameVersion: GameVersion): Promise<ApiTestResult> {
  if (!TSM_SUPPORTED_GAME_VERSIONS.includes(gameVersion)) {
    return { success: false, message: 'TSM pricing is not available for this game version.' }
  }
  if (settings.tsmScope === 'realm' && !settings.tsmRealmSlug) {
    return { success: false, message: 'No realm slug configured.' }
  }
  try {
    const rows = await fetchPublicDataCsv(
      gameVersion,
      settings.region,
      settings.tsmScope,
      'items',
      settings.tsmScope === 'realm' ? settings.tsmRealmSlug : undefined
    )
    return { success: true, message: `Reachable — ${rows.length.toLocaleString()} priced items found.` }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Unknown TSM connection error.' }
  }
}

function upsertItemNamesFromCsv(db: Database.Database, rows: TsmCsvRow[]): void {
  const insertPlaceholder = db.prepare(/* sql */ `
    INSERT INTO items (id, name, quality, category)
    VALUES (?, ?, 1, 'other')
    ON CONFLICT(id) DO UPDATE SET name = excluded.name WHERE items.name LIKE 'Unknown Item #%'
  `)

  const runInserts = db.transaction((namedRows: TsmCsvRow[]) => {
    for (const row of namedRows) {
      insertPlaceholder.run(row.id, row.name ?? `Unknown Item #${row.id}`)
    }
  })
  runInserts(rows.filter((row) => row.name))
}

function upsertPetNamesFromCsv(db: Database.Database, rows: TsmCsvRow[]): void {
  const insertPet = db.prepare(/* sql */ `
    INSERT INTO battle_pets (id, name) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name
  `)

  const runInserts = db.transaction((namedRows: TsmCsvRow[]) => {
    for (const row of namedRows) {
      insertPet.run(row.id, row.name ?? `Unknown Pet #${row.id}`)
    }
  })
  runInserts(rows)
}
