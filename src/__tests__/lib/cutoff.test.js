import { describe, it, expect } from 'vitest'
import {
  cutoffOf, cutoffRange, cutoffPayDate, cutoffRangeLabel, cutoffLabel,
  payMonthOf, inPeriod, parseCutoffKey, monthCutoffKeys,
} from '../../lib/cutoff'

const at = (y, m, d) => new Date(y, m, d, 12, 0)

describe('cutoffOf', () => {
  it('puts days 1–15 in the 1st cutoff', () => {
    expect(cutoffOf(at(2026, 7, 1)).key).toBe('2026-08-C1')
    expect(cutoffOf(at(2026, 7, 15)).key).toBe('2026-08-C1')
  })

  it('puts days 16–30 in the 2nd cutoff', () => {
    expect(cutoffOf(at(2026, 7, 16)).key).toBe('2026-08-C2')
    expect(cutoffOf(at(2026, 7, 30)).key).toBe('2026-08-C2')
  })

  it('rolls a 31st into the NEXT pay period, not the current one', () => {
    expect(cutoffOf(at(2026, 7, 31)).key).toBe('2026-09-C1')
  })

  it('rolls a December 31st into the new year', () => {
    expect(cutoffOf(at(2026, 11, 31)).key).toBe('2027-01-C1')
  })

  it('leaves a short month\'s last day in its own 2nd cutoff', () => {
    expect(cutoffOf(at(2026, 1, 28)).key).toBe('2026-02-C2') // Feb 28
    expect(cutoffOf(at(2026, 3, 30)).key).toBe('2026-04-C2') // Apr 30
  })

  it('returns null for a date that does not parse', () => {
    expect(cutoffOf(null)).toBeNull()
    expect(cutoffOf('not a date')).toBeNull()
  })
})

describe('cutoffRange', () => {
  it('covers days 1–15 when the previous month had no 31st', () => {
    const { start, end } = cutoffRange('2026-07-C1') // June has 30 days
    expect(start.getMonth()).toBe(6)
    expect(start.getDate()).toBe(1)
    expect(end.getDate()).toBe(15)
  })

  it('starts on the previous month\'s 31st when there was one', () => {
    const { start } = cutoffRange('2026-08-C1') // July has 31 days
    expect(start.getMonth()).toBe(6)
    expect(start.getDate()).toBe(31)
  })

  it('ends the 2nd cutoff on the 30th, never the 31st', () => {
    expect(cutoffRange('2026-08-C2').end.getDate()).toBe(30)
  })

  it('ends February\'s 2nd cutoff on its real last day', () => {
    expect(cutoffRange('2026-02-C2').end.getDate()).toBe(28)
    expect(cutoffRange('2028-02-C2').end.getDate()).toBe(29) // leap year
  })

  it('reaches back into the previous year for a January 1st cutoff', () => {
    const { start } = cutoffRange('2026-01-C1')
    expect(start.getFullYear()).toBe(2025)
    expect(start.getMonth()).toBe(11)
    expect(start.getDate()).toBe(31)
  })

  it('returns null for a malformed key', () => {
    expect(cutoffRange('2026-08')).toBeNull()
    expect(parseCutoffKey('2026-08-C3')).toBeNull()
  })
})

describe('every calendar day belongs to exactly one cutoff', () => {
  it('holds across a 31-day month and its neighbours', () => {
    const seen = new Map()
    for (let day = 1; day <= 31; day++) {
      const d = at(2026, 7, day) // August
      const key = cutoffOf(d).key
      expect(cutoffRange(key).start <= d && d <= cutoffRange(key).end).toBe(true)
      seen.set(day, key)
    }
    expect(seen.get(15)).toBe('2026-08-C1')
    expect(seen.get(16)).toBe('2026-08-C2')
    expect(seen.get(31)).toBe('2026-09-C1')
  })
})

describe('cutoffPayDate', () => {
  it('pays the 1st cutoff on the 15th and the 2nd on the 30th', () => {
    expect(cutoffPayDate('2026-08-C1').getDate()).toBe(15)
    expect(cutoffPayDate('2026-08-C2').getDate()).toBe(30)
  })

  it('pays February\'s 2nd cutoff on its last day, since there is no 30th', () => {
    expect(cutoffPayDate('2026-02-C2').getDate()).toBe(28)
  })
})

describe('labels', () => {
  it('names a same-month span compactly', () => {
    expect(cutoffRangeLabel('2026-08-C2')).toBe('Aug 16–30, 2026')
  })

  it('spells out a span that borrows the previous month\'s 31st', () => {
    expect(cutoffRangeLabel('2026-08-C1')).toBe('Jul 31 – Aug 15, 2026')
  })

  it('shows both years when the borrowed 31st crosses a year boundary', () => {
    expect(cutoffRangeLabel('2027-01-C1')).toBe('Dec 31, 2026 – Jan 15, 2027')
  })

  it('describes the period in full', () => {
    expect(cutoffLabel('2026-08-C1')).toBe('1st cutoff · Jul 31 – Aug 15, 2026')
  })
})

describe('payMonthOf / inPeriod', () => {
  it('reports the PAY month, which is not always the calendar month', () => {
    expect(payMonthOf(at(2026, 7, 20))).toBe('2026-08')
    expect(payMonthOf(at(2026, 7, 31))).toBe('2026-09')
  })

  it('matches a whole pay month as both of its cutoffs', () => {
    expect(monthCutoffKeys('2026-08')).toEqual(['2026-08-C1', '2026-08-C2'])
    expect(inPeriod(at(2026, 6, 31), '2026-08')).toBe(true)  // Jul 31 → Aug payroll
    expect(inPeriod(at(2026, 7, 31), '2026-08')).toBe(false) // Aug 31 → Sep payroll
  })

  it('narrows to a single cutoff', () => {
    expect(inPeriod(at(2026, 7, 10), '2026-08', 1)).toBe(true)
    expect(inPeriod(at(2026, 7, 10), '2026-08', 2)).toBe(false)
    expect(inPeriod(at(2026, 6, 31), '2026-08', 1)).toBe(true)
  })

  it('matches everything under All Time, and nothing for an unparseable date', () => {
    expect(inPeriod(at(2026, 7, 10), 'all')).toBe(true)
    expect(inPeriod(null, 'all')).toBe(false)
  })
})
