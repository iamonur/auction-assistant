import type Database from 'better-sqlite3'
import type { AppSettings, PetFarmingRow } from '@shared/types'

/** Battle pets ranked by current TSM market value, for the active (region, realm) — see battle_pets/pet_price_stats. */
export function listPetFarmingRows(db: Database.Database, settings: AppSettings): PetFarmingRow[] {
  return db
    .prepare(
      /* sql */ `
      SELECT bp.id as petSpeciesId, bp.name as petName, ps.avg_price as price, COALESCE(ps.volume, 0) as volume
      FROM battle_pets bp
      LEFT JOIN pet_price_stats ps
        ON ps.pet_species_id = bp.id AND ps.region = @region AND ps.realm = @realm
        AND ps.date = (
          SELECT MAX(date) FROM pet_price_stats WHERE pet_species_id = bp.id AND region = @region AND realm = @realm
        )
      ORDER BY price DESC
    `
    )
    .all({ region: settings.region, realm: settings.realmName }) as PetFarmingRow[]
}
