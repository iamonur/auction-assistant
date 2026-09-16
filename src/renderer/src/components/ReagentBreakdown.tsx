import { formatCopperAsGold } from '../lib/gold'
import type { CraftingReagentSourcing } from '@shared/types'

/** Per-reagent sourcing list (buy vs. crafted, and via which recipe) — shared by Crafting Sniper and the Leveling Planner, the two features that price recipe reagents with chaining (see main/queries/reagentCost.ts). */
export default function ReagentBreakdown({
  reagents,
  onOpenItem
}: {
  reagents: CraftingReagentSourcing[]
  onOpenItem: (itemId: number) => void
}): React.JSX.Element {
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
      {reagents.map((reagent) => (
        <li key={reagent.itemId} className="flex items-center justify-between gap-2 text-zinc-400">
          <button type="button" onClick={() => onOpenItem(reagent.itemId)} className="truncate hover:text-gold hover:underline">
            {reagent.quantity}× {reagent.itemName}
          </button>
          <span className="flex shrink-0 items-center gap-1.5">
            {reagent.unitCost !== null ? (
              <span className="text-zinc-300">{formatCopperAsGold(reagent.unitCost)} ea</span>
            ) : (
              <span className="text-profit-negative">no price</span>
            )}
            {reagent.source === 'crafted' && (
              <span
                className="rounded-full bg-gold/10 px-1.5 py-0.5 text-[10px] text-gold"
                title={reagent.craftedViaRecipeName ? `Crafted via ${reagent.craftedViaRecipeName}` : 'Crafted'}
              >
                crafted
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
