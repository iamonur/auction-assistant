import type Database from 'better-sqlite3'
import type { AppSettings, ItemCategory, ItemDetail, ItemQuality } from '@shared/types'
import { getItemPriceInfo } from './shared'

interface ItemRow {
  id: number
  name: string
  quality: ItemQuality
  itemLevel: number | null
  vendorPrice: number | null
  category: ItemCategory
  isBoe: number
}

/**
 * Cross-references every table that references an item id — mob loot,
 * gathering nodes, skinning drops, and recipes (both as a reagent and as
 * a crafted result) — for the item detail popup. Reused from Mob Value's
 * drop table, Crafting Sniper, Gathering Profitability, and Anomalies.
 */
export function getItemDetail(db: Database.Database, settings: AppSettings, itemId: number): ItemDetail | null {
  const item = db
    .prepare(
      /* sql */ `
      SELECT id, name, quality, item_level as itemLevel, vendor_price as vendorPrice,
             category, is_boe as isBoe
      FROM items WHERE id = ?
    `
    )
    .get(itemId) as ItemRow | undefined

  if (!item) return null

  const droppedBy = db
    .prepare(
      /* sql */ `
      SELECT mc.id as creatureId, mc.name as name, mc.npc_rank as npcRank,
             ml.chance_percent as chancePercent, ml.min_count as minCount, ml.max_count as maxCount
      FROM mob_loot ml
      JOIN mob_catalog mc ON mc.id = ml.creature_id
      WHERE ml.item_id = ?
      ORDER BY ml.chance_percent DESC
      LIMIT 25
    `
    )
    .all(itemId) as ItemDetail['droppedBy']

  const gatheredFrom = db
    .prepare(
      /* sql */ `
      SELECT node_name as nodeName, kind, SUM(spawn_count) as spawnCount
      FROM gathering_node_spawns
      WHERE item_id = ?
      GROUP BY node_name, kind
      ORDER BY spawnCount DESC
    `
    )
    .all(itemId) as ItemDetail['gatheredFrom']

  const skinnedFrom = db
    .prepare(
      /* sql */ `
      SELECT creature_id as creatureId, creature_name as name,
             chance_percent as chancePercent, spawn_count as spawnCount
      FROM skinning_drops
      WHERE item_id = ?
      ORDER BY chance_percent DESC
    `
    )
    .all(itemId) as ItemDetail['skinnedFrom']

  const usedInRecipes = db
    .prepare(
      /* sql */ `
      SELECT r.id as recipeId, r.name as recipeName, r.profession as profession, rr.quantity as quantity
      FROM recipe_reagents rr
      JOIN recipes r ON r.id = rr.recipe_id
      WHERE rr.item_id = ?
      ORDER BY r.profession, r.name
    `
    )
    .all(itemId) as ItemDetail['usedInRecipes']

  const craftedBy = db
    .prepare(
      /* sql */ `
      SELECT id as recipeId, name as recipeName, profession,
             skill_level_req as skillLevelReq, result_quantity as resultQuantity
      FROM recipes
      WHERE result_item_id = ?
    `
    )
    .all(itemId) as ItemDetail['craftedBy']

  const { price, volume } = getItemPriceInfo(db, settings, itemId)

  return {
    itemId: item.id,
    name: item.name,
    quality: item.quality,
    itemLevel: item.itemLevel,
    vendorPrice: item.vendorPrice,
    category: item.category,
    isBoe: item.isBoe === 1,
    price,
    volume,
    droppedBy,
    gatheredFrom,
    skinnedFrom,
    usedInRecipes,
    craftedBy
  } satisfies ItemDetail
}
