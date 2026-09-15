import type { GameVersion } from './types'

export const GAME_VERSIONS: GameVersion[] = ['retail', 'classic_era', 'classic_progression']

export const GAME_VERSION_LABELS: Record<GameVersion, string> = {
  retail: 'Retail',
  classic_era: 'Classic Era',
  classic_progression: 'Classic Progression'
}

/**
 * Battle.net Game Data API namespace infix per game version. Confirmed
 * against Blizzard's own namespace scheme: Classic Era (the perpetual
 * vanilla/Anniversary/SoD/Hardcore realms) moved to `classic1x-{region}`
 * when Wrath Classic launched and took over the plain `classic-{region}`
 * namespace for whichever expansion the "Progression" realms are
 * currently on. Retail uses no infix at all.
 */
export const BATTLE_NET_NAMESPACE_INFIX: Record<GameVersion, string | null> = {
  retail: null,
  classic_era: 'classic1x',
  classic_progression: 'classic'
}

/**
 * TSM's public-data CSV feed (https://public-data.tradeskillmaster.com,
 * free and unauthenticated — see main/tsm/client.ts) is confirmed
 * live and working for all three: fetched real data from `retail`,
 * `classic`, and `classic-progression` directly. This is TSM's own URL
 * slug naming and is unrelated to Blizzard's classic/classic1x namespace
 * split — verified empirically (classic-progression returns
 * Wrath-and-later item ids like glyphs; classic returns vanilla-only ids)
 * rather than assumed from the Battle.net convention.
 */
export const TSM_SUPPORTED_GAME_VERSIONS: GameVersion[] = ['retail', 'classic_era', 'classic_progression']

export const TSM_PUBLIC_DATA_GAME_TYPE: Record<GameVersion, string> = {
  retail: 'retail',
  classic_era: 'classic',
  classic_progression: 'classic-progression'
}
