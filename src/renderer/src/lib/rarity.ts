import type { ItemQuality } from '@shared/types'

const RARITY_LABEL: Record<ItemQuality, string> = {
  0: 'Poor',
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Epic',
  5: 'Legendary'
}

const RARITY_TEXT_CLASS: Record<ItemQuality, string> = {
  0: 'text-rarity-poor',
  1: 'text-rarity-common',
  2: 'text-rarity-uncommon',
  3: 'text-rarity-rare',
  4: 'text-rarity-epic',
  5: 'text-rarity-legendary'
}

export function rarityLabel(quality: ItemQuality): string {
  return RARITY_LABEL[quality] ?? 'Common'
}

export function rarityTextClass(quality: ItemQuality): string {
  return RARITY_TEXT_CLASS[quality] ?? RARITY_TEXT_CLASS[1]
}

export function rarityBorderClass(quality: ItemQuality): string {
  return `rarity-border-${quality}`
}
