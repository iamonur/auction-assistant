import { ipcMain } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type { ApiTestResult, AppSettings, DungeonEntryInput, GameVersion, Profession } from '@shared/types'
import { getDb } from './db'
import { getActiveGameVersion, getAppSettings, setActiveGameVersion, setAppSettings } from './store'
import { runAhSync, testConnection as testBattleNetConnection } from './battlenet/sync'
import { runTsmSync, testTsmConnection } from './tsm/sync'
import { searchItems } from './queries/items'
import { getItemDetail } from './queries/itemDetail'
import { listCraftingSnipeRows } from './queries/crafting'
import { getLevelingPlan } from './queries/levelingPlanner'
import { listGatheringRows } from './queries/gathering'
import { listPetFarmingRows } from './queries/pets'
import { listMarketAnomalies } from './queries/anomalies'
import { getMobDropTable, listMobValueRows, searchMobs } from './queries/mobValue'
import { listZoneValueRows } from './queries/zoneValue'
import { getFarmingSpotsForItem, listFarmingReagentOptions } from './queries/farming'
import { getNotableLootSuggestions } from './queries/worldData'
import {
  createDungeonRun,
  deleteDungeonEntry,
  deleteDungeonRun,
  importDungeonFromZone,
  listDungeonRuns,
  listInstanceZones,
  updateDungeonRun,
  upsertDungeonEntry
} from './queries/dungeon'

/** Every query/sync handler below operates on "whatever game version is currently active" — these two are the only place that reads it. */
function activeDb() {
  return getDb(getActiveGameVersion())
}

function activeSettings(): AppSettings {
  return getAppSettings(getActiveGameVersion())
}

async function syncPricingData(): Promise<ApiTestResult> {
  const gameVersion = getActiveGameVersion()
  const settings = getAppSettings(gameVersion)
  const result =
    settings.pricingSource === 'battlenet'
      ? await runAhSync(getDb(gameVersion), settings, gameVersion)
      : await runTsmSync(getDb(gameVersion), settings, gameVersion)
  if (result.success) {
    setAppSettings({ lastSyncAt: new Date().toISOString() }, gameVersion)
  }
  return result
}

async function testPricingConnection(): Promise<ApiTestResult> {
  const gameVersion = getActiveGameVersion()
  const settings = getAppSettings(gameVersion)
  return settings.pricingSource === 'battlenet'
    ? testBattleNetConnection(settings, gameVersion)
    : testTsmConnection(settings, gameVersion)
}

/** Registers every ipcMain.handle used by the renderer. Called once from main/index.ts on app start. */
export function registerIpcHandlers(): void {
  ipcMain.handle(IPC.GAME_VERSION_GET, (): GameVersion => getActiveGameVersion())

  ipcMain.handle(IPC.GAME_VERSION_SET, (_event, gameVersion: GameVersion): GameVersion => {
    setActiveGameVersion(gameVersion)
    // Opens (and creates + seeds, on first use) that version's database
    // eagerly so the renderer's post-switch reload hits a warm connection.
    getDb(gameVersion)
    return gameVersion
  })

  ipcMain.handle(IPC.SETTINGS_GET, (): AppSettings => activeSettings())

  ipcMain.handle(IPC.SETTINGS_SET, (_event, patch: Partial<AppSettings>): AppSettings =>
    setAppSettings(patch, getActiveGameVersion())
  )

  ipcMain.handle(IPC.AH_TEST_CONNECTION, async (): Promise<ApiTestResult> => testPricingConnection())

  ipcMain.handle(IPC.AH_FETCH_DATA, async (): Promise<ApiTestResult> => syncPricingData())

  ipcMain.handle(IPC.AH_LAST_SYNC, (): string | null => activeSettings().lastSyncAt)

  ipcMain.handle(IPC.ITEMS_SEARCH, (_event, query: string) => searchItems(activeDb(), query, activeSettings()))

  ipcMain.handle(IPC.ITEM_DETAIL_GET, (_event, itemId: number) => getItemDetail(activeDb(), activeSettings(), itemId))

  ipcMain.handle(IPC.CRAFTING_LIST, () => listCraftingSnipeRows(activeDb(), activeSettings()))

  ipcMain.handle(
    IPC.LEVELING_PLAN_GET,
    (_event, profession: Profession, startSkill: number, targetSkill: number, sellToAH: boolean) =>
      getLevelingPlan(activeDb(), activeSettings(), profession, startSkill, targetSkill, sellToAH)
  )

  ipcMain.handle(IPC.GATHERING_LIST, () => listGatheringRows(activeDb(), activeSettings()))

  ipcMain.handle(IPC.PETS_LIST, () => listPetFarmingRows(activeDb(), activeSettings()))

  ipcMain.handle(IPC.ANOMALIES_LIST, () => listMarketAnomalies(activeDb(), activeSettings()))

  ipcMain.handle(IPC.MOB_VALUE_LIST, () => listMobValueRows(activeDb(), activeSettings()))

  ipcMain.handle(IPC.MOB_VALUE_DROP_TABLE, (_event, creatureId: number) =>
    getMobDropTable(activeDb(), activeSettings(), creatureId)
  )

  ipcMain.handle(IPC.ZONE_VALUE_LIST, () => listZoneValueRows(activeDb(), activeSettings()))

  ipcMain.handle(IPC.MOB_SEARCH, (_event, query: string) => searchMobs(activeDb(), query))

  ipcMain.handle(IPC.FARMING_REAGENT_OPTIONS, () => listFarmingReagentOptions(activeDb()))

  ipcMain.handle(IPC.FARMING_SPOTS_FOR_ITEM, (_event, itemId: number) =>
    getFarmingSpotsForItem(activeDb(), itemId, activeSettings())
  )

  ipcMain.handle(IPC.DUNGEON_LOOT_SUGGESTIONS, (_event, itemId: number) =>
    getNotableLootSuggestions(activeDb(), itemId)
  )

  ipcMain.handle(IPC.DUNGEON_LIST, () => listDungeonRuns(activeDb(), activeSettings()))

  ipcMain.handle(IPC.DUNGEON_CREATE, (_event, name: string, notes: string | null) =>
    createDungeonRun(activeDb(), name, notes)
  )

  ipcMain.handle(IPC.DUNGEON_UPDATE, (_event, id: number, name: string, notes: string | null) =>
    updateDungeonRun(activeDb(), id, name, notes)
  )

  ipcMain.handle(IPC.DUNGEON_DELETE, (_event, id: number) => deleteDungeonRun(activeDb(), id))

  ipcMain.handle(IPC.DUNGEON_ENTRY_UPSERT, (_event, input: DungeonEntryInput) =>
    upsertDungeonEntry(activeDb(), input)
  )

  ipcMain.handle(IPC.DUNGEON_ENTRY_DELETE, (_event, id: number) => deleteDungeonEntry(activeDb(), id))

  ipcMain.handle(IPC.DUNGEON_LIST_INSTANCE_ZONES, () => listInstanceZones(activeDb()))

  ipcMain.handle(IPC.DUNGEON_IMPORT_FROM_ZONE, (_event, mapId: number, zoneName: string) =>
    importDungeonFromZone(activeDb(), activeSettings(), mapId, zoneName)
  )
}
