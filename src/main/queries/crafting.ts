import type Database from 'better-sqlite3'
import type { AppSettings, CraftingReagentSourcing, CraftingSnipeRow, ItemQuality, Profession } from '@shared/types'
import { AH_CUT_RATE, getCheapestPriceMap, getSupplyVolumeMap } from './shared'

interface RecipeRow {
  id: number
  profession: Profession
  name: string
  resultItemId: number
  resultQuantity: number
  itemName: string
  icon: string | null
  quality: ItemQuality
}

interface ReagentRow {
  recipeId: number
  itemId: number
  itemName: string
  quantity: number
  vendorPrice: number | null
}

/** The cheapest known way to get one unit of an item, right now — either buying it, or (if it's itself a recipe's result) crafting it from its own cheapest reagents. */
interface ResolvedCost {
  unitCost: number
  source: 'buy' | 'crafted'
  craftedViaRecipeId: number | null
}

export function listCraftingSnipeRows(db: Database.Database, settings: AppSettings): CraftingSnipeRow[] {
  const recipes = db
    .prepare(
      /* sql */ `
      SELECT r.id as id, r.profession as profession, r.name as name, r.result_item_id as resultItemId,
             r.result_quantity as resultQuantity,
             i.name as itemName, i.icon as icon, i.quality as quality
      FROM recipes r
      JOIN items i ON i.id = r.result_item_id
    `
    )
    .all() as RecipeRow[]

  const reagentRows = db
    .prepare(
      /* sql */ `
      SELECT rr.recipe_id as recipeId, rr.item_id as itemId, i.name as itemName, rr.quantity as quantity, i.vendor_price as vendorPrice
      FROM recipe_reagents rr
      JOIN items i ON i.id = rr.item_id
    `
    )
    .all() as ReagentRow[]

  const reagentsByRecipe = new Map<number, ReagentRow[]>()
  for (const reagent of reagentRows) {
    const list = reagentsByRecipe.get(reagent.recipeId) ?? []
    list.push(reagent)
    reagentsByRecipe.set(reagent.recipeId, list)
  }

  // Reverse index — every recipe that can produce a given item, for the
  // reagent chaining below (e.g. a weapon needs bars, and bars are
  // themselves a recipe's result — the cheaper of buying or crafting one
  // should win).
  const recipesByResultItem = new Map<number, RecipeRow[]>()
  for (const recipe of recipes) {
    const list = recipesByResultItem.get(recipe.resultItemId) ?? []
    list.push(recipe)
    recipesByResultItem.set(recipe.resultItemId, list)
  }

  const priceMap = getCheapestPriceMap(db, settings)
  const volumeMap = getSupplyVolumeMap(db, settings)

  const resolved = new Map<number, ResolvedCost | null>()
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
   * Bar) is typically needed by many different top-level recipes.
   */
  function resolveCheapestCost(itemId: number, vendorPrice: number | null): ResolvedCost | null {
    if (resolved.has(itemId)) return resolved.get(itemId) ?? null

    const buyPrice = priceMap.get(itemId) ?? vendorPrice ?? null
    let best: ResolvedCost | null = buyPrice !== null ? { unitCost: buyPrice, source: 'buy', craftedViaRecipeId: null } : null

    if (inProgress.has(itemId)) return best

    inProgress.add(itemId)
    for (const candidate of recipesByResultItem.get(itemId) ?? []) {
      const candidateReagents = reagentsByRecipe.get(candidate.id) ?? []
      if (candidateReagents.length === 0) continue

      let total = 0
      let feasible = true
      for (const reagent of candidateReagents) {
        const reagentCost = resolveCheapestCost(reagent.itemId, reagent.vendorPrice)
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

  const recipeNameById = new Map(recipes.map((recipe) => [recipe.id, recipe.name]))

  return recipes.map((recipe) => {
    const recipeReagents = reagentsByRecipe.get(recipe.id) ?? []
    let reagentsAvailable = recipeReagents.length > 0
    let craftCost = 0

    const reagentSourcing: CraftingReagentSourcing[] = recipeReagents.map((reagent) => {
      const cost = resolveCheapestCost(reagent.itemId, reagent.vendorPrice)
      if (cost === null) {
        reagentsAvailable = false
        return {
          itemId: reagent.itemId,
          itemName: reagent.itemName,
          quantity: reagent.quantity,
          unitCost: null,
          source: 'unavailable',
          craftedViaRecipeName: null
        }
      }

      craftCost += cost.unitCost * reagent.quantity
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

    const rawSalePrice = priceMap.get(recipe.resultItemId) ?? null
    const salePrice = rawSalePrice === null ? null : Math.round(rawSalePrice * (1 - AH_CUT_RATE))

    const netProfitWithReagentCost =
      salePrice !== null && reagentsAvailable ? salePrice - craftCost : null
    const netProfitIgnoringReagentCost = salePrice !== null ? salePrice : null
    const roiPercent =
      netProfitWithReagentCost !== null && craftCost > 0
        ? Number(((netProfitWithReagentCost / craftCost) * 100).toFixed(1))
        : null

    return {
      recipeId: recipe.id,
      itemId: recipe.resultItemId,
      itemName: recipe.itemName,
      icon: recipe.icon,
      quality: recipe.quality,
      profession: recipe.profession,
      craftCost: reagentsAvailable ? craftCost : null,
      reagentsAvailable,
      salePrice,
      netProfitWithReagentCost,
      netProfitIgnoringReagentCost,
      roiPercent,
      volume: volumeMap.get(recipe.resultItemId) ?? 0,
      reagents: reagentSourcing
    } satisfies CraftingSnipeRow
  })
}
