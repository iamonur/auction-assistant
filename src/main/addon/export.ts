import fs from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import type Database from 'better-sqlite3'
import type { AppSettings, ExportPricesResult, GameVersion } from '@shared/types'
import { encodeLuaSavedVariable } from './luaSerializer'
import { listZoneValueRows } from '../queries/zoneValue'
import { getMobExpectedValueMap, getSkinningExpectedValueMap } from '../queries/mobValue'
import { listGatheringNodeValueRows } from '../queries/gathering'
import { getCheapestPriceMap, getSupplyVolumeMap } from '../queries/shared'
import { normalizeDisplayName } from './displayName'

const execAsync = promisify(exec)

/** Must match the addon's own folder/.toc name — the SavedVariables filename WoW writes/reads is always `<AddonFolderName>.lua`. */
const ADDON_FOLDER_NAME = 'AuctionAssistant'
/** Must match the `## SavedVariables:` line in the addon's .toc files. */
const SAVED_VARIABLE_NAME = 'AuctionAssistantPrices'
/** Bump alongside the addon's own EXPECTED_SCHEMA_VERSION in Core.lua if this shape ever changes. */
const SCHEMA_VERSION = 1

/**
 * Best-effort, not a guarantee: WoW only writes SavedVariables to disk at
 * logout, so exporting while it's running risks the client overwriting
 * this export with its stale in-memory copy the next time the player logs
 * out. Failure to detect (unknown platform, exec error, ...) is treated
 * as "not running" — this is a helpful warning, not a safety gate, since
 * a false negative here is far less costly than blocking a valid export.
 */
export async function isWowLikelyRunning(): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execAsync('pgrep -x "World of Warcraft"')
      return stdout.trim().length > 0
    }
    if (process.platform === 'win32') {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq Wow*.exe"')
      return /Wow.*\.exe/i.test(stdout)
    }
    return false
  } catch {
    // pgrep/tasklist exit non-zero when nothing matches — that's "not running", not an error.
    return false
  }
}

/**
 * Writes a price snapshot into the WoW addon's SavedVariables file(s) —
 * see wow-addon/AuctionAssistant/Core.lua for the reader side. Only
 * items with a currently liquid price for the active (region, realm) are
 * included, same liquidity gate as every other feature in this app.
 */
export function exportPricesToAddon(
  db: Database.Database,
  settings: AppSettings,
  gameVersion: GameVersion
): ExportPricesResult {
  if (!settings.wowFlavorPath) {
    return { success: false, message: 'Set your WoW installation folder in Settings first.' }
  }

  const wtfAccountDir = path.join(settings.wowFlavorPath, 'WTF', 'Account')
  if (!fs.existsSync(wtfAccountDir)) {
    return {
      success: false,
      message: `No WTF/Account folder found under "${settings.wowFlavorPath}". Double-check that folder directly contains Interface/ and WTF/, and that you've logged into WoW at least once.`
    }
  }

  const accountFolders = fs
    .readdirSync(wtfAccountDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  if (accountFolders.length === 0) {
    return { success: false, message: 'No WoW account folder found under WTF/Account — log into WoW at least once first.' }
  }

  // Routed through the same shared resolver every other feature reads
  // through (see queries/shared.ts), so in-game tooltips reflect a fresh
  // AH scan the same way the rest of the app does — not just TSM/Battle.net.
  const priceMap = getCheapestPriceMap(db, settings)
  const volumeMap = getSupplyVolumeMap(db, settings)
  const itemNames = new Map(
    (db.prepare('SELECT id, name FROM items').all() as { id: number; name: string }[]).map((row) => [
      row.id,
      row.name
    ])
  )

  const items: Record<number, { n: string; p: number; v: number }> = {}
  let itemCount = 0
  for (const [itemId, volume] of volumeMap) {
    if (volume <= 0) continue
    const price = priceMap.get(itemId)
    const name = itemNames.get(itemId)
    if (price === undefined || name === undefined) continue
    items[itemId] = { n: name, p: price, v: volume }
    itemCount++
  }

  // Keyed by normalizeDisplayName(zoneName), not the raw name — the addon
  // reads WoW's own C_Map.GetMapInfoAtPosition(uiMapID, x, y).name at
  // runtime (following the player's cursor on the world map) and looks it
  // up under the same normalization, since there's no shared id space
  // between this app's zone data (from the world database) and WoW's
  // UiMapID system. See wow-addon/AuctionAssistant/ZoneHover.lua.
  const zoneRows = listZoneValueRows(db, settings)
  const zones: Record<string, { n: string; v: number; m: number; s: number }> = {}
  for (const zone of zoneRows) {
    zones[normalizeDisplayName(zone.zoneName)] = {
      n: zone.zoneName,
      v: zone.avgMobValue,
      m: zone.mobCount,
      s: zone.totalSpawns
    }
  }

  // Keyed by creature template id, which is what WoW's own addon API
  // exposes via UnitGUID (the "npcId" field) — see
  // wow-addon/AuctionAssistant/MobTooltip.lua. Zero-value mobs (no loot,
  // no gold) are dropped rather than shown as "worth 0c", same call as
  // the liquidity gate on items above.
  const mobValues = getMobExpectedValueMap(db, settings)
  const mobs: Record<number, number> = {}
  for (const [creatureId, expectedValue] of mobValues) {
    if (expectedValue > 0) {
      mobs[creatureId] = expectedValue
    }
  }

  // Also keyed by creature template id, but kept entirely separate from
  // `mobs` above — skinning value is shown as its own tooltip line only
  // for a skinnable corpse, not folded into general Expected Value. See
  // queries/mobValue.ts#getSkinningExpectedValueMap.
  const skinningValues = getSkinningExpectedValueMap(db, settings)
  const skinning: Record<number, number> = {}
  for (const [creatureId, value] of skinningValues) {
    if (value > 0) {
      skinning[creatureId] = value
    }
  }

  // Keyed by normalizeDisplayName(nodeName) — the addon reads a gathering
  // node's own tooltip name at runtime (see
  // wow-addon/AuctionAssistant/GatherTooltip_*.lua) and looks it up the
  // same way ZoneHover.lua does for zones. Nodes with no liquid price for
  // their yielded item are dropped rather than shown as worthless.
  const nodeRows = listGatheringNodeValueRows(db, settings)
  const gatheringNodes: Record<string, { n: string; v: number }> = {}
  for (const node of nodeRows) {
    if (node.value !== null) {
      gatheringNodes[normalizeDisplayName(node.nodeName)] = { n: node.nodeName, v: node.value }
    }
  }

  const luaSource = encodeLuaSavedVariable(SAVED_VARIABLE_NAME, {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    gameVersion,
    region: settings.region,
    realm: settings.realmName,
    items,
    zones,
    mobs,
    skinning,
    gatheringNodes
  })

  for (const accountFolder of accountFolders) {
    const savedVariablesDir = path.join(wtfAccountDir, accountFolder, 'SavedVariables')
    fs.mkdirSync(savedVariablesDir, { recursive: true })
    fs.writeFileSync(path.join(savedVariablesDir, `${ADDON_FOLDER_NAME}.lua`), luaSource, 'utf8')
  }

  const counts = [
    [itemCount, 'item price'],
    [zoneRows.length, 'zone value'],
    [Object.keys(mobs).length, 'mob value'],
    [Object.keys(skinning).length, 'skinning value'],
    [Object.keys(gatheringNodes).length, 'gathering node']
  ] as const
  const summary = counts.map(([count, label]) => `${count.toLocaleString()} ${label}${count === 1 ? '' : 's'}`).join(', ')

  return {
    success: true,
    message: `Exported ${summary} to ${accountFolders.length} WoW account${accountFolders.length === 1 ? '' : 's'}. Fully log out and back in for the addon to pick it up.`,
    itemCount
  }
}
