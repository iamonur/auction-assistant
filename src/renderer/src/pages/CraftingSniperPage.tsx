import { Fragment, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GitMerge } from 'lucide-react'
import TopBar from '../components/TopBar'
import FilterChip from '../components/FilterChip'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'
import { useAsyncData } from '../hooks/useAsyncData'
import { useItemDetailModal } from '../hooks/useItemDetailModal'
import ReagentBreakdown from '../components/ReagentBreakdown'
import { formatCopperAsGold } from '../lib/gold'
import { rarityBorderClass, rarityTextClass } from '../lib/rarity'
import type { CraftingSnipeRow, Profession } from '@shared/types'

const TABLE_COLUMN_COUNT = 9

const PROFESSIONS: Profession[] = ['Alchemy', 'Blacksmithing', 'Engineering', 'Leatherworking', 'Tailoring']

type SortKey = 'netWithReagent' | 'netIgnoringReagent' | 'roi' | 'craftCost' | 'salePrice' | 'volume'

const SORT_ACCESSORS: Record<SortKey, (row: CraftingSnipeRow) => number> = {
  netWithReagent: (row) => row.netProfitWithReagentCost ?? Number.NEGATIVE_INFINITY,
  netIgnoringReagent: (row) => row.netProfitIgnoringReagentCost ?? Number.NEGATIVE_INFINITY,
  roi: (row) => row.roiPercent ?? Number.NEGATIVE_INFINITY,
  craftCost: (row) => row.craftCost ?? Number.POSITIVE_INFINITY,
  salePrice: (row) => row.salePrice ?? Number.NEGATIVE_INFINITY,
  volume: (row) => row.volume
}

export default function CraftingSniperPage(): React.JSX.Element {
  const { data, loading, error, reload } = useAsyncData(() => window.api.crafting.list(), [])
  const { openItem, itemDetailModal } = useItemDetailModal()
  const [professionFilter, setProfessionFilter] = useState<Profession | 'All'>('All')
  const [hideZeroVolume, setHideZeroVolume] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('netWithReagent')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [expandedRecipeId, setExpandedRecipeId] = useState<number | null>(null)

  const rows = useMemo(() => {
    if (!data) return []
    let filtered = professionFilter === 'All' ? data : data.filter((row) => row.profession === professionFilter)
    if (hideZeroVolume) filtered = filtered.filter((row) => row.volume > 0)
    const accessor = SORT_ACCESSORS[sortKey]
    const sorted = [...filtered].sort((a, b) => accessor(a) - accessor(b))
    return sortDir === 'asc' ? sorted : sorted.reverse()
  }, [data, professionFilter, hideZeroVolume, sortKey, sortDir])

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
      <TopBar title="Crafting Sniper" onSynced={reload} />

      <div className="flex flex-wrap items-center gap-3 border-b border-surface-border bg-surface px-6 py-3">
        <div className="flex items-center gap-2">
          <FilterChip label="All" active={professionFilter === 'All'} onClick={() => setProfessionFilter('All')} />
          {PROFESSIONS.map((profession) => (
            <FilterChip
              key={profession}
              label={profession}
              active={professionFilter === profession}
              onClick={() => setProfessionFilter(profession)}
            />
          ))}
        </div>

        <label className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
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
        {loading && <LoadingState label="Loading recipe economics…" />}
        {error && <ErrorState message={error} />}
        {!loading && !error && rows.length === 0 && (
          <EmptyState message="No recipes found for this filter. Sync AH data to compute profitability." />
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="panel overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-panel text-left text-xs uppercase tracking-wide text-zinc-500">
                  <th className="w-8 px-2 py-3" />
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Profession</th>
                  <SortableTh label="Craft Cost" sortKey="craftCost" active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableTh label="Sale Price (after 5%)" sortKey="salePrice" active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableTh
                    label="Net Profit (w/ reagents)"
                    sortKey="netWithReagent"
                    active={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                  />
                  <SortableTh
                    label="Net Profit (reagents free)"
                    sortKey="netIgnoringReagent"
                    active={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                  />
                  <SortableTh label="ROI %" sortKey="roi" active={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortableTh label="Volume" sortKey="volume" active={sortKey} dir={sortDir} onClick={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const illiquid = row.volume === 0
                  const expanded = expandedRecipeId === row.recipeId
                  const hasChainedReagent = row.reagents.some((reagent) => reagent.source === 'crafted')
                  return (
                    <Fragment key={row.recipeId}>
                      <tr
                        className={`border-b border-surface-border/60 last:border-0 hover:bg-surface-raised/50 ${rarityBorderClass(row.quality)}`}
                      >
                        <td className="px-2 py-3">
                          {row.reagents.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setExpandedRecipeId(expanded ? null : row.recipeId)}
                              className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 hover:text-gold"
                              aria-label={expanded ? 'Hide reagent breakdown' : 'Show reagent breakdown'}
                            >
                              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => openItem(row.itemId)}
                            className={`font-medium hover:underline ${rarityTextClass(row.quality)}`}
                          >
                            {row.itemName}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{row.profession}</td>
                        <td className={`px-4 py-3 ${illiquid ? 'text-zinc-600' : 'text-zinc-300'}`}>
                          <span className="flex items-center gap-1.5">
                            {row.reagentsAvailable ? formatCopperAsGold(row.craftCost) : 'Missing AH data'}
                            {hasChainedReagent && (
                              <GitMerge
                                size={12}
                                className="text-gold"
                                aria-label="Cheaper to craft one or more reagents yourself"
                              />
                            )}
                          </span>
                        </td>
                        <td className={`px-4 py-3 ${illiquid ? 'text-zinc-600' : 'text-zinc-300'}`}>
                          {formatCopperAsGold(row.salePrice)}
                        </td>
                        <td className={`px-4 py-3 font-medium ${profitClass(row.netProfitWithReagentCost, illiquid)}`}>
                          {row.netProfitWithReagentCost !== null ? formatCopperAsGold(row.netProfitWithReagentCost) : '—'}
                        </td>
                        <td className={`px-4 py-3 font-medium ${profitClass(row.netProfitIgnoringReagentCost, illiquid)}`}>
                          {row.netProfitIgnoringReagentCost !== null
                            ? formatCopperAsGold(row.netProfitIgnoringReagentCost)
                            : '—'}
                        </td>
                        <td className={`px-4 py-3 font-medium ${profitClass(row.roiPercent, illiquid)}`}>
                          {row.roiPercent !== null ? `${row.roiPercent}%` : '—'}
                        </td>
                        <td
                          className={`px-4 py-3 ${illiquid ? 'text-profit-negative/70' : 'text-zinc-300'}`}
                          title={illiquid ? 'No recent sales — treat this price as a low-confidence estimate.' : undefined}
                        >
                          {row.volume.toLocaleString()}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-surface-border/60 bg-surface-panel/40 last:border-0">
                          <td colSpan={TABLE_COLUMN_COUNT} className="px-4 py-3">
                            <ReagentBreakdown reagents={row.reagents} onOpenItem={openItem} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {itemDetailModal}
    </div>
  )
}

function profitClass(value: number | null, illiquid: boolean): string {
  if (illiquid) return 'text-zinc-600'
  if (value === null) return 'text-profit-neutral'
  return value > 0 ? 'text-profit-positive' : value < 0 ? 'text-profit-negative' : 'text-profit-neutral'
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
