import path from 'node:path'
import { app } from 'electron'
import Database from 'better-sqlite3'
import type { GameVersion } from '@shared/types'
import { SCHEMA_SQL } from './schema'
import { runSeed } from './seed'
import { importWorldData } from './importWorldData'
import { importClassicRecipes } from './importClassicRecipes'

let dbInstance: Database.Database | null = null
let dbInstanceVersion: GameVersion | null = null

const DB_FILE_SUFFIX: Record<GameVersion, string> = {
  retail: 'retail',
  classic_era: 'classic-era',
  classic_progression: 'classic-progression'
}

/**
 * Each game version gets its own SQLite file — item ids, recipes, and
 * auction prices from one WoW product are meaningless (or actively wrong)
 * applied to another, so they're never allowed to share a database.
 * Switching the active game version (see main/store.ts) closes the
 * current connection and lazily opens/creates the target version's file
 * on the next getDb() call.
 */
export function getDb(gameVersion: GameVersion): Database.Database {
  if (dbInstance && dbInstanceVersion === gameVersion) return dbInstance

  dbInstance?.close()

  const dbPath = path.join(app.getPath('userData'), `market-assistant-${DB_FILE_SUFFIX[gameVersion]}.sqlite3`)
  const db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')

  db.exec(SCHEMA_SQL)
  runSeed(db)
  if (gameVersion === 'classic_era' || gameVersion === 'classic_progression') importClassicRecipes(db)
  if (gameVersion === 'classic_progression') importWorldData(db, 'mop-import')
  if (gameVersion === 'classic_era') importWorldData(db, 'classic-import')

  dbInstance = db
  dbInstanceVersion = gameVersion
  return db
}

export function closeDb(): void {
  dbInstance?.close()
  dbInstance = null
  dbInstanceVersion = null
}

export { aggregateSnapshot, ingestDailyPriceRows } from './aggregate'
