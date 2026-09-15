import type Database from 'better-sqlite3'
import type { NotableLootSuggestion } from '@shared/types'

/**
 * Real drop-chance/mob suggestions for an item, from the world-data
 * import — the user still has to accept one to fill the entry form.
 * Scoped to rare-elite/boss creatures (npc_rank >= 2): mob_loot/mob_catalog
 * cover every creature now (see queries/mobValue.ts for the unfiltered
 * view), but suggesting from ordinary trash-mob loot tables here would
 * mostly just be noise for a "notable drop" assist.
 */
export function getNotableLootSuggestions(db: Database.Database, itemId: number): NotableLootSuggestion[] {
  return db
    .prepare(
      /* sql */ `
      SELECT mc.id as creatureId, mc.name as creatureName, mc.npc_rank as npcRank,
             mc.min_level as minLevel, mc.max_level as maxLevel, ml.chance_percent as chancePercent,
             ml.min_count as minCount, ml.max_count as maxCount, mc.spawn_count as spawnCount
      FROM mob_loot ml
      JOIN mob_catalog mc ON mc.id = ml.creature_id
      WHERE ml.item_id = ? AND mc.npc_rank >= 2
      ORDER BY ml.chance_percent DESC
    `
    )
    .all(itemId) as NotableLootSuggestion[]
}
