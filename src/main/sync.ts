import type { ApiTestResult } from '@shared/types'
import { getDb } from './db'
import { getActiveGameVersion, getAppSettings, setAppSettings } from './store'
import { runAhSync } from './battlenet/sync'
import { runTsmSync } from './tsm/sync'

/**
 * Runs a pricing sync for whichever game version is currently active,
 * using its configured pricing source. Shared by the manual "Sync AH
 * Data" button (main/ipc.ts) and the scheduled background sync
 * (main/autoSync.ts) so the two never drift out of sync with each other.
 */
export async function syncActiveGameVersion(): Promise<ApiTestResult> {
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
