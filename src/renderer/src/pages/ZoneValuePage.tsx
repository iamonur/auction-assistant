import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Search } from 'lucide-react'
import TopBar from '../components/TopBar'
import FilterChip from '../components/FilterChip'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'
import { useAsyncData } from '../hooks/useAsyncData'
import { formatCopperAsGold } from '../lib/gold'
import type { ZoneType, ZoneValueRow } from '@shared/types'

const MAX_ROWS_SHOWN = 300

const ZONE_TYPE_LABELS: Record<ZoneType, string> = {
  open_world: 'Open World',
  dungeon: 'Dungeon',
  raid: 'Raid',
  unknown: 'Unknown'
}

type TypeFilter = 'all' | ZoneType

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open_world', label: 'Open World' },
  { value: 'dungeon', label: 'Dungeon' },
  { value: 'raid', label: 'Raid' }
]

type SortKey = 'avgMobValue' | 'mobCount' | 'totalSpawns'

const SORT_ACCESSORS: Record<SortKey, (row: ZoneValueRow) => number> = {
  avgMobValue: (row) => row.avgMobValue,
  mobCount: (row) => row.mobCount,
  totalSpawns: (row) => row.totalSpawns
}

export default function ZoneValuePage(): React.JSX.Element {
  const { data, loading, error, reload } = useAsyncData(() => window.api.zoneValue.list(), [])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('avgMobValue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const { rows, totalMatching } = useMemo(() => {
    if (!data) return { rows: [] as ZoneValueRow[], totalMatching: 0 }
    let filtered = data
    if (typeFilter !== 'all') filtered = filtered.filter((row) => row.zoneType === typeFilter)
    if (search.trim()) {
      const needle = search.trim().toLowerCase()
      filtered = filtered.filter((row) => row.zoneName.toLowerCase().includes(needle))
    }
    const accessor = SORT_ACCESSORS[sortKey]
    const sorted = [...filtered].sort((a, b) => accessor(a) - accessor(b))
    const ordered = sortDir === 'asc' ? sorted : sorted.reverse()
    return { rows: ordered.slice(0, MAX_ROWS_SHOWN), totalMatching: ordered.length }
  }, [data, typeFilter, search, sortKey, sortDir])

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
      <TopBar title="Zone Value" onSynced={reload} />

      <div className="flex flex-wrap items-center gap-3 border-b border-surface-border bg-surface px-6 py-3">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search zone name…"
            className="w-64 rounded-md border border-surface-border bg-surface-panel py-1.5 pl-8 pr-3 text-sm text-zinc-200 focus:border-gold/50 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          {TYPE_FILTERS.map((filter) => (
            <FilterChip
              key={filter.value}
              label={filter.label}
              active={typeFilter === filter.value}
              onClick={() => setTypeFilter(filter.value)}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading && <LoadingState label="Computing zone values…" />}
        {error && <ErrorState message={error} />}
        {!loading && !error && rows.length === 0 && (
          <EmptyState message="No zone data yet. Sync AH data, then check back — this needs both the world-data import and priced items." />
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-600">
              Showing {rows.length.toLocaleString()} of {totalMatching.toLocaleString()} matching zones
              {totalMatching > MAX_ROWS_SHOWN ? ' — refine your search to see more.' : ''}
            </p>
            <div className="panel overflow-hidden">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-panel text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-3 font-medium">Zone</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <SortableTh label="Mobs" sortKey="mobCount" active={sortKey} dir={sortDir} onClick={toggleSort} />
                    <SortableTh
                      label="Total Spawns"
                      sortKey="totalSpawns"
                      active={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                    />
                    <SortableTh
                      label="Avg Mob Value"
                      sortKey="avgMobValue"
                      active={sortKey}
                      dir={sortDir}
                      onClick={toggleSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.zoneName}
                      className="border-b border-surface-border/60 last:border-0 hover:bg-surface-raised/50"
                    >
                      <td className="px-4 py-3 font-medium text-zinc-200">{row.zoneName}</td>
                      <td className="px-4 py-3">
                        <ZoneTypeBadge zoneType={row.zoneType} />
                      </td>
                      <td className="px-4 py-3 text-zinc-300">{row.mobCount.toLocaleString()}</td>
                      <td className="px-4 py-3 text-zinc-300">{row.totalSpawns.toLocaleString()}</td>
                      <td className="px-4 py-3 font-medium text-profit-positive">
                        {formatCopperAsGold(row.avgMobValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ZoneTypeBadge({ zoneType }: { zoneType: ZoneType }): React.JSX.Element {
  const classByType: Record<ZoneType, string> = {
    open_world: 'bg-zinc-700/30 text-zinc-400',
    dungeon: 'bg-rarity-uncommon/10 text-rarity-uncommon',
    raid: 'bg-rarity-epic/10 text-rarity-epic',
    unknown: 'bg-zinc-800/50 text-zinc-600'
  }

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${classByType[zoneType]}`}>{ZONE_TYPE_LABELS[zoneType]}</span>
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
