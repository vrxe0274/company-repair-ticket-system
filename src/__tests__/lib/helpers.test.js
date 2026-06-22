import { describe, it, expect } from 'vitest'
import {
  emptyItem,
  peso,
  sumItems,
  discountAmount,
  computeQuotation,
} from '../../pages/dashboard/ticket-detail/helpers'

// ─── emptyItem ────────────────────────────────────────────────────────────────

describe('emptyItem', () => {
  it('returns an object with empty description and amount', () => {
    expect(emptyItem()).toMatchObject({ description: '', amount: '' })
  })

  it('returns an object with a truthy id', () => {
    expect(emptyItem().id).toBeTruthy()
  })

  it('returns a unique id on every call', () => {
    const a = emptyItem()
    const b = emptyItem()
    expect(a.id).not.toBe(b.id)
  })
})

// ─── peso ─────────────────────────────────────────────────────────────────────

describe('peso', () => {
  it('prefixes the value with ₱', () => {
    expect(peso(0)).toMatch(/^₱/)
  })

  it('includes exactly two decimal places', () => {
    expect(peso(1000)).toContain('.00')
  })

  it('formats 1500.5 as ₱1,500.50', () => {
    expect(peso(1500.5)).toBe('₱1,500.50')
  })

  it('formats 0 as ₱0.00', () => {
    expect(peso(0)).toBe('₱0.00')
  })

  it('formats a large number with thousands separator', () => {
    const result = peso(10000)
    expect(result).toContain('10,000')
  })
})

// ─── sumItems ─────────────────────────────────────────────────────────────────

describe('sumItems', () => {
  it('returns 0 for an empty array', () => {
    expect(sumItems([])).toBe(0)
  })

  it('sums numeric string amounts correctly', () => {
    expect(sumItems([{ amount: '500' }, { amount: '1200.50' }, { amount: '300' }]))
      .toBeCloseTo(2000.5)
  })

  it('treats empty string amount as 0', () => {
    expect(sumItems([{ amount: '' }])).toBe(0)
  })

  it('treats non-numeric amount as 0', () => {
    expect(sumItems([{ amount: 'abc' }])).toBe(0)
  })

  it('handles a mix of valid, empty, and non-numeric amounts', () => {
    expect(sumItems([{ amount: '500' }, { amount: '' }, { amount: '200' }])).toBe(700)
  })

  it('handles a single item', () => {
    expect(sumItems([{ amount: '750' }])).toBe(750)
  })
})

// ─── discountAmount ──────────────────────────────────────────────────────────
// `discountAmount(base, percent)` resolves a manual percentage to a peso value.

describe('discountAmount', () => {
  it('returns the percentage of the base', () => {
    expect(discountAmount(1500, 10)).toBe(150)
  })

  it('treats empty / non-numeric percent as 0', () => {
    expect(discountAmount(1500, '')).toBe(0)
    expect(discountAmount(1500, 'abc')).toBe(0)
  })

  it('clamps percent above 100 to 100', () => {
    expect(discountAmount(1500, 999)).toBe(1500)
  })

  it('clamps negative percent to 0', () => {
    expect(discountAmount(1500, -10)).toBe(0)
  })

  it('rounds to 2 decimals', () => {
    expect(discountAmount(1000, 12.345)).toBe(123.45)
  })
})

// ─── computeQuotation ────────────────────────────────────────────────────────
// Third arg is now a manual discount PERCENTAGE, not a peso amount.

describe('computeQuotation', () => {
  it('sums labor + parts and subtracts a percentage discount', () => {
    const labor = [{ amount: '1000' }]
    const parts = [{ amount: '500' }]
    // 10% of 1500 = 150 → 1350
    expect(computeQuotation(labor, parts, '10')).toBe(1350)
  })

  it('treats empty discount string as 0%', () => {
    expect(computeQuotation([{ amount: '1000' }], [{ amount: '500' }], '')).toBe(1500)
  })

  it('100% discount floors the total at 0', () => {
    expect(computeQuotation([{ amount: '100' }], [], '100')).toBe(0)
  })

  it('clamps percent above 100 so total never goes negative', () => {
    expect(computeQuotation([{ amount: '100' }], [], '9999')).toBe(0)
  })

  it('returns 0 for all-empty inputs', () => {
    expect(computeQuotation([], [], '')).toBe(0)
  })

  it('handles decimal precision correctly with 0% discount', () => {
    expect(computeQuotation([{ amount: '750.50' }], [{ amount: '249.50' }], '0'))
      .toBeCloseTo(1000)
  })

  it('works with no parts items', () => {
    // 25% of 800 = 200 → 600
    expect(computeQuotation([{ amount: '800' }], [], '25')).toBe(600)
  })

  it('works with no labor items', () => {
    // 50% of 350 = 175 → 175
    expect(computeQuotation([], [{ amount: '350' }], '50')).toBe(175)
  })
})
