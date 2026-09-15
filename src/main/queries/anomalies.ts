import type Database from 'better-sqlite3'
import type { AppSettings, ItemQuality, MarketAnomalyRow } from '@shared/types'

const Z_SCORE_THRESHOLD = -1.5
const PERCENT_OF_AVG_THRESHOLD = 0.7

interface LatestStatRow {
  itemId: number
  itemName: string
  icon: string | null
  quality: ItemQuality
  isBoe: number
  avgPrice: number
  avg30d: number | null
  stddev30d: number | null
}

/** Items currently priced far below their 30-day average — either statistically (z-score) or by simple ratio. */
export function listMarketAnomalies(db: Database.Database, settings: AppSettings): MarketAnomalyRow[] {
  const rows = db
    .prepare(
      /* sql */ `
      SELECT ips.item_id as itemId, i.name as itemName, i.icon as icon, i.quality as quality, i.is_boe as isBoe,
             ips.avg_price as avgPrice, ips.avg_30d as avg30d, ips.stddev_30d as stddev30d
      FROM item_price_stats ips
      JOIN items i ON i.id = ips.item_id
      JOIN (
        SELECT item_id, MAX(date) as maxDate
        FROM item_price_stats
        WHERE region = @region AND realm = @realm
        GROUP BY item_id
      ) latest ON latest.item_id = ips.item_id AND latest.maxDate = ips.date
      WHERE ips.region = @region AND ips.realm = @realm AND ips.avg_30d IS NOT NULL
    `
    )
    .all({ region: settings.region, realm: settings.realmName }) as LatestStatRow[]

  const anomalies: MarketAnomalyRow[] = []

  for (const row of rows) {
    if (row.avg30d === null || row.avg30d === 0) continue

    const zScore = row.stddev30d && row.stddev30d > 0 ? (row.avgPrice - row.avg30d) / row.stddev30d : null
    const percentOfAvg = row.avgPrice / row.avg30d

    const isAnomaly = (zScore !== null && zScore <= Z_SCORE_THRESHOLD) || percentOfAvg <= PERCENT_OF_AVG_THRESHOLD
    if (!isAnomaly) continue

    anomalies.push({
      itemId: row.itemId,
      itemName: row.itemName,
      icon: row.icon,
      quality: row.quality,
      isBoe: Boolean(row.isBoe),
      currentPrice: row.avgPrice,
      avg30d: row.avg30d,
      stddev30d: row.stddev30d,
      zScore: zScore !== null ? Number(zScore.toFixed(2)) : null,
      percentOfAvg: Number((percentOfAvg * 100).toFixed(1))
    })
  }

  return anomalies.sort((a, b) => (a.zScore ?? 0) - (b.zScore ?? 0))
}
