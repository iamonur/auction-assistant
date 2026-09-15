import type Database from 'better-sqlite3'
import type { AppSettings, GatheringItemRow, ItemQuality, Profession } from '@shared/types'
import { getCheapestPriceMap, getSupplyVolumeMap } from './shared'

const STACK_SIZE = 20

interface GatherableItemRow {
  id: number
  name: string
  icon: string | null
  quality: ItemQuality
  gatheringProfession: Extract<Profession, 'Herbalism' | 'Mining' | 'Skinning' | 'Fishing'>
}

interface HistoryRow {
  date: string
  avgPrice: number
}

export function listGatheringRows(db: Database.Database, settings: AppSettings): GatheringItemRow[] {
  const items = db
    .prepare(
      /* sql */ `
      SELECT id, name, icon, quality, gathering_profession as gatheringProfession
      FROM items
      WHERE gathering_profession IS NOT NULL
    `
    )
    .all() as GatherableItemRow[]

  const priceMap = getCheapestPriceMap(db, settings)
  const volumeMap = getSupplyVolumeMap(db, settings)

  const historyStmt = db.prepare(
    /* sql */ `
    SELECT date, avg_price as avgPrice
    FROM item_price_stats
    WHERE item_id = ? AND region = ? AND realm = ? AND date >= date('now', '-7 day')
    ORDER BY date ASC
  `
  )

  return items.map((item) => {
    const unitPrice = priceMap.get(item.id) ?? null
    const history = historyStmt.all(item.id, settings.region, settings.realmName) as HistoryRow[]

    return {
      itemId: item.id,
      itemName: item.name,
      icon: item.icon,
      quality: item.quality,
      profession: item.gatheringProfession,
      unitPrice,
      stackPrice: unitPrice !== null ? unitPrice * STACK_SIZE : null,
      supplyVolume: volumeMap.get(item.id) ?? 0,
      trend7d: computeTrend(history),
      history
    } satisfies GatheringItemRow
  })
}

function computeTrend(history: HistoryRow[]): GatheringItemRow['trend7d'] {
  if (history.length < 2) return 'unknown'
  const first = history[0].avgPrice
  const last = history[history.length - 1].avgPrice
  if (first === 0) return 'unknown'
  const changeRatio = (last - first) / first
  if (changeRatio > 0.03) return 'up'
  if (changeRatio < -0.03) return 'down'
  return 'flat'
}
