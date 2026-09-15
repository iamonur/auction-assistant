/**
 * Normalizes an in-game display name for matching between this app's own
 * data (sourced from the world database, keyed by a plain display name)
 * and whatever live string the addon reads back in-game — a zone name via
 * `C_Map`, or a gathering node's tooltip name. Used anywhere the app and
 * the addon need to agree on the same string despite coming from
 * different data pipelines that don't share an id space.
 *
 * Strips everything prone to drift between the two sources (case,
 * punctuation like apostrophes/hyphens, whitespace) rather than requiring
 * an exact match. The Lua side implements the exact same rule — if you
 * change this, change Core.lua's NormalizeDisplayName too, or lookups
 * will silently stop matching.
 */
export function normalizeDisplayName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}
