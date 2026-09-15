/** All prices in this app are stored/transmitted as copper (Blizzard API convention: 1g = 100s = 10000c). */
export function formatCopperAsGold(copper: number | null): string {
  if (copper === null || Number.isNaN(copper)) return '—'

  const negative = copper < 0
  const absolute = Math.abs(Math.round(copper))

  const gold = Math.floor(absolute / 10000)
  const silver = Math.floor((absolute % 10000) / 100)
  const bronze = absolute % 100

  const parts: string[] = []
  if (gold > 0) parts.push(`${gold}g`)
  if (silver > 0 || gold > 0) parts.push(`${silver}s`)
  parts.push(`${bronze}c`)

  return `${negative ? '-' : ''}${parts.join(' ')}`
}
