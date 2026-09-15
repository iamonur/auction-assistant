import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipcChannels'
import type {
  ApiTestResult,
  AppSettings,
  CraftingSnipeRow,
  DungeonEntryInput,
  DungeonRunWithValue,
  ExportPricesResult,
  FarmingRouteResult,
  GameVersion,
  GatheringItemRow,
  ImportAhScanResult,
  ItemDetail,
  InstanceZoneOption,
  ItemSearchResult,
  LevelingPlanResult,
  MarketAnomalyRow,
  MobDropTableEntry,
  MobSearchResult,
  MobValueRow,
  NotableLootSuggestion,
  PetFarmingRow,
  Profession,
  ZoneValueRow
} from '@shared/types'

const api = {
  gameVersion: {
    get: (): Promise<GameVersion> => ipcRenderer.invoke(IPC.GAME_VERSION_GET),
    set: (gameVersion: GameVersion): Promise<GameVersion> => ipcRenderer.invoke(IPC.GAME_VERSION_SET, gameVersion)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_SET, patch)
  },
  ah: {
    testConnection: (): Promise<ApiTestResult> => ipcRenderer.invoke(IPC.AH_TEST_CONNECTION),
    fetchData: (): Promise<ApiTestResult> => ipcRenderer.invoke(IPC.AH_FETCH_DATA),
    lastSync: (): Promise<string | null> => ipcRenderer.invoke(IPC.AH_LAST_SYNC)
  },
  items: {
    search: (query: string): Promise<ItemSearchResult[]> => ipcRenderer.invoke(IPC.ITEMS_SEARCH, query),
    detail: (itemId: number): Promise<ItemDetail | null> => ipcRenderer.invoke(IPC.ITEM_DETAIL_GET, itemId)
  },
  crafting: {
    list: (): Promise<CraftingSnipeRow[]> => ipcRenderer.invoke(IPC.CRAFTING_LIST)
  },
  levelingPlan: {
    get: (profession: Profession, startSkill: number, targetSkill: number, sellToAH: boolean): Promise<LevelingPlanResult> =>
      ipcRenderer.invoke(IPC.LEVELING_PLAN_GET, profession, startSkill, targetSkill, sellToAH)
  },
  gathering: {
    list: (): Promise<GatheringItemRow[]> => ipcRenderer.invoke(IPC.GATHERING_LIST)
  },
  pets: {
    list: (): Promise<PetFarmingRow[]> => ipcRenderer.invoke(IPC.PETS_LIST)
  },
  anomalies: {
    list: (): Promise<MarketAnomalyRow[]> => ipcRenderer.invoke(IPC.ANOMALIES_LIST)
  },
  mobValue: {
    list: (): Promise<MobValueRow[]> => ipcRenderer.invoke(IPC.MOB_VALUE_LIST),
    dropTable: (creatureId: number): Promise<MobDropTableEntry[]> =>
      ipcRenderer.invoke(IPC.MOB_VALUE_DROP_TABLE, creatureId),
    search: (query: string): Promise<MobSearchResult[]> => ipcRenderer.invoke(IPC.MOB_SEARCH, query)
  },
  zoneValue: {
    list: (): Promise<ZoneValueRow[]> => ipcRenderer.invoke(IPC.ZONE_VALUE_LIST)
  },
  farming: {
    reagentOptions: (): Promise<{ itemId: number; itemName: string }[]> =>
      ipcRenderer.invoke(IPC.FARMING_REAGENT_OPTIONS),
    spotsForItem: (itemId: number): Promise<FarmingRouteResult | null> =>
      ipcRenderer.invoke(IPC.FARMING_SPOTS_FOR_ITEM, itemId)
  },
  dungeon: {
    lootSuggestions: (itemId: number): Promise<NotableLootSuggestion[]> =>
      ipcRenderer.invoke(IPC.DUNGEON_LOOT_SUGGESTIONS, itemId),
    list: (): Promise<DungeonRunWithValue[]> => ipcRenderer.invoke(IPC.DUNGEON_LIST),
    create: (name: string, notes: string | null) => ipcRenderer.invoke(IPC.DUNGEON_CREATE, name, notes),
    update: (id: number, name: string, notes: string | null) =>
      ipcRenderer.invoke(IPC.DUNGEON_UPDATE, id, name, notes),
    delete: (id: number) => ipcRenderer.invoke(IPC.DUNGEON_DELETE, id),
    upsertEntry: (input: DungeonEntryInput) => ipcRenderer.invoke(IPC.DUNGEON_ENTRY_UPSERT, input),
    deleteEntry: (id: number) => ipcRenderer.invoke(IPC.DUNGEON_ENTRY_DELETE, id),
    listInstanceZones: (): Promise<InstanceZoneOption[]> => ipcRenderer.invoke(IPC.DUNGEON_LIST_INSTANCE_ZONES),
    importFromZone: (mapId: number, zoneName: string): Promise<DungeonRunWithValue> =>
      ipcRenderer.invoke(IPC.DUNGEON_IMPORT_FROM_ZONE, mapId, zoneName)
  },
  addon: {
    pickWowFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.ADDON_PICK_WOW_FOLDER),
    exportPrices: (): Promise<ExportPricesResult> => ipcRenderer.invoke(IPC.ADDON_EXPORT_PRICES),
    checkWowRunning: (): Promise<boolean> => ipcRenderer.invoke(IPC.ADDON_CHECK_WOW_RUNNING),
    importAhScan: (): Promise<ImportAhScanResult> => ipcRenderer.invoke(IPC.ADDON_IMPORT_AH_SCAN)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
