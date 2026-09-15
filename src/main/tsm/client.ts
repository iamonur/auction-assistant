import type { GameVersion, Region } from '@shared/types'
import { TSM_PUBLIC_DATA_GAME_TYPE } from '@shared/gameVersions'

const PUBLIC_DATA_BASE = 'https://public-data.tradeskillmaster.com'

export type TsmAssetType = 'items' | 'pets'

/**
 * TSM's free, unauthenticated pricing feed — confirmed live for retail,
 * classic (Era), and classic-progression, for both items.csv and
 * pets.csv (identical shape, petSpeciesId in place of itemId — caged
 * pets of every species share one generic item id in the item catalog,
 * so TSM breaks them out separately). No API key, no OAuth, no account.
 * Region-wide files add saleRate/soldPerDay; realm files swap those for
 * minBuyout — both carry marketValue/historical and, usefully, the
 * item's/pet's own name (TSM resolves that server-side, so this app
 * never needs Battle.net credentials just to label a TSM-sourced row).
 */
function buildUrl(
  gameVersion: GameVersion,
  region: Region,
  scope: 'region' | 'realm',
  assetType: TsmAssetType,
  realmSlug?: string
): string {
  const gameType = TSM_PUBLIC_DATA_GAME_TYPE[gameVersion]
  const fileName = assetType === 'pets' ? 'pets.csv' : 'items.csv'
  if (scope === 'realm') {
    if (!realmSlug) throw new Error('Realm slug is required for realm-scoped TSM pricing.')
    return `${PUBLIC_DATA_BASE}/${gameType}/${region}/realm/${encodeURIComponent(realmSlug)}/${fileName}`
  }
  return `${PUBLIC_DATA_BASE}/${gameType}/${region}/region/${fileName}`
}

/** Minimal RFC4180 CSV line splitter — item names are the only field likely to need quoting (commas/quotes), everything else here is numeric. Exported for direct unit testing. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  const n = text.length

  while (i < n) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r') {
      i++
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i++
      continue
    }
    field += ch
    i++
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '')
}

export interface TsmCsvRow {
  /** itemId for the items.csv feed, petSpeciesId for pets.csv. */
  id: number
  name: string | null
  marketValue: number
  minBuyout: number | null
  volume: number
}

function findColumn(header: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = header.indexOf(candidate)
    if (index !== -1) return index
  }
  return -1
}

/** Fetches and parses one public-data CSV (region-wide or a specific realm; items or battle pets). */
export async function fetchPublicDataCsv(
  gameVersion: GameVersion,
  region: Region,
  scope: 'region' | 'realm',
  assetType: TsmAssetType,
  realmSlug?: string
): Promise<TsmCsvRow[]> {
  const url = buildUrl(gameVersion, region, scope, assetType, realmSlug)
  const response = await fetch(url)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`TSM public-data request failed (${response.status}) for ${url}: ${body.slice(0, 200) || response.statusText}`)
  }
  const text = await response.text()
  const table = parseCsv(text)
  if (table.length === 0) return []

  const header = table[0]
  const idCol = findColumn(header, assetType === 'pets' ? ['petSpeciesId'] : ['itemId'])
  const nameCol = findColumn(header, ['name'])
  const marketValueCol = findColumn(header, ['marketValue', 'regionMarketValue'])
  const minBuyoutCol = findColumn(header, ['minBuyout'])
  const soldPerDayCol = findColumn(header, ['soldPerDay'])

  if (idCol === -1 || marketValueCol === -1) {
    throw new Error(`TSM public-data CSV at ${url} is missing expected columns (got: ${header.join(', ')}).`)
  }

  const rows: TsmCsvRow[] = []
  for (const record of table.slice(1)) {
    const id = Number(record[idCol])
    const marketValue = Number(record[marketValueCol])
    if (!Number.isFinite(id) || !Number.isFinite(marketValue)) continue

    rows.push({
      id,
      name: nameCol !== -1 ? record[nameCol] || null : null,
      marketValue: Math.round(marketValue),
      minBuyout: minBuyoutCol !== -1 && record[minBuyoutCol] ? Math.round(Number(record[minBuyoutCol])) : null,
      // Neither region nor realm files carry a listed-quantity column —
      // soldPerDay (region-wide only) is the closest available proxy for
      // market activity; realm files have no such field at all.
      volume: soldPerDayCol !== -1 ? Math.round(Number(record[soldPerDayCol]) || 0) : 0
    })
  }
  return rows
}
