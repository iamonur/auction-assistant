import Database from 'better-sqlite3'
import type { AppSettings } from '@shared/types'
import { SCHEMA_SQL } from '@main/db/schema'

/** A fresh in-memory database with the app's real schema — no seed data, no fixtures. Callers insert exactly what their test needs. */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA_SQL)
  return db
}

/** Minimal valid AppSettings for query functions that take settings — override only what a test cares about. */
export function testSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    pricingSource: 'tsm',
    region: 'us',
    realmName: 'test-realm',
    clientId: '',
    clientSecret: '',
    realmSlug: '',
    tsmScope: 'realm',
    tsmRealmSlug: 'test-realm',
    lastSyncAt: null,
    onboardingDismissed: true,
    ...overrides
  }
}
