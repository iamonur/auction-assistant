import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import TopBar from '../components/TopBar'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'
import { useAsyncData } from '../hooks/useAsyncData'
import { formatCopperAsGold } from '../lib/gold'
import type { PetFarmingRow } from '@shared/types'

type SortKey = 'price' | 'volume'

const SORT_ACCESSORS: Record<SortKey, (row: PetFarmingRow) => number> = {
  price: (row) => row.price ?? Number.NEGATIVE_INFINITY,
  volume: (row) => row.volume
}

export default function PetFarmingPage(): React.JSX.Element {
  const { data, loading, error, reload } = useAsyncData(() => window.api.pets.list(), [])
  const [hideZeroVolume, setHideZeroVolume] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('price')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const rows = useMemo(() => {
    if (!data) return []
    const filtered = hideZeroVolume ? data.filter((row) => row.volume > 0) : data
    const accessor = SORT_ACCESSORS[sortKey]
    const sorted = [...filtered].sort((a, b) => accessor(a) - accessor(b))
    return sortDir === 'asc' ? sorted : sorted.reverse()
  }, [data, hideZeroVolume, sortKey, sortDir])

  const toggleSort = (key: SortKey): void => {
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar title="Battle Pet Farming" onSynced={reload} />

      <div className="flex items-center justify-between border-b border-surface-border bg-surface px-6 py-3">
        <p className="text-xs text-zinc-500">
          Species worth capturing in the wild and caging for sale — from TSM&apos;s pets.csv feed only, no Battle.net
          equivalent.
        </p>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={hideZeroVolume}
            onChange={(event) => setHideZeroVolume(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-surface-border bg-surface-panel accent-[#FFD100]"
          />
          Hide zero-volume items
        </label>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading && <LoadingState label="Loading pet prices…" />}
        {error && <ErrorState message={error} />}
        {!loading && !error && rows.length === 0 && (
          <EmptyState message="No pet price data yet. Sync AH data with TSM as the pricing source." />
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="panel overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-panel text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-4 py-3 font-medium">Pet</th>
                  <SortableTh label="Market Value" sortKey="price" active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableTh label="Volume" sortKey="volume" active={sortKey} dir={sortDir} onClick={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const illiquid = row.volume === 0
                  return (
                    <tr
                      key={row.petSpeciesId}
                      className="border-b border-surface-border/60 last:border-0 hover:bg-surface-raised/50"
                    >
                      <td className="px-4 py-3 font-medium text-zinc-200">{row.petName}</td>
                      <td className={`px-4 py-3 font-medium ${illiquid ? 'text-zinc-600' : 'text-profit-positive'}`}>
                        {row.price !== null ? formatCopperAsGold(row.price) : '—'}
                      </td>
                      <td
                        className={`px-4 py-3 ${illiquid ? 'text-profit-negative/70' : 'text-zinc-300'}`}
                        title={illiquid ? 'No recent sales — treat this price as a low-confidence estimate.' : undefined}
                      >
                        {row.volume.toLocaleString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function SortableTh({
  label,
  sortKey,
  active,
  dir,
  onClick
}: {
  label: string
  sortKey: SortKey
  active: SortKey
  dir: 'asc' | 'desc'
  onClick: (key: SortKey) => void
}): React.JSX.Element {
  const isActive = active === sortKey
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`flex items-center gap-1 transition-colors hover:text-gold ${isActive ? 'text-gold' : ''}`}
      >
        {label}
        {isActive && (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  )
}
