import ExcelJS from 'exceljs'
import { format, isSameMonth } from 'date-fns'
import { laborFee, payeeJobs, commissionDate } from './commission'
import {
  groupWorkDays, regularPayDaysFor, combinePay, resolveDailyRate, personKey,
} from './salary'
import { shiftHoursCap, fmtShiftHour, DEFAULT_SHIFT } from './shift'
import { autoSize } from './xlsxStyle'

/**
 * @file commissionExport.js
 * @description Admin-only monthly payroll export (.xlsx via ExcelJS) for the
 * Commission page.
 *
 * Three worksheets, because payroll needs the totals AND the working behind
 * them:
 *
 *   1. Payroll     — one row per employee: Commission Pay, Regular Pay,
 *                    Total Pay. The figures the employer actually pays out.
 *   2. Commission  — one row per (employee × paid repair): the labor fee,
 *                    that repair's percentage, and the resulting cut.
 *   3. Regular Pay — one row per (employee × working day): clock in/out, late
 *                    and undertime minutes, what each cost, and the day's pay.
 *
 * The two pay branches stay separate here exactly as they do on screen and in
 * lib/salary.js — they are computed by their own modules and only added
 * together by combinePay for the Total Pay column. Sheets 2 and 3 are each
 * one branch's working alone; neither ever shows the other's money.
 *
 * A null commission (Admin hasn't inputted that repair's percentage) and an
 * unclosed attendance day are both written as text, never as 0.00 — a blank
 * that reads as zero pesos is the one mistake a payroll sheet cannot make.
 *
 * Unlike the attendance sheet, cells here are static values rather than live
 * formulas: this is a snapshot of a closed pay period, not a worksheet meant
 * to be hand-corrected after the fact.
 */

// Mirrors the attendance sheet's palette so the two exports look like one
// system (see attendanceExport.js — kept local rather than shared so a tweak
// to one report can't silently restyle the other).
const HEADER_BG = 'FF7317E8' // brand purple
const HEADER_FG = 'FFFFFFFF'
const TITLE_BG  = 'FF4527A0'
const DETAIL_HEADER_BG = 'FF37474F'

const MONEY_FILL = 'FFF3E5F5' // Total Pay column tint
const SUBTOTAL_FILL = 'FFEFEFEF' // per-employee block subtotal
const PENDING_FILL = 'FFFFF8E1'
const PENDING_FONT = 'FFB26A00'

const THIN = { style: 'thin', color: { argb: 'FFD8D8D8' } }
const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN }

const MONEY_FMT = '#,##0.00'
const PCT_FMT   = '0.00%'

const PENDING_TEXT = 'Not yet inputted'
const UNCLOSED_TEXT = 'Not clocked out'

/** Employee accounts in the order the Commission page lists them. */
function allPayees(techs, staff) {
  return [
    ...techs.map(t => ({ ...t, role: 'Technician' })),
    ...staff.map(s => ({ ...s, role: 'Staff' })),
  ]
}

/**
 * Paid, commissionable repairs that fall in the target month — bucketed by the
 * date the money was collected (commissionDate), not the date the job was
 * booked. See commission.js.
 */
function monthTickets(tickets, monthDate) {
  return tickets.filter(t => {
    if (t.status !== 'Paid' || t.commission_not_applicable) return false
    if (laborFee(t) <= 0) return false
    const d = commissionDate(t)
    return d != null && isSameMonth(d, monthDate)
  })
}

/** Attendance rows that fall in the target month. */
function monthLogs(logs, monthDate) {
  return logs.filter(l => {
    const d = new Date(l.logged_in_at)
    return !isNaN(d) && isSameMonth(d, monthDate)
  })
}

/**
 * Everything the workbook renders, computed once so the summary row and the
 * detail sheets can never disagree about an employee's totals.
 */
function aggregate({ tickets, logs, techs, staff, rates, shift, monthDate }) {
  const paid = monthTickets(tickets, monthDate)
  // Group the month's attendance ONCE — going through regularPayDays per
  // employee would re-walk every log row for each of them.
  const attendance = groupWorkDays(monthLogs(logs, monthDate))

  return allPayees(techs, staff).map(p => {
    const dailyRate = resolveDailyRate(p, rates)
    const jobs      = payeeJobs(paid, p.role, p.username)
    const days      = regularPayDaysFor(attendance.get(personKey(p)), dailyRate, shift)

    const commission = jobs.reduce((s, j) => s + (j.commission ?? 0), 0)
    const regular    = days.reduce((s, d) => s + (d.pay?.dailyPay ?? 0), 0)

    return {
      name: p.name || p.username,
      username: p.username ?? '',
      role: p.role,
      dailyRate,
      jobs,
      days,
      pendingJobs: jobs.filter(j => j.commission == null).length,
      paidDays:    days.filter(d => d.pay).length,
      unclosedDays: days.filter(d => !d.pay).length,
      lateMinutes:      days.reduce((s, d) => s + (d.pay?.lateMinutes ?? 0), 0),
      undertimeMinutes: days.reduce((s, d) => s + (d.pay?.undertimeMinutes ?? 0), 0),
      pay: combinePay(commission, regular),
    }
  })
}

/** Title row merged across the sheet. */
function addTitle(sheet, colCount, text) {
  sheet.mergeCells(1, 1, 1, colCount)
  const cell = sheet.getCell(1, 1)
  cell.value = text
  cell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' }, name: 'Calibri' }
  cell.alignment = { vertical: 'middle', horizontal: 'center' }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } }
  sheet.getRow(1).height = 26
}

/** Bold, filled column header on row 2. */
function addHeader(sheet, headers, bg) {
  const row = sheet.addRow(headers)
  row.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
    cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11, name: 'Calibri' }
    cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'center', wrapText: true }
    cell.border = ALL_BORDERS
  })
  row.height = 22
  return row
}

/** Shared body-row styling: left-align the name column, centre the rest. */
function styleBody(row) {
  row.eachCell({ includeEmpty: true }, (cell, colNum) => {
    cell.font = { size: 10, name: 'Calibri' }
    cell.alignment = { vertical: 'middle', horizontal: colNum === 1 ? 'left' : 'center' }
    cell.border = ALL_BORDERS
  })
}

/** Amber "needs Admin input" treatment for a cell holding placeholder text. */
function markPending(cell) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PENDING_FILL } }
  cell.font = { size: 10, name: 'Calibri', bold: true, color: { argb: PENDING_FONT } }
}

/**
 * Mark a computed total as provisional: it is a real figure, but an input it
 * sums is still missing, so it can only be too low. Keeps the cell's own fill
 * (these are the emphasised money cells) and states in a note exactly what is
 * outstanding — an understated bottom line that reads as final is the one
 * mistake a payroll sheet cannot make.
 */
function markProvisional(cell, note, size = 10) {
  cell.font = { size, name: 'Calibri', bold: true, color: { argb: PENDING_FONT } }
  cell.note = note
}

/** "2 jobs awaiting a commission percentage · 1 day never clocked out" */
function provisionalNote(pendingJobs, unclosedDays) {
  const parts = []
  if (pendingJobs > 0) {
    parts.push(`${pendingJobs} job${pendingJobs === 1 ? '' : 's'} awaiting a commission percentage`)
  }
  if (unclosedDays > 0) {
    parts.push(`${unclosedDays} day${unclosedDays === 1 ? '' : 's'} never clocked out — excluded from Regular Pay`)
  }
  return parts.join(' · ')
}

/**
 * Write a detail sheet as one block per employee.
 *
 * The employee's name (and the facts that don't change within their block —
 * role, daily rate) is written ONCE into column A and merged down the whole
 * block, instead of being repeated on every line. Each block closes with its
 * own subtotal and is separated by a spacer row, so the sheet reads as a stack
 * of small per-person statements rather than one long table you have to scan
 * a name column to navigate.
 *
 * @param {ExcelJS.Worksheet} sheet
 * @param {Array}  blocks   one entry per employee, already filtered to non-empty
 * @param {object} spec
 * @param {(block) => string} spec.identity   column-A text for the block
 * @param {(block) => Array<{cells:Array, money?:number[], percent?:number[],
 *                           pending?:number[], emphasis?:number}>} spec.lines
 *        `cells` start at column B; the number arrays are 1-based SHEET columns.
 * @param {(block) => {label:string, labelSpan:number, cells:Array, money?:number[]}} spec.subtotal
 */
function writeBlocks(sheet, blocks, { identity, lines, subtotal }) {
  blocks.forEach((block, blockIndex) => {
    if (blockIndex > 0) sheet.addRow([]) // breathing room between people

    const rows = lines(block)
    let blockStart = null

    rows.forEach((line, i) => {
      const row = sheet.addRow([i === 0 ? identity(block) : '', ...line.cells])
      if (i === 0) blockStart = row.number
      styleBody(row)
      for (const col of line.money ?? []) {
        if (typeof row.getCell(col).value === 'number') row.getCell(col).numFmt = MONEY_FMT
      }
      for (const col of line.percent ?? []) {
        if (typeof row.getCell(col).value === 'number') row.getCell(col).numFmt = PCT_FMT
      }
      for (const col of line.pending ?? []) markPending(row.getCell(col))
      if (line.emphasis && typeof row.getCell(line.emphasis).value === 'number') {
        row.getCell(line.emphasis).font = { size: 10, name: 'Calibri', bold: true }
      }
    })

    // ── Block subtotal ──
    const sub = subtotal(block)
    const subRow = sheet.addRow([])
    sub.cells.forEach((v, i) => { subRow.getCell(sub.labelSpan + 1 + i).value = v })
    // The label spills left across the columns the subtotal has no figure for.
    // Merge FIRST, then write into the merge's master (column B) — assigning a
    // cell that a later merge swallows silently loses the value.
    sheet.mergeCells(subRow.number, 2, subRow.number, sub.labelSpan)
    subRow.getCell(2).value = sub.label
    subRow.eachCell({ includeEmpty: true }, cell => {
      cell.font = { size: 10, name: 'Calibri', bold: true }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBTOTAL_FILL } }
      cell.border = { ...ALL_BORDERS, top: { style: 'medium', color: { argb: 'FFB0B0B0' } } }
    })
    subRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' }
    for (const col of sub.money ?? []) {
      if (typeof subRow.getCell(col).value === 'number') subRow.getCell(col).numFmt = MONEY_FMT
    }

    // Name written once, merged down the block including its subtotal.
    sheet.mergeCells(blockStart, 1, subRow.number, 1)
    const nameCell = sheet.getCell(blockStart, 1)
    nameCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
    nameCell.font = { size: 10, name: 'Calibri', bold: true }
  })
}

/** Column sizing for these sheets — wrap-aware, and a touch wider than the
 *  attendance sheet's since a block header carries two lines of text. */
const sizeColumns = sheet => autoSize(sheet, { min: 8, max: 34, wrapped: true, headerRow: 2 })

/**
 * Pure builder: turn the page's already-loaded data into a styled workbook.
 * Exported separately so it can be unit-tested without the DOM or Supabase.
 *
 * @param {object} args
 * @param {Array}  args.tickets  all tickets (filtered to the month in here)
 * @param {Array}  args.logs     all attendance_logs (filtered to the month in here)
 * @param {Array}  args.techs    technician accounts ({username, name})
 * @param {Array}  args.staff    staff accounts ({username, name})
 * @param {Record<string,number>} args.rates
 * @param {{start:number,end:number}} args.shift
 * @param {Date}   args.monthDate  any date within the target month
 * @returns {ExcelJS.Workbook}
 */
export function buildCommissionWorkbook({
  tickets = [], logs = [], techs = [], staff = [], rates = {},
  shift = DEFAULT_SHIFT, monthDate,
}) {
  return buildFromRows(
    aggregate({ tickets, logs, techs, staff, rates, shift, monthDate }),
    shift, monthDate,
  )
}

/**
 * The rendering half, split from aggregation so a caller that also needs the
 * aggregated rows (to report what was written) computes them once instead of
 * running the whole pass a second time.
 */
function buildFromRows(rows, shift, monthDate) {
  const monthLabel = format(monthDate, 'MMMM yyyy')

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'VRXE Repair Services'
  workbook.created = new Date()

  // ── Sheet 1: Payroll summary ────────────────────────────────────────────────
  const summary = workbook.addWorksheet('Payroll', { views: [{ state: 'frozen', ySplit: 2 }] })
  const SUMMARY_HEADERS = [
    'Employee', 'Role', 'Jobs', 'Commission Pay',
    'Daily Rate', 'Days Worked', 'Late Mins', 'Undertime Mins', 'Regular Pay',
    'Total Pay',
  ]
  addTitle(summary, SUMMARY_HEADERS.length, `Payroll — ${monthLabel}`)
  addHeader(summary, SUMMARY_HEADERS, HEADER_BG)

  rows.forEach(r => {
    const row = summary.addRow([
      r.name, r.role, r.jobs.length, r.pay.commissionPay,
      r.dailyRate, r.paidDays, r.lateMinutes, r.undertimeMinutes, r.pay.regularPay,
      r.pay.totalPay,
    ])
    styleBody(row)
    for (const col of [4, 5, 9, 10]) row.getCell(col).numFmt = MONEY_FMT
    const totalCell = row.getCell(10)
    totalCell.font = { size: 10, name: 'Calibri', bold: true }
    totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MONEY_FILL } }
    // Flag the two "still owed an input" cases so a low figure is never read as
    // final when it is really just incomplete.
    if (r.pendingJobs > 0) {
      const cell = row.getCell(4)
      markPending(cell)
      cell.note = provisionalNote(r.pendingJobs, 0)
    }
    if (r.unclosedDays > 0) {
      const cell = row.getCell(6)
      markPending(cell)
      cell.note = provisionalNote(0, r.unclosedDays)
    }
    // …and carry the flag through to Total Pay, which is the number an employer
    // actually reads as "what I owe this person". A marked Commission Pay cell
    // beside a confident bold total says nothing about the total being short.
    if (r.pendingJobs > 0 || r.unclosedDays > 0) {
      markProvisional(totalCell, provisionalNote(r.pendingJobs, r.unclosedDays))
    }
  })

  // Only Total Pay is totalled, matching the Commission page — the per-branch
  // columns are reported per employee, without a column subtotal.
  const grandTotal   = rows.reduce((s, r) => s + r.pay.totalPay, 0)
  const totalPending = rows.reduce((s, r) => s + r.pendingJobs, 0)
  const totalUnclosed = rows.reduce((s, r) => s + r.unclosedDays, 0)
  const totalRow = summary.addRow([
    'TOTAL PAY', '', '', '', '', '', '', '', '', Number(grandTotal.toFixed(2)),
  ])
  summary.mergeCells(totalRow.number, 1, totalRow.number, SUMMARY_HEADERS.length - 1)
  totalRow.eachCell({ includeEmpty: true }, cell => {
    cell.font = { size: 11, name: 'Calibri', bold: true }
    cell.border = { ...ALL_BORDERS, top: { style: 'medium', color: { argb: 'FFB0B0B0' } } }
    cell.alignment = { vertical: 'middle', horizontal: 'right' }
  })
  const grandCell = totalRow.getCell(SUMMARY_HEADERS.length)
  grandCell.numFmt = MONEY_FMT
  grandCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MONEY_FILL } }
  // The bottom line inherits every employee's outstanding input.
  if (totalPending > 0 || totalUnclosed > 0) {
    markProvisional(grandCell, `Provisional — ${provisionalNote(totalPending, totalUnclosed)}`, 11)
    totalRow.getCell(1).value = 'TOTAL PAY (provisional)'
  }

  // Footnote: the constants the Regular Pay column was derived from.
  summary.addRow([])
  const noteRow = summary.addRow([
    `Regular pay: daily rate over ${shiftHoursCap(shift)} paid hours ` +
    `(${fmtShiftHour(shift.start)}–${fmtShiftHour(shift.end)}, 1 hour unpaid lunch already deducted). ` +
    'Late and undertime minutes are docked at the per-minute rate; early time-in and overtime are not paid.',
  ])
  noteRow.getCell(1).font = { size: 9, name: 'Calibri', italic: true, color: { argb: 'FF757575' } }
  autoSize(summary, {
    skipRows: new Set([1, noteRow.number]), min: 8, max: 34, wrapped: true, headerRow: 2,
  })

  // ── Sheet 2: Commission detail ──────────────────────────────────────────────
  const detail = workbook.addWorksheet('Commission', { views: [{ state: 'frozen', ySplit: 2 }] })
  const DETAIL_HEADERS = [
    // "Date Paid", not the booking date — that is the date this sheet's month
    // filter buckets on, so a Date column showing anything else would look like
    // a repair from the wrong month had leaked in.
    'Employee', 'Ticket', 'Client / Unit', 'Date Paid', 'Labor Fee', 'Rate', 'Cut',
  ]
  addTitle(detail, DETAIL_HEADERS.length, `Commission Breakdown — ${monthLabel}`)
  addHeader(detail, DETAIL_HEADERS, DETAIL_HEADER_BG)

  writeBlocks(detail, rows.filter(r => r.jobs.length > 0), {
    identity: r => `${r.name}\n${r.role}`,
    lines: r => r.jobs.map(({ ticket, fee, pct, commission }) => ({
      cells: [
        ticket.ticket_id,
        [ticket.client_name, [ticket.unit_brand, ticket.unit_model].filter(Boolean).join(' ')]
          .filter(Boolean).join(' — '),
        commissionDate(ticket) ? format(commissionDate(ticket), 'MMM d, yyyy') : '—',
        fee,
        pct ?? PENDING_TEXT,
        commission ?? PENDING_TEXT,
      ],
      money:   [5, 7],
      percent: [6],
      pending: [pct == null && 6, commission == null && 7].filter(Boolean),
      emphasis: 7,
    })),
    subtotal: r => ({
      label: `${r.jobs.length} job${r.jobs.length === 1 ? '' : 's'}` +
             (r.pendingJobs ? ` · ${r.pendingJobs} not yet inputted` : ''),
      labelSpan: 4, // Employee → Date
      cells: [
        r.jobs.reduce((s, j) => s + j.fee, 0),
        '',
        r.pay.commissionPay,
      ],
      money: [5, 7],
    }),
  })
  sizeColumns(detail)

  // ── Sheet 3: Regular pay detail ─────────────────────────────────────────────
  const salary = workbook.addWorksheet('Regular Pay', { views: [{ state: 'frozen', ySplit: 2 }] })
  const SALARY_HEADERS = [
    'Employee', 'Date', 'Day', 'Time In', 'Time Out',
    'Late Mins', 'Late Deduction', 'Undertime Mins', 'Undertime Deduction', 'Daily Pay',
  ]
  addTitle(salary, SALARY_HEADERS.length, `Regular Pay Breakdown — ${monthLabel}`)
  addHeader(salary, SALARY_HEADERS, DETAIL_HEADER_BG)

  writeBlocks(salary, rows.filter(r => r.days.length > 0), {
    // The daily rate is constant for an employee, so it belongs in the block
    // header rather than repeated down every day of the month.
    identity: r => `${r.name}\n${r.role} · ${r.dailyRate.toFixed(2)}/day`,
    // Oldest first here — a pay sheet reads forward through the month, unlike
    // the popup, which leads with the most recent day.
    lines: r => [...r.days].sort((a, b) => a.firstIn - b.firstIn).map(({ firstIn, lastOut, pay }) => ({
      cells: [
        format(firstIn, 'yyyy-MM-dd'), format(firstIn, 'EEE'),
        format(firstIn, 'hh:mm a'),
        lastOut ? format(lastOut, 'hh:mm a') : UNCLOSED_TEXT,
        pay ? pay.lateMinutes : '',
        pay ? pay.lateDeduction : '',
        pay ? pay.undertimeMinutes : '',
        pay ? pay.undertimeDeduction : '',
        pay ? pay.dailyPay : UNCLOSED_TEXT,
      ],
      money: [7, 9, 10],
      pending: pay
        ? [pay.lateMinutes > 0 && 7, pay.undertimeMinutes > 0 && 9].filter(Boolean)
        : [5, 10],
      emphasis: 10,
    })),
    subtotal: r => ({
      label: `${r.paidDays} day${r.paidDays === 1 ? '' : 's'} paid` +
             (r.unclosedDays ? ` · ${r.unclosedDays} not clocked out` : ''),
      labelSpan: 5, // Employee → Time Out
      cells: [
        r.lateMinutes,
        r.days.reduce((s, d) => s + (d.pay?.lateDeduction ?? 0), 0),
        r.undertimeMinutes,
        r.days.reduce((s, d) => s + (d.pay?.undertimeDeduction ?? 0), 0),
        r.pay.regularPay,
      ],
      money: [7, 9, 10],
    }),
  })
  sizeColumns(salary)

  return workbook
}

/**
 * Build the workbook and trigger the download.
 * Admin-only by placement (called from the Admin-gated Commission page).
 *
 * Takes the page's already-loaded data rather than re-querying: the page holds
 * every ticket and attendance row already, so a second round trip could only
 * disagree with what the Admin is looking at.
 *
 * @returns {{employees:number, jobs:number, days:number}} what was written
 */
export async function exportCommissionMonth(args) {
  const shift = args.shift ?? DEFAULT_SHIFT
  // Aggregate once and render from the result: the counts reported back are
  // then necessarily the same rows the workbook was built from.
  const rows = aggregate({
    tickets: args.tickets ?? [], logs: args.logs ?? [],
    techs: args.techs ?? [], staff: args.staff ?? [],
    rates: args.rates ?? {}, shift,
    monthDate: args.monthDate,
  })
  const workbook = buildFromRows(rows, shift, args.monthDate)

  const buffer = await workbook.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url    = URL.createObjectURL(blob)
  const link   = document.createElement('a')
  link.href     = url
  link.download = `VRXE_Commission_${format(args.monthDate, 'MMMM_yyyy')}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  return {
    employees: rows.length,
    jobs: rows.reduce((s, r) => s + r.jobs.length, 0),
    days: rows.reduce((s, r) => s + r.days.length, 0),
  }
}
