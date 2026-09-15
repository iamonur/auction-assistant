import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Search } from 'lucide-react'
import TopBar from '../components/TopBar'
import FilterChip from '../components/FilterChip'
import MobDropTableModal from '../components/MobDropTableModal'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'
import { useAsyncData } from '../hooks/useAsyncData'
import { formatCopperAsGold } from '../lib/gold'
import { npcRankLabel } from '../lib/npcRank'
import type { MobValueRow } from '@shared/types'

const MAX_ROWS_SHOWN = 300

type RankFilter = 'all' | 0 | 1 | 2 | 3

const RANK_FILTERS: { value: RankFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 0, label: 'Normal' },
  { value: 1, label: 'Elite' },
  { value: 2, label: 'Rare Elite' },
  { value: 3, label: 'Boss' }
]

type SortKey = 'expectedValue' | 'avgGold' | 'spawnCount'

const SORT_ACCESSORS: Record<SortKey, (row: MobValueRow) => number> = {
  expectedValue: (row) => row.expectedValue,
  avgGold: (row) => row.avgGold,
  spawnCount: (row) => row.spawnCount
}

export default function MobValuePage(): React.JSX.Element {
  const { data, loading, error, reload } = useAsyncData(() => window.api.mobValue.list(), [])
  const [search, setSearch] = useState('')
  const [rankFilter, setRankFilter] = useState<RankFilter>('all')
  const [hideZeroValue, setHideZeroValue] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('expectedValue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [selectedMob, setSelectedMob] = useState<{ creatureId: number; name: string } | null>(null)

  const { rows, totalMatching } = useMemo(() => {
    if (!data) return { rows: [] as MobValueRow[], totalMatching: 0 }
    let filtered = data
    if (rankFilter !== 'all') filtered = filtered.filter((row) => row.npcRank === rankFilter)
    if (hideZeroValue) filtered = filtered.filter((row) => row.expectedValue > 0)
    if (search.trim()) {
      const needle = search.trim().toLowerCase()
      filtered = filtered.filter((row) => row.name.toLowerCase().includes(needle))
    }
    const accessor = SORT_ACCESSORS[sortKey]
    const sorted = [...filtered].sort((a, b) => accessor(a) - accessor(b))
    const ordered = sortDir === 'asc' ? sorted : sorted.reverse()
    return { rows: ordered.slice(0, MAX_ROWS_SHOWN), totalMatching: ordered.length }
  }, [data, rankFilter, hideZeroValue, search, sortKey, sortDir])

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
      <TopBar title="Mob Value" onSynced={reload} />

      <div className="flex flex-wrap items-center gap-3 border-b border-surface-border bg-surface px-6 py-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search mob name…"
            className="w-64 rounded-md border border-surface-border bg-surface-panel py-1.5 pl-8 pr-3 text-sm text-zinc-200 focus:border-gold/50 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          {RANK_FILTERS.map((filter) => (
            <FilterChip
              key={filter.value}
              label={filter.label}
              active={rankFilter === filter.value}
              onClick={() => setRankFilter(filter.value)}
            />
          ))}
        </div>

        <label className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={hideZeroValue}
            onChange={(event) => setHideZeroValue(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-surface-border bg-surface-panel accent-[#FFD100]"
          />
          Hide zero-value mobs
        </label>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading && <LoadingState label="Computing expected mob values…" />}
        {error && <ErrorState message={error} />}
        {!loading && !error && rows.length === 0 && (
          <EmptyState message="No mob value data yet. Sync AH data, then check back — this needs both the world-data import and priced items." />
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-600">
              Showing {rows.length.toLocaleString()} of {totalMatching.toLocaleString()} matching mobs
              {totalMatching > MAX_ROWS_SHOWN ? ' — refine your search to see more.' : ''}
            </p>
            <div className="panel overflow-hidden">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-panel text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-3 font-medium">Mob</th>
                    <th className="px-4 py-3 font-medium">Level</th>
                    <th className="px-4 py-3 font-medium">Rank</th>
                    <SortableTh label="Spawns" sortKey="spawnCount" active={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableTh label="Avg Gold" sortKey="avgGold" active={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableTh
                      label="Expected Value"
                      sortKey="expectedValue"
                      active={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                    />
                    <th className="px-4 py-3 font-medium">Loot Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.creatureId}
                      onClick={() => setSelectedMob({ creatureId: row.creatureId, name: row.name })}
                      className="cursor-pointer border-b border-surface-border/60 last:border-0 hover:bg-surface-raised/50"
                    >
                      <td className="px-4 py-3 font-medium text-zinc-200">{row.name}</td>
                      <td className="px-4 py-3 text-zinc-400">
                        {row.minLevel ?? '?'}–{row.maxLevel ?? '?'}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{npcRankLabel(row.npcRank)}</td>
                      <td className="px-4 py-3 text-zinc-300">{row.spawnCount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-zinc-300">{row.avgGold > 0 ? formatCopperAsGold(row.avgGold) : '—'}</td>
                      <td className="px-4 py-3 font-medium text-profit-positive">
                        {formatCopperAsGold(row.expectedValue)}
                      </td>
                      <td
                        className="px-4 py-3 text-xs text-zinc-500"
                        title="Loot items priced from real trade volume vs. skipped (no current listings)"
                      >
                        {row.lootItemsIncluded} priced / {row.lootItemsExcluded} skipped
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selectedMob && (
        <MobDropTableModal
          creatureId={selectedMob.creatureId}
          mobName={selectedMob.name}
          onClose={() => setSelectedMob(null)}
        />
      )}
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
