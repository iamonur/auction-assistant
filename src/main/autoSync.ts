import { getActiveGameVersion, getAppSettings } from './store'
import { syncActiveGameVersion } from './sync'
import { isSyncDue } from './isSyncDue'

/** How often the timer wakes up to check whether a sync is due — coarser than any real interval choice, so it never meaningfully delays a scheduled sync. */
const CHECK_INTERVAL_MS = 5 * 60 * 1000

let timer: NodeJS.Timeout | null = null

async function tick(): Promise<void> {
  // Only ever syncs whichever game version is currently active — same
  // scope as the manual "Sync AH Data" button, and the only version with
  // an open database connection at any given time (see main/db/index.ts).
  const settings = getAppSettings(getActiveGameVersion())
  if (!isSyncDue(settings, Date.now())) return

  try {
    await syncActiveGameVersion()
  } catch (error) {
    console.error('Scheduled sync failed:', error)
  }
}

export function startAutoSync(): void {
  if (timer) return
  timer = setInterval(() => void tick(), CHECK_INTERVAL_MS)
}

export function stopAutoSync(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
