import type Database from 'better-sqlite3'
import type { AppSettings, CraftingReagentSourcing } from '@shared/types'
import { getCheapestPriceMap } from './shared'

interface RecipeGraphNode {
  id: number
  name: string
  resultItemId: number
  resultQuantity: number
}

interface ReagentGraphRow {
  recipeId: number
  itemId: number
  itemName: string
  quantity: number
  vendorPrice: number | null
}

/** The cheapest known way to get one unit of an item, right now — either buying it, or (if it's itself a recipe's result) crafting it from its own cheapest reagents. */
interface ResolvedReagentCost {
  unitCost: number
  source: 'buy' | 'crafted'
  craftedViaRecipeId: number | null
}

export interface ReagentCostResolver {
  /** Cheapest currently-available unit price per item — same map every other feature query reads through (see main/queries/shared.ts). Exposed here so callers don't need a second query for it. */
  priceMap: Map<number, number>
  /** Turns one recipe's direct reagent lines into a priced, source-tagged breakdown, recursing into any reagent that's itself craftable. `totalCost` is null when any line couldn't be priced at all (no AH/vendor price and nothing craftable). */
  priceReagents(reagents: { itemId: number; itemName: string; quantity: number; vendorPrice: number | null }[]): {
    reagents: CraftingReagentSourcing[]
    totalCost: number | null
  }
}

/**
 * Builds a reagent-cost resolver over EVERY recipe in the database, not
 * just one profession — a reagent can be the result of a recipe in a
 * different profession (or the same one), and this app doesn't gate
 * recipes by "professions the player actually knows" anywhere else
 * either (see listCraftingSnipeRows), so chaining follows the same
 * assumption. Shared by Crafting Sniper and the Leveling Planner so a
 * reagent prices the same way in both, and so the recursive-resolution +
 * cycle-guard logic exists in exactly one place.
 */
export function createReagentCostResolver(db: Database.Database, settings: AppSettings): ReagentCostResolver {
  const recipes = db
    .prepare(
      /* sql */ `SELECT id, name, result_item_id as resultItemId, result_quantity as resultQuantity FROM recipes`
    )
    .all() as RecipeGraphNode[]

  const reagentRows = db
    .prepare(
      /* sql */ `
      SELECT rr.recipe_id as recipeId, rr.item_id as itemId, i.name as itemName, rr.quantity as quantity, i.vendor_price as vendorPrice
      FROM recipe_reagents rr
      JOIN items i ON i.id = rr.item_id
    `
    )
    .all() as ReagentGraphRow[]

  const reagentsByRecipe = new Map<number, ReagentGraphRow[]>()
  for (const reagent of reagentRows) {
    const list = reagentsByRecipe.get(reagent.recipeId) ?? []
    list.push(reagent)
    reagentsByRecipe.set(reagent.recipeId, list)
  }

  // Reverse index — every recipe that can produce a given item.
  const recipesByResultItem = new Map<number, RecipeGraphNode[]>()
  for (const recipe of recipes) {
    const list = recipesByResultItem.get(recipe.resultItemId) ?? []
    list.push(recipe)
    recipesByResultItem.set(recipe.resultItemId, list)
  }

  const recipeNameById = new Map(recipes.map((recipe) => [recipe.id, recipe.name]))
  const priceMap = getCheapestPriceMap(db, settings)

  const resolved = new Map<number, ResolvedReagentCost | null>()
  const inProgress = new Set<number>()

  /**
   * Cheapest way to get one unit of `itemId` — buy it outright (AH
   * price, falling back to vendor price when there's no AH price), or,
   * if it's itself the result of some recipe, craft it from that
   * recipe's own cheapest reagents, recursively picking whichever
   * candidate recipe is cheapest when more than one produces the item.
   *
   * `inProgress` is a standard DFS cycle guard: real recipe data never
   * has an item indirectly requiring itself, but nothing enforces that
   * at the data layer, so a malformed cycle (A needs B needs A) falls
   * back to A's buy price along that path instead of recursing forever.
   * Results are memoized per item — the same intermediate (e.g. Copper
   * Bar) is typically needed by many different recipes.
   */
  function resolve(itemId: number, vendorPrice: number | null): ResolvedReagentCost | null {
    if (resolved.has(itemId)) return resolved.get(itemId) ?? null

    const buyPrice = priceMap.get(itemId) ?? vendorPrice ?? null
    let best: ResolvedReagentCost | null =
      buyPrice !== null ? { unitCost: buyPrice, source: 'buy', craftedViaRecipeId: null } : null

    if (inProgress.has(itemId)) return best

    inProgress.add(itemId)
    for (const candidate of recipesByResultItem.get(itemId) ?? []) {
      const candidateReagents = reagentsByRecipe.get(candidate.id) ?? []
      if (candidateReagents.length === 0) continue

      let total = 0
      let feasible = true
      for (const reagent of candidateReagents) {
        const reagentCost = resolve(reagent.itemId, reagent.vendorPrice)
        if (reagentCost === null) {
          feasible = false
          break
        }
        total += reagentCost.unitCost * reagent.quantity
      }
      if (!feasible) continue

      const perUnit = total / candidate.resultQuantity
      if (best === null || perUnit < best.unitCost) {
        best = { unitCost: perUnit, source: 'crafted', craftedViaRecipeId: candidate.id }
      }
    }
    inProgress.delete(itemId)

    resolved.set(itemId, best)
    return best
  }

  function priceReagents(
    reagents: { itemId: number; itemName: string; quantity: number; vendorPrice: number | null }[]
  ): { reagents: CraftingReagentSourcing[]; totalCost: number | null } {
    let totalCost = 0
    let allPriced = reagents.length > 0

    const sourcing: CraftingReagentSourcing[] = reagents.map((reagent) => {
      const cost = resolve(reagent.itemId, reagent.vendorPrice)
      if (cost === null) {
        allPriced = false
        return {
          itemId: reagent.itemId,
          itemName: reagent.itemName,
          quantity: reagent.quantity,
          unitCost: null,
          source: 'unavailable',
          craftedViaRecipeName: null
        }
      }

      totalCost += cost.unitCost * reagent.quantity
      return {
        itemId: reagent.itemId,
        itemName: reagent.itemName,
        quantity: reagent.quantity,
        unitCost: cost.unitCost,
        source: cost.source,
        craftedViaRecipeName:
          cost.craftedViaRecipeId !== null ? (recipeNameById.get(cost.craftedViaRecipeId) ?? null) : null
      }
    })

    return { reagents: sourcing, totalCost: allPriced ? totalCost : null }
  }

  return { priceMap, priceReagents }
}
