/**
 * Starter dataset for WoW Classic (Progression / Era) items, recipes, and
 * farming spots. This is a curated demo set covering the five crafting
 * professions and four gathering professions named in the spec — it is
 * NOT an exhaustive recipe/item dump. Item IDs below are the real Blizzard
 * item IDs for these items. Anything the live Auction House sync
 * encounters that isn't in this table is resolved and inserted on the fly
 * via the Battle.net Item API (see src/main/battlenet/sync.ts), so the
 * `items` table grows organically from real data rather than depending on
 * this list being complete.
 */

export interface SeedItem {
  id: number
  name: string
  quality: number
  category: 'reagent' | 'crafted' | 'gathered' | 'gear' | 'trade_good' | 'other'
  isBoe?: boolean
  gatheringProfession?: 'Herbalism' | 'Mining' | 'Skinning' | 'Fishing' | null
  vendorPrice?: number | null
}

export interface SeedFarmingSpot {
  itemId: number
  zone: string
  subZone?: string
  mobOrNode: string
  minLevel?: number
  maxLevel?: number
  dropOrGatherChance: number
  estimatedNodesOrMobsPerHour: number
  notes?: string
}

// ---------------------------------------------------------------------
// Herbs (Herbalism)
// ---------------------------------------------------------------------
const herbs: SeedItem[] = [
  { id: 765, name: 'Silverleaf', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 785, name: 'Mageroyal', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 2447, name: 'Peacebloom', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 2449, name: 'Earthroot', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 2450, name: 'Briarthorn', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 2452, name: 'Swiftthistle', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 2453, name: 'Bruiseweed', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 3355, name: 'Wild Steelbloom', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 3356, name: 'Kingsblood', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 3357, name: 'Liferoot', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 3818, name: 'Fadeleaf', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 3820, name: 'Stranglekelp', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 3821, name: 'Goldthorn', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 4625, name: 'Firebloom', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 8836, name: 'Purple Lotus', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 8838, name: "Arthas' Tears", quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 8839, name: 'Sungrass', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 8845, name: 'Ghost Mushroom', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 8846, name: 'Gromsblood', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 13463, name: 'Golden Sansam', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 13464, name: 'Dreamfoil', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 13465, name: 'Mountain Silversage', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 13466, name: 'Plaguebloom', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 13467, name: 'Icecap', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 13468, name: 'Black Lotus', quality: 4, category: 'gathered', gatheringProfession: 'Herbalism' }
]

// ---------------------------------------------------------------------
// Ores & Bars (Mining)
// ---------------------------------------------------------------------
const oresAndBars: SeedItem[] = [
  { id: 2770, name: 'Copper Ore', quality: 1, category: 'gathered', gatheringProfession: 'Mining' },
  { id: 2771, name: 'Tin Ore', quality: 1, category: 'gathered', gatheringProfession: 'Mining' },
  { id: 2772, name: 'Iron Ore', quality: 1, category: 'gathered', gatheringProfession: 'Mining' },
  { id: 2775, name: 'Silver Ore', quality: 1, category: 'gathered', gatheringProfession: 'Mining' },
  { id: 2776, name: 'Gold Ore', quality: 1, category: 'gathered', gatheringProfession: 'Mining' },
  { id: 3858, name: 'Mithril Ore', quality: 1, category: 'gathered', gatheringProfession: 'Mining' },
  { id: 7911, name: 'Truesilver Ore', quality: 1, category: 'gathered', gatheringProfession: 'Mining' },
  { id: 10620, name: 'Thorium Ore', quality: 1, category: 'gathered', gatheringProfession: 'Mining' },
  { id: 2840, name: 'Copper Bar', quality: 1, category: 'trade_good' },
  { id: 2841, name: 'Tin Bar', quality: 1, category: 'trade_good' },
  { id: 2842, name: 'Bronze Bar', quality: 1, category: 'trade_good' },
  { id: 3575, name: 'Iron Bar', quality: 1, category: 'trade_good' },
  { id: 3859, name: 'Steel Bar', quality: 1, category: 'trade_good' },
  { id: 3860, name: 'Mithril Bar', quality: 1, category: 'trade_good' },
  { id: 12359, name: 'Thorium Bar', quality: 1, category: 'trade_good' }
]

// ---------------------------------------------------------------------
// Leather & Hides (Skinning)
// ---------------------------------------------------------------------
const leathers: SeedItem[] = [
  { id: 2318, name: 'Light Leather', quality: 1, category: 'gathered', gatheringProfession: 'Skinning' },
  { id: 2319, name: 'Medium Leather', quality: 1, category: 'gathered', gatheringProfession: 'Skinning' },
  { id: 4234, name: 'Heavy Leather', quality: 1, category: 'gathered', gatheringProfession: 'Skinning' },
  { id: 4304, name: 'Thick Leather', quality: 1, category: 'gathered', gatheringProfession: 'Skinning' },
  { id: 8170, name: 'Rugged Leather', quality: 1, category: 'gathered', gatheringProfession: 'Skinning' }
]

// ---------------------------------------------------------------------
// Fish (Fishing)
// ---------------------------------------------------------------------
const fish: SeedItem[] = [
  { id: 6291, name: 'Firefin Snapper', quality: 1, category: 'gathered', gatheringProfession: 'Fishing' },
  { id: 6303, name: 'Raw Brilliant Smallfish', quality: 1, category: 'gathered', gatheringProfession: 'Fishing' },
  { id: 6317, name: 'Raw Rockscale Cod', quality: 1, category: 'gathered', gatheringProfession: 'Fishing' },
  { id: 6358, name: 'Oily Blackmouth', quality: 1, category: 'gathered', gatheringProfession: 'Fishing' },
  { id: 8365, name: 'Stonescale Eel', quality: 1, category: 'gathered', gatheringProfession: 'Fishing' }
]

// ---------------------------------------------------------------------
// Cloth (Tailoring reagents, gathered via looting/vendor, not a profession here)
// ---------------------------------------------------------------------
const cloth: SeedItem[] = [
  { id: 2589, name: 'Linen Cloth', quality: 1, category: 'reagent' },
  { id: 2592, name: 'Wool Cloth', quality: 1, category: 'reagent' },
  { id: 4306, name: 'Silk Cloth', quality: 1, category: 'reagent' },
  { id: 4338, name: 'Mageweave Cloth', quality: 1, category: 'reagent' },
  { id: 14047, name: 'Runecloth', quality: 1, category: 'reagent' }
]

// ---------------------------------------------------------------------
// Misc common reagents (vials, threads, etc.)
// ---------------------------------------------------------------------
const misc: SeedItem[] = [
  { id: 4625, name: 'Firebloom', quality: 1, category: 'gathered', gatheringProfession: 'Herbalism' },
  { id: 6217, name: 'Crystal Vial', quality: 1, category: 'reagent', vendorPrice: 100 },
  { id: 2320, name: 'Coarse Thread', quality: 1, category: 'reagent', vendorPrice: 50 },
  { id: 4291, name: 'Fine Thread', quality: 1, category: 'reagent', vendorPrice: 100 },
  { id: 8343, name: 'Silken Thread', quality: 1, category: 'reagent', vendorPrice: 200 },
  { id: 14341, name: 'Rune Thread', quality: 1, category: 'reagent', vendorPrice: 500 }
]

export const SEED_ITEMS: SeedItem[] = [...herbs, ...oresAndBars, ...leathers, ...fish, ...cloth, ...misc]

// Real crafting recipes (profession, reagents, result) are imported from
// LibCrafts (MIT-licensed, community-maintained) — see
// resources/classic-recipes/*.json and main/db/importClassicRecipes.ts.
// An earlier hand-typed set of 7 example recipes lived here; three of its
// seven item ids turned out to be wrong (verified against real game data
// while building the import), so it's gone rather than fixed in place.

// ---------------------------------------------------------------------
// Farming spots (starter examples — Farming Route Helper is meant to be
// expanded by the user; this seeds a handful of well-known low-level
// gathering locations so the page renders real data out of the box).
// ---------------------------------------------------------------------
export const SEED_FARMING_SPOTS: SeedFarmingSpot[] = [
  {
    itemId: 2447, // Peacebloom
    zone: 'Elwynn Forest',
    mobOrNode: 'Herb node (field growth)',
    minLevel: 1,
    maxLevel: 10,
    dropOrGatherChance: 1,
    estimatedNodesOrMobsPerHour: 90,
    notes: 'Extremely common low-level node, fast respawn.'
  },
  {
    itemId: 2770, // Copper Ore
    zone: 'Elwynn Forest',
    subZone: 'Fargodeep Mine',
    mobOrNode: 'Copper Vein',
    minLevel: 1,
    maxLevel: 10,
    dropOrGatherChance: 1,
    estimatedNodesOrMobsPerHour: 70,
    notes: 'Dedicated mine with dense vein spawns.'
  },
  {
    itemId: 2318, // Light Leather
    zone: 'Westfall',
    mobOrNode: 'Skinnable beasts (various)',
    minLevel: 10,
    maxLevel: 20,
    dropOrGatherChance: 1,
    estimatedNodesOrMobsPerHour: 60,
    notes: 'High density of skinnable mobs along the coast.'
  },
  {
    itemId: 8836, // Purple Lotus
    zone: 'Tanaris',
    mobOrNode: 'Herb node (rare spawn)',
    minLevel: 45,
    maxLevel: 55,
    dropOrGatherChance: 0.15,
    estimatedNodesOrMobsPerHour: 4,
    notes: 'Low spawn rate, contested by other herbalists.'
  },
  {
    itemId: 10620, // Thorium Ore
    zone: 'Un’Goro Crater',
    mobOrNode: 'Thorium Vein',
    minLevel: 48,
    maxLevel: 55,
    dropOrGatherChance: 1,
    estimatedNodesOrMobsPerHour: 45,
    notes: 'Also present in Winterspring and Blackrock areas.'
  }
]
