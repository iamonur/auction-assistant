import type Database from 'better-sqlite3'
import type { AppSettings, CraftingSnipeRow, ItemQuality, Profession } from '@shared/types'
import { AH_CUT_RATE, getCheapestPriceMap, getSupplyVolumeMap } from './shared'

interface RecipeRow {
  id: number
  profession: Profession
  name: string
  resultItemId: number
  itemName: string
  icon: string | null
  quality: ItemQuality
}

interface ReagentRow {
  recipeId: number
  itemId: number
  quantity: number
  vendorPrice: number | null
}

export function listCraftingSnipeRows(db: Database.Database, settings: AppSettings): CraftingSnipeRow[] {
  const recipes = db
    .prepare(
      /* sql */ `
      SELECT r.id as id, r.profession as profession, r.name as name, r.result_item_id as resultItemId,
             i.name as itemName, i.icon as icon, i.quality as quality
      FROM recipes r
      JOIN items i ON i.id = r.result_item_id
    `
    )
    .all() as RecipeRow[]

  const reagents = db
    .prepare(
      /* sql */ `
      SELECT rr.recipe_id as recipeId, rr.item_id as itemId, rr.quantity as quantity, i.vendor_price as vendorPrice
      FROM recipe_reagents rr
      JOIN items i ON i.id = rr.item_id
    `
    )
    .all() as ReagentRow[]

  const reagentsByRecipe = new Map<number, ReagentRow[]>()
  for (const reagent of reagents) {
    const list = reagentsByRecipe.get(reagent.recipeId) ?? []
    list.push(reagent)
    reagentsByRecipe.set(reagent.recipeId, list)
  }

  const priceMap = getCheapestPriceMap(db, settings)
  const volumeMap = getSupplyVolumeMap(db, settings)

  return recipes.map((recipe) => {
    const recipeReagents = reagentsByRecipe.get(recipe.id) ?? []
    let reagentsAvailable = recipeReagents.length > 0
    let craftCost = 0

    for (const reagent of recipeReagents) {
      const price = priceMap.get(reagent.itemId) ?? reagent.vendorPrice
      if (price === null || price === undefined) {
        reagentsAvailable = false
        continue
      }
      craftCost += price * reagent.quantity
    }

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
      volume: volumeMap.get(recipe.resultItemId) ?? 0
    } satisfies CraftingSnipeRow
  })
}
