const NPC_RANK_LABELS: Record<number, string> = {
  0: 'Normal',
  1: 'Elite',
  2: 'Rare Elite',
  3: 'Boss'
}

export function npcRankLabel(rank: number): string {
  return NPC_RANK_LABELS[rank] ?? `Rank ${rank}`
}
