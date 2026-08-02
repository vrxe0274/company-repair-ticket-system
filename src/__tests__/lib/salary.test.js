import { describe, it, expect, vi } from 'vitest'

// salary.js imports the supabase client at module level (rate storage).
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), functions: { invoke: vi.fn() } } }))

import {
  computeRegularSalary, hourlyRate, minuteRate, paidHoursPerDay,
  regularPayByPerson, regularPayDays, combinePay, resolveDailyRate, DEFAULT_DAILY_RATES,
} from '../../lib/salary'

const shift = { start: 10, end: 19 } // 10 AM – 7 PM
const RATE  = 704.55

/** A Date on 2026-07-01 (a Wednesday) at the given wall-clock time. */
const at = (h, m = 0, day = 1) => new Date(2026, 6, day, h, m)

describe('derived rates', () => {
  it('divides the daily rate over 8 payable hours (9h window − 1h unpaid lunch)', () => {
    expect(paidHoursPerDay(shift)).toBe(8)
    expect(hourlyRate(RATE, shift)).toBeCloseTo(88.06875, 5)
    expect(minuteRate(RATE, shift)).toBeCloseTo(1.4678125, 7)
  })
})

describe('computeRegularSalary', () => {
  it('pays the full daily rate for an on-time full shift', () => {
    const r = computeRegularSalary(RATE, at(10, 0), at(19, 0), shift)
    expect(r.lateMinutes).toBe(0)
    expect(r.undertimeMinutes).toBe(0)
    expect(r.lateDeduction).toBe(0)
    expect(r.undertimeDeduction).toBe(0)
    expect(r.dailyPay).toBe(704.55)
  })

  it('deducts late minutes only', () => {
    const r = computeRegularSalary(RATE, at(10, 30), at(19, 0), shift)
    expect(r.lateMinutes).toBe(30)
    expect(r.undertimeMinutes).toBe(0)
    expect(r.lateDeduction).toBe(44.03) // 30 × 1.4678125 = 44.034375
    expect(r.dailyPay).toBe(660.52)     // 704.55 − 44.034375
  })

  it('deducts undertime minutes only', () => {
    const r = computeRegularSalary(RATE, at(10, 0), at(18, 15), shift)
    expect(r.lateMinutes).toBe(0)
    expect(r.undertimeMinutes).toBe(45)
    expect(r.undertimeDeduction).toBe(66.05) // 45 × 1.4678125 = 66.0515625
    expect(r.dailyPay).toBe(638.5)           // 704.55 − 66.0515625
  })

  it('deducts both late and undertime', () => {
    const r = computeRegularSalary(RATE, at(10, 30), at(18, 15), shift)
    expect(r.lateMinutes).toBe(30)
    expect(r.undertimeMinutes).toBe(45)
    expect(r.dailyPay).toBe(594.46)
  })

  it('gives no bonus pay for clocking in early — start clamps to shift start', () => {
    const early  = computeRegularSalary(RATE, at(8, 0),  at(19, 0), shift)
    const onTime = computeRegularSalary(RATE, at(10, 0), at(19, 0), shift)
    expect(early.lateMinutes).toBe(0)
    expect(early.dailyPay).toBe(onTime.dailyPay)
    expect(early.dailyPay).toBe(704.55)
  })

  it('gives no overtime for clocking out late — end clamps to shift end', () => {
    const late   = computeRegularSalary(RATE, at(10, 0), at(22, 0), shift)
    const onTime = computeRegularSalary(RATE, at(10, 0), at(19, 0), shift)
    expect(late.undertimeMinutes).toBe(0)
    expect(late.dailyPay).toBe(onTime.dailyPay)
    expect(late.dailyPay).toBe(704.55)
  })

  it('clamps an overnight logout down to shift end of the login day', () => {
    const overnight = computeRegularSalary(RATE, at(10, 0), at(2, 0, 2), shift)
    expect(overnight.undertimeMinutes).toBe(0)
    expect(overnight.dailyPay).toBe(704.55)
  })

  it('matches the worked example — 704.55, 30 min late, 45 min undertime → 594.46', () => {
    const r = computeRegularSalary(RATE, at(10, 30), at(18, 15), shift)
    expect(r.dailyRate).toBe(704.55)
    expect(r.lateMinutes).toBe(30)
    expect(r.undertimeMinutes).toBe(45)
    expect(r.lateDeduction).toBe(44.03)
    expect(r.undertimeDeduction).toBe(66.05)
    expect(r.dailyPay).toBe(594.46)
  })

  it('never pays below zero, however large the deductions', () => {
    // Clocked in an hour before close and left immediately: deductions exceed
    // the daily rate, so pay floors at 0 rather than going negative.
    const r = computeRegularSalary(RATE, at(18, 0), at(18, 5), shift)
    expect(r.dailyPay).toBe(0)
  })

  it('pays nothing extra and nothing negative on a zero daily rate', () => {
    const r = computeRegularSalary(0, at(10, 30), at(18, 15), shift)
    expect(r.dailyPay).toBe(0)
    expect(r.lateMinutes).toBe(30) // minutes still tracked for reporting
  })

  it('returns null (unknown, not zero) for a session that never closed', () => {
    expect(computeRegularSalary(RATE, at(10, 0), null, shift)).toBeNull()
    expect(computeRegularSalary(RATE, null, at(19, 0), shift)).toBeNull()
  })
})

describe('regularPayByPerson', () => {
  const log = (username, inAt, outAt) => ({
    username, role: 'Technician', name: username,
    logged_in_at: inAt.toISOString(),
    logged_out_at: outAt ? outAt.toISOString() : null,
  })

  it('sums daily pay across a period, per person', () => {
    const logs = [
      log('ariel', at(10, 0), at(19, 0)),           // full day
      log('ariel', at(10, 30, 2), at(18, 15, 2)),   // late + undertime day
    ]
    const out = regularPayByPerson(logs, () => RATE, shift)
    expect(out.ariel.days).toBe(2)
    expect(out.ariel.amount).toBe(1299.01) // 704.55 + 594.46
    expect(out.ariel.lateMinutes).toBe(30)
    expect(out.ariel.undertimeMinutes).toBe(45)
  })

  it('treats several sessions in one day as one working day, first-in to last-out', () => {
    const logs = [
      log('ariel', at(10, 0), at(13, 0)),
      log('ariel', at(14, 0), at(19, 0)),
    ]
    const out = regularPayByPerson(logs, () => RATE, shift)
    expect(out.ariel.days).toBe(1)
    expect(out.ariel.amount).toBe(704.55) // the midday gap is absorbed, not deducted twice
  })

  it('excludes weekend logins from pay', () => {
    // 2026-07-04 is a Saturday.
    const out = regularPayByPerson([log('ariel', at(10, 0, 4), at(19, 0, 4))], () => RATE, shift)
    expect(out.ariel).toBeUndefined()
  })

  it('counts an unclosed day as unpaid rather than folding it in as zero pay', () => {
    const logs = [
      log('ariel', at(10, 0), at(19, 0)),
      log('ariel', at(10, 0, 2), null),
    ]
    const out = regularPayByPerson(logs, () => RATE, shift)
    expect(out.ariel.days).toBe(1)
    expect(out.ariel.unpaidDays).toBe(1)
    expect(out.ariel.amount).toBe(704.55)
  })

  it('treats a day whose LAST session is still open as unpaid, not as an early exit', () => {
    // Clocked out at 13:00 for lunch, clocked back in at 14:00, still on shift.
    // Falling back to the 13:00 logout would dock 6 hours of phantom undertime.
    const logs = [
      log('ariel', at(10, 0), at(13, 0)),
      log('ariel', at(14, 0), null),
    ]
    const out = regularPayByPerson(logs, () => RATE, shift)
    expect(out.ariel.days).toBe(0)
    expect(out.ariel.unpaidDays).toBe(1)
    expect(out.ariel.amount).toBe(0)
    expect(out.ariel.undertimeMinutes).toBe(0)
  })

  it('still pays a day whose last session closed after an earlier open one', () => {
    // Rows can arrive in any order; only the LATEST login's state decides.
    const logs = [
      log('ariel', at(14, 0), at(19, 0)),
      log('ariel', at(10, 0), null),
    ]
    const out = regularPayByPerson(logs, () => RATE, shift)
    expect(out.ariel.days).toBe(1)
    expect(out.ariel.amount).toBe(704.55)
  })
})

describe('degenerate shift windows', () => {
  it('reports pay as unknown when the window has no payable hours', () => {
    // A 10 AM–11 AM window is entirely consumed by the unpaid lunch.
    const oneHour = { start: 10, end: 11 }
    expect(paidHoursPerDay(oneHour)).toBe(0)
    expect(computeRegularSalary(RATE, at(10, 0), at(11, 0), oneHour)).toBeNull()
  })
})

describe('regularPayDays — the working shown behind the total', () => {
  const log = (username, inAt, outAt) => ({
    username, role: 'Technician', name: username,
    logged_in_at: inAt.toISOString(),
    logged_out_at: outAt ? outAt.toISOString() : null,
  })

  it('returns one row per working day, newest first', () => {
    const rows = regularPayDays([
      log('ariel', at(10, 0), at(19, 0)),
      log('ariel', at(10, 30, 2), at(18, 15, 2)),
    ], 'ariel', RATE, shift)

    expect(rows).toHaveLength(2)
    expect(rows[0].firstIn.getDate()).toBe(2) // newest first
    expect(rows[0].pay.dailyPay).toBe(594.46)
    expect(rows[1].pay.dailyPay).toBe(704.55)
  })

  it('sums to exactly the total regularPayByPerson reports', () => {
    const logs = [
      log('ariel', at(10, 0), at(19, 0)),
      log('ariel', at(10, 30, 2), at(18, 15, 2)),
      log('ariel', at(11, 0, 3), at(17, 0, 3)),
    ]
    const rows  = regularPayDays(logs, 'ariel', RATE, shift)
    const total = regularPayByPerson(logs, () => RATE, shift).ariel.amount
    expect(Number(rows.reduce((s, r) => s + r.pay.dailyPay, 0).toFixed(2))).toBe(total)
  })

  it('carries a null pay for an unclosed day instead of dropping the row', () => {
    const rows = regularPayDays([log('ariel', at(10, 0), null)], 'ariel', RATE, shift)
    expect(rows).toHaveLength(1)
    expect(rows[0].pay).toBeNull()
    expect(rows[0].lastOut).toBeNull()
  })

  it('is empty for someone with no attendance in the period', () => {
    expect(regularPayDays([log('ariel', at(10, 0), at(19, 0))], 'kurt', RATE, shift)).toEqual([])
  })

  it('matches usernames case-insensitively', () => {
    const rows = regularPayDays([log('ariel', at(10, 0), at(19, 0))], 'Ariel', RATE, shift)
    expect(rows).toHaveLength(1)
  })
})

describe('combinePay — the only place the two branches meet', () => {
  it('reports Total Pay as Commission Pay + Regular Pay', () => {
    const row = combinePay(1500.25, 1299.01)
    expect(row.commissionPay).toBe(1500.25)
    expect(row.regularPay).toBe(1299.01)
    expect(row.totalPay).toBe(2799.26)
    expect(row.totalPay).toBe(Number((row.commissionPay + row.regularPay).toFixed(2)))
  })

  it('holds Total = Commission + Regular for every branch combination', () => {
    const cases = [[0, 0], [0, 704.55], [1500.25, 0], [1500.25, 1299.01], [0.005, 0.005]]
    for (const [commission, regular] of cases) {
      const row = combinePay(commission, regular)
      expect(row.totalPay).toBe(Number((commission + regular).toFixed(2)))
    }
  })

  it('treats a missing branch as zero, not NaN', () => {
    expect(combinePay(undefined, null).totalPay).toBe(0)
  })
})

describe('resolveDailyRate', () => {
  it('prefers an explicitly saved rate over the first-run seed', () => {
    expect(resolveDailyRate({ username: 'ariel', name: 'Ariel Cruz' }, { ariel: 900 })).toBe(900)
  })

  it('keys rates by role, so a Staff and a Technician sharing a username are paid separately', () => {
    // staff_accounts.username and technician_accounts.username are unique only
    // within their own table — one name can be two different people.
    const saved = { 'staff:kurt': 500, 'technician:kurt': 900 }
    expect(resolveDailyRate({ username: 'kurt', role: 'Staff' },      saved)).toBe(500)
    expect(resolveDailyRate({ username: 'kurt', role: 'Technician' }, saved)).toBe(900)
  })

  it('still honours a rate saved before role scoping', () => {
    expect(resolveDailyRate({ username: 'kurt', role: 'Staff' }, { kurt: 500 })).toBe(500)
  })

  it('lets a role-scoped rate win over a legacy bare-username one', () => {
    const saved = { kurt: 500, 'technician:kurt': 900 }
    expect(resolveDailyRate({ username: 'kurt', role: 'Technician' }, saved)).toBe(900)
    expect(resolveDailyRate({ username: 'kurt', role: 'Staff' },      saved)).toBe(500)
  })

  it('seeds Ariel at 704.55 and Kurt at 0 when nothing is saved yet', () => {
    expect(resolveDailyRate({ username: 'ariel', name: 'Ariel Cruz' }, {})).toBe(704.55)
    expect(resolveDailyRate({ username: 'kurt',  name: 'Kurt Mina' },  {})).toBe(0)
    expect(DEFAULT_DAILY_RATES.ariel).toBe(704.55)
  })

  it('matches the seed on first name when the username differs', () => {
    expect(resolveDailyRate({ username: 'acruz', name: 'Ariel Cruz' }, {})).toBe(704.55)
  })

  it('stops seeding once any rate has been saved', () => {
    // A later hire whose first name collides with a seed key must not start
    // accruing a daily rate nobody configured.
    const saved = { kurt: 0 }
    expect(resolveDailyRate({ username: 'asantos', name: 'Ariel Santos' }, saved)).toBe(0)
    expect(resolveDailyRate({ username: 'ariel', name: 'Ariel Cruz' }, saved)).toBe(0)
  })

  it('defaults to 0 for anyone with no saved rate and no seed', () => {
    expect(resolveDailyRate({ username: 'zed', name: 'Zed Santos' }, {})).toBe(0)
  })

  it('honours an explicitly saved 0 instead of falling through to the seed', () => {
    expect(resolveDailyRate({ username: 'ariel', name: 'Ariel Cruz' }, { ariel: 0 })).toBe(0)
  })
})
