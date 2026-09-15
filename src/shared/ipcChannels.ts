/**
 * Central registry of IPC channel names shared between main and renderer.
 * Keeping these as a const object (not string literals scattered around)
 * prevents typos from silently breaking an invoke/handle pair.
 */
export const IPC = {
  // Active game version (determines which database + settings are in play)
  GAME_VERSION_GET: 'game-version:get',
  GAME_VERSION_SET: 'game-version:set',

  // Battle.net / Auction House
  AH_FETCH_DATA: 'ah:fetch-data',
  AH_TEST_CONNECTION: 'ah:test-connection',
  AH_LAST_SYNC: 'ah:last-sync',

  // Settings (electron-store backed)
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // Items (generic lookup, used by the Dungeon Selecting item picker)
  ITEMS_SEARCH: 'items:search',
  ITEM_DETAIL_GET: 'items:detail',

  // Global search palette (Cmd+K)
  MOB_SEARCH: 'mob-value:search',

  // Crafting Sniper
  CRAFTING_LIST: 'crafting:list',

  // Profession Leveling Planner
  LEVELING_PLAN_GET: 'leveling-plan:get',

  // Gathering Profitability
  GATHERING_LIST: 'gathering:list',

  // Battle Pet Farming (TSM pets.csv only)
  PETS_LIST: 'pets:list',

  // Farming Route Helper
  FARMING_SPOTS_FOR_ITEM: 'farming:spots-for-item',
  FARMING_REAGENT_OPTIONS: 'farming:reagent-options',

  // Investment & Market Anomalies
  ANOMALIES_LIST: 'anomalies:list',

  // Mob Value
  MOB_VALUE_LIST: 'mob-value:list',
  MOB_VALUE_DROP_TABLE: 'mob-value:drop-table',

  // Zone Value
  ZONE_VALUE_LIST: 'zone-value:list',

  // Dungeon selecting
  DUNGEON_LOOT_SUGGESTIONS: 'dungeon:loot-suggestions',
  DUNGEON_LIST: 'dungeon:list',
  DUNGEON_CREATE: 'dungeon:create',
  DUNGEON_UPDATE: 'dungeon:update',
  DUNGEON_DELETE: 'dungeon:delete',
  DUNGEON_ENTRY_UPSERT: 'dungeon:entry-upsert',
  DUNGEON_ENTRY_DELETE: 'dungeon:entry-delete',
  DUNGEON_LIST_INSTANCE_ZONES: 'dungeon:list-instance-zones',
  DUNGEON_IMPORT_FROM_ZONE: 'dungeon:import-from-zone'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
