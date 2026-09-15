import Store from 'electron-store'
import type { AppSettings, GameVersion } from '@shared/types'
import { GAME_VERSIONS } from '@shared/gameVersions'

interface StoreSchema {
  activeGameVersion: GameVersion
  settingsByVersion: Record<GameVersion, AppSettings>
}

function defaultSettingsFor(_gameVersion: GameVersion): AppSettings {
  return {
    pricingSource: 'battlenet',
    region: 'us',
    realmName: '',

    clientId: '',
    clientSecret: '',
    realmSlug: '',

    tsmScope: 'realm',
    tsmRealmSlug: '',

    lastSyncAt: null,
    onboardingDismissed: false
  }
}

const DEFAULT_ACTIVE_VERSION: GameVersion = 'classic_era'

/**
 * electron-store persists to userData/config.json with the Battle.net
 * client secret stored as plain JSON on disk — its `encryptionKey` option
 * only obscures the file from casual viewing, it is not a real secrets
 * vault. That's an acceptable tradeoff for a local single-user desktop
 * tool reading its own API credentials, same as most AH addons. (TSM's
 * pricing feed needs no credentials at all — see main/tsm/client.ts.)
 *
 * Settings are keyed per game version (retail / classic_era /
 * classic_progression) since each points at a different realm/database —
 * see db/index.ts for the matching per-version SQLite file.
 */
const store = new Store<StoreSchema>({ name: 'config' })

export function getActiveGameVersion(): GameVersion {
  const value = store.get('activeGameVersion')
  return value && GAME_VERSIONS.includes(value) ? value : DEFAULT_ACTIVE_VERSION
}

export function setActiveGameVersion(gameVersion: GameVersion): GameVersion {
  store.set('activeGameVersion', gameVersion)
  return gameVersion
}

export function getAppSettings(gameVersion: GameVersion = getActiveGameVersion()): AppSettings {
  const stored = store.get(`settingsByVersion.${gameVersion}`) as AppSettings | undefined
  return { ...defaultSettingsFor(gameVersion), ...stored }
}

export function setAppSettings(
  patch: Partial<AppSettings>,
  gameVersion: GameVersion = getActiveGameVersion()
): AppSettings {
  const next = { ...getAppSettings(gameVersion), ...patch }
  store.set(`settingsByVersion.${gameVersion}`, next)
  return next
}
