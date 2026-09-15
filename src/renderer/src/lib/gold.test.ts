import { describe, expect, it } from 'vitest'
import { formatCopperAsGold } from './gold'

describe('formatCopperAsGold', () => {
  it('renders null as an em dash', () => {
    expect(formatCopperAsGold(null)).toBe('—')
  })

  it('renders NaN as an em dash', () => {
    expect(formatCopperAsGold(NaN)).toBe('—')
  })

  it('renders zero as 0c with no gold/silver parts', () => {
    expect(formatCopperAsGold(0)).toBe('0c')
  })

  it('renders copper-only amounts', () => {
    expect(formatCopperAsGold(99)).toBe('99c')
  })

  it('renders silver once it rolls over 100 copper', () => {
    expect(formatCopperAsGold(100)).toBe('1s 0c')
  })

  it('renders gold once it rolls over 10000 copper', () => {
    expect(formatCopperAsGold(10000)).toBe('1g 0s 0c')
  })

  it('renders all three denominations together', () => {
    expect(formatCopperAsGold(123456)).toBe('12g 34s 56c')
  })

  it('prefixes negative amounts with a minus sign', () => {
    expect(formatCopperAsGold(-100)).toBe('-1s 0c')
  })

  it('rounds fractional copper to the nearest whole unit', () => {
    expect(formatCopperAsGold(100.6)).toBe('1s 1c')
  })
})
