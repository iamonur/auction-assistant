import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { createTestDb, testSettings } from '@test/db'
import { importAhScanFromAddon } from './ahScanImport'

const REGION = 'us'
const REALM = 'test-realm'

function writeSavedVariables(wowRoot: string, accountFolder: string, luaSource: string): string {
  const dir = path.join(wowRoot, 'WTF', 'Account', accountFolder, 'SavedVariables')
  fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, 'AuctionAssistant.lua')
  fs.writeFileSync(filePath, luaSource, 'utf8')
  return filePath
}

function scanFixture(scannedAt: string, items: Record<number, { p: number; v: number }>): string {
  const entries = Object.entries(items)
    .map(([id, { p, v }]) => `\t\t[${id}] = { ["p"] = ${p}, ["v"] = ${v} },`)
    .join('\n')
  return `AuctionAssistantScan = {
\t["schemaVersion"] = 1,
\t["scannedAt"] = "${scannedAt}",
\t["region"] = "us",
\t["realm"] = "test-realm",
\t["items"] = {
${entries}
\t},
}
`
}

describe('importAhScanFromAddon', () => {
  let db: Database.Database
  let wowRoot: string

  beforeEach(() => {
    db = createTestDb()
    wowRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wow-ahscan-import-test-'))
  })

  afterEach(() => {
    db.close()
    fs.rmSync(wowRoot, { recursive: true, force: true })
  })

  it('fails clearly when no WoW folder is configured', () => {
    const result = importAhScanFromAddon(db, testSettings({ wowFlavorPath: '' }))
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/Settings/)
  })

  it('fails clearly when no SavedVariables file exists at all', () => {
    const result = importAhScanFromAddon(db, testSettings({ wowFlavorPath: wowRoot }))
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/No SavedVariables file/)
  })

  it('fails clearly when the file has no AuctionAssistantScan global yet', () => {
    writeSavedVariables(wowRoot, 'ACC#1', 'AuctionAssistantPrices = { ["items"] = {} }\n')
    const result = importAhScanFromAddon(db, testSettings({ wowFlavorPath: wowRoot }))
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/open the in-game Auction House/)
  })

  it('imports scanned items into ah_scan_price_stats', () => {
    writeSavedVariables(
      wowRoot,
      'ACC#1',
      scanFixture('2026-01-01T12:00:00Z', { 19019: { p: 500000, v: 3 }, 100: { p: 250, v: 0 } })
    )

    const settings = testSettings({ region: REGION, realmName: REALM, wowFlavorPath: wowRoot })
    const result = importAhScanFromAddon(db, settings)

    expect(result.success).toBe(true)
    expect(result.itemCount).toBe(2)
    expect(result.scannedAt).toBe('2026-01-01T12:00:00Z')

    const rows = db
      .prepare('SELECT item_id as itemId, price, volume, scanned_at as scannedAt FROM ah_scan_price_stats ORDER BY item_id')
      .all()
    expect(rows).toEqual([
      { itemId: 100, price: 250, volume: 0, scannedAt: '2026-01-01T12:00:00Z' },
      { itemId: 19019, price: 500000, volume: 3, scannedAt: '2026-01-01T12:00:00Z' }
    ])
  })

  it('rejects data from an unexpected schema version', () => {
    writeSavedVariables(
      wowRoot,
      'ACC#1',
      'AuctionAssistantScan = { ["schemaVersion"] = 99, ["scannedAt"] = "2026-01-01T12:00:00Z", ["items"] = {} }\n'
    )
    const result = importAhScanFromAddon(db, testSettings({ wowFlavorPath: wowRoot }))
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/schema version/)
  })

  it('picks the most recently modified account folder when several exist', () => {
    const olderPath = writeSavedVariables(
      wowRoot,
      'OLD#1',
      scanFixture('2026-01-01T00:00:00Z', { 1: { p: 100, v: 1 } })
    )
    // Ensure a distinguishable mtime ordering regardless of filesystem timestamp resolution.
    fs.utimesSync(olderPath, new Date('2020-01-01'), new Date('2020-01-01'))

    const newerPath = writeSavedVariables(
      wowRoot,
      'NEW#1',
      scanFixture('2026-02-01T00:00:00Z', { 2: { p: 200, v: 2 } })
    )
    fs.utimesSync(newerPath, new Date('2026-06-01'), new Date('2026-06-01'))

    const result = importAhScanFromAddon(db, testSettings({ wowFlavorPath: wowRoot }))
    expect(result.success).toBe(true)
    expect(result.scannedAt).toBe('2026-02-01T00:00:00Z')

    const itemIds = (db.prepare('SELECT item_id as itemId FROM ah_scan_price_stats').all() as { itemId: number }[]).map(
      (r) => r.itemId
    )
    expect(itemIds).toEqual([2])
  })
})
