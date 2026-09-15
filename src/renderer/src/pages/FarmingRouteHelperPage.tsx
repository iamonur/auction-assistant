import { useEffect, useState } from 'react'
import TopBar from '../components/TopBar'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'
import { useAsyncData } from '../hooks/useAsyncData'
import { formatCopperAsGold } from '../lib/gold'
import type { FarmingRouteResult } from '@shared/types'

export default function FarmingRouteHelperPage(): React.JSX.Element {
  const { data: options, loading: optionsLoading, error: optionsError } = useAsyncData(
    () => window.api.farming.reagentOptions(),
    []
  )
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null)
  const [result, setResult] = useState<FarmingRouteResult | null>(null)
  const [loadingResult, setLoadingResult] = useState(false)

  useEffect(() => {
    if (options && options.length > 0 && selectedItemId === null) {
      setSelectedItemId(options[0].itemId)
    }
  }, [options, selectedItemId])

  useEffect(() => {
    if (selectedItemId === null) return
    let cancelled = false
    setLoadingResult(true)
    window.api.farming
      .spotsForItem(selectedItemId)
      .then((data) => {
        if (!cancelled) setResult(data)
      })
      .finally(() => {
        if (!cancelled) setLoadingResult(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedItemId])

  return (
    <div className="flex h-full flex-col">
      <TopBar title="Farming Route Helper" />

      <div className="flex items-center gap-3 border-b border-surface-border bg-surface px-6 py-3">
        <label htmlFor="reagent-select" className="text-xs uppercase tracking-wide text-zinc-500">
          Reagent
        </label>
        {optionsLoading && <span className="text-xs text-zinc-500">Loading…</span>}
        {optionsError && <span className="text-xs text-profit-negative">{optionsError}</span>}
        {options && options.length > 0 && (
          <select
            id="reagent-select"
            value={selectedItemId ?? ''}
            onChange={(event) => setSelectedItemId(Number(event.target.value))}
            className="rounded-md border border-surface-border bg-surface-panel px-3 py-1.5 text-sm text-zinc-200 focus:border-gold/50 focus:outline-none"
          >
            {options.map((option) => (
              <option key={option.itemId} value={option.itemId}>
                {option.itemName}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {options && options.length === 0 && (
          <EmptyState message="No farming spots seeded yet for any reagent." />
        )}

        {loadingResult && <LoadingState label="Calculating routes…" />}

        {!loadingResult && result && (
          <div className="space-y-4">
            <div className="panel flex items-center justify-between p-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Selected reagent</p>
                <p className="text-lg font-medium text-gold">{result.itemName}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-zinc-500">Current AH unit price</p>
                <p className="text-lg font-medium text-zinc-200">{formatCopperAsGold(result.currentUnitPrice)}</p>
              </div>
            </div>

            {result.spots.length > 0 && (
              <div className="panel overflow-hidden">
                <p className="border-b border-surface-border bg-surface-panel px-4 py-2 text-xs uppercase tracking-wide text-zinc-500">
                  Known farming spots (curated)
                </p>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-surface-border bg-surface-panel text-left text-xs uppercase tracking-wide text-zinc-500">
                      <th className="px-4 py-3 font-medium">Zone</th>
                      <th className="px-4 py-3 font-medium">Mob / Node</th>
                      <th className="px-4 py-3 font-medium">Level Range</th>
                      <th className="px-4 py-3 font-medium">Drop / Gather %</th>
                      <th className="px-4 py-3 font-medium">Est. Nodes/Mobs per Hour</th>
                      <th className="px-4 py-3 font-medium">Est. Gold / Hour</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.spots.map((spot) => (
                      <tr key={spot.id} className="border-b border-surface-border/60 last:border-0 hover:bg-surface-raised/50">
                        <td className="px-4 py-3 text-zinc-200">
                          {spot.zone}
                          {spot.subZone && <span className="text-zinc-500"> — {spot.subZone}</span>}
                        </td>
                        <td className="px-4 py-3 text-zinc-300">{spot.mobOrNode}</td>
                        <td className="px-4 py-3 text-zinc-400">
                          {spot.minLevel ?? '?'}–{spot.maxLevel ?? '?'}
                        </td>
                        <td className="px-4 py-3 text-zinc-300">{(spot.dropOrGatherChance * 100).toFixed(0)}%</td>
                        <td className="px-4 py-3 text-zinc-300">{spot.estimatedNodesOrMobsPerHour}</td>
                        <td className="px-4 py-3 font-medium text-profit-positive">
                          {spot.estimatedGoldPerHour !== null ? formatCopperAsGold(spot.estimatedGoldPerHour) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {result.importedSpawns.length > 0 && (
              <div className="panel overflow-hidden">
                <p className="border-b border-surface-border bg-surface-panel px-4 py-2 text-xs uppercase tracking-wide text-zinc-500">
                  Tracked node spawns (real world-data import)
                </p>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-surface-border bg-surface-panel text-left text-xs uppercase tracking-wide text-zinc-500">
                      <th className="px-4 py-3 font-medium">Continent</th>
                      <th className="px-4 py-3 font-medium">Node</th>
                      <th className="px-4 py-3 font-medium">Kind</th>
                      <th className="px-4 py-3 font-medium">Tracked Spawns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.importedSpawns.map((spawn) => (
                      <tr
                        key={`${spawn.nodeName}-${spawn.mapId}`}
                        className="border-b border-surface-border/60 last:border-0 hover:bg-surface-raised/50"
                      >
                        <td className="px-4 py-3 text-zinc-200">{spawn.mapLabel}</td>
                        <td className="px-4 py-3 text-zinc-300">{spawn.nodeName}</td>
                        <td className="px-4 py-3 text-zinc-400 capitalize">{spawn.kind}</td>
                        <td className="px-4 py-3 text-zinc-300">{spawn.spawnCount.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="px-4 py-2 text-xs text-zinc-600">
                  Spawn count is a relative density signal (total placed node instances per continent), not a
                  timed farming rate.
                </p>
              </div>
            )}

            {result.spots.length === 0 && result.importedSpawns.length === 0 && (
              <EmptyState message="No known farming spots for this reagent yet." />
            )}
          </div>
        )}

        {!loadingResult && !optionsError && !result && !options?.length && (
          <ErrorState message="Unable to load farming route data." />
        )}
      </div>
    </div>
  )
}
