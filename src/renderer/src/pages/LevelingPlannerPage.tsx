import { useState } from 'react'
import TopBar from '../components/TopBar'
import FilterChip from '../components/FilterChip'
import { EmptyState, ErrorState, LoadingState } from '../components/StateViews'
import { useAsyncData } from '../hooks/useAsyncData'
import { formatCopperAsGold } from '../lib/gold'
import { rarityTextClass } from '../lib/rarity'
import type { Profession } from '@shared/types'

const PROFESSIONS: Profession[] = ['Alchemy', 'Blacksmithing', 'Engineering', 'Leatherworking', 'Tailoring']

export default function LevelingPlannerPage(): React.JSX.Element {
  const [profession, setProfession] = useState<Profession>('Alchemy')
  const [startSkill, setStartSkill] = useState(1)
  const [targetSkill, setTargetSkill] = useState(300)
  const [sellToAH, setSellToAH] = useState(false)

  const { data: plan, loading, error } = useAsyncData(
    () => window.api.levelingPlan.get(profession, startSkill, targetSkill, sellToAH),
    [profession, startSkill, targetSkill, sellToAH]
  )

  return (
    <div className="flex h-full flex-col">
      <TopBar title="Profession Leveling Planner" />

      <div className="flex flex-wrap items-center gap-4 border-b border-surface-border bg-surface px-6 py-3">
        <div className="flex items-center gap-2">
          {PROFESSIONS.map((p) => (
            <FilterChip key={p} label={p} active={profession === p} onClick={() => setProfession(p)} />
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>From</span>
          <input
            type="number"
            min={1}
            max={999}
            value={startSkill}
            onChange={(event) => setStartSkill(Math.max(1, Number(event.target.value) || 1))}
            className="w-16 rounded-md border border-surface-border bg-surface-panel px-2 py-1.5 text-sm text-zinc-200 focus:border-gold/50 focus:outline-none"
          />
          <span>to</span>
          <input
            type="number"
            min={1}
            max={999}
            value={targetSkill}
            onChange={(event) => setTargetSkill(Math.max(1, Number(event.target.value) || 1))}
            className="w-16 rounded-md border border-surface-border bg-surface-panel px-2 py-1.5 text-sm text-zinc-200 focus:border-gold/50 focus:outline-none"
          />
        </div>

        <label className="ml-auto flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={sellToAH}
            onChange={(event) => setSellToAH(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-surface-border bg-surface-panel accent-[#FFD100]"
          />
          Sell crafted items to AH (offsets cost)
        </label>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {loading && <LoadingState label="Computing the cheapest leveling path…" />}
        {error && <ErrorState message={error} />}

        {!loading && !error && plan && plan.steps.length === 0 && (
          <EmptyState message="Target skill must be higher than the starting skill." />
        )}

        {!loading && !error && plan && plan.steps.length > 0 && (
          <div className="space-y-4">
            <div className="panel flex flex-wrap items-center justify-between gap-3 p-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">
                  {profession} — skill {startSkill} to {targetSkill}
                  {sellToAH ? ' (selling crafted items)' : ''}
                </p>
                <p className="font-display text-2xl font-semibold text-gold">{formatCopperAsGold(plan.totalCost)}</p>
              </div>
              {plan.hasGaps && (
                <p className="max-w-sm text-xs text-profit-negative">
                  Some skill brackets are missing reagent price data and aren&apos;t included in this total — sync AH
                  data for a more complete estimate.
                </p>
              )}
            </div>

            <div className="panel overflow-hidden">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-surface-border bg-surface-panel text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-3 font-medium">Skill Range</th>
                    <th className="px-4 py-3 font-medium">Recipe</th>
                    <th className="px-4 py-3 font-medium">Crafts</th>
                    <th className="px-4 py-3 font-medium">Cost Each</th>
                    <th className="px-4 py-3 font-medium">Net Cost Each</th>
                    <th className="px-4 py-3 font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.steps.map((step) => {
                    const isGap = step.recipeId === -1
                    return (
                      <tr
                        key={`${step.recipeId}-${step.fromSkill}`}
                        className="border-b border-surface-border/60 last:border-0 hover:bg-surface-raised/50"
                      >
                        <td className="px-4 py-3 text-zinc-300">
                          {step.fromSkill}–{step.toSkill}
                        </td>
                        <td className="px-4 py-3">
                          {isGap ? (
                            <span className="text-zinc-600">No recipe available</span>
                          ) : (
                            <span className={`font-medium ${rarityTextClass(step.quality)}`}>{step.itemName}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-300">{step.craftsNeeded.toLocaleString()}</td>
                        <td className="px-4 py-3 text-zinc-300">
                          {step.reagentCost !== null ? formatCopperAsGold(step.reagentCost) : 'Missing price data'}
                        </td>
                        <td
                          className={`px-4 py-3 font-medium ${
                            step.netCostPerCraft !== null && step.netCostPerCraft < 0
                              ? 'text-profit-positive'
                              : 'text-zinc-300'
                          }`}
                        >
                          {step.netCostPerCraft !== null ? formatCopperAsGold(step.netCostPerCraft) : '—'}
                        </td>
                        <td className="px-4 py-3 font-medium text-zinc-200">
                          {step.subtotal !== null ? formatCopperAsGold(step.subtotal) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
