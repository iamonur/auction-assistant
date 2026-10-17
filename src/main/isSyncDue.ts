import type { AppSettings } from '@shared/types'

/**
 * Pure due-check for scheduled background sync — kept in its own module,
 * with no electron/electron-store/better-sqlite3 imports, so it can be
 * unit tested without constructing any of main/autoSync.ts's real
 * dependencies (electron-store's Store opens a file on construction,
 * which isn't available under a plain vitest run).
 */
export function isSyncDue(
  settings: Pick<AppSettings, 'autoSyncEnabled' | 'autoSyncIntervalMinutes' | 'lastSyncAt'>,
  now: number
): boolean {
  if (!settings.autoSyncEnabled) return false
  if (!settings.lastSyncAt) return true
  const dueAt = new Date(settings.lastSyncAt).getTime() + settings.autoSyncIntervalMinutes * 60_000
  return now >= dueAt
}
