/**
 * @file salary.js
 * @description Regular (daily-rate) salary math — the second pay branch,
 * running alongside commission.js and deliberately independent of it.
 *
 * The two branches never mix here: commission.js knows nothing about
 * attendance, this file knows nothing about tickets. They are only added
 * together at the reporting layer (the Commission page's Commission Pay /
 * Regular Pay / Total Pay columns, and the attendance sheet's Regular Pay
 * column). Keep it that way — a bug in one branch should never be able to
 * silently move money in the other.
 *
 * PAY RULES (per employee per day)
 * --------------------------------
 *   - Paid shift window: shift.start–shift.end (default 10 AM – 7 PM).
 *   - hourly = daily_rate / 8 payable hours, minute = hourly / 60. The 8 comes
 *     from shiftHoursCap(shift) — the 9-hour window minus the fixed 1-hour
 *     unpaid lunch (shift.js LUNCH_HOURS). The lunch is therefore ALREADY
 *     baked into the daily rate and is never deducted a second time here.
 *   - Clock-in before shift start earns nothing extra (clamped up to start).
 *   - Clock-out after shift end earns no overtime (clamped down to end).
 *   - late minutes      = effective time-in  − shift start, floored at 0.
 *   - undertime minutes = shift end − effective time-out,   floored at 0.
 *   - daily_pay = daily_rate − late_deduction − undertime_deduction, floored at 0.
 *
 * ROUNDING — deductions are computed at full precision and only the reported
 * figures are rounded to 2 dp (currency convention used throughout the app).
 * daily_pay is rounded from the UNROUNDED deductions, so on some days the
 * displayed deductions can differ from (rate − pay) by up to a centavo. That
 * is intentional: rounding each deduction first would drift the take-home
 * figure, and take-home is the number that must be right.
 */

import { supabase } from './supabase'
import { DEFAULT_SHIFT, atHour, shiftHoursCap } from './shift'

/** Currency rounding — 2 dp, matching every other peso figure in the app. */
const round2 = n => Number(n.toFixed(2))

const MS_PER_MINUTE = 60000

/**
 * First-run daily rates, applied only to employees the Admin hasn't set a rate
 * for yet. Matched against the account's username OR the first word of their
 * display name, both lowercased — attendance rows and accounts don't share a
 * single stable key, and this is a seed, not the source of truth. Once Admin
 * saves a rate on the Commission page it lives in app_settings.daily_rates and
 * wins over anything here.
 */
export const DEFAULT_DAILY_RATES = {
  ariel: 704.55,
  kurt: 0,
}

/** Payable hours in a shift window — the divisor behind the hourly rate. */
export const paidHoursPerDay = (shift = DEFAULT_SHIFT) => shiftHoursCap(shift)

/** daily_rate / 8. Unrounded — callers round only what they display. */
export function hourlyRate(dailyRate, shift = DEFAULT_SHIFT) {
  const hours = paidHoursPerDay(shift)
  return hours > 0 ? Number(dailyRate || 0) / hours : 0
}

/** hourly_rate / 60. Unrounded — callers round only what they display. */
export function minuteRate(dailyRate, shift = DEFAULT_SHIFT) {
  return hourlyRate(dailyRate, shift) / 60
}

/**
 * One day's regular pay for one employee.
 *
 * Returns null when the day can't be paid out yet — no clock-in, or a session
 * that never closed (no clock-out to measure undertime against). Null means
 * "unknown", never 0; callers must not sum it as zero pay.
 *
 * @param {number} dailyRate
 * @param {Date|string} timeIn   actual clock-in
 * @param {Date|string} timeOut  actual clock-out
 * @param {{start:number,end:number}} [shift]
 * @returns {{dailyRate:number, lateMinutes:number, undertimeMinutes:number,
 *            lateDeduction:number, undertimeDeduction:number, dailyPay:number}|null}
 */
export function computeRegularSalary(dailyRate, timeIn, timeOut, shift = DEFAULT_SHIFT) {
  if (timeIn == null || timeOut == null) return null
  // A window with no payable hours (a misconfigured shift no wider than the
  // unpaid lunch) has no rate to dock against — report it as unknown rather
  // than quietly paying the full rate for zero payable time.
  if (paidHoursPerDay(shift) <= 0) return null

  const inAt  = timeIn  instanceof Date ? timeIn  : new Date(timeIn)
  const outAt = timeOut instanceof Date ? timeOut : new Date(timeOut)
  if (isNaN(inAt) || isNaN(outAt)) return null

  const rate = Number(dailyRate) || 0

  // Shift anchors sit on the clock-in's calendar day, so an overnight logout
  // (next-day timestamp) clamps down to that day's shift end by real date
  // order rather than by comparing bare times.
  const shiftStart = atHour(inAt, shift.start)
  const shiftEnd   = atHour(inAt, shift.end)

  // Early in / late out are unpaid — clamp both ends into the shift window.
  const effectiveIn  = inAt  < shiftStart ? shiftStart : inAt
  const effectiveOut = outAt > shiftEnd   ? shiftEnd   : outAt

  const lateMinutes      = Math.max(0, Math.round((effectiveIn - shiftStart) / MS_PER_MINUTE))
  const undertimeMinutes = Math.max(0, Math.round((shiftEnd - effectiveOut) / MS_PER_MINUTE))

  const perMinute          = minuteRate(rate, shift)
  const lateDeduction      = lateMinutes * perMinute
  const undertimeDeduction = undertimeMinutes * perMinute

  return {
    dailyRate:          round2(rate),
    lateMinutes,
    undertimeMinutes,
    lateDeduction:      round2(lateDeduction),
    undertimeDeduction: round2(undertimeDeduction),
    dailyPay:           round2(Math.max(0, rate - lateDeduction - undertimeDeduction)),
  }
}

/** Weekend logins are excluded from pay, matching the attendance sheet's rules. */
const isWeekendDate = d => d.getDay() === 0 || d.getDay() === 6

/**
 * Identity for an attendance row. Shared with attendanceExport.js and the
 * Commission page so the pay figures on screen and the ones in the exports can
 * never bucket the same person differently — every producer AND consumer of a
 * per-person map keys through this, so a stray space or capital in a stored
 * username can't make a lookup miss the entry it wrote.
 */
export const personKey = l => (l?.username ?? l?.name ?? '').toLowerCase().trim()

/**
 * Key for the saved daily-rate map — role-scoped, unlike personKey.
 *
 * staff_accounts.username and technician_accounts.username are unique only
 * within their own table, so one username can belong to two different people.
 * Keying rates by username alone gave them a single shared rate; the role
 * prefix separates them. Rates saved before this scoping are keyed by bare
 * username and are still honoured (see resolveDailyRate).
 */
export function rateKey(account) {
  const username = (account?.username ?? '').toLowerCase().trim()
  const role     = (account?.role ?? '').toLowerCase().trim()
  return role ? `${role}:${username}` : username
}

/**
 * Collapse raw attendance_logs into one first-in/last-out pair per person per
 * weekday, the same day shape the attendance sheet pays on: several sessions
 * in a day are one working day, and the gap between them is worked time.
 *
 * `lastOut` is null when the day's LAST session (by login time) never closed —
 * not merely when no session closed. Falling back to an earlier session's
 * logout would read a lunch break as an early departure and dock hours of
 * undertime off someone who is in fact still clocked in.
 *
 * @returns {Map<string, {username:string|null, name:string|null, role:string,
 *                        days: Map<string, {firstIn: Date, lastOut: Date|null}>}>}
 */
export function groupWorkDays(logs) {
  const people = new Map()

  for (const l of logs) {
    const loginAt = new Date(l.logged_in_at)
    if (isNaN(loginAt) || isWeekendDate(loginAt)) continue

    const key = personKey(l)
    let p = people.get(key)
    if (!p) {
      p = { username: l.username ?? null, name: l.name ?? null, role: l.role, days: new Map() }
      people.set(key, p)
    }
    if (!p.name && l.name) p.name = l.name

    const dayKey = `${loginAt.getFullYear()}-${loginAt.getMonth()}-${loginAt.getDate()}`
    const logoutAt = l.logged_out_at ? new Date(l.logged_out_at) : null
    let day = p.days.get(dayKey)

    if (!day) {
      day = { firstIn: loginAt, lastOut: null, lastLogin: loginAt, lastLoginClosed: !!logoutAt }
      p.days.set(dayKey, day)
    } else {
      if (loginAt < day.firstIn) day.firstIn = loginAt
      // Rows arrive in no guaranteed order, so track the latest login and
      // whether THAT session closed.
      if (loginAt >= day.lastLogin) {
        day.lastLogin = loginAt
        day.lastLoginClosed = !!logoutAt
      }
    }
    if (logoutAt && (!day.lastOut || logoutAt > day.lastOut)) day.lastOut = logoutAt
  }

  // An open final session makes the day's end unknown, whatever earlier
  // sessions logged out at.
  for (const p of people.values()) {
    for (const day of p.days.values()) {
      if (!day.lastLoginClosed) day.lastOut = null
      delete day.lastLogin
      delete day.lastLoginClosed
    }
  }

  return people
}

/**
 * Total regular pay per person over a set of attendance logs.
 *
 * `unpaidDays` counts working days that produced no payable figure — a session
 * that never closed. Those are surfaced rather than folded in as ₱0.00, the
 * same way commission.js surfaces a not-yet-inputted percentage.
 *
 * @param {Array}  logs                 attendance_logs rows
 * @param {(person) => number} rateFor  resolves a person's daily rate
 * @param {{start:number,end:number}} [shift]
 * @returns {Record<string, {amount:number, days:number, unpaidDays:number,
 *                           lateMinutes:number, undertimeMinutes:number}>}
 *          keyed by lowercased username
 */
export function regularPayByPerson(logs, rateFor, shift = DEFAULT_SHIFT) {
  return regularPayFromGrouped(groupWorkDays(logs), rateFor, shift)
}

/**
 * Same totals as regularPayByPerson, but for logs already collapsed by
 * groupWorkDays. A caller that also needs the day-by-day working (the payee
 * popup) groups ONCE and feeds both from the same map, instead of re-walking
 * the whole period's attendance per person.
 *
 * @param {Map} people  a groupWorkDays result
 */
export function regularPayFromGrouped(people, rateFor, shift = DEFAULT_SHIFT) {
  const out = {}

  for (const p of people.values()) {
    const rate = Number(rateFor(p)) || 0
    let amount = 0, days = 0, unpaidDays = 0, lateMinutes = 0, undertimeMinutes = 0

    for (const { firstIn, lastOut } of p.days.values()) {
      const day = computeRegularSalary(rate, firstIn, lastOut, shift)
      if (!day) { unpaidDays++; continue }
      days++
      amount           += day.dailyPay
      lateMinutes      += day.lateMinutes
      undertimeMinutes += day.undertimeMinutes
    }

    out[personKey(p)] = { amount: round2(amount), days, unpaidDays, lateMinutes, undertimeMinutes }
  }

  return out
}

/**
 * One person's regular pay day by day, newest first — the working shown behind
 * the total that regularPayByPerson returns.
 *
 * `pay` is null on a day whose last session never closed; the caller must show
 * that as unknown rather than ₱0.00.
 *
 * @param {Array}  logs        attendance_logs rows (already filtered to the period)
 * @param {string} username
 * @param {number} dailyRate
 * @returns {Array<{firstIn: Date, lastOut: Date|null, pay: object|null}>}
 */
export function regularPayDays(logs, username, dailyRate, shift = DEFAULT_SHIFT) {
  return regularPayDaysFor(groupWorkDays(logs).get(personKey({ username })), dailyRate, shift)
}

/**
 * Same rows as regularPayDays, but for a person already extracted from
 * groupWorkDays. Callers reporting on many employees at once group the logs
 * ONCE and index into the result — going through regularPayDays per person
 * would re-walk the whole month's attendance for each of them.
 *
 * @param {{days: Map}|undefined} person  a groupWorkDays entry
 */
export function regularPayDaysFor(person, dailyRate, shift = DEFAULT_SHIFT) {
  if (!person) return []
  return [...person.days.values()]
    .map(({ firstIn, lastOut }) => ({
      firstIn, lastOut,
      pay: computeRegularSalary(dailyRate, firstIn, lastOut, shift),
    }))
    .sort((a, b) => b.firstIn - a.firstIn)
}

// ── Reporting ─────────────────────────────────────────────────────────────────

/**
 * The three reported figures for one employee — and the ONLY place the two pay
 * branches are allowed to meet. Commission and regular salary are computed by
 * separate modules that never read each other's inputs; they are added here,
 * at the output stage, and nowhere else.
 *
 * @param {number} commissionPay  from commission.js
 * @param {number} regularPay     from regularPayByPerson()
 */
export function combinePay(commissionPay, regularPay) {
  const commission = Number(commissionPay) || 0
  const regular    = Number(regularPay) || 0
  return {
    commissionPay: round2(commission),
    regularPay:    round2(regular),
    totalPay:      round2(commission + regular),
  }
}

// ── Rate storage (app_settings.daily_rates) ───────────────────────────────────

/**
 * Saved daily rates, keyed by rateKey(). `{}` when Admin hasn't set any yet —
 * resolveDailyRate then falls back to DEFAULT_DAILY_RATES.
 *
 * Throws on a failed read rather than answering `{}`. supabase-js resolves with
 * `{ error }` instead of rejecting, and an empty map is NOT a neutral value
 * here: resolveDailyRate reads it as "Admin has never saved rates" and answers
 * with the first-run seed, so a swallowed error would price a payroll run at
 * rates nobody configured. Callers must fail visibly instead.
 */
export async function getDailyRates() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'daily_rates')
    .maybeSingle()
  if (error) throw new Error(error.message || 'Could not load daily rates.')
  return data?.value ?? {}
}

/**
 * Persist the rate map. Throws on a failed write — supabase-js resolves with
 * `{ error }` rather than rejecting, and a save that silently did nothing
 * would leave the Admin looking at rates the next payroll run won't use.
 *
 * @param {Record<string, number>} rates keyed by lowercased username
 */
export async function saveDailyRates(rates) {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'daily_rates', value: rates })
  if (error) throw new Error(error.message || 'Could not save daily rates.')
}

/**
 * The rate to pay an account: an explicitly saved one, else the first-run seed,
 * else 0 — never a guessed default. 0 means "on commission only", which is a
 * real configuration, not a missing value.
 *
 * The seed applies ONLY while nothing has been saved at all. Once Admin saves
 * the rate map even once, an account missing from it is treated as unset (0)
 * rather than matched against DEFAULT_DAILY_RATES — otherwise a later hire
 * whose first name happens to collide with a seed key would start accruing a
 * real daily rate nobody configured.
 *
 * @param {{username?: string|null, name?: string|null, role?: string}} account
 * @param {Record<string, number>} rates  from getDailyRates()
 */
export function resolveDailyRate(account, rates = {}) {
  const username = (account?.username ?? '').toLowerCase().trim()
  const key = rateKey(account)
  if (key && rates[key] != null) return Number(rates[key]) || 0
  // Rates saved before role scoping are keyed by bare username. Honoured as a
  // fallback so an existing rate map keeps paying the right amounts.
  if (username && rates[username] != null) return Number(rates[username]) || 0
  if (Object.keys(rates).length > 0) return 0

  const firstName = (account?.name ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  return DEFAULT_DAILY_RATES[username] ?? DEFAULT_DAILY_RATES[firstName] ?? 0
}

/**
 * Attendance rows for Staff/Technician, paged past PostgREST's default
 * 1000-row cap. An unranged select silently truncates, and a truncated read
 * here under-reports somebody's pay with no error to notice.
 *
 * `since` bounds the transfer: the Commission page reports one month at a time,
 * so pulling the company's entire history on every visit costs several round
 * trips of rows that are then filtered away. Pass nothing to read everything
 * (what the All Time view and the exports need).
 *
 * @param {{since?: Date|null, pageSize?: number}} [options]
 */
export async function fetchAllAttendance({ since = null, pageSize = 1000 } = {}) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from('attendance_logs')
      .select('username, role, name, logged_in_at, logged_out_at')
      .in('role', ['Staff', 'Technician'])
    if (since) query = query.gte('logged_in_at', since.toISOString())

    const { data, error } = await query
      .order('logged_in_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error('Could not load attendance data.')
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) return rows
  }
}
