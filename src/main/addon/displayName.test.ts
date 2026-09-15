import { describe, expect, it } from 'vitest'
import { normalizeDisplayName } from './displayName'

describe('normalizeDisplayName', () => {
  it('lowercases and strips spaces', () => {
    expect(normalizeDisplayName('Elwynn Forest')).toBe('elwynnforest')
  })

  it('strips apostrophes so straight and curly quotes match the same key', () => {
    expect(normalizeDisplayName("Un'Goro Crater")).toBe('ungorocrater')
    expect(normalizeDisplayName('Un’Goro Crater')).toBe('ungorocrater')
  })

  it('strips hyphens and other punctuation', () => {
    expect(normalizeDisplayName('Blasted Lands')).toBe('blastedlands')
    expect(normalizeDisplayName('Dun Morogh')).toBe('dunmorogh')
  })

  it('treats different names as different keys', () => {
    expect(normalizeDisplayName('Redridge Mountains')).not.toBe(normalizeDisplayName('Redridge'))
  })

  it('works for gathering node names the same way it works for zone names', () => {
    expect(normalizeDisplayName('Rich Thorium Vein')).toBe('richthoriumvein')
    expect(normalizeDisplayName("King's Herb")).toBe('kingsherb')
  })
})
