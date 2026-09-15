import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import type { AppSettings, ImportAhScanResult } from '@shared/types'
import { ingestAhScanRows, type AhScanRow } from '../db/aggregate'
import { decodeLuaSavedVariable } from './luaParser'

/** Must match the addon's own folder/.toc name — same file export.ts writes to. */
const ADDON_FOLDER_NAME = 'AuctionAssistant'
/** Must match the `## SavedVariables:` entry the addon declares for its scan data (see wow-addon/AuctionAssistant/AHScan_*.lua). */
const SCAN_SAVED_VARIABLE_NAME = 'AuctionAssistantScan'
/** Must match the addon's own EXPECTED_SCHEMA_VERSION for the scan table. */
const EXPECTED_SCHEMA_VERSION = 1

/**
 * Field names `p`/`v` are load-bearing — they must exactly match what
 * AHScan_Legacy.lua and AHScan_ModernAH.lua actually write (the same
 * short {n, p, v} convention every other export in this app uses). These
 * two sides were once out of sync (the addon wrote `price`/`quantity`
 * while this expected `p`/`v`) and nothing caught it: the addon's own
 * tests only checked its own aggregation output, and this file's own
 * tests only checked hand-written fixtures that already assumed `p`/`v`
 * — neither side was ever tested against the other's real output. If you
 * change this shape, grep both AHScan_*.lua files for the same fields.
 */
interface RawScanItem {
  p?: unknown
  v?: unknown
}

interface RawScanData {
  schemaVersion?: unknown
  scannedAt?: unknown
  items?: Record<string, RawScanItem>
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Picks whichever account folder's SavedVariables file was written most
 * recently — the one the player actually just logged out of. Importing
 * from a stale, long-untouched second account's file would silently show
 * old data as if it were current, which is worse than just picking one.
 */
function findMostRecentSavedVariablesFile(wowFlavorPath: string): string | null {
  const wtfAccountDir = path.join(wowFlavorPath, 'WTF', 'Account')
  if (!fs.existsSync(wtfAccountDir)) return null

  const accountFolders = fs
    .readdirSync(wtfAccountDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  let newestPath: string | null = null
  let newestMtime = -Infinity

  for (const accountFolder of accountFolders) {
    const filePath = path.join(wtfAccountDir, accountFolder, 'SavedVariables', `${ADDON_FOLDER_NAME}.lua`)
    if (!fs.existsSync(filePath)) continue
    const mtime = fs.statSync(filePath).mtimeMs
    if (mtime > newestMtime) {
      newestMtime = mtime
      newestPath = filePath
    }
  }

  return newestPath
}

/**
 * Reads the WoW addon's in-game AH scan results back into
 * ah_scan_price_stats — the counterpart to export.ts, in the opposite
 * direction. Same SavedVariables-only constraint applies (this can only
 * see whatever WoW last saved to disk), but unlike export.ts, WoW does
 * NOT need to be fully closed first: the addon calls ReloadUI() itself
 * right after a scan completes (see AHScan_Legacy.lua/AHScan_Retail.lua),
 * which flushes SavedVariables to disk without the player needing to log
 * out, and nothing in the client touches AuctionAssistantScan again
 * afterward the way it would re-touch (and potentially clobber) an
 * app-side price export while still running.
 */
export function importAhScanFromAddon(db: Database.Database, settings: AppSettings): ImportAhScanResult {
  if (!settings.wowFlavorPath) {
    return { success: false, message: 'Set your WoW installation folder in Settings first.' }
  }

  const filePath = findMostRecentSavedVariablesFile(settings.wowFlavorPath)
  if (!filePath) {
    return {
      success: false,
      message: `No SavedVariables file found under "${settings.wowFlavorPath}". Log into WoW with the addon installed at least once first.`
    }
  }

  const source = fs.readFileSync(filePath, 'utf8')
  const raw = decodeLuaSavedVariable(source, SCAN_SAVED_VARIABLE_NAME)

  if (raw === undefined) {
    return {
      success: false,
      message: 'No AH scan data found yet — open the in-game Auction House at least once with the addon installed, then log out.'
    }
  }
  if (!isPlainRecord(raw)) {
    return { success: false, message: 'AH scan data in the SavedVariables file is malformed.' }
  }

  const data = raw as RawScanData
  if (data.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
    return {
      success: false,
      message: `AH scan data is schema version ${String(data.schemaVersion)}, expected ${EXPECTED_SCHEMA_VERSION}. Update the addon and desktop app to matching versions.`
    }
  }
  if (typeof data.scannedAt !== 'string') {
    return { success: false, message: 'AH scan data is missing a scan timestamp.' }
  }
  if (!isPlainRecord(data.items)) {
    return { success: false, message: 'AH scan data has no items table.' }
  }

  const rows: AhScanRow[] = []
  for (const [itemIdText, entry] of Object.entries(data.items)) {
    const itemId = Number(itemIdText)
    if (!Number.isFinite(itemId) || !isPlainRecord(entry)) continue
    const price = Number(entry.p)
    const volume = Number(entry.v)
    if (!Number.isFinite(price) || !Number.isFinite(volume)) continue
    rows.push({ itemId, price, volume })
  }

  if (rows.length === 0) {
    return { success: false, message: 'AH scan data has no usable item rows.' }
  }

  ingestAhScanRows(db, rows, settings.region, settings.realmName, data.scannedAt)

  return {
    success: true,
    message: `Imported ${rows.length.toLocaleString()} scanned item price${rows.length === 1 ? '' : 's'} from ${data.scannedAt}.`,
    itemCount: rows.length,
    scannedAt: data.scannedAt
  }
}
