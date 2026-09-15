import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, testSettings } from '@test/db'
import { getLevelingPlan } from './levelingPlanner'

const REGION = 'us'
const REALM = 'test-realm'
const DATE = '2026-01-01'

function insertItem(db: Database.Database, id: number, name: string): void {
  db.prepare(`INSERT INTO items (id, name, quality) VALUES (?, ?, 1)`).run(id, name)
}

function insertPrice(db: Database.Database, itemId: number, price: number, volume: number): void {
  db.prepare(
    `INSERT INTO item_price_stats (item_id, region, realm, date, avg_price, min_price, max_price, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(itemId, REGION, REALM, DATE, price, price, price, volume)
}

function insertRecipe(
  db: Database.Database,
  id: number,
  name: string,
  resultItemId: number,
  skillLevelReq: number,
  reagents: { itemId: number; quantity: number }[]
): void {
  db.prepare(
    `INSERT INTO recipes (id, profession, name, result_item_id, skill_level_req) VALUES (?, 'Alchemy', ?, ?, ?)`
  ).run(id, name, resultItemId, skillLevelReq)
  const insertReagent = db.prepare(
    `INSERT INTO recipe_reagents (recipe_id, item_id, quantity) VALUES (?, ?, ?)`
  )
  for (const reagent of reagents) insertReagent.run(id, reagent.itemId, reagent.quantity)
}

describe('getLevelingPlan', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('walks skill brackets tier by tier, one craft per skill point', () => {
    insertItem(db, 100, 'Reagent A')
    insertItem(db, 200, 'Potion of Tier 1')
    insertPrice(db, 100, 10, 5)
    insertRecipe(db, 1, 'Recipe Tier 1', 200, 1, [{ itemId: 100, quantity: 1 }])

    insertItem(db, 101, 'Reagent B')
    insertItem(db, 201, 'Potion of Tier 2')
    insertPrice(db, 101, 20, 5)
    insertRecipe(db, 2, 'Recipe Tier 2', 201, 50, [{ itemId: 101, quantity: 1 }])

    const plan = getLevelingPlan(db, testSettings({ region: REGION, realmName: REALM }), 'Alchemy', 1, 100, false)

    // Tier 1 covers skill 1-49 (49 crafts x 10 copper), tier 2 covers 50-99 (50 crafts x 20 copper).
    expect(plan.steps).toHaveLength(2)
    expect(plan.steps[0]).toMatchObject({ fromSkill: 1, toSkill: 50, craftsNeeded: 49, reagentCost: 10, subtotal: 490 })
    expect(plan.steps[1]).toMatchObject({ fromSkill: 50, toSkill: 100, craftsNeeded: 50, reagentCost: 20, subtotal: 1000 })
    expect(plan.totalCost).toBe(490 + 1000)
    expect(plan.hasGaps).toBe(false)
  })

  it('picks the cheaper of two recipes sharing the same skill tier', () => {
    insertItem(db, 100, 'Cheap Reagent')
    insertItem(db, 101, 'Pricey Reagent')
    insertItem(db, 200, 'Cheap Potion')
    insertItem(db, 201, 'Pricey Potion')
    insertPrice(db, 100, 5, 5)
    insertPrice(db, 101, 500, 5)
    insertRecipe(db, 1, 'Cheap Recipe', 200, 1, [{ itemId: 100, quantity: 1 }])
    insertRecipe(db, 2, 'Pricey Recipe', 201, 1, [{ itemId: 101, quantity: 1 }])

    const plan = getLevelingPlan(db, testSettings({ region: REGION, realmName: REALM }), 'Alchemy', 1, 2, false)

    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].recipeName).toBe('Cheap Recipe')
  })

  it('offsets cost with sale price when sellToAH is true, and can go negative (net profit)', () => {
    insertItem(db, 100, 'Reagent')
    insertItem(db, 200, 'Profitable Potion')
    insertPrice(db, 100, 10, 5) // reagent cost 10
    insertPrice(db, 200, 1000, 5) // sells for way more than it costs to make
    insertRecipe(db, 1, 'Recipe', 200, 1, [{ itemId: 100, quantity: 1 }])

    const plan = getLevelingPlan(db, testSettings({ region: REGION, realmName: REALM }), 'Alchemy', 1, 2, true)

    // salePrice = round(1000 * 0.95) = 950; netCostPerCraft = 10 - 950 = -940
    expect(plan.steps[0].netCostPerCraft).toBe(-940)
    expect(plan.totalCost).toBeLessThan(0)
  })

  it('does not use sale price to offset cost when the crafted item has zero trade volume', () => {
    insertItem(db, 100, 'Reagent')
    insertItem(db, 200, 'Illiquid Potion')
    insertPrice(db, 100, 10, 5)
    insertPrice(db, 200, 1000, 0) // priced, but nobody's actually trading it
    insertRecipe(db, 1, 'Recipe', 200, 1, [{ itemId: 100, quantity: 1 }])

    const plan = getLevelingPlan(db, testSettings({ region: REGION, realmName: REALM }), 'Alchemy', 1, 2, true)

    expect(plan.steps[0].salePrice).toBeNull()
    expect(plan.steps[0].netCostPerCraft).toBe(10)
  })

  it('flags a step as a gap when a reagent has no known price, and excludes it from the total', () => {
    insertItem(db, 100, 'Unpriced Reagent')
    insertItem(db, 200, 'Potion')
    insertRecipe(db, 1, 'Recipe', 200, 1, [{ itemId: 100, quantity: 1 }])
    // no item_price_stats row for item 100 at all, and no vendor_price

    const plan = getLevelingPlan(db, testSettings({ region: REGION, realmName: REALM }), 'Alchemy', 1, 2, false)

    expect(plan.steps[0].reagentCost).toBeNull()
    expect(plan.steps[0].subtotal).toBeNull()
    expect(plan.hasGaps).toBe(true)
    expect(plan.totalCost).toBe(0)
  })

  it('emits a leading gap step when the start skill is below the profession\'s first recipe', () => {
    insertItem(db, 100, 'Reagent')
    insertItem(db, 200, 'Potion')
    insertPrice(db, 100, 10, 5)
    insertRecipe(db, 1, 'Recipe', 200, 10, [{ itemId: 100, quantity: 1 }])

    const plan = getLevelingPlan(db, testSettings({ region: REGION, realmName: REALM }), 'Alchemy', 1, 20, false)

    expect(plan.steps[0]).toMatchObject({ fromSkill: 1, toSkill: 10, recipeId: -1, subtotal: null })
    expect(plan.hasGaps).toBe(true)
  })

  it('reports the entire range as a gap when the profession has no recipe data at all', () => {
    const plan = getLevelingPlan(db, testSettings({ region: REGION, realmName: REALM }), 'Alchemy', 1, 300, false)
    expect(plan.steps).toEqual([
      expect.objectContaining({ fromSkill: 1, toSkill: 300, recipeId: -1, subtotal: null })
    ])
    expect(plan.hasGaps).toBe(true)
    expect(plan.totalCost).toBe(0)
  })
})
