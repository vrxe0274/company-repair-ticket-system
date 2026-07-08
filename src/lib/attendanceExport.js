import ExcelJS from 'exceljs'
import {
  format, parseISO, startOfMonth, endOfMonth, differenceInMinutes, isWeekend, startOfWeek,
} from 'date-fns'
import { supabase } from './supabase'
import { isOutsideShift } from './shift'

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
 *   - Late            = employee's first login hour is later than the shift
 *                       start hour (shift is configured hour-granular).
 *   - Absent          = operating day with no session for that employee.
 *   - Off-shift       = a session started before shift start / after shift end
 *                       (reuses the app's isOutsideShift rule).
 *   - Hours           = sum of real session durations (no cap — sessions run
 *                       until an explicit logout).
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
  Late:    'FFFFF8E1', // amber tint
  Absent:  'FFFDECEA', // red tint
}
const STATUS_FONT = {
  Present: 'FF2E7D32',
  Late:    'FFB26A00',
  Absent:  'FFC62828',
}

const THIN = { style: 'thin', color: { argb: 'FFD8D8D8' } }
const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN }
const WEEK_DIVIDER = { style: 'medium', color: { argb: 'FFB0B0B0' } } // marks the start of a new week

// Alternating tint applied per calendar week within an employee's block, so
// weeks are visually grouped without breaking the long/tabular row layout.
const WEEK_BAND = ['FFFFFFFF', 'FFF2F2F2']

/** Monday-anchored week key so day rows group by calendar week (Mon–Fri). */
const weekKey = dateObj => format(startOfWeek(dateObj, { weekStartsOn: 1 }), 'yyyy-MM-dd')

const personKey = l => (l.username ?? l.name ?? '').toLowerCase().trim()

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

/** Real session length in minutes (uncapped); null when the session never closed. */
function sessionMinutes(l) {
  if (!l.logged_out_at) return null
  const mins = differenceInMinutes(parseISO(l.logged_out_at), parseISO(l.logged_in_at))
  return Math.max(mins, 0)
}

/**
 * Reduce raw event rows into per-employee, per-day aggregates plus the set of
 * company operating days.
 */
function aggregate(logs, shift, liveNames = null) {
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
    let present = 0, late = 0, absent = 0, offShift = 0, totalMins = 0

    for (const dayKey of sortedDays) {
      const dayLogs = p.days.get(dayKey)
      const dateObj = parseISO(`${dayKey}T00:00:00`)

      if (!dayLogs || dayLogs.length === 0) {
        absent++
        dailyRows.push({
          name: p.name, username: p.username, role: p.role,
          date: dayKey, day: format(dateObj, 'EEE'), week: weekKey(dateObj),
          status: 'Absent', timeIn: '', timeOut: '', hours: '',
        })
        continue
      }

      // Sort the day's sessions chronologically.
      const day = [...dayLogs].sort((a, b) => parseISO(a.logged_in_at) - parseISO(b.logged_in_at))
      const firstIn = parseISO(day[0].logged_in_at)
      const closed  = day.filter(l => l.logged_out_at)
      const lastOut = closed.length
        ? closed.reduce((m, l) => (parseISO(l.logged_out_at) > m ? parseISO(l.logged_out_at) : m), parseISO(closed[0].logged_out_at))
        : null

      const dayMins = day.reduce((s, l) => s + (sessionMinutes(l) ?? 0), 0)
      const isLate  = firstIn.getHours() > shift.start
      const isOff   = day.some(l => isOutsideShift(l.logged_in_at, shift))

      present++
      if (isLate) late++
      if (isOff) offShift++
      totalMins += dayMins

      dailyRows.push({
        name: p.name, username: p.username, role: p.role,
        date: dayKey, day: format(dateObj, 'EEE'), week: weekKey(dateObj),
        status: isLate ? 'Late' : 'Present',
        timeIn: format(firstIn, 'hh:mm a'),
        timeOut: lastOut ? format(lastOut, 'hh:mm a') : '—',
        hours: Number((dayMins / 60).toFixed(2)),
        offShift: isOff,
      })
    }

    summaryRows.push({
      name: p.name ?? p.username ?? 'Unknown',
      username: p.username ?? '',
      role: p.role,
      present, late, absent, offShift,
      totalHours: Number((totalMins / 60).toFixed(2)),
    })
  }

  return { dailyRows, summaryRows, operatingDayCount: sortedDays.length }
}

/** Auto-size columns from content, clamped to sane min/max.
 *  Title rows (merged across every column) are skipped so their long text
 *  doesn't inflate column A — pass their row numbers in skipRows. */
function autoSize(sheet, skipRows = new Set(), min = 6, max = 30) {
  sheet.columns.forEach(col => {
    let longest = 0
    col.eachCell({ includeEmpty: true }, (cell, rowNum) => {
      if (skipRows.has(rowNum)) return
      const v = cell.value == null ? '' : String(cell.value?.richText ? '' : cell.value)
      if (v.length > longest) longest = v.length
    })
    col.width = Math.min(Math.max(longest + 2, min), max)
  })
}

/**
 * Scale every column proportionally so the sheet fills a 1080p screen
 * (~1920 px). Excel renders a column at roughly width × 7 + 5 px, so the
 * width units to distribute are (1920 − cols × 5) / 7.
 */
function fitToScreenWidth(sheet, screenPx = 1920) {
  const cols = sheet.columns
  const target = (screenPx - cols.length * 5) / 7
  const current = cols.reduce((s, c) => s + (c.width ?? 9), 0)
  if (current <= 0) return
  const factor = target / current
  cols.forEach(c => { c.width = Math.round((c.width ?? 9) * factor * 100) / 100 })
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
export function buildAttendanceWorkbook(logs, shift, monthDate, liveNames = null) {
  const { dailyRows, summaryRows, operatingDayCount } = aggregate(logs, shift, liveNames)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'VRXE Repair Services'
  workbook.created = new Date()

  const sheetName = format(monthDate, 'MMMM yyyy')
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 2 }], // freeze title + header rows
  })

  const COLUMNS = [
    { header: 'Employee',  key: 'name',     width: 22 },
    { header: 'Date',      key: 'date',     width: 12 },
    { header: 'Day',       key: 'day',      width: 8  },
    { header: 'Status',    key: 'status',   width: 10 },
    { header: 'Time In',   key: 'timeIn',   width: 11 },
    { header: 'Time Out',  key: 'timeOut',  width: 11 },
    { header: 'Hours',     key: 'hours',    width: 9  },
  ]
  sheet.columns = COLUMNS

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
    const hoursCell = row.getCell('hours')
    if (typeof hoursCell.value === 'number') hoursCell.numFmt = '0.00'
  })
  mergeEmployeeBlock(sheet.rowCount) // close the final employee's block

  autoSize(sheet, new Set([1]))
  fitToScreenWidth(sheet) // stretch proportionally to fill a 1080p screen

  // ── Summary sheet (per employee) ─────────────────────────────────────────────
  const summarySheet = workbook.addWorksheet('Summary', {
    views: [{ state: 'frozen', ySplit: 2 }],
  })
  const SUMMARY_COLUMNS = ['Employee', 'Present', 'Late', 'Absent', 'Off-shift', 'Total Hours']

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
    ])
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = { size: 10, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'center' }
      cell.border = ALL_BORDERS
    })
    const totalCell = row.getCell(SUMMARY_COLUMNS.length)
    if (typeof totalCell.value === 'number') {
      totalCell.numFmt = '0.00'
      totalCell.font = { size: 10, name: 'Calibri', bold: true }
    }
  })

  autoSize(summarySheet, new Set([1]))
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

  // Live account names so renamed employees export under their CURRENT name,
  // not the snapshot stored on each log row. Non-fatal — falls back to snapshots.
  let liveNames = null
  try { liveNames = await fetchLiveNames() } catch { /* snapshot fallback */ }

  const logs = data ?? []
  const workbook = buildAttendanceWorkbook(logs, shift, monthDate, liveNames)
  const stats = aggregate(logs, shift, liveNames)

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
