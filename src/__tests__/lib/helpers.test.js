import { describe, it, expect } from 'vitest'
import {
  emptyItem,
  peso,
  sumItems,
  computeQuotation,
} from '../../pages/dashboard/ticketDetail/helpers'

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

// ─── computeQuotation ────────────────────────────────────────────────────────

describe('computeQuotation', () => {
  it('sums labor + parts and subtracts discount', () => {
    const labor = [{ amount: '1000' }]
    const parts = [{ amount: '500' }]
    expect(computeQuotation(labor, parts, '200')).toBe(1300)
  })

  it('treats empty discount string as 0', () => {
    expect(computeQuotation([{ amount: '1000' }], [{ amount: '500' }], '')).toBe(1500)
  })

  it('floors at 0 — discount cannot make total negative', () => {
    expect(computeQuotation([{ amount: '100' }], [], '9999')).toBe(0)
  })

  it('returns 0 for all-empty inputs', () => {
    expect(computeQuotation([], [], '')).toBe(0)
  })

  it('handles decimal precision correctly', () => {
    expect(computeQuotation([{ amount: '750.50' }], [{ amount: '249.50' }], '0'))
      .toBeCloseTo(1000)
  })

  it('works with no parts items', () => {
    expect(computeQuotation([{ amount: '800' }], [], '100')).toBe(700)
  })

  it('works with no labor items', () => {
    expect(computeQuotation([], [{ amount: '350' }], '50')).toBe(300)
  })
})
