import type Database from 'better-sqlite3'
import type {
  AppSettings,
  CraftingReagentSourcing,
  ItemQuality,
  LevelingPlanResult,
  LevelingPlanStep,
  Profession
} from '@shared/types'
import { AH_CUT_RATE, getSupplyVolumeMap } from './shared'
import { createReagentCostResolver } from './reagentCost'

interface RecipeRow {
  id: number
  name: string
  resultItemId: number
  itemName: string
  quality: ItemQuality
  skillLevelReq: number
}

interface ReagentRow {
  recipeId: number
  itemId: number
  itemName: string
  quantity: number
  vendorPrice: number | null
}

interface RecipeCost {
  recipe: RecipeRow
  /** Cheapest known way to source every reagent — buy, or craft from its own cheapest recipe (see main/queries/reagentCost.ts). Null if any reagent can't be priced at all. */
  reagentCost: number | null
  /** Post-AH-cut sale price for the crafted item — only computed when sellToAH is true and the item has real trade volume. */
  salePrice: number | null
  reagents: CraftingReagentSourcing[]
}

function netCostOf(rc: RecipeCost): number | null {
  if (rc.reagentCost === null) return null
  return rc.salePrice !== null ? rc.reagentCost - rc.salePrice : rc.reagentCost
}

/** Picks the lowest net-cost recipe among a tier's candidates; falls back to the first candidate (producing a "missing data" step) if none are priced. */
function cheapestInTier(candidates: RecipeCost[]): RecipeCost {
  let best: RecipeCost = candidates[0]
  let bestCost = netCostOf(best) ?? Infinity
  for (const candidate of candidates.slice(1)) {
    const cost = netCostOf(candidate)
    if (cost !== null && cost < bestCost) {
      best = candidate
      bestCost = cost
    }
  }
  return best
}

/**
 * Cheapest-path plan to go from `startSkill` to `targetSkill` in a
 * profession: recipes are grouped into tiers by their skill_level_req
 * (their unlock point), and at each tier we pick whichever candidate has
 * the lowest net cost, assumed used for the entire bracket up to the next
 * tier. See LevelingPlanStep's doc comment in shared/types.ts for the
 * "one craft = one skill point" simplification this relies on.
 */
export function getLevelingPlan(
  db: Database.Database,
  settings: AppSettings,
  profession: Profession,
  startSkill: number,
  targetSkill: number,
  sellToAH: boolean
): LevelingPlanResult {
  const recipes = db
    .prepare(
      /* sql */ `
      SELECT r.id as id, r.name as name, r.result_item_id as resultItemId,
             i.name as itemName, i.quality as quality, r.skill_level_req as skillLevelReq
      FROM recipes r
      JOIN items i ON i.id = r.result_item_id
      WHERE r.profession = ?
      ORDER BY r.skill_level_req ASC, r.name ASC
    `
    )
    .all(profession) as RecipeRow[]

  const reagents = db
    .prepare(
      /* sql */ `
      SELECT rr.recipe_id as recipeId, rr.item_id as itemId, i.name as itemName, rr.quantity as quantity, i.vendor_price as vendorPrice
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

  const volumeMap = getSupplyVolumeMap(db, settings)
  // Chains into any reagent that's itself craftable (e.g. a potion
  // needing a lower-tier potion as a reagent) — see
  // main/queries/reagentCost.ts, shared with Crafting Sniper so a
  // reagent prices the same way in both.
  const resolver = createReagentCostResolver(db, settings)

  const recipeCosts: RecipeCost[] = recipes.map((recipe) => {
    const recipeReagents = reagentsByRecipe.get(recipe.id) ?? []
    const { reagents: reagentSourcing, totalCost } = resolver.priceReagents(recipeReagents)

    let salePrice: number | null = null
    if (sellToAH) {
      const volume = volumeMap.get(recipe.resultItemId) ?? 0
      const rawPrice = resolver.priceMap.get(recipe.resultItemId)
      if (volume > 0 && rawPrice !== undefined) {
        salePrice = Math.round(rawPrice * (1 - AH_CUT_RATE))
      }
    }

    return { recipe, reagentCost: totalCost, salePrice, reagents: reagentSourcing }
  })

  const tierMap = new Map<number, RecipeCost[]>()
  for (const rc of recipeCosts) {
    const list = tierMap.get(rc.recipe.skillLevelReq) ?? []
    list.push(rc)
    tierMap.set(rc.recipe.skillLevelReq, list)
  }
  const tiers = [...tierMap.entries()].sort((a, b) => a[0] - b[0])

  const steps: LevelingPlanStep[] = []

  // No recipe at all covers the very start of the requested range (e.g. this
  // profession's cheapest recipe needs more skill than startSkill) — flag it
  // as a gap rather than silently skipping those skill points.
  const firstTierSkill = tiers[0]?.[0]
  const leadingGapEnd = firstTierSkill !== undefined ? Math.min(firstTierSkill, targetSkill) : targetSkill
  if (leadingGapEnd > startSkill) {
    steps.push({
      fromSkill: startSkill,
      toSkill: leadingGapEnd,
      craftsNeeded: leadingGapEnd - startSkill,
      recipeId: -1,
      recipeName: 'No recipe available',
      itemName: '—',
      quality: 1,
      reagentCost: null,
      salePrice: null,
      netCostPerCraft: null,
      subtotal: null,
      reagents: []
    })
  }

  for (let i = 0; i < tiers.length; i++) {
    const [tierSkill, candidates] = tiers[i]
    const nextTierSkill = i + 1 < tiers.length ? tiers[i + 1][0] : targetSkill

    const bracketStart = Math.max(tierSkill, startSkill)
    const bracketEnd = Math.min(nextTierSkill, targetSkill)
    if (bracketEnd <= bracketStart) continue

    const chosen = cheapestInTier(candidates)
    const netCostPerCraft = netCostOf(chosen)
    const craftsNeeded = bracketEnd - bracketStart

    steps.push({
      fromSkill: bracketStart,
      toSkill: bracketEnd,
      craftsNeeded,
      recipeId: chosen.recipe.id,
      recipeName: chosen.recipe.name,
      itemName: chosen.recipe.itemName,
      quality: chosen.recipe.quality,
      reagentCost: chosen.reagentCost,
      salePrice: chosen.salePrice,
      netCostPerCraft,
      subtotal: netCostPerCraft !== null ? netCostPerCraft * craftsNeeded : null,
      reagents: chosen.reagents
    })
  }

  let totalCost = 0
  let hasGaps = false
  for (const step of steps) {
    if (step.subtotal === null) {
      hasGaps = true
    } else {
      totalCost += step.subtotal
    }
  }

  return { profession, startSkill, targetSkill, sellToAH, steps, totalCost, hasGaps }
}
