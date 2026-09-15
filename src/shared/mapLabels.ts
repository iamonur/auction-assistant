/**
 * Continent/map id -> display name, for the handful of ids empirically
 * verified against the SkyFire world database dump (cross-referenced
 * against unmistakable zone-exclusive mobs/herbs — see this session's
 * import work). Deliberately not exhaustive: instance/dungeon/raid map
 * ids and a few continent ids weren't confidently verified, so they fall
 * back to a numeric label rather than risk a wrong name.
 */
export const MAP_LABELS: Record<number, string> = {
  0: 'Eastern Kingdoms',
  1: 'Kalimdor',
  530: 'Outland',
  870: 'Pandaria'
}

export function mapLabel(mapId: number): string {
  return MAP_LABELS[mapId] ?? `Map #${mapId}`
}
