import ExcelJS from 'exceljs'
import {
  format, parseISO, startOfMonth, endOfMonth, isWeekend, startOfWeek,
} from 'date-fns'
import { supabase } from './supabase'
import {
  isOutsideShift, atHour, minutesLate, shiftHoursCap, LUNCH_HOURS,
} from './shift'
import {
  computeRegularSalary, resolveDailyRate, getDailyRates, personKey,
} from './salary'
import { autoSize, fitToScreenWidth } from './xlsxStyle'

/**
 * @file attendanceExport.js
 * @description Admin-only monthly attendance sheet export (.xlsx via ExcelJS).
 *
 * DATA MODEL NOTE
 * ---------------
 * attendance_logs is an EVENT log — one row per login, with logged_in_at /
 * logged_out_at. There is NO stored "status" (present/late/absent/leave) and
 * NO working-calendar. So this module DERIVES those from the events and never
 * invents fields that don't exist:
 *
 *   - Operating days  = the set of WEEKDAY calendar days on which ANY
 *                       Staff/Technician logged in that month. Weekend logins
 *                       are excluded from the report entirely — no rows, no
 *                       present/late/hours credit.
 *   - Present         = employee has ≥1 session that operating day.
 *   - Absent          = operating day with no session for that employee.
 *   - Late            = NOT a status — the daily Status is only Present or
 *                       Absent. Lateness is indicated by the Minutes Late
 *                       column (minute-exact, highlighted when > 0); the
 *                       Summary's Late column tallies days with Minutes
 *                       Late > 0.
 *   - Off-shift       = a session started before shift start / after shift end
 *                       (reuses the app's isOutsideShift rule).
 *   - Hours           = the first-in → last-out SPAN (not a sum of individual
 *                       session durations — a gap between two sessions in the
 *                       same day, other than the fixed lunch deduction below,
 *                       is absorbed into the span and counted as worked time)
 *                       clamped to the shift window (shift.start–shift.end),
 *                       minus a fixed lunch deduction (shift.js LUNCH_HOURS),
 *                       capped at shiftHoursCap(shift), floored at 0. Early
 *                       time-in counts from shift start; late time-out counts
 *                       up to shift end; a first login after shift end earns
 *                       0. Overnight sessions (logout past midnight) count
 *                       only up to shift end of the LOGIN day. A day whose
 *                       last session never closed has no Hours (blank).
 *   - Minutes Late    = minutes between shift start and the first login
 *                       (0 when on-time/early, blank on absent days).
 *   - Pay columns     = Daily Rate / Late Deduction / Undertime Mins /
 *                       Undertime Deduction / Daily Pay, from lib/salary.js.
 *                       These are the REGULAR-salary branch only; commission
 *                       is a separate branch and is never added in here (see
 *                       salary.js's combinePay for the one place they meet).
 *                       Pay is docked per late/undertime minute off the daily
 *                       rate rather than derived from the Hours column, but the
 *                       two agree by construction: Hours = 8 − (late +
 *                       undertime)/60 over the same clamped window. Blank
 *                       whenever pay is unknown — absent days, and days whose
 *                       last session never closed — never 0.00.
 *
 * Time In / Time Out are written as real Excel date+time serials (not just a
 * time-of-day fraction — the date is kept so a live formula can tell an
 * overnight logout apart from a same-day one by real date order), and Hours /
 * Minutes Late as live formulas over them (with cached results), so the sheet
 * recalculates if a time is hand-corrected after export. The JS-computed
 * cached values (windowedHours/minutesLate in this file, sharing LUNCH_HOURS/
 * shiftHoursCap from shift.js with the formula strings below) and the Excel
 * formulas encode the same rule independently — keep both in sync when either
 * changes.
 *
 * "Leave" is intentionally omitted — the schema stores nothing that could
 * distinguish a leave day from a plain absence.
 *
 * LAYOUT — one row per employee per operating day (long/tabular), not a pivot.
 * A pivot (employee rows × date columns) can't hold status + time-in/out +
 * hours in a single cell; the long format carries all derived fields per day.
 * A per-employee summary lives on its own "Summary" worksheet.
 *
 * Within each employee's block, daily rows are visually grouped by calendar
 * week (Mon–Fri): an alternating tint per week plus a heavier top border at
 * each week boundary.
 */

const HEADER_BG = 'FF7317E8' // brand purple
const HEADER_FG = 'FFFFFFFF'
const TITLE_BG  = 'FF4527A0'
const SUMMARY_HEADER_BG = 'FF37474F'

const STATUS_FILL = {
  Present: 'FFE8F5E9', // green tint
  Absent:  'FFFDECEA', // red tint
}
const STATUS_FONT = {
  Present: 'FF2E7D32',
  Absent:  'FFC62828',
}
// Lateness is not a status — a nonzero Minutes Late cell gets this amber accent.
const LATE_FILL = 'FFFFF8E1'
const LATE_FONT = 'FFB26A00'

const THIN = { style: 'thin', color: { argb: 'FFD8D8D8' } }
const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN }
const WEEK_DIVIDER = { style: 'medium', color: { argb: 'FFB0B0B0' } } // marks the start of a new week

// Alternating tint applied per calendar week within an employee's block, so
// weeks are visually grouped without breaking the long/tabular row layout.
const WEEK_BAND = ['FFFFFFFF', 'FFF2F2F2']

/** Monday-anchored week key so day rows group by calendar week (Mon–Fri). */
const weekKey = dateObj => format(startOfWeek(dateObj, { weekStartsOn: 1 }), 'yyyy-MM-dd')

/**
 * Live username → display-name lookup, keyed by role. Lets exports/pages show
 * the CURRENT account name even when attendance_logs' stored snapshot is stale
 * (e.g. after a rename).
 *
 * @returns {Promise<{Staff: Record<string,string>, Technician: Record<string,string>}>}
 */
export async function fetchLiveNames() {
  const [staffRes, techRes] = await Promise.all([
    supabase.functions.invoke('staff-manage', { body: { action: 'list-names' } }),
    supabase.functions.invoke('tech-manage',  { body: { action: 'list-names' } }),
  ])
  const map = { Staff: {}, Technician: {} }
  for (const row of staffRes.data?.staff ?? []) map.Staff[row.username] = row.name
  for (const row of techRes.data?.staff ?? [])  map.Technician[row.username] = row.name
  return map
}

/**
 * Excel serial (days since 1899-12-30) for a Date's local wall-clock value.
 * Unlike a time-of-day-only fraction, this carries the calendar date too, so
 * a formula comparing two of these serials can tell an overnight logout
 * (next calendar day) apart from a same-day one by real date order rather
 * than by guessing from the time-of-day numbers alone.
 */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)
const toExcelSerial = d => (
  Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds())
  - EXCEL_EPOCH_UTC
) / 86400000

/**
 * Payable hours for one day: first-in → last-out clamped to the shift window,
 * minus a fixed lunch deduction (LUNCH_HOURS), capped at shiftHoursCap(shift),
 * floored at 0. Overnight logouts count only up to shift end of the login day
 * (lastOut past shift end — including next-day timestamps — clamps to it).
 * Null when the day's last session never closed (no last-out to measure
 * against).
 *
 * @param {Date} shiftStart  `atHour(firstIn, shift.start)` — passed in so the
 *                           caller (which also needs it for minutesLate)
 *                           only builds it once per row.
 * @param {Date} dayEnd      `atHour(firstIn, shift.end)`
 */
function windowedHours(firstIn, lastOut, shiftStart, dayEnd, cap) {
  if (!lastOut) return null
  const start = firstIn < shiftStart ? shiftStart : firstIn
  const end   = lastOut > dayEnd ? dayEnd : lastOut
  const hrs   = (end - start) / 3600000 - LUNCH_HOURS
  return Number(Math.min(cap, Math.max(0, hrs)).toFixed(2))
}

/**
 * Reduce raw event rows into per-employee, per-day aggregates plus the set of
 * company operating days.
 */
function aggregate(logs, shift, liveNames = null, rates = {}) {
  const cap = shiftHoursCap(shift) // invariant across every row for this export
  const operatingDays = new Set()
  const people = new Map() // key -> { name, username, role, days: Map<dayKey, log[]> }

  for (const l of logs) {
    const loginDate = parseISO(l.logged_in_at)
    if (isWeekend(loginDate)) continue // weekend logins are excluded entirely
    const dayKey = format(loginDate, 'yyyy-MM-dd')
    operatingDays.add(dayKey)

    const key = personKey(l)
    let p = people.get(key)
    if (!p) {
      // Live account name wins over the row's stored snapshot (handles renames).
      const live = liveNames?.[l.role]?.[l.username] ?? null
      p = { name: live ?? l.name ?? null, username: l.username ?? null, role: l.role, days: new Map() }
      people.set(key, p)
    }
    // Prefer a non-null display name / username if a later row has one.
    if (!p.name && l.name) p.name = l.name
    if (!p.username && l.username) p.username = l.username
    if (!p.days.has(dayKey)) p.days.set(dayKey, [])
    p.days.get(dayKey).push(l)
  }

  const sortedDays = [...operatingDays].sort() // yyyy-MM-dd sorts lexically = chronologically

  // Build daily rows + summary per person.
  const sortedPeople = [...people.values()].sort((a, b) =>
    (a.name ?? a.username ?? '').localeCompare(b.name ?? b.username ?? '')
  )

  const dailyRows = []
  const summaryRows = []

  for (const p of sortedPeople) {
    let present = 0, late = 0, absent = 0, offShift = 0, totalHours = 0
    // Regular-salary tallies (commission is a separate branch — not summed here).
    let regularPay = 0, totalLateMins = 0, totalUndertimeMins = 0
    const dailyRate = resolveDailyRate(p, rates)

    for (const dayKey of sortedDays) {
      const dayLogs = p.days.get(dayKey)
      const dateObj = parseISO(`${dayKey}T00:00:00`)

      if (!dayLogs || dayLogs.length === 0) {
        absent++
        dailyRows.push({
          name: p.name, username: p.username, role: p.role,
          date: dayKey, day: format(dateObj, 'EEE'), week: weekKey(dateObj),
          status: 'Absent', timeIn: '', timeOut: '', hours: '', minsLate: '',
          dailyRate: '', lateDeduction: '', undertimeMins: '', undertimeDeduction: '', dailyPay: '',
        })
        continue
      }

      // Sort the day's sessions chronologically.
      const day = [...dayLogs].sort((a, b) => parseISO(a.logged_in_at) - parseISO(b.logged_in_at))
      const firstIn = parseISO(day[0].logged_in_at)
      const closed  = day.filter(l => l.logged_out_at)
      // The day's end is known only if its LAST session closed — same rule as
      // salary.js's groupWorkDays. Falling back to an earlier session's logout
      // reads a lunch break as an early departure and charges hours of phantom
      // undertime against someone who is in fact still clocked in.
      const lastOut = day[day.length - 1].logged_out_at
        ? closed.reduce((m, l) => (parseISO(l.logged_out_at) > m ? parseISO(l.logged_out_at) : m), parseISO(closed[0].logged_out_at))
        : null

      const shiftStart = atHour(firstIn, shift.start)
      const dayEnd     = atHour(firstIn, shift.end)
      const hours   = windowedHours(firstIn, lastOut, shiftStart, dayEnd, cap) // null while unclosed
      const minsLate = minutesLate(firstIn, shiftStart)
      const isOff   = day.some(l => isOutsideShift(l.logged_in_at, shift))

      // Regular-salary branch — null while the day's last session is unclosed,
      // in which case every pay cell stays blank rather than reading as ₱0.00.
      const pay = computeRegularSalary(dailyRate, firstIn, lastOut, shift)

      present++
      if (minsLate > 0) late++ // summary tally only — lateness is not a status
      if (isOff) offShift++
      if (hours != null) totalHours += hours
      // Lateness is known from the clock-in alone, so it is tallied on every
      // present day — including one that never closed, where pay is unknown.
      // Gating it on `pay` would make the Late and Late Mins columns of the
      // same summary row contradict each other, and would stop Late Mins from
      // totalling its own detail sheet's Minutes Late column.
      totalLateMins += minsLate
      if (pay) {
        regularPay         += pay.dailyPay
        totalUndertimeMins += pay.undertimeMinutes
      }

      dailyRows.push({
        name: p.name, username: p.username, role: p.role,
        date: dayKey, day: format(dateObj, 'EEE'), week: weekKey(dateObj),
        status: 'Present',
        // Full date+time serial, not just time-of-day — lets the Excel Hours
        // formula anchor to the login's real calendar day instead of guessing
        // overnight from clock-time comparison alone.
        timeIn: toExcelSerial(firstIn),
        timeOut: lastOut ? toExcelSerial(lastOut) : '—',
        hours: hours ?? '',
        minsLate,
        offShift: isOff,
        dailyRate:          pay ? pay.dailyRate          : '',
        lateDeduction:      pay ? pay.lateDeduction      : '',
        undertimeMins:      pay ? pay.undertimeMinutes   : '',
        undertimeDeduction: pay ? pay.undertimeDeduction : '',
        dailyPay:           pay ? pay.dailyPay           : '',
      })
    }

    summaryRows.push({
      name: p.name ?? p.username ?? 'Unknown',
      username: p.username ?? '',
      role: p.role,
      present, late, absent, offShift,
      totalHours: Number(totalHours.toFixed(2)),
      dailyRate,
      totalLateMins,
      totalUndertimeMins,
      regularPay: Number(regularPay.toFixed(2)),
    })
  }

  return { dailyRows, summaryRows, operatingDayCount: sortedDays.length }
}

/**
 * Fetch one month of attendance, build a styled workbook, and trigger download.
 * Admin-only by placement (called from the Admin-gated Attendance page).
 *
 * @param {Date}   monthDate  any date within the target month
 * @param {{start:number,end:number}} shift  configured shift hours
 */
/**
 * Pure builder: turn raw event logs into a fully-styled workbook.
 * Exported separately so it can be unit-tested without the DOM or Supabase.
 *
 * @param {Array}  logs       attendance_logs rows for the month
 * @param {{start:number,end:number}} shift
 * @param {Date}   monthDate  any date within the target month
 * @returns {ExcelJS.Workbook}
 */
export function buildAttendanceWorkbook(logs, shift, monthDate, liveNames = null, rates = {}) {
  return buildFromAggregate(aggregate(logs, shift, liveNames, rates), shift, monthDate)
}

/**
 * The rendering half, split from aggregation so a caller that also needs the
 * aggregated rows (to report what was written) computes them once instead of
 * running the whole pass a second time — each pass now costs a resolveDailyRate
 * per person plus a computeRegularSalary per person-day.
 */
function buildFromAggregate({ dailyRows, summaryRows, operatingDayCount }, shift, monthDate) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'VRXE Repair Services'
  workbook.created = new Date()

  const sheetName = format(monthDate, 'MMMM yyyy')
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 2 }], // freeze title + header rows
  })

  const COLUMNS = [
    { header: 'Employee',     key: 'name',     width: 22 },
    { header: 'Date',         key: 'date',     width: 12 },
    { header: 'Day',          key: 'day',      width: 8  },
    { header: 'Status',       key: 'status',   width: 10 },
    { header: 'Time In',      key: 'timeIn',   width: 11 },
    { header: 'Time Out',     key: 'timeOut',  width: 11 },
    { header: 'Hours',        key: 'hours',    width: 9  },
    { header: 'Minutes Late', key: 'minsLate', width: 13 },
    // ── Regular-salary columns (appended; the columns above are unchanged) ──
    { header: 'Daily Rate',          key: 'dailyRate',          width: 12 },
    { header: 'Late Deduction',      key: 'lateDeduction',      width: 14 },
    { header: 'Undertime Mins',      key: 'undertimeMins',      width: 14 },
    { header: 'Undertime Deduction', key: 'undertimeDeduction', width: 18 },
    { header: 'Daily Pay',           key: 'dailyPay',           width: 12 },
  ]
  sheet.columns = COLUMNS

  // Live formulas over the Time In (E) / Time Out (F) date+time serials.
  // ISNUMBER guards skip absent rows ('' in E/F) and unclosed sessions ('—'
  // in F). E/F carry the real calendar date (see toExcelSerial), so the
  // shift-start/end anchors are built as INT(cell)+TIME(h) — the same
  // calendar day as the login — rather than bare TIME(h) literals. That lets
  // MIN/MAX clamp a next-day logout down to shift-end of the login day by
  // real date order, instead of needing a fragile "is the time-of-day number
  // smaller" heuristic to guess it's overnight.
  const t = h => `TIME(${h},0,0)`
  const dayAnchor = (n, h) => `(INT(E${n})+${t(h)})`
  const HOURS_CAP = shiftHoursCap(shift)
  const hoursFormula = n =>
    `IF(AND(ISNUMBER(E${n}),ISNUMBER(F${n})),` +
    `MIN(${HOURS_CAP},MAX(0,(MIN(F${n},${dayAnchor(n, shift.end)})-MAX(E${n},${dayAnchor(n, shift.start)}))*24-${LUNCH_HOURS})),"")`
  const minsLateFormula = n =>
    `IF(ISNUMBER(E${n}),MAX(0,ROUND((E${n}-${dayAnchor(n, shift.start)})*1440,0)),"")`

  // ── Regular-salary formulas (columns I–M) ───────────────────────────────────
  // Same live-formula treatment as Hours/Minutes Late: a hand-corrected time in
  // E/F must flow through to pay, otherwise a fixed timestamp leaves the money
  // column silently stale. Deductions are left unrounded in the formula (numFmt
  // renders 2 dp) so Daily Pay = rate − late − undertime matches the JS figure
  // in salary.js to the centavo rather than drifting on pre-rounded parts.
  //   I = Daily Rate, H = Minutes Late, K = Undertime Mins.
  // A shift window no wider than the unpaid lunch has no payable minutes to
  // divide by. computeRegularSalary refuses to price that day at all, so the
  // formulas must stay blank too rather than emit a /0 the JS side disagrees
  // with — BLANK_FORMULA keeps the columns present but empty.
  const PAID_MINUTES = shiftHoursCap(shift) * 60
  const BLANK_FORMULA = '""'
  const lateDeductionFormula = n => PAID_MINUTES > 0
    ? `IF(AND(ISNUMBER(H${n}),ISNUMBER(I${n})),H${n}*I${n}/${PAID_MINUTES},"")`
    : BLANK_FORMULA
  const undertimeMinsFormula = n => PAID_MINUTES > 0
    ? `IF(AND(ISNUMBER(E${n}),ISNUMBER(F${n})),MAX(0,ROUND((${dayAnchor(n, shift.end)}-MIN(F${n},${dayAnchor(n, shift.end)}))*1440,0)),"")`
    : BLANK_FORMULA
  const undertimeDeductionFormula = n => PAID_MINUTES > 0
    ? `IF(AND(ISNUMBER(K${n}),ISNUMBER(I${n})),K${n}*I${n}/${PAID_MINUTES},"")`
    : BLANK_FORMULA
  const dailyPayFormula = n => PAID_MINUTES > 0
    ? `IF(AND(ISNUMBER(I${n}),ISNUMBER(J${n}),ISNUMBER(L${n})),MAX(0,I${n}-J${n}-L${n}),"")`
    : BLANK_FORMULA

  // ── Row 1: title (merged across all columns) ────────────────────────────────
  sheet.mergeCells(1, 1, 1, COLUMNS.length)
  const titleCell = sheet.getCell(1, 1)
  titleCell.value = `Attendance Sheet — ${sheetName}`
  titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Calibri' }
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } }
  sheet.getRow(1).height = 26

  // ── Row 2: column header (bold, frozen) ─────────────────────────────────────
  const headerRow = sheet.getRow(2)
  COLUMNS.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = c.header
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
    cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11, name: 'Calibri' }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border = ALL_BORDERS
  })
  headerRow.height = 20

  // ── Daily detail rows ───────────────────────────────────────────────────────
  // Employee repeats on every daily row; merge it vertically per employee
  // block so each name prints once.
  let blockStart = null
  let blockKey = null
  const mergeEmployeeBlock = endRowNum => {
    if (blockStart != null && endRowNum > blockStart) {
      sheet.mergeCells(blockStart, 1, endRowNum, 1) // Employee
    }
  }

  // Weeks (Mon–Fri) are visually grouped within each employee's block: an
  // alternating tint per week, plus a heavier top border marking where a new
  // week starts.
  let lastWeekKey = null
  let bandIndex = 0

  dailyRows.forEach(r => {
    const rowKey = (r.username ?? r.name ?? '').toLowerCase()
    const isNewEmployee = rowKey !== blockKey
    if (isNewEmployee && blockKey != null) {
      mergeEmployeeBlock(sheet.rowCount)
      sheet.addRow([]) // spacer row between employees
    }

    const row = sheet.addRow({
      name: r.name ?? '—',
      date: r.date,
      day: r.day,
      status: r.status,
      timeIn: r.timeIn,
      timeOut: r.timeOut,
      hours: r.hours,
      minsLate: r.minsLate,
      // The four pay columns are filled in below as formulas, but they must be
      // present in the row NOW: eachCell only visits cells that already exist,
      // so cells created afterwards would miss the borders and week banding.
      dailyRate: r.dailyRate,
      lateDeduction: '',
      undertimeMins: '',
      undertimeDeduction: '',
      dailyPay: '',
    })
    if (isNewEmployee) {
      blockStart = row.number
      blockKey = rowKey
      lastWeekKey = null // each employee's banding restarts at week 1
    }
    const isNewWeek = r.week !== lastWeekKey
    if (isNewWeek) {
      if (lastWeekKey != null) bandIndex = 1 - bandIndex
      lastWeekKey = r.week
    }
    const weekDivider = isNewWeek && !isNewEmployee // employee block edge already separates rows

    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = { size: 10, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'center' }
      cell.border = { ...ALL_BORDERS, ...(weekDivider ? { top: WEEK_DIVIDER } : {}) }
      if (colNum > 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WEEK_BAND[bandIndex] } }
      }
    })
    // Color the Status cell by derived status (wins over the week band).
    const statusCell = row.getCell('status')
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STATUS_FILL[r.status] } }
    statusCell.font = { size: 10, name: 'Calibri', bold: true, color: { argb: STATUS_FONT[r.status] } }
    // Off-shift marker on the Time In cell.
    if (r.offShift) {
      const inCell = row.getCell('timeIn')
      inCell.font = { size: 10, name: 'Calibri', color: { argb: 'FFB26A00' }, italic: true }
      inCell.note = 'Off-shift login'
    }
    // Render time serials as clock times.
    for (const key of ['timeIn', 'timeOut']) {
      const cell = row.getCell(key)
      if (typeof cell.value === 'number') cell.numFmt = 'hh:mm AM/PM'
    }
    // Hours / Minutes Late as formulas with cached results (blank rows carry
    // the guarded formula alone; Excel/Sheets recalculate on open).
    const n = row.number
    const hoursCell = row.getCell('hours')
    hoursCell.value = typeof r.hours === 'number'
      ? { formula: hoursFormula(n), result: r.hours }
      : { formula: hoursFormula(n) }
    hoursCell.numFmt = '0.00'
    const lateCell = row.getCell('minsLate')
    lateCell.value = typeof r.minsLate === 'number'
      ? { formula: minsLateFormula(n), result: r.minsLate }
      : { formula: minsLateFormula(n) }
    lateCell.numFmt = '0'
    // Amber accent marks a late day — Minutes Late is the lateness indicator
    // (Status stays Present/Absent).
    if (typeof r.minsLate === 'number' && r.minsLate > 0) {
      lateCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LATE_FILL } }
      lateCell.font = { size: 10, name: 'Calibri', bold: true, color: { argb: LATE_FONT } }
    }

    // ── Regular-salary cells ──
    // Daily Rate is config, so it stays a plain number; everything downstream
    // of it is a formula over it and the time cells. On days with no payable
    // figure (absent, or an unclosed session) the rate is left blank too, which
    // is what makes the guarded formulas below fall through to "".
    const rateCell = row.getCell('dailyRate')
    if (typeof r.dailyRate === 'number') rateCell.numFmt = '#,##0.00'
    const payFormulas = [
      ['lateDeduction',      lateDeductionFormula,      '#,##0.00', r.lateDeduction],
      ['undertimeMins',      undertimeMinsFormula,      '0',        r.undertimeMins],
      ['undertimeDeduction', undertimeDeductionFormula, '#,##0.00', r.undertimeDeduction],
      ['dailyPay',           dailyPayFormula,           '#,##0.00', r.dailyPay],
    ]
    for (const [key, formulaFor, numFmt, cached] of payFormulas) {
      const cell = row.getCell(key)
      cell.value = typeof cached === 'number'
        ? { formula: formulaFor(n), result: cached }
        : { formula: formulaFor(n) }
      cell.numFmt = numFmt
    }
    const dailyPayCell = row.getCell('dailyPay')
    dailyPayCell.font = { size: 10, name: 'Calibri', bold: true }
    // A deduction is money the employee lost that day — flag it like lateness.
    for (const key of ['lateDeduction', 'undertimeDeduction']) {
      if (typeof r[key] === 'number' && r[key] > 0) {
        const cell = row.getCell(key)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LATE_FILL } }
        cell.font = { size: 10, name: 'Calibri', bold: true, color: { argb: LATE_FONT } }
      }
    }
  })
  mergeEmployeeBlock(sheet.rowCount) // close the final employee's block

  autoSize(sheet)
  fitToScreenWidth(sheet) // stretch proportionally to fill a 1080p screen

  // ── Summary sheet (per employee) ─────────────────────────────────────────────
  const summarySheet = workbook.addWorksheet('Summary', {
    views: [{ state: 'frozen', ySplit: 2 }],
  })
  const SUMMARY_COLUMNS = [
    'Employee', 'Present', 'Late', 'Absent', 'Off-shift', 'Total Hours',
    // ── Regular-salary columns (appended; the columns above are unchanged) ──
    'Daily Rate', 'Late Mins', 'Undertime Mins', 'Regular Pay',
  ]
  const CURRENCY_SUMMARY_COLS = new Set([7, 10]) // Daily Rate, Regular Pay

  summarySheet.mergeCells(1, 1, 1, SUMMARY_COLUMNS.length)
  const sumTitle = summarySheet.getCell(1, 1)
  sumTitle.value = `Summary — ${sheetName} · ${operatingDayCount} operating day${operatingDayCount === 1 ? '' : 's'}`
  sumTitle.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Calibri' }
  sumTitle.alignment = { vertical: 'middle', horizontal: 'center' }
  sumTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } }
  summarySheet.getRow(1).height = 26

  const sumHeadRow = summarySheet.addRow(SUMMARY_COLUMNS)
  sumHeadRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUMMARY_HEADER_BG } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' }
    cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'center' }
    cell.border = ALL_BORDERS
  })
  sumHeadRow.height = 20

  summaryRows.forEach(s => {
    const row = summarySheet.addRow([
      s.name, s.present, s.late, s.absent, s.offShift, s.totalHours,
      s.dailyRate, s.totalLateMins, s.totalUndertimeMins, s.regularPay,
    ])
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = { size: 10, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'center' }
      cell.border = ALL_BORDERS
      if (CURRENCY_SUMMARY_COLS.has(colNum) && typeof cell.value === 'number') cell.numFmt = '#,##0.00'
    })
    const hoursCell = row.getCell(6)
    if (typeof hoursCell.value === 'number') {
      hoursCell.numFmt = '0.00'
      hoursCell.font = { size: 10, name: 'Calibri', bold: true }
    }
    const regularPayCell = row.getCell(SUMMARY_COLUMNS.length)
    if (typeof regularPayCell.value === 'number') {
      regularPayCell.font = { size: 10, name: 'Calibri', bold: true }
    }
  })

  autoSize(summarySheet)
  fitToScreenWidth(summarySheet)
  return workbook
}

/**
 * Fetch one month of attendance, build a styled workbook, and trigger download.
 * Admin-only by placement (called from the Admin-gated Attendance page).
 *
 * @param {Date}   monthDate  any date within the target month
 * @param {{start:number,end:number}} shift  configured shift hours
 */
export async function exportAttendanceMonth(monthDate, shift) {
  const start = startOfMonth(monthDate)
  const end   = endOfMonth(monthDate)

  const { data, error } = await supabase
    .from('attendance_logs')
    .select('username, role, name, logged_in_at, logged_out_at, logout_reason')
    .gte('logged_in_at', start.toISOString())
    .lte('logged_in_at', end.toISOString())
    .in('role', ['Staff', 'Technician'])
    .order('logged_in_at', { ascending: true })

  if (error) throw new Error('Could not load attendance data. Please try again.')

  // Two reads issued together rather than costing a round trip each:
  //   - live account names, so renamed employees export under their CURRENT
  //     name and not the snapshot stored on each log row. Best-effort: a
  //     failure just falls back to the row snapshots.
  //   - daily rates for the regular-salary columns. NOT best-effort: an empty
  //     map is what tells resolveDailyRate "Admin has never saved rates", so a
  //     swallowed failure would price every day at the first-run seed and hand
  //     out a sheet of money nobody configured. Fail the export instead.
  const [liveNames, rates] = await Promise.all([
    fetchLiveNames().then(v => v, () => null),
    getDailyRates(),
  ])

  const logs  = data ?? []
  // Aggregate once and render from the result: the counts reported back are
  // then necessarily the same rows the workbook was built from.
  const stats = aggregate(logs, shift, liveNames, rates)
  const workbook = buildFromAggregate(stats, shift, monthDate)

  // ── Download ────────────────────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url    = URL.createObjectURL(blob)
  const link   = document.createElement('a')
  link.href     = url
  link.download = `VRXE_Attendance_${format(monthDate, 'MMMM_yyyy')}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  return { employees: stats.summaryRows.length, days: stats.operatingDayCount, rows: stats.dailyRows.length }
}
