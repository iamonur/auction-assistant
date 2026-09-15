import { useMemo, useState } from 'react'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts'
import TopBar from '../components/TopBar'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'
import { useAsyncData } from '../hooks/useAsyncData'
import { useItemDetailModal } from '../hooks/useItemDetailModal'
import { formatCopperAsGold } from '../lib/gold'
import { rarityBorderClass, rarityTextClass } from '../lib/rarity'
import type { GatheringItemRow, Profession } from '@shared/types'

const GATHERING_PROFESSIONS: Extract<Profession, 'Herbalism' | 'Mining' | 'Skinning' | 'Fishing'>[] = [
  'Herbalism',
  'Mining',
  'Skinning',
  'Fishing'
]

export default function GatheringProfitabilityPage(): React.JSX.Element {
  const { data, loading, error, reload } = useAsyncData(() => window.api.gathering.list(), [])
  const { openItem, itemDetailModal } = useItemDetailModal()
  const [professionFilter, setProfessionFilter] = useState<(typeof GATHERING_PROFESSIONS)[number]>('Herbalism')

  const rows = useMemo(() => {
    if (!data) return []
    return data
      .filter((row) => row.profession === professionFilter)
      .sort((a, b) => (b.unitPrice ?? 0) - (a.unitPrice ?? 0))
  }, [data, professionFilter])

  return (
    <div className="flex h-full flex-col">
      <TopBar title="Gathering Profitability" onSynced={reload} />

      <div className="flex items-center gap-2 border-b border-surface-border bg-surface px-6 py-3">
        {GATHERING_PROFESSIONS.map((profession) => (
          <button
            key={profession}
            type="button"
            onClick={() => setProfessionFilter(profession)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              professionFilter === profession
                ? 'border-gold/40 bg-gold/15 text-gold'
                : 'border-surface-border text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
            }`}
          >
            {profession}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading && <LoadingState label="Loading gathering prices…" />}
        {error && <ErrorState message={error} />}
        {!loading && !error && rows.length === 0 && (
          <EmptyState message="No priced items for this profession yet. Sync AH data first." />
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <GatheringCard key={row.itemId} row={row} onSelect={() => openItem(row.itemId)} />
            ))}
          </div>
        )}
      </div>

      {itemDetailModal}
    </div>
  )
}

function GatheringCard({ row, onSelect }: { row: GatheringItemRow; onSelect: () => void }): React.JSX.Element {
  return (
    <div className={`panel flex flex-col gap-3 p-4 ${rarityBorderClass(row.quality)}`}>
      <div className="flex items-start justify-between">
        <button type="button" onClick={onSelect} className={`font-medium hover:underline ${rarityTextClass(row.quality)}`}>
          {row.itemName}
        </button>
        <TrendBadge trend={row.trend7d} />
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="Unit price" value={formatCopperAsGold(row.unitPrice)} />
        <Stat label="Stack (x20)" value={formatCopperAsGold(row.stackPrice)} />
        <Stat label="Supply" value={row.supplyVolume.toLocaleString()} />
        <Stat label="7d points" value={row.history.length.toString()} />
      </div>

      {row.history.length > 1 && (
        <div className="h-12">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={row.history}>
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Tooltip
                formatter={(value: number) => formatCopperAsGold(value)}
                labelFormatter={(label: string) => label}
                contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', fontSize: 12 }}
              />
              <Line type="monotone" dataKey="avgPrice" stroke="#FFD100" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-zinc-200">{value}</p>
    </div>
  )
}

function TrendBadge({ trend }: { trend: GatheringItemRow['trend7d'] }): React.JSX.Element {
  if (trend === 'up') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-profit-positive/10 px-2 py-0.5 text-xs text-profit-positive">
        <TrendingUp size={12} /> Up
      </span>
    )
  }
  if (trend === 'down') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-profit-negative/10 px-2 py-0.5 text-xs text-profit-negative">
        <TrendingDown size={12} /> Down
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-zinc-700/30 px-2 py-0.5 text-xs text-zinc-400">
      <Minus size={12} /> {trend === 'flat' ? 'Flat' : 'N/A'}
    </span>
  )
}
