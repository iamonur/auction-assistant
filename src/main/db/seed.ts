import type Database from 'better-sqlite3'
import { SEED_ITEMS, SEED_FARMING_SPOTS } from './seedData'

/**
 * Populates the database with the starter dataset on first run only
 * (guarded by an empty `items` table check in runSeed). Any item id
 * referenced by a farming spot that isn't in SEED_ITEMS gets a minimal
 * placeholder row so the foreign key constraint holds; the live AH sync
 * fills in the real name/icon/quality later. Recipes are a separate,
 * much larger import — see importClassicRecipes.ts.
 */
export function runSeed(db: Database.Database): void {
  const itemCount = db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number }
  if (itemCount.count > 0) return

  const insertItem = db.prepare(/* sql */ `
    INSERT OR IGNORE INTO items (id, name, quality, icon, item_level, vendor_price, category, is_boe, gathering_profession)
    VALUES (@id, @name, @quality, @icon, @itemLevel, @vendorPrice, @category, @isBoe, @gatheringProfession)
  `)

  const insertPlaceholderItem = db.prepare(/* sql */ `
    INSERT OR IGNORE INTO items (id, name, quality, category)
    VALUES (?, ?, 1, 'other')
  `)

  const insertFarmingSpot = db.prepare(/* sql */ `
    INSERT INTO farming_spots (item_id, zone, sub_zone, mob_or_node, min_level, max_level, drop_or_gather_chance, estimated_nodes_or_mobs_per_hour, notes)
    VALUES (@itemId, @zone, @subZone, @mobOrNode, @minLevel, @maxLevel, @dropOrGatherChance, @estimatedNodesOrMobsPerHour, @notes)
  `)

  const seedTransaction = db.transaction(() => {
    const knownIds = new Set(SEED_ITEMS.map((item) => item.id))

    for (const item of SEED_ITEMS) {
      insertItem.run({
        id: item.id,
        name: item.name,
        quality: item.quality,
        icon: null,
        itemLevel: null,
        vendorPrice: item.vendorPrice ?? null,
        category: item.category,
        isBoe: item.isBoe ? 1 : 0,
        gatheringProfession: item.gatheringProfession ?? null
      })
    }

    const ensurePlaceholder = (itemId: number): void => {
      if (knownIds.has(itemId)) return
      insertPlaceholderItem.run(itemId, `Unknown Item #${itemId}`)
      knownIds.add(itemId)
    }

    for (const spot of SEED_FARMING_SPOTS) {
      ensurePlaceholder(spot.itemId)
      insertFarmingSpot.run({
        itemId: spot.itemId,
        zone: spot.zone,
        subZone: spot.subZone ?? null,
        mobOrNode: spot.mobOrNode,
        minLevel: spot.minLevel ?? null,
        maxLevel: spot.maxLevel ?? null,
        dropOrGatherChance: spot.dropOrGatherChance,
        estimatedNodesOrMobsPerHour: spot.estimatedNodesOrMobsPerHour,
        notes: spot.notes ?? null
      })
    }
  })

  seedTransaction()
}
