import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { createTestDb, testSettings } from '@test/db'
import { exportPricesToAddon } from './export'

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

function insertFreshAhScan(db: Database.Database, itemId: number, price: number, volume: number): void {
  db.prepare(
    `INSERT INTO ah_scan_price_stats (item_id, region, realm, price, volume, scanned_at) VALUES (?, ?, ?, ?, ?, datetime('now', '-1 hours'))`
  ).run(itemId, REGION, REALM, price, volume)
}

function seedZoneSpawn(
  db: Database.Database,
  creatureId: number,
  itemId: number,
  price: number,
  zoneName: string
): void {
  db.prepare(
    `INSERT INTO mob_catalog (id, name, min_level, max_level, npc_rank, min_gold, max_gold, spawn_count) VALUES (?, ?, 1, 1, 0, 0, 0, 5)`
  ).run(creatureId, `Mob ${creatureId}`)
  db.prepare(
    `INSERT INTO mob_loot (creature_id, item_id, chance_percent, min_count, max_count) VALUES (?, ?, 100, 1, 1)`
  ).run(creatureId, itemId)
  insertItem(db, itemId, `Loot ${itemId}`)
  insertPrice(db, itemId, price, 10)
  db.prepare(
    `INSERT INTO mob_zone_spawns (creature_id, map_id, zone_name, zone_type, spawn_count) VALUES (?, 0, ?, 'open_world', 5)`
  ).run(creatureId, zoneName)
}

/** True if a `lua` interpreter is on PATH — the syntax round-trip test is skipped (not failed) when it isn't, so this suite stays portable across dev machines/CI. */
function hasLuaInterpreter(): boolean {
  try {
    execFileSync('lua', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

describe('exportPricesToAddon', () => {
  let db: Database.Database
  let wowRoot: string

  beforeEach(() => {
    db = createTestDb()
    wowRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wow-export-test-'))
    // Simulate an existing WoW account folder, as if the player had logged in before.
    fs.mkdirSync(path.join(wowRoot, 'WTF', 'Account', 'TESTACCOUNT#1'), { recursive: true })
  })

  afterEach(() => {
    db.close()
    fs.rmSync(wowRoot, { recursive: true, force: true })
  })

  it('fails clearly when no WoW folder is configured', () => {
    const result = exportPricesToAddon(db, testSettings({ wowFlavorPath: '' }), 'classic_era')
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/Settings/)
  })

  it('fails clearly when the folder has no WTF/Account directory', () => {
    const emptyFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'wow-export-empty-'))
    const result = exportPricesToAddon(db, testSettings({ wowFlavorPath: emptyFolder }), 'classic_era')
    expect(result.success).toBe(false)
    expect(result.message).toMatch(/WTF\/Account/)
    fs.rmSync(emptyFolder, { recursive: true, force: true })
  })

  it('writes a SavedVariables file including only liquid-priced items', () => {
    insertItem(db, 19019, 'Thunderfury, Blessed Blade of the Windseeker')
    insertPrice(db, 19019, 999999999, 3)
    insertItem(db, 100, 'Illiquid Item')
    insertPrice(db, 100, 500, 0) // zero volume — must be excluded

    const settings = testSettings({ region: REGION, realmName: REALM, wowFlavorPath: wowRoot })
    const result = exportPricesToAddon(db, settings, 'classic_progression')

    expect(result.success).toBe(true)
    expect(result.itemCount).toBe(1)

    const written = fs.readFileSync(
      path.join(wowRoot, 'WTF', 'Account', 'TESTACCOUNT#1', 'SavedVariables', 'AuctionAssistant.lua'),
      'utf8'
    )
    expect(written).toContain('AuctionAssistantPrices = {')
    expect(written).toContain('[19019]=')
    expect(written).toContain('Thunderfury')
    expect(written).not.toContain('Illiquid Item')
  })

  it('exports a fresh AH scan price in place of the TSM/Battle.net price', () => {
    insertItem(db, 19019, 'Thunderfury, Blessed Blade of the Windseeker')
    insertPrice(db, 19019, 999999999, 3)
    insertFreshAhScan(db, 19019, 500000000, 7)

    const settings = testSettings({ region: REGION, realmName: REALM, wowFlavorPath: wowRoot })
    exportPricesToAddon(db, settings, 'classic_era')

    const written = fs.readFileSync(
      path.join(wowRoot, 'WTF', 'Account', 'TESTACCOUNT#1', 'SavedVariables', 'AuctionAssistant.lua'),
      'utf8'
    )
    expect(written).toContain('[19019]={["n"]="Thunderfury, Blessed Blade of the Windseeker",["p"]=500000000,["v"]=7}')
  })

  it('includes zone value data keyed by normalized zone name', () => {
    seedZoneSpawn(db, 1, 501, 250, "Un'Goro Crater")

    const settings = testSettings({ region: REGION, realmName: REALM, wowFlavorPath: wowRoot })
    exportPricesToAddon(db, settings, 'classic_era')

    const written = fs.readFileSync(
      path.join(wowRoot, 'WTF', 'Account', 'TESTACCOUNT#1', 'SavedVariables', 'AuctionAssistant.lua'),
      'utf8'
    )
    expect(written).toContain('["zones"]=')
    expect(written).toContain('["ungorocrater"]=')
    expect(written).toContain('"Un\'Goro Crater"')
  })

  it('includes mob expected value data keyed by creature id, excluding zero-value mobs', () => {
    seedZoneSpawn(db, 42, 601, 400, 'Duskwood') // creature 42 has loot worth 400 copper * 100% chance

    // A mob with no loot and no gold — expected value is 0, must be excluded.
    db.prepare(
      `INSERT INTO mob_catalog (id, name, min_level, max_level, npc_rank, min_gold, max_gold, spawn_count) VALUES (?, ?, 1, 1, 0, 0, 0, 1)`
    ).run(99, 'Worthless Critter')

    const settings = testSettings({ region: REGION, realmName: REALM, wowFlavorPath: wowRoot })
    exportPricesToAddon(db, settings, 'classic_era')

    const written = fs.readFileSync(
      path.join(wowRoot, 'WTF', 'Account', 'TESTACCOUNT#1', 'SavedVariables', 'AuctionAssistant.lua'),
      'utf8'
    )
    expect(written).toContain('["mobs"]=')
    expect(written).toContain('[42]=400')
    expect(written).not.toContain('[99]=')
  })

  it('writes into every existing WoW account folder found', () => {
    fs.mkdirSync(path.join(wowRoot, 'WTF', 'Account', 'SECONDACCOUNT#1'), { recursive: true })
    insertItem(db, 1, 'Test Item')
    insertPrice(db, 1, 100, 5)

    exportPricesToAddon(db, testSettings({ region: REGION, realmName: REALM, wowFlavorPath: wowRoot }), 'classic_era')

    expect(
      fs.existsSync(path.join(wowRoot, 'WTF', 'Account', 'TESTACCOUNT#1', 'SavedVariables', 'AuctionAssistant.lua'))
    ).toBe(true)
    expect(
      fs.existsSync(path.join(wowRoot, 'WTF', 'Account', 'SECONDACCOUNT#1', 'SavedVariables', 'AuctionAssistant.lua'))
    ).toBe(true)
  })

  it.skipIf(!hasLuaInterpreter())('produces a file that is valid, loadable Lua syntax', () => {
    insertItem(db, 1, 'Quoted "Item" Name')
    insertPrice(db, 1, 100, 5)
    insertItem(db, 2, "Item with 'apostrophe'")
    insertPrice(db, 2, 200, 10)

    exportPricesToAddon(db, testSettings({ region: REGION, realmName: REALM, wowFlavorPath: wowRoot }), 'classic_era')

    const filePath = path.join(wowRoot, 'WTF', 'Account', 'TESTACCOUNT#1', 'SavedVariables', 'AuctionAssistant.lua')
    // Exits non-zero (throws) if the file isn't syntactically valid Lua.
    expect(() => execFileSync('lua', ['-e', `assert(loadfile(${JSON.stringify(filePath)}))`])).not.toThrow()
  })
})
