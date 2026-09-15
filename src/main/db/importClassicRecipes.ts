import fs from 'node:fs'
import type Database from 'better-sqlite3'
import type { Profession } from '@shared/types'
import { bundledDataPath } from './worldDataPaths'

const PROFESSIONS: Profession[] = ['Alchemy', 'Blacksmithing', 'Engineering', 'Leatherworking', 'Tailoring']

interface RawReagent {
  itemId: number
  quantity: number
  itemName: string
  quality: number
}

interface RawCraft {
  spellId: number
  name: string
  skillLevelReq: number
  source: 'trainer' | 'vendor' | 'drop' | 'quest'
  resultItemId: number
  resultQuantity: number
  resultItemName: string
  resultQuality: number
  reagents: RawReagent[]
}

/**
 * One-time import of real Classic crafting recipes from LibCrafts
 * (MIT-licensed, community-maintained — see resources/classic-recipes/
 * and this session's history for provenance), covering the five
 * professions named in the original spec: 1,215 recipes total, in place
 * of a small hand-typed example set (which turned out to have wrong item
 * ids for 3 of its 7 entries once checked against this data). Shared
 * across Classic Era and Classic Progression — pre-current-expansion
 * profession content is the same leveling recipe set in both. Guarded
 * the same way as runSeed: only runs when `recipes` is still empty.
 */
export function importClassicRecipes(db: Database.Database): void {
  const alreadyImported = db.prepare('SELECT COUNT(*) as count FROM recipes').get() as { count: number }
  if (alreadyImported.count > 0) return

  const insertPlaceholderItem = db.prepare(/* sql */ `
    INSERT INTO items (id, name, quality, category)
    VALUES (@id, @name, @quality, @category)
    ON CONFLICT(id) DO NOTHING
  `)

  const insertRecipe = db.prepare(/* sql */ `
    INSERT INTO recipes (profession, name, result_item_id, result_quantity, skill_level_req, source)
    VALUES (@profession, @name, @resultItemId, @resultQuantity, @skillLevelReq, @source)
  `)

  const insertReagent = db.prepare(/* sql */ `
    INSERT INTO recipe_reagents (recipe_id, item_id, quantity)
    VALUES (?, ?, ?)
  `)

  const runImport = db.transaction(() => {
    for (const profession of PROFESSIONS) {
      const crafts = JSON.parse(fs.readFileSync(bundledDataPath('classic-recipes', `${profession}.json`), 'utf8')) as RawCraft[]

      for (const craft of crafts) {
        insertPlaceholderItem.run({
          id: craft.resultItemId,
          name: craft.resultItemName,
          quality: craft.resultQuality,
          category: 'crafted'
        })
        for (const reagent of craft.reagents) {
          insertPlaceholderItem.run({
            id: reagent.itemId,
            name: reagent.itemName,
            quality: reagent.quality,
            category: 'reagent'
          })
        }

        const result = insertRecipe.run({
          profession,
          name: craft.name,
          resultItemId: craft.resultItemId,
          resultQuantity: craft.resultQuantity,
          skillLevelReq: craft.skillLevelReq,
          source: craft.source
        })
        const recipeId = Number(result.lastInsertRowid)

        for (const reagent of craft.reagents) {
          insertReagent.run(recipeId, reagent.itemId, reagent.quantity)
        }
      }
    }
  })

  runImport()
}
