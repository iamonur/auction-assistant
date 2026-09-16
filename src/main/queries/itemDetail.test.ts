import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, testSettings } from '@test/db'
import { getItemDetail } from './itemDetail'

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
  reagents: { itemId: number; quantity: number }[]
): void {
  db.prepare(`INSERT INTO recipes (id, profession, name, result_item_id) VALUES (?, 'Blacksmithing', ?, ?)`).run(
    id,
    name,
    resultItemId
  )
  const insertReagent = db.prepare(`INSERT INTO recipe_reagents (recipe_id, item_id, quantity) VALUES (?, ?, ?)`)
  for (const reagent of reagents) insertReagent.run(id, reagent.itemId, reagent.quantity)
}

describe('getItemDetail', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('returns an empty craftedBy list for an item no recipe produces', () => {
    insertItem(db, 1, 'Just an Item')
    const detail = getItemDetail(db, testSettings({ region: REGION, realmName: REALM }), 1)
    expect(detail?.craftedBy).toEqual([])
  })

  // Same chaining as Crafting Sniper/Leveling Planner (main/queries/reagentCost.ts) —
  // a reagent that's itself craftable should be priced at whichever is cheaper.
  it('prices craftedBy recipes with reagent chaining, not just a flat AH sum', () => {
    insertItem(db, 1, 'Copper Ore')
    insertItem(db, 2, 'Copper Bar')
    insertItem(db, 3, 'Copper Sword')
    insertPrice(db, 1, 10, 20) // 2 ore -> 1 bar costs 20 to craft
    insertPrice(db, 2, 50, 5) // buying a bar outright costs 50
    insertRecipe(db, 1, 'Smelt Copper', 2, [{ itemId: 1, quantity: 2 }])
    insertRecipe(db, 2, 'Forge Copper Sword', 3, [{ itemId: 2, quantity: 2 }])

    const detail = getItemDetail(db, testSettings({ region: REGION, realmName: REALM }), 3)

    expect(detail?.craftedBy).toEqual([
      expect.objectContaining({ recipeId: 2, recipeName: 'Forge Copper Sword', craftCost: 40 })
    ])
  })

  it('leaves craftCost null when a reagent has no price at all', () => {
    insertItem(db, 1, 'Mystery Reagent')
    insertItem(db, 2, 'Copper Sword')
    insertRecipe(db, 1, 'Forge Copper Sword', 2, [{ itemId: 1, quantity: 1 }])

    const detail = getItemDetail(db, testSettings({ region: REGION, realmName: REALM }), 2)

    expect(detail?.craftedBy[0]).toMatchObject({ craftCost: null })
  })
})
