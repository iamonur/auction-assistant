import { useMemo, useState } from 'react'
import TopBar from '../components/TopBar'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'
import { useAsyncData } from '../hooks/useAsyncData'
import { useItemDetailModal } from '../hooks/useItemDetailModal'
import { formatCopperAsGold } from '../lib/gold'
import { rarityBorderClass, rarityTextClass } from '../lib/rarity'

export default function MarketAnomaliesPage(): React.JSX.Element {
  const { data, loading, error, reload } = useAsyncData(() => window.api.anomalies.list(), [])
  const { openItem, itemDetailModal } = useItemDetailModal()
  const [boeOnly, setBoeOnly] = useState(false)

  const rows = useMemo(() => {
    if (!data) return []
    return boeOnly ? data.filter((row) => row.isBoe) : data
  }, [data, boeOnly])

  return (
    <div className="flex h-full flex-col">
      <TopBar title="Investment & Market Anomalies" onSynced={reload} />

      <div className="flex items-center gap-3 border-b border-surface-border bg-surface px-6 py-3">
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={boeOnly}
            onChange={(event) => setBoeOnly(event.target.checked)}
            className="h-4 w-4 rounded border-surface-border bg-surface-panel accent-[#FFD100]"
          />
          BoE gear only
        </label>
        <span className="text-xs text-zinc-500">Flags items at z-score ≤ -1.5 or ≤ 70% of 30-day average.</span>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading && <LoadingState label="Scanning for anomalies…" />}
        {error && <ErrorState message={error} />}
        {!loading && !error && rows.length === 0 && (
          <EmptyState message="No anomalies detected — nothing is currently trading well below its historical average." />
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="panel overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-panel text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Current Price</th>
                  <th className="px-4 py-3 font-medium">30d Avg</th>
                  <th className="px-4 py-3 font-medium">% of Avg</th>
                  <th className="px-4 py-3 font-medium">Z-Score</th>
                  <th className="px-4 py-3 font-medium">BoE</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.itemId}
                    className={`border-b border-surface-border/60 last:border-0 hover:bg-surface-raised/50 ${rarityBorderClass(row.quality)}`}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openItem(row.itemId)}
                        className={`font-medium hover:underline ${rarityTextClass(row.quality)}`}
                      >
                        {row.itemName}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-profit-positive font-medium">
                      {formatCopperAsGold(row.currentPrice)}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{formatCopperAsGold(row.avg30d)}</td>
                    <td className="px-4 py-3 text-zinc-300">{row.percentOfAvg}%</td>
                    <td className="px-4 py-3 text-zinc-300">{row.zScore ?? '—'}</td>
                    <td className="px-4 py-3">
                      {row.isBoe && (
                        <span className="rounded-full bg-rarity-rare/10 px-2 py-0.5 text-xs text-rarity-rare">
                          BoE
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {itemDetailModal}
    </div>
  )
}
