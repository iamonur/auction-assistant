import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb, testSettings } from '@test/db'
import { listGatheringNodeValueRows } from './gathering'

const REGION = 'us'
const REALM = 'test-realm'
const DATE = '2026-01-01'

function seedNodeSpawn(
  db: Database.Database,
  nodeName: string,
  itemId: number,
  itemName: string,
  kind: 'herb' | 'ore'
): void {
  db.prepare(`INSERT OR IGNORE INTO items (id, name, quality) VALUES (?, ?, 1)`).run(itemId, itemName)
  db.prepare(
    `INSERT INTO gathering_node_spawns (gameobject_id, node_name, item_id, kind, map_id, spawn_count) VALUES (?, ?, ?, ?, 0, 5)`
  ).run(itemId * 1000, nodeName, itemId, kind)
}

describe('listGatheringNodeValueRows', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('resolves a node to its yielded item price, keyed by the real node display name (not the item name)', () => {
    seedNodeSpawn(db, 'Copper Vein', 201, 'Copper Ore', 'ore')
    db.prepare(
      `INSERT INTO item_price_stats (item_id, region, realm, date, avg_price, min_price, max_price, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(201, REGION, REALM, DATE, 50, 50, 50, 10)

    const rows = listGatheringNodeValueRows(db, testSettings({ region: REGION, realmName: REALM }))
    expect(rows).toEqual([{ nodeName: 'Copper Vein', itemId: 201, itemName: 'Copper Ore', value: 50 }])
  })

  it('gates value to null when the yielded item has zero liquidity', () => {
    seedNodeSpawn(db, 'Peacebloom', 202, 'Peacebloom', 'herb')
    db.prepare(
      `INSERT INTO item_price_stats (item_id, region, realm, date, avg_price, min_price, max_price, volume) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(202, REGION, REALM, DATE, 10, 10, 10, 0)

    const rows = listGatheringNodeValueRows(db, testSettings({ region: REGION, realmName: REALM }))
    expect(rows).toEqual([{ nodeName: 'Peacebloom', itemId: 202, itemName: 'Peacebloom', value: null }])
  })

  it('gates value to null when there is no price data at all', () => {
    seedNodeSpawn(db, 'Silverleaf', 203, 'Silverleaf', 'herb')

    const rows = listGatheringNodeValueRows(db, testSettings({ region: REGION, realmName: REALM }))
    expect(rows).toEqual([{ nodeName: 'Silverleaf', itemId: 203, itemName: 'Silverleaf', value: null }])
  })

  it('keeps distinct node names as separate rows even when duplicated across maps', () => {
    seedNodeSpawn(db, 'Rich Thorium Vein', 204, 'Thorium Ore', 'ore')
    db.prepare(
      `INSERT INTO gathering_node_spawns (gameobject_id, node_name, item_id, kind, map_id, spawn_count) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(204999, 'Rich Thorium Vein', 204, 'ore', 1, 3) // same node name, different map — must not duplicate the row

    const rows = listGatheringNodeValueRows(db, testSettings({ region: REGION, realmName: REALM }))
    expect(rows).toHaveLength(1)
  })
})
