import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, testSettings } from '@test/db'
import { listCraftingSnipeRows } from './crafting'

const REGION = 'us'
const REALM = 'test-realm'
const DATE = '2026-01-01'

function insertItem(db: Database.Database, id: number, name: string, vendorPrice: number | null = null): void {
  db.prepare(`INSERT INTO items (id, name, quality, vendor_price) VALUES (?, ?, 1, ?)`).run(id, name, vendorPrice)
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
  reagents: { itemId: number; quantity: number }[],
  resultQuantity = 1
): void {
  db.prepare(
    `INSERT INTO recipes (id, profession, name, result_item_id, result_quantity) VALUES (?, 'Blacksmithing', ?, ?, ?)`
  ).run(id, name, resultItemId, resultQuantity)
  const insertReagent = db.prepare(`INSERT INTO recipe_reagents (recipe_id, item_id, quantity) VALUES (?, ?, ?)`)
  for (const reagent of reagents) insertReagent.run(id, reagent.itemId, reagent.quantity)
}

describe('listCraftingSnipeRows', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('sources a reagent from the AH when it has no recipe of its own', () => {
    insertItem(db, 1, 'Copper Ore')
    insertItem(db, 2, 'Copper Sword')
    insertPrice(db, 1, 100, 10)
    insertPrice(db, 2, 1000, 5)
    insertRecipe(db, 1, 'Forge Copper Sword', 2, [{ itemId: 1, quantity: 3 }])

    const [row] = listCraftingSnipeRows(db, testSettings({ region: REGION, realmName: REALM }))
    expect(row.craftCost).toBe(300)
    expect(row.reagents).toEqual([
      { itemId: 1, itemName: 'Copper Ore', quantity: 3, unitCost: 100, source: 'buy', craftedViaRecipeName: null }
    ])
  })

  // The motivating case: a weapon needs bars, and bars are themselves a
  // recipe's result (smelted from ore) — crafting the bar should win
  // when it's cheaper than buying it outright on the AH.
  it('prefers crafting a reagent over buying it when crafting is cheaper', () => {
    insertItem(db, 1, 'Copper Ore')
    insertItem(db, 2, 'Copper Bar')
    insertItem(db, 3, 'Copper Sword')
    insertPrice(db, 1, 10, 20) // 2 ore -> 1 bar costs 20 to craft
    insertPrice(db, 2, 50, 5) // buying a bar outright costs 50
    insertPrice(db, 3, 1000, 5)
    insertRecipe(db, 1, 'Smelt Copper', 2, [{ itemId: 1, quantity: 2 }])
    insertRecipe(db, 2, 'Forge Copper Sword', 3, [{ itemId: 2, quantity: 2 }])

    const row = listCraftingSnipeRows(db, testSettings({ region: REGION, realmName: REALM })).find(
      (r) => r.recipeId === 2
    )!
    // 2 bars, each cheaper crafted (20) than bought (50) -> 2 * 20 = 40
    expect(row.craftCost).toBe(40)
    expect(row.reagents).toEqual([
      { itemId: 2, itemName: 'Copper Bar', quantity: 2, unitCost: 20, source: 'crafted', craftedViaRecipeName: 'Smelt Copper' }
    ])
  })

  it('still buys a reagent on the AH when crafting it would be more expensive', () => {
    insertItem(db, 1, 'Copper Ore')
    insertItem(db, 2, 'Copper Bar')
    insertItem(db, 3, 'Copper Sword')
    insertPrice(db, 1, 100, 20) // 2 ore -> 1 bar costs 200 to craft
    insertPrice(db, 2, 50, 5) // buying a bar outright costs 50 — cheaper
    insertPrice(db, 3, 1000, 5)
    insertRecipe(db, 1, 'Smelt Copper', 2, [{ itemId: 1, quantity: 2 }])
    insertRecipe(db, 2, 'Forge Copper Sword', 3, [{ itemId: 2, quantity: 2 }])

    const row = listCraftingSnipeRows(db, testSettings({ region: REGION, realmName: REALM })).find(
      (r) => r.recipeId === 2
    )!
    expect(row.craftCost).toBe(100)
    expect(row.reagents[0]).toMatchObject({ unitCost: 50, source: 'buy', craftedViaRecipeName: null })
  })

  it('divides the crafted cost by the recipe result quantity', () => {
    insertItem(db, 1, 'Linen Cloth')
    insertItem(db, 2, 'Bolt of Linen Cloth')
    insertItem(db, 3, 'Linen Robe')
    insertPrice(db, 1, 10, 20)
    insertPrice(db, 3, 1000, 5)
    // 2 cloth -> makes 2 bolts at once, so each bolt costs (2*10)/2 = 10 to craft
    insertRecipe(db, 1, 'Bolt of Linen Cloth', 2, [{ itemId: 1, quantity: 2 }], 2)
    insertRecipe(db, 2, 'Linen Robe', 3, [{ itemId: 2, quantity: 1 }])

    const row = listCraftingSnipeRows(db, testSettings({ region: REGION, realmName: REALM })).find(
      (r) => r.recipeId === 2
    )!
    expect(row.reagents[0]).toMatchObject({ unitCost: 10, source: 'crafted' })
  })

  it('falls back to vendor price when a reagent has no AH price', () => {
    insertItem(db, 1, 'Weak Flux', 5)
    insertItem(db, 2, 'Copper Sword')
    insertPrice(db, 2, 1000, 5)
    insertRecipe(db, 1, 'Forge Copper Sword', 2, [{ itemId: 1, quantity: 1 }])

    const [row] = listCraftingSnipeRows(db, testSettings({ region: REGION, realmName: REALM }))
    expect(row.reagents[0]).toMatchObject({ unitCost: 5, source: 'buy' })
  })

  it('marks the row unavailable when a reagent has no price at all', () => {
    insertItem(db, 1, 'Mystery Reagent')
    insertItem(db, 2, 'Copper Sword')
    insertPrice(db, 2, 1000, 5)
    insertRecipe(db, 1, 'Forge Copper Sword', 2, [{ itemId: 1, quantity: 1 }])

    const [row] = listCraftingSnipeRows(db, testSettings({ region: REGION, realmName: REALM }))
    expect(row.reagentsAvailable).toBe(false)
    expect(row.craftCost).toBeNull()
    expect(row.reagents[0]).toMatchObject({ unitCost: null, source: 'unavailable' })
  })

  // Real recipe data never has an item indirectly requiring itself, but
  // nothing enforces that at the data layer — this guards against an
  // infinite recursion if it ever did, rather than crashing the whole
  // query for every recipe.
  it('does not infinite-loop on a cyclic recipe graph', () => {
    insertItem(db, 1, 'Item A', 5)
    insertItem(db, 2, 'Item B', 7)
    insertItem(db, 3, 'Copper Sword')
    insertPrice(db, 3, 1000, 5)
    insertRecipe(db, 1, 'Craft A', 1, [{ itemId: 2, quantity: 1 }])
    insertRecipe(db, 2, 'Craft B', 2, [{ itemId: 1, quantity: 1 }])
    insertRecipe(db, 3, 'Forge Copper Sword', 3, [{ itemId: 1, quantity: 1 }])

    const rows = listCraftingSnipeRows(db, testSettings({ region: REGION, realmName: REALM }))
    const swordRow = rows.find((r) => r.recipeId === 3)!
    // Falls back to Item A's own vendor price rather than recursing forever.
    expect(swordRow.reagents[0]).toMatchObject({ unitCost: 5, source: 'buy' })
  })
})
