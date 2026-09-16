import { describe, expect, it } from 'vitest'
import { isSyncDue } from './isSyncDue'

describe('isSyncDue', () => {
  it('is false when auto-sync is disabled, regardless of how stale lastSyncAt is', () => {
    expect(isSyncDue({ autoSyncEnabled: false, autoSyncIntervalMinutes: 30, lastSyncAt: null }, Date.now())).toBe(
      false
    )
  })

  it('is true when enabled and never synced yet', () => {
    expect(isSyncDue({ autoSyncEnabled: true, autoSyncIntervalMinutes: 30, lastSyncAt: null }, Date.now())).toBe(true)
  })

  it('is false before the configured interval has elapsed since the last sync', () => {
    const now = Date.now()
    const lastSyncAt = new Date(now - 10 * 60_000).toISOString()
    expect(isSyncDue({ autoSyncEnabled: true, autoSyncIntervalMinutes: 30, lastSyncAt }, now)).toBe(false)
  })

  it('is true once the configured interval has elapsed since the last sync', () => {
    const now = Date.now()
    const lastSyncAt = new Date(now - 31 * 60_000).toISOString()
    expect(isSyncDue({ autoSyncEnabled: true, autoSyncIntervalMinutes: 30, lastSyncAt }, now)).toBe(true)
  })
})
