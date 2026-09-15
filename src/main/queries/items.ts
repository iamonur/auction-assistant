import type Database from 'better-sqlite3'
import type { AppSettings, ItemQuality, ItemSearchResult } from '@shared/types'
import { getCheapestPriceMap } from './shared'

const SEARCH_LIMIT = 20

interface ItemRow {
  id: number
  name: string
  quality: ItemQuality
}

/** Case-insensitive substring search over the local item catalog, used by the Dungeon Selecting item picker. */
export function searchItems(db: Database.Database, query: string, settings: AppSettings): ItemSearchResult[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []

  const rows = db
    .prepare('SELECT id, name, quality FROM items WHERE name LIKE ? COLLATE NOCASE ORDER BY name ASC LIMIT ?')
    .all(`%${trimmed}%`, SEARCH_LIMIT) as ItemRow[]

  const priceMap = getCheapestPriceMap(db, settings)

  return rows.map((row) => ({
    itemId: row.id,
    itemName: row.name,
    quality: row.quality,
    currentPrice: priceMap.get(row.id) ?? null
  }))
}
