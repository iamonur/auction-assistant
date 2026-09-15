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

interface NodeSpawnRow {
  nodeName: string
  itemId: number
}

export interface GatheringNodeValueRow {
  nodeName: string
  itemId: number
  itemName: string
  value: number | null
}

/**
 * Per-node value, keyed by the gathering node's own real display name
 * (gathering_node_spawns.node_name — resolved at import time from the
 * world database, not derived here), for the addon's gathering-node
 * tooltip. Distinct from listGatheringRows above, which is per-item (the
 * resource itself) for the desktop Gathering Profitability tab — a herb
 * node's display name isn't always the same as the item it yields
 * (mining nodes especially: "Copper Vein" node -> "Copper Ore" item), so
 * matching by node name here avoids needing to guess at that mapping in
 * the addon itself.
 */
export function listGatheringNodeValueRows(db: Database.Database, settings: AppSettings): GatheringNodeValueRow[] {
  const rows = db
    .prepare(
      /* sql */ `
      SELECT DISTINCT node_name as nodeName, item_id as itemId
      FROM gathering_node_spawns
    `
    )
    .all() as NodeSpawnRow[]

  const priceMap = getCheapestPriceMap(db, settings)
  const volumeMap = getSupplyVolumeMap(db, settings)
  const itemNames = new Map(
    (db.prepare('SELECT id, name FROM items').all() as { id: number; name: string }[]).map((row) => [
      row.id,
      row.name
    ])
  )

  return rows.map((row) => {
    const volume = volumeMap.get(row.itemId) ?? 0
    const price = priceMap.get(row.itemId)
    return {
      nodeName: row.nodeName,
      itemId: row.itemId,
      itemName: itemNames.get(row.itemId) ?? `Item #${row.itemId}`,
      value: volume > 0 && price !== undefined ? price : null
    } satisfies GatheringNodeValueRow
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
