import type Database from 'better-sqlite3'
import type { AppSettings, ItemQuality, MobDropTableEntry, MobSearchResult, MobValueRow } from '@shared/types'
import { getCheapestPriceMap, getSupplyVolumeMap } from './shared'

const SEARCH_LIMIT = 20

/** Case-insensitive substring search over the mob catalog, used by the global search palette (Cmd+K). */
export function searchMobs(db: Database.Database, query: string): MobSearchResult[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []

  return db
    .prepare(
      /* sql */ `
      SELECT id as creatureId, name, npc_rank as npcRank
      FROM mob_catalog
      WHERE name LIKE ? COLLATE NOCASE
      ORDER BY name ASC
      LIMIT ?
    `
    )
    .all(`%${trimmed}%`, SEARCH_LIMIT) as MobSearchResult[]
}

interface CatalogRow {
  id: number
  name: string
  minLevel: number | null
  maxLevel: number | null
  npcRank: number
  spawnCount: number
}

interface LootRow {
  creatureId: number
  itemId: number
  chancePercent: number
  minCount: number
  maxCount: number
}

interface ExpectedValue {
  expectedValue: number
  avgGold: number
  lootItemsIncluded: number
  lootItemsExcluded: number
}

/**
 * Expected Value per mob: sum of chance% x avg-count x current price
 * across its loot table (any item with zero current volume is excluded —
 * its price isn't backed by real trades, same rule as Crafting Sniper and
 * Battle Pet Farming), plus average gold reward when the mob has one.
 * Shared by listMobValueRows below and Zone Value's per-zone average
 * (see queries/zoneValue.ts) so both agree on the same numbers.
 */
function computeExpectedValues(db: Database.Database, settings: AppSettings): Map<number, ExpectedValue> {
  const catalog = db
    .prepare(/* sql */ `SELECT id, min_gold as minGold, max_gold as maxGold FROM mob_catalog`)
    .all() as { id: number; minGold: number; maxGold: number }[]

  const lootRows = db
    .prepare(
      /* sql */ `
      SELECT creature_id as creatureId, item_id as itemId, chance_percent as chancePercent,
             min_count as minCount, max_count as maxCount
      FROM mob_loot
    `
    )
    .all() as LootRow[]

  const lootByCreature = new Map<number, LootRow[]>()
  for (const row of lootRows) {
    const list = lootByCreature.get(row.creatureId) ?? []
    list.push(row)
    lootByCreature.set(row.creatureId, list)
  }

  const priceMap = getCheapestPriceMap(db, settings)
  const volumeMap = getSupplyVolumeMap(db, settings)

  const result = new Map<number, ExpectedValue>()
  for (const mob of catalog) {
    const loot = lootByCreature.get(mob.id) ?? []
    let itemValue = 0
    let lootItemsIncluded = 0
    let lootItemsExcluded = 0

    for (const drop of loot) {
      const volume = volumeMap.get(drop.itemId) ?? 0
      const price = priceMap.get(drop.itemId)
      if (volume === 0 || price === undefined) {
        lootItemsExcluded++
        continue
      }
      const avgCount = (drop.minCount + drop.maxCount) / 2
      itemValue += (drop.chancePercent / 100) * avgCount * price
      lootItemsIncluded++
    }

    const avgGold = mob.maxGold > 0 ? Math.round((mob.minGold + mob.maxGold) / 2) : 0

    result.set(mob.id, {
      expectedValue: Math.round(itemValue) + avgGold,
      avgGold,
      lootItemsIncluded,
      lootItemsExcluded
    })
  }

  return result
}

/** Per-creature Expected Value only, for callers (like Zone Value) that don't need the full row shape. */
export function getMobExpectedValueMap(db: Database.Database, settings: AppSettings): Map<number, number> {
  const values = computeExpectedValues(db, settings)
  return new Map([...values].map(([creatureId, value]) => [creatureId, value.expectedValue]))
}

interface SkinningDropRow {
  creatureId: number
  itemId: number
  chancePercent: number
}

/**
 * Expected skinning value per creature: sum of chance% x current price
 * across its skinning loot table (skinning_drops), same liquidity gate as
 * everywhere else (an item with zero current volume is excluded). Kept
 * entirely separate from computeExpectedValues/getMobExpectedValueMap
 * above — skinning is a distinct, optional action the player may or may
 * not take, not part of a mob's general kill value, so it shouldn't
 * silently change what "Expected Value" means everywhere else in the app
 * (Zone Value averages, Dungeon Selecting totals, ...). Used only by the
 * addon's skinning-value tooltip line — see main/addon/export.ts.
 */
export function getSkinningExpectedValueMap(db: Database.Database, settings: AppSettings): Map<number, number> {
  const dropRows = db
    .prepare(
      /* sql */ `
      SELECT creature_id as creatureId, item_id as itemId, chance_percent as chancePercent
      FROM skinning_drops
    `
    )
    .all() as SkinningDropRow[]

  const priceMap = getCheapestPriceMap(db, settings)
  const volumeMap = getSupplyVolumeMap(db, settings)

  const rawTotals = new Map<number, number>()
  for (const drop of dropRows) {
    const volume = volumeMap.get(drop.itemId) ?? 0
    const price = priceMap.get(drop.itemId)
    if (volume === 0 || price === undefined) continue

    const value = (drop.chancePercent / 100) * price
    rawTotals.set(drop.creatureId, (rawTotals.get(drop.creatureId) ?? 0) + value)
  }

  return new Map([...rawTotals].map(([creatureId, total]) => [creatureId, Math.round(total)]))
}

export function listMobValueRows(db: Database.Database, settings: AppSettings): MobValueRow[] {
  const catalog = db
    .prepare(
      /* sql */ `
      SELECT id, name, min_level as minLevel, max_level as maxLevel, npc_rank as npcRank, spawn_count as spawnCount
      FROM mob_catalog
    `
    )
    .all() as CatalogRow[]

  const values = computeExpectedValues(db, settings)

  const rows = catalog.map((mob) => {
    const value = values.get(mob.id) ?? { expectedValue: 0, avgGold: 0, lootItemsIncluded: 0, lootItemsExcluded: 0 }
    return {
      creatureId: mob.id,
      name: mob.name,
      minLevel: mob.minLevel,
      maxLevel: mob.maxLevel,
      npcRank: mob.npcRank,
      spawnCount: mob.spawnCount,
      avgGold: value.avgGold,
      expectedValue: value.expectedValue,
      lootItemsIncluded: value.lootItemsIncluded,
      lootItemsExcluded: value.lootItemsExcluded
    } satisfies MobValueRow
  })

  return rows.sort((a, b) => b.expectedValue - a.expectedValue)
}

interface DropTableJoinRow {
  itemId: number
  itemName: string
  quality: ItemQuality
  chancePercent: number
  minCount: number
  maxCount: number
}

/**
 * Full drop table for one mob, priced the same way as its Expected Value
 * (see listMobValueRows) so the popup and the list row agree on which
 * items counted. Sorted by chance% descending — most common drop first.
 */
export function getMobDropTable(db: Database.Database, settings: AppSettings, creatureId: number): MobDropTableEntry[] {
  const lootRows = db
    .prepare(
      /* sql */ `
      SELECT ml.item_id as itemId, i.name as itemName, i.quality as quality,
             ml.chance_percent as chancePercent, ml.min_count as minCount, ml.max_count as maxCount
      FROM mob_loot ml
      JOIN items i ON i.id = ml.item_id
      WHERE ml.creature_id = ?
    `
    )
    .all(creatureId) as DropTableJoinRow[]

  const priceMap = getCheapestPriceMap(db, settings)
  const volumeMap = getSupplyVolumeMap(db, settings)

  const entries = lootRows.map((row) => {
    const volume = volumeMap.get(row.itemId) ?? 0
    const price = priceMap.get(row.itemId) ?? null
    return {
      itemId: row.itemId,
      itemName: row.itemName,
      quality: row.quality,
      chancePercent: row.chancePercent,
      minCount: row.minCount,
      maxCount: row.maxCount,
      price: volume > 0 ? price : null,
      volume
    } satisfies MobDropTableEntry
  })

  return entries.sort((a, b) => b.chancePercent - a.chancePercent)
}
