import { combinePay } from './salary'

/**
 * @file cutoff.js
 * @description Semi-monthly payroll cutoffs — the single source of truth for
 * WHICH pay period a date belongs to. Both pay branches bucket through here:
 * commission.js's commissionDate (when a repair was paid) and attendance
 * logins (when a day was worked) are each turned into a cutoff key by the same
 * function, so the two branches can never disagree about a period boundary.
 *
 * THE SCHEDULE
 * ------------
 *   1st cutoff — paid on the 15th, covers days 1–15.
 *   2nd cutoff — paid on the 30th, covers days 16–30.
 *   Day 31 is NOT part of the month's 2nd cutoff. It rolls into the NEXT pay
 *   period, i.e. the following month's 1st cutoff.
 *
 * That last rule is why a "month" of payroll is not the same thing as a
 * calendar month. A 31-day month's last day is paid out with the next month's
 * first cutoff, and a month whose predecessor had 31 days starts its own 1st
 * cutoff on that borrowed day. `payMonthOf` reports the PAY month for exactly
 * this reason — filtering by calendar month would strand the 31st in a period
 * that has already been paid out, or double-count it in both.
 *
 * The borrowed day makes every cutoff a contiguous date range even so:
 * Jul 31 – Aug 15 is one unbroken span, not two pieces. Every calendar day
 * belongs to exactly one cutoff.
 *
 * In February the 2nd cutoff ends on the 28th/29th and pays out that day —
 * there is no 30th to pay on.
 */

/** Last day covered by each cutoff. The 2nd never reaches a 31st. */
export const FIRST_CUTOFF_END  = 15
export const SECOND_CUTOFF_END = 30

/** Days in the calendar month containing (year, monthIndex). */
const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate()

/** `2026-08-C1` — sortable, and the pay month is its first 7 characters. */
export const cutoffKey = (year, month, half) =>
  `${year}-${String(month + 1).padStart(2, '0')}-C${half}`

/**
 * The cutoff a date is paid in.
 *
 * A 31st returns the FOLLOWING month's 1st cutoff — it is worked in one month
 * and paid in the next, exactly like a repair collected after the period closed.
 *
 * @param {Date|string|null} date
 * @returns {{year:number, month:number, half:1|2, key:string}|null} null when
 *          the date doesn't parse — callers must drop the row, not default it
 *          into some period.
 */
export function cutoffOf(date) {
  if (date == null) return null
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d)) return null

  const day = d.getDate()
  let year  = d.getFullYear()
  let month = d.getMonth()
  let half

  if (day <= FIRST_CUTOFF_END) {
    half = 1
  } else if (day <= SECOND_CUTOFF_END) {
    half = 2
  } else {
    // The 31st: next pay period, which is next month's 1st cutoff.
    half = 1
    month += 1
    if (month > 11) { month = 0; year += 1 }
  }

  return { year, month, half, key: cutoffKey(year, month, half) }
}

/** `2026-08-C1` → `{ year: 2026, month: 7, half: 1 }`, or null if malformed. */
export function parseCutoffKey(key) {
  const m = /^(\d{4})-(\d{2})-C([12])$/.exec(String(key ?? ''))
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]) - 1, half: Number(m[3]) }
}

/** The pay month a date lands in — `yyyy-MM`, NOT its calendar month. */
export function payMonthOf(date) {
  return cutoffOf(date)?.key.slice(0, 7) ?? null
}

/** Both cutoff keys of a `yyyy-MM` pay month, first cutoff first. */
export const monthCutoffKeys = monthKey => [`${monthKey}-C1`, `${monthKey}-C2`]

/**
 * The calendar span a cutoff covers, as day boundaries.
 *
 * A 1st cutoff starts on the previous month's 31st when it had one — that day
 * is worked before the period but paid inside it (see the file header).
 *
 * @returns {{start: Date, end: Date}|null}
 */
export function cutoffRange(key) {
  const parsed = parseCutoffKey(key)
  if (!parsed) return null
  const { year, month, half } = parsed

  let start, end
  if (half === 1) {
    // new Date(y, m, 0) is the last day of the PREVIOUS month — and normalises
    // month -1 into December of the previous year on its own.
    const prevMonthLastDay = new Date(year, month, 0).getDate()
    start = prevMonthLastDay === 31 ? new Date(year, month - 1, 31) : new Date(year, month, 1)
    end   = new Date(year, month, FIRST_CUTOFF_END)
  } else {
    start = new Date(year, month, FIRST_CUTOFF_END + 1)
    // February has no 30th — the period ends (and pays) on its last day.
    end   = new Date(year, month, Math.min(SECOND_CUTOFF_END, daysInMonth(year, month)))
  }

  start.setHours(0, 0, 0, 0)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

/** The day the cutoff is paid out: the 15th, or the 30th (last day in February). */
export function cutoffPayDate(key) {
  const parsed = parseCutoffKey(key)
  if (!parsed) return null
  const { year, month, half } = parsed
  return half === 1
    ? new Date(year, month, FIRST_CUTOFF_END)
    : new Date(year, month, Math.min(SECOND_CUTOFF_END, daysInMonth(year, month)))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `1st` / `2nd`. */
export const halfOrdinal = half => (half === 1 ? '1st' : '2nd')

/** `1st cutoff` / `2nd cutoff`. */
export const cutoffName = half => `${halfOrdinal(half)} cutoff`

/**
 * The dates a cutoff covers, in words: `Aug 1–15, 2026`, or
 * `Jul 31 – Aug 15, 2026` when it borrows the previous month's 31st.
 */
export function cutoffRangeLabel(key) {
  const range = cutoffRange(key)
  if (!range) return ''
  const { start, end } = range
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  const sameYear = start.getFullYear() === end.getFullYear()
  return sameMonth
    ? `${MONTHS[start.getMonth()]} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
    : sameYear
      ? `${MONTHS[start.getMonth()]} ${start.getDate()} – ${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
      : `${MONTHS[start.getMonth()]} ${start.getDate()}, ${start.getFullYear()} – ${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
}

/** `1st cutoff · Aug 1–15, 2026` — the full description of a period. */
export function cutoffLabel(key) {
  const parsed = parseCutoffKey(key)
  if (!parsed) return ''
  return `${cutoffName(parsed.half)} · ${cutoffRangeLabel(key)}`
}

/** `Paid Aug 15, 2026`. */
export function cutoffPayDateLabel(key) {
  const d = cutoffPayDate(key)
  return d ? `Paid ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : ''
}

/**
 * Does a date fall in the selected reporting period?
 *
 * @param {Date|string|null} date
 * @param {string} monthKey  `yyyy-MM` pay month, or 'all' for every period
 * @param {'all'|1|2} [cutoff]  'all' = both cutoffs of that pay month
 */
export function inPeriod(date, monthKey, cutoff = 'all') {
  const c = cutoffOf(date)
  if (!c) return false
  if (monthKey === 'all') return true
  if (cutoff === 'all') return c.key.startsWith(`${monthKey}-`)
  return c.key === `${monthKey}-C${cutoff}`
}

/**
 * Split a payee's commission jobs and attendance days into a pay month's two
 * cutoffs, each reduced to pending/unclosed counts and a combinePay result —
 * the partition CommissionPage.jsx, EarningsPage.jsx, and commissionExport.js
 * all need, kept in one place so their figures can't drift apart.
 *
 * Partitions the jobs/days already passed in rather than re-querying, so the
 * two halves always add back up to whatever total the caller derived them from.
 *
 * @param {string} monthKey  `yyyy-MM` pay month
 * @param {Array}  jobs      commission rows, each with a `commission` field
 * @param {(job) => Date|string|null} jobDate
 * @param {Array}  days      attendance day rows, each with a `pay` field
 * @param {(day) => Date|string|null} dayDate
 */
export function payoutByCutoff(monthKey, jobs, jobDate, days, dayDate) {
  const keys = monthCutoffKeys(monthKey)
  return [1, 2].map(half => {
    const halfJobs = jobs.filter(j => cutoffOf(jobDate(j))?.half === half)
    const halfDays = days.filter(d => cutoffOf(dayDate(d))?.half === half)
    return {
      half,
      key: keys[half - 1],
      pending:  halfJobs.filter(j => j.commission == null).length,
      unclosed: halfDays.filter(d => !d.pay).length,
      ...combinePay(
        halfJobs.reduce((s, j) => s + (j.commission ?? 0), 0),
        halfDays.reduce((s, d) => s + (d.pay?.dailyPay ?? 0), 0),
      ),
    }
  })
}
