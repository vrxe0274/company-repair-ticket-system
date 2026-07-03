import ExcelJS from 'exceljs'
import {
  format, parseISO, startOfMonth, endOfMonth, differenceInMinutes,
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
 *   - Operating days  = the set of calendar days on which ANY Staff/Technician
 *                       logged in that month. This is a data-driven definition
 *                       of "company was open" — no weekend/holiday guessing.
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
 * A per-employee summary block sits at the end of the same sheet.
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

const personKey = l => (l.username ?? l.name ?? '').toLowerCase().trim()

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
function aggregate(logs, shift) {
  const operatingDays = new Set()
  const people = new Map() // key -> { name, username, role, days: Map<dayKey, log[]> }

  for (const l of logs) {
    const dayKey = format(parseISO(l.logged_in_at), 'yyyy-MM-dd')
    operatingDays.add(dayKey)

    const key = personKey(l)
    let p = people.get(key)
    if (!p) {
      p = { name: l.name ?? null, username: l.username ?? null, role: l.role, days: new Map() }
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
          date: dayKey, day: format(dateObj, 'EEE'),
          status: 'Absent', timeIn: '', timeOut: '', sessions: 0, hours: '',
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
        date: dayKey, day: format(dateObj, 'EEE'),
        status: isLate ? 'Late' : 'Present',
        timeIn: format(firstIn, 'hh:mm a'),
        timeOut: lastOut ? format(lastOut, 'hh:mm a') : '—',
        sessions: day.length,
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

/** Auto-size columns from content, clamped to sane min/max. */
function autoSize(sheet, min = 8, max = 40) {
  sheet.columns.forEach(col => {
    let longest = 0
    col.eachCell({ includeEmpty: true }, cell => {
      const v = cell.value == null ? '' : String(cell.value?.richText ? '' : cell.value)
      if (v.length > longest) longest = v.length
    })
    col.width = Math.min(Math.max(longest + 2, min), max)
  })
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
export function buildAttendanceWorkbook(logs, shift, monthDate) {
  const { dailyRows, summaryRows, operatingDayCount } = aggregate(logs, shift)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'VRXE Repair Services'
  workbook.created = new Date()

  const sheetName = format(monthDate, 'MMMM yyyy')
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 2 }], // freeze title + header rows
  })

  const COLUMNS = [
    { header: 'Employee',  key: 'name',     width: 22 },
    { header: 'Username',  key: 'username', width: 16 },
    { header: 'Role',      key: 'role',     width: 12 },
    { header: 'Date',      key: 'date',     width: 12 },
    { header: 'Day',       key: 'day',      width: 8  },
    { header: 'Status',    key: 'status',   width: 10 },
    { header: 'Time In',   key: 'timeIn',   width: 11 },
    { header: 'Time Out',  key: 'timeOut',  width: 11 },
    { header: 'Sessions',  key: 'sessions', width: 10 },
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
  dailyRows.forEach(r => {
    const row = sheet.addRow({
      name: r.name ?? '—',
      username: r.username ?? '',
      role: r.role,
      date: r.date,
      day: r.day,
      status: r.status,
      timeIn: r.timeIn,
      timeOut: r.timeOut,
      sessions: r.sessions,
      hours: r.hours,
    })
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = { size: 10, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', horizontal: colNum <= 2 ? 'left' : 'center' }
      cell.border = ALL_BORDERS
    })
    // Color the Status cell by derived status.
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

  // ── Summary block (per employee) at the end of the sheet ────────────────────
  sheet.addRow([]) // spacer
  const summaryTitleRowNum = sheet.rowCount + 1
  sheet.mergeCells(summaryTitleRowNum, 1, summaryTitleRowNum, COLUMNS.length)
  const sumTitle = sheet.getCell(summaryTitleRowNum, 1)
  sumTitle.value = `Summary — ${operatingDayCount} operating day${operatingDayCount === 1 ? '' : 's'} this month`
  sumTitle.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' }, name: 'Calibri' }
  sumTitle.alignment = { vertical: 'middle', horizontal: 'center' }
  sumTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUMMARY_HEADER_BG } }
  sheet.getRow(summaryTitleRowNum).height = 22

  const SUMMARY_HEADERS = ['Employee', 'Username', 'Role', 'Present', 'Late', 'Absent', 'Off-shift', '', '', 'Total Hours']
  const sumHeadRow = sheet.addRow(SUMMARY_HEADERS)
  sumHeadRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
    if (colNum === 8 || colNum === 9) return // gap columns
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUMMARY_HEADER_BG } }
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' }
    cell.alignment = { vertical: 'middle', horizontal: colNum <= 3 ? 'left' : 'center' }
    cell.border = ALL_BORDERS
  })

  summaryRows.forEach(s => {
    const row = sheet.addRow([
      s.name, s.username, s.role, s.present, s.late, s.absent, s.offShift, '', '', s.totalHours,
    ])
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum === 8 || colNum === 9) return
      cell.font = { size: 10, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', horizontal: colNum <= 3 ? 'left' : 'center' }
      cell.border = ALL_BORDERS
    })
    const totalCell = row.getCell(10)
    if (typeof totalCell.value === 'number') {
      totalCell.numFmt = '0.00'
      totalCell.font = { size: 10, name: 'Calibri', bold: true }
    }
  })

  autoSize(sheet)
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

  const logs = data ?? []
  const workbook = buildAttendanceWorkbook(logs, shift, monthDate)
  const stats = aggregate(logs, shift)

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
