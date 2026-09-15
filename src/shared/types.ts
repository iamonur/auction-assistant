export type Profession =
  | 'Alchemy'
  | 'Blacksmithing'
  | 'Engineering'
  | 'Leatherworking'
  | 'Tailoring'
  | 'Cooking'
  | 'Herbalism'
  | 'Mining'
  | 'Skinning'
  | 'Fishing'

export type ItemQuality = 0 | 1 | 2 | 3 | 4 | 5
// 0 poor, 1 common, 2 uncommon, 3 rare, 4 epic, 5 legendary

export type ItemCategory = 'reagent' | 'crafted' | 'gathered' | 'gear' | 'trade_good' | 'other'

export interface Item {
  id: number
  name: string
  quality: ItemQuality
  icon: string | null
  itemLevel: number | null
  vendorPrice: number | null
  category: ItemCategory
  isBoe: boolean
  gatheringProfession: Profession | null
}

export interface Recipe {
  id: number
  profession: Profession
  name: string
  resultItemId: number
  resultQuantity: number
  skillLevelReq: number
  source: 'trainer' | 'vendor' | 'drop' | 'quest'
}

export interface RecipeReagent {
  id: number
  recipeId: number
  itemId: number
  quantity: number
}

export interface AhSnapshot {
  id: number
  connectedRealmId: number
  region: 'us' | 'eu'
  fetchedAt: string
}

export interface AhListing {
  id: number
  snapshotId: number
  itemId: number
  unitPrice: number
  quantity: number
  timeLeft: string
}

export interface ItemPriceStats {
  id: number
  itemId: number
  region: 'us' | 'eu'
  realm: string
  date: string
  avgPrice: number
  minPrice: number
  maxPrice: number
  volume: number
  avg7d: number | null
  avg30d: number | null
  stddev30d: number | null
  updatedAt: string
}

// ---- Feature DTOs (computed, returned over IPC to the renderer) ----

/**
 * One skill bracket of a leveling plan — crafting the cheapest available
 * recipe from `fromSkill` up to (but not including) `toSkill`, one craft
 * per skill point (a simplification: the app has no orange/yellow/green/
 * grey skill-up-chance data, so this assumes a fresh recipe reliably
 * grants skill at its own unlock threshold, same heuristic most community
 * leveling guides use — switch to the newest recipe the moment it's
 * available). See main/queries/levelingPlanner.ts.
 */
export interface LevelingPlanStep {
  fromSkill: number
  toSkill: number
  craftsNeeded: number
  recipeId: number
  recipeName: string
  itemName: string
  quality: ItemQuality
  /** Reagent cost per craft — null when any reagent has no known price (AH/TSM or vendor). */
  reagentCost: number | null
  /** Sale price per craft after the AH cut, only set when sellToAH is true and the crafted item has real trade volume. */
  salePrice: number | null
  /** reagentCost minus salePrice (or just reagentCost when not selling) — can be negative if selling more than covers the reagents. Null when reagentCost is null. */
  netCostPerCraft: number | null
  /** netCostPerCraft x craftsNeeded — null when netCostPerCraft is null. */
  subtotal: number | null
}

export interface LevelingPlanResult {
  profession: Profession
  startSkill: number
  targetSkill: number
  sellToAH: boolean
  steps: LevelingPlanStep[]
  /** Sum of every step's known subtotal — a best-effort total, not necessarily the full range if some steps are missing price data (see hasGaps). */
  totalCost: number
  /** True if any step's cost couldn't be computed (missing reagent price data) and was excluded from totalCost. */
  hasGaps: boolean
}

export interface CraftingSnipeRow {
  recipeId: number
  itemId: number
  itemName: string
  icon: string | null
  quality: ItemQuality
  profession: Profession
  craftCost: number | null
  reagentsAvailable: boolean
  salePrice: number | null
  netProfitWithReagentCost: number | null
  netProfitIgnoringReagentCost: number | null
  roiPercent: number | null
  /** Listed volume for the *sale* item, from the active pricing source (0 for TSM region-wide data means no recent sales — treat its price/profit as a low-confidence estimate, not an observed price). */
  volume: number
}

/** Row for the Battle Pet Farming tab — TSM pets.csv only, no Battle.net equivalent (see main/tsm/sync.ts). */
export interface PetFarmingRow {
  petSpeciesId: number
  petName: string
  price: number | null
  volume: number
}

export interface GatheringItemRow {
  itemId: number
  itemName: string
  icon: string | null
  quality: ItemQuality
  profession: Extract<Profession, 'Herbalism' | 'Mining' | 'Skinning' | 'Fishing'>
  unitPrice: number | null
  stackPrice: number | null
  supplyVolume: number
  trend7d: 'up' | 'down' | 'flat' | 'unknown'
  history: { date: string; avgPrice: number }[]
}

export interface FarmingSpot {
  id: number
  itemId: number
  zone: string
  subZone: string | null
  mobOrNode: string
  minLevel: number | null
  maxLevel: number | null
  dropOrGatherChance: number
  estimatedNodesOrMobsPerHour: number
  notes: string | null
}

/**
 * A real gathering-node spawn count, from the world-data import — see
 * main/db/importWorldData.ts. spawnCount is a total placed-instance count
 * (a relative density signal), not a timed rate, so there's no
 * estimatedGoldPerHour here the way curated FarmingSpot has one — that
 * would need a respawn-timer assumption this data doesn't support.
 */
export interface ImportedGatheringSpawn {
  nodeName: string
  kind: 'herb' | 'ore'
  mapId: number
  mapLabel: string
  spawnCount: number
}

export interface FarmingRouteResult {
  itemId: number
  itemName: string
  currentUnitPrice: number | null
  spots: (FarmingSpot & { estimatedGoldPerHour: number | null })[]
  importedSpawns: ImportedGatheringSpawn[]
}

/** A real notable-creature drop, from the world-data import — assists (doesn't auto-fill) the Dungeon Selecting entry form. */
export interface NotableLootSuggestion {
  creatureId: number
  creatureName: string
  npcRank: number
  minLevel: number | null
  maxLevel: number | null
  chancePercent: number
  minCount: number
  maxCount: number
  spawnCount: number
}

/**
 * Expected gold value of one kill — sum of (chance% x avg drop count x
 * current price) over the mob's loot table, skipping any item with zero
 * current trading volume, plus average gold reward if the mob has one.
 * See main/queries/mobValue.ts.
 */
export interface MobValueRow {
  creatureId: number
  name: string
  minLevel: number | null
  maxLevel: number | null
  npcRank: number
  spawnCount: number
  avgGold: number
  expectedValue: number
  lootItemsIncluded: number
  lootItemsExcluded: number
}

/**
 * One row of a mob's loot table, priced the same way as its contribution
 * to MobValueRow.expectedValue — price is null when volume is 0 (no
 * recent trades to back the estimate), the same liquidity gate used
 * everywhere else in the app. See main/queries/mobValue.ts#getMobDropTable.
 */
export interface MobDropTableEntry {
  itemId: number
  itemName: string
  quality: ItemQuality
  chancePercent: number
  minCount: number
  maxCount: number
  price: number | null
  volume: number
}

export interface ItemDetailMobDrop {
  creatureId: number
  name: string
  npcRank: number
  chancePercent: number
  minCount: number
  maxCount: number
}

export interface ItemDetailGatherSource {
  nodeName: string
  kind: string
  spawnCount: number
}

export interface ItemDetailSkinningSource {
  creatureId: number
  name: string
  chancePercent: number
  spawnCount: number
}

export interface ItemDetailRecipeUsage {
  recipeId: number
  recipeName: string
  profession: Profession
  quantity: number
}

export interface ItemDetailCraftedBy {
  recipeId: number
  recipeName: string
  profession: Profession
  skillLevelReq: number
  resultQuantity: number
}

/**
 * "Where does this item come from and where does it go" — cross-referenced
 * from every table that mentions an item id, for the item detail popup.
 * See main/queries/itemDetail.ts#getItemDetail.
 */
export interface ItemDetail {
  itemId: number
  name: string
  quality: ItemQuality
  itemLevel: number | null
  vendorPrice: number | null
  category: ItemCategory
  isBoe: boolean
  price: number | null
  volume: number
  droppedBy: ItemDetailMobDrop[]
  gatheredFrom: ItemDetailGatherSource[]
  skinnedFrom: ItemDetailSkinningSource[]
  usedInRecipes: ItemDetailRecipeUsage[]
  craftedBy: ItemDetailCraftedBy[]
}

export type ZoneType = 'open_world' | 'dungeon' | 'raid' | 'unknown'

/**
 * One zone/instance, with the average Expected Value (see MobValueRow)
 * across every mob known to spawn there. See main/queries/zoneValue.ts.
 * zoneName (not mapId) is the unique identity here — open-world sub-zones
 * (Elwynn Forest, Westfall, ...) share Blizzard's continent map id, so
 * mapId is informational only (the first map id seen for that zone name).
 */
export interface ZoneValueRow {
  mapId: number
  zoneName: string
  zoneType: ZoneType
  avgMobValue: number
  mobCount: number
  totalSpawns: number
}

export interface MarketAnomalyRow {
  itemId: number
  itemName: string
  icon: string | null
  quality: ItemQuality
  isBoe: boolean
  currentPrice: number
  avg30d: number
  stddev30d: number | null
  zScore: number | null
  percentOfAvg: number
}

export interface DungeonRun {
  id: number
  name: string
  notes: string | null
  createdAt: string
}

export interface DungeonEntry {
  id: number
  dungeonRunId: number
  itemId: number | null
  itemNameOverride: string | null
  mobCount: number
  dropChancePercent: number
  /** Average quantity per drop — 1 for hand-authored entries, the real loot table's (min+max)/2 when imported. */
  avgDropCount: number
}

export interface DungeonEntryInput {
  id?: number
  dungeonRunId: number
  itemId: number | null
  itemNameOverride: string | null
  mobCount: number
  dropChancePercent: number
  avgDropCount: number
}

export interface DungeonEntryWithValue extends DungeonEntry {
  resolvedItemName: string
  currentPrice: number | null
  expectedValue: number | null
}

export interface DungeonRunWithValue extends DungeonRun {
  entries: DungeonEntryWithValue[]
  totalExpectedValue: number
}

/** One real dungeon/raid instance available to bulk-import into a dungeon run — see queries/dungeon.ts#listInstanceZones. */
export interface InstanceZoneOption {
  mapId: number
  zoneName: string
  zoneType: Extract<ZoneType, 'dungeon' | 'raid'>
}

export interface ItemSearchResult {
  itemId: number
  itemName: string
  quality: ItemQuality
  currentPrice: number | null
}

/** Minimal shape for the global search palette (Cmd+K) — see main/queries/mobValue.ts#searchMobs. */
export interface MobSearchResult {
  creatureId: number
  name: string
  npcRank: number
}

// ---- Settings ----

export type Region = 'us' | 'eu'

/**
 * Which WoW product the whole app is pointed at. Each one gets its own
 * SQLite database (items/recipes/prices don't mix across products) and
 * its own settings (different realms, different credentials). See
 * shared/gameVersions.ts for labels and Battle.net namespace mapping.
 */
export type GameVersion = 'retail' | 'classic_era' | 'classic_progression'

export type PricingSource = 'battlenet' | 'tsm'

export type TsmScope = 'realm' | 'region'

export interface AppSettings {
  pricingSource: PricingSource

  /**
   * Canonical region/realm identity used as the (region, realm) key in
   * item_price_stats regardless of which pricing source populated it —
   * switching sources for the same real-world realm keeps one continuous
   * price history instead of splitting it in two.
   */
  region: Region
  realmName: string

  // Battle.net Game Data API (official, per-connected-realm snapshots)
  clientId: string
  clientSecret: string
  realmSlug: string

  // TSM public-data CSV feed (free, unauthenticated — see main/tsm/client.ts)
  tsmScope: TsmScope
  /** The realm segment of the public-data URL, e.g. "firemaw-alliance" — TSM's own slug, including faction for Classic. Only used when tsmScope is 'realm'. */
  tsmRealmSlug: string

  lastSyncAt: string | null

  /** True once the user has synced or explicitly skipped first-run onboarding for this game version. See components/FirstRunModal.tsx. */
  onboardingDismissed: boolean
}

export interface ApiTestResult {
  success: boolean
  message: string
  listingsImported?: number
}
