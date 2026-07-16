import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'

// attendanceExport.js imports the supabase client at module level.
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), functions: { invoke: vi.fn() } } }))

import { buildAttendanceWorkbook } from '../../lib/attendanceExport'

const shift = { start: 10, end: 19 } // 10 AM – 7 PM
const iso = (d, h, m) => new Date(2026, 6, d, h, m).toISOString() // July = month 6

// Sample month (Jul 1 2026 = Wednesday, Jul 4 = Saturday, Jul 8 = next Wednesday):
//   Week 1 (Jun29–Jul3): Kurt — Jul1 two sessions (first in 10:05 → 5 min late), Jul2 late (11:30), Jul3 absent,
//                                Jul4 (Sat) login — must be EXCLUDED from the report entirely
//                        Aria — Jul1 present on-time, Jul2 after-hours (off-shift + late), Jul3 unclosed
//                        Zed  — Jul1 early-in/late-out (hours cap), Jul2 overnight logout, Jul3 absent
//   Week 2 (Jul6–Jul10): all three present Jul8, so weekly grouping has 2 bands to check
const logs = [
  { username: 'kurt', role: 'Technician', name: 'Kurt Tristan Rain Mina', logged_in_at: iso(1, 10, 5),  logged_out_at: iso(1, 13, 0) },
  { username: 'kurt', role: 'Technician', name: 'Kurt Tristan Rain Mina', logged_in_at: iso(1, 14, 0),  logged_out_at: iso(1, 18, 30) },
  { username: 'kurt', role: 'Technician', name: 'Kurt Tristan Rain Mina', logged_in_at: iso(2, 11, 30), logged_out_at: iso(2, 19, 0) }, // late
  { username: 'kurt', role: 'Technician', name: 'Kurt Tristan Rain Mina', logged_in_at: iso(4, 10, 0),  logged_out_at: iso(4, 15, 0) }, // Saturday
  { username: 'kurt', role: 'Technician', name: 'Kurt Tristan Rain Mina', logged_in_at: iso(8, 10, 0),  logged_out_at: iso(8, 14, 0) }, // week 2
  { username: 'aria', role: 'Staff',      name: 'Aria Mina Lumbao',        logged_in_at: iso(1, 10, 0),  logged_out_at: iso(1, 17, 0) },
  { username: 'aria', role: 'Staff',      name: 'Aria Mina Lumbao',        logged_in_at: iso(2, 20, 0),  logged_out_at: iso(2, 21, 0) }, // off-shift + late
  { username: 'aria', role: 'Staff',      name: 'Aria Mina Lumbao',        logged_in_at: iso(3, 10, 0),  logged_out_at: null }, // unclosed
  { username: 'aria', role: 'Staff',      name: 'Aria Mina Lumbao',        logged_in_at: iso(8, 10, 0),  logged_out_at: iso(8, 16, 0) }, // week 2
  { username: 'zed',  role: 'Technician', name: 'Zed Overnight Casewright', logged_in_at: iso(1, 8, 0),  logged_out_at: iso(1, 20, 0) }, // early in + late out → capped
  { username: 'zed',  role: 'Technician', name: 'Zed Overnight Casewright', logged_in_at: iso(2, 14, 0), logged_out_at: iso(3, 4, 0) },  // overnight → count to 7 PM Jul2 only
  { username: 'zed',  role: 'Technician', name: 'Zed Overnight Casewright', logged_in_at: iso(8, 10, 0), logged_out_at: iso(8, 12, 0) }, // week 2
]

let ws
let summarySheet
let memWs // pre-write in-memory sheet — raw serials / cached zero results survive here
const file = join(tmpdir(), `vrxe-attendance-test-${Date.now()}.xlsx`)

beforeAll(async () => {
  const wb = buildAttendanceWorkbook(logs, shift, new Date(2026, 6, 15))
  memWs = wb.getWorksheet(1)
  await wb.xlsx.writeFile(file)
  // Round-trip through disk to prove the file is valid & re-openable by Excel.
  const reopened = new ExcelJS.Workbook()
  await reopened.xlsx.readFile(file)
  ws = reopened.getWorksheet(1)
  summarySheet = reopened.getWorksheet('Summary')
})

afterAll(async () => { await unlink(file).catch(() => {}) })

describe('buildAttendanceWorkbook — file validity & formatting', () => {
  it('produces a sheet named for the month', () => {
    expect(ws.name).toBe('July 2026')
  })

  it('freezes the title + header rows', () => {
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 2 })
  })

  it('has a bold, filled header row on row 2 without Username or Role columns', () => {
    const header = ws.getRow(2)
    expect(header.values.slice(1)).toEqual(
      ['Employee', 'Date', 'Day', 'Status', 'Time In', 'Time Out', 'Hours', 'Minutes Late']
    )
    expect(header.getCell(1).font.bold).toBe(true)
    expect(header.getCell(1).fill.fgColor.argb).toBe('FF7317E8')
  })

  it('never emits "Username" anywhere on the sheet', () => {
    ws.eachRow(row => {
      row.values.slice(1).forEach(v => expect(String(v ?? '')).not.toBe('Username'))
    })
  })

  it('scales column widths to fill a 1080p (1920 px) screen', () => {
    // Excel px ≈ width × 7 + 5 per column → total ≈ (1920 − 9×5) / 7 units.
    // (ExcelJS omits widths equal to the sheet default (9) on write, so a
    // reopened column can read back undefined — that means 9.)
    const widths = ws.columns.map(c => c.width ?? 9)
    widths.forEach(w => expect(w).toBeGreaterThan(0))
    const total = widths.reduce((s, w) => s + w, 0)
    expect(total).toBeCloseTo((1920 - widths.length * 5) / 7, 0)
  })

  it('borders data cells', () => {
    expect(ws.getRow(3).getCell(1).border?.top?.style).toBe('thin')
  })

  it('merges Employee vertically per employee block (no repetition)', () => {
    // Daily rows start at row 3; employees sort alphabetically, so Aria owns
    // rows 3–6 (4 operating days), row 7 is a spacer, Kurt owns rows 8–11.
    expect(ws.getCell(4, 1).isMerged).toBe(true)
    expect(ws.getCell(4, 1).master.address).toBe('A3')
    expect(ws.getCell(6, 1).master.address).toBe('A3')
    expect(ws.getCell(9, 1).master.address).toBe('A8')
    // Blocks don't bleed into each other.
    expect(ws.getCell(8, 1).master.address).toBe('A8')
  })

  it('inserts a blank spacer row between employee blocks', () => {
    const spacer = ws.getRow(7)
    expect(spacer.values.slice(1).every(v => v == null || v === '')).toBe(true)
    // Next employee's block starts cleanly right after the spacer.
    expect(ws.getCell(8, 1).value).toBeTruthy()
  })

  it('groups daily rows by calendar week with an alternating tint and a divider border', () => {
    // Aria's block: rows 3–5 = week 1 (Jul1–3), row 6 = week 2 (Jul8).
    const week1Fill = ws.getCell(4, 2).fill?.fgColor?.argb
    expect(ws.getCell(5, 2).fill?.fgColor?.argb).toBe(week1Fill) // same week → same band
    const week2Fill = ws.getCell(6, 2).fill?.fgColor?.argb
    expect(week2Fill).not.toBe(week1Fill) // new week → band flips
    // The first row of a new week (row 6) gets a heavier divider border; the
    // block's own first row (row 3, a new employee) does not.
    expect(ws.getCell(6, 2).border?.top?.style).toBe('medium')
    expect(ws.getCell(3, 2).border?.top?.style).not.toBe('medium')
  })
})

describe('buildAttendanceWorkbook — derived attendance logic', () => {
  // Collect the daily detail rows (below title + header rows).
  // Employee is vertically merged per employee block, so slave rows may read
  // back blank — carry the last seen name forward. Hours / Minutes Late are
  // formula cells — unwrap to their cached result.
  const unwrap = x => (x && typeof x === 'object' && 'formula' in x) ? (x.result ?? '') : x
  function dailyRows(sheet = ws) {
    const rows = []
    let lastName = null
    sheet.eachRow((row, n) => {
      if (n <= 2) return
      const v = row.values.slice(1)
      if (v.every(x => x == null || x === '')) return
      if (v[0] != null && v[0] !== '') lastName = v[0]
      rows.push({
        name: lastName, date: v[1], day: v[2],
        status: v[3], timeIn: v[4], timeOut: v[5],
        hours: unwrap(v[6]), minsLate: unwrap(v[7]),
      })
    })
    return rows
  }

  it('emits one row per employee per weekday operating day (3 employees × 4 days = 12)', () => {
    expect(dailyRows().length).toBe(12)
  })

  it('completely removes weekend rows — a Saturday login produces no row at all', () => {
    const rows = dailyRows()
    expect(rows.some(r => r.date === '2026-07-04')).toBe(false) // Kurt's Sat login gone
    expect(rows.every(r => !['Sat', 'Sun'].includes(r.day))).toBe(true)
  })

  it('keeps daily Status to Present/Absent only — lateness never becomes a status', () => {
    const statuses = new Set(dailyRows().map(r => r.status))
    expect([...statuses].sort()).toEqual(['Absent', 'Present'])
    // A late first login (Kurt Jul 2, 11:30) stays Present; Minutes Late carries the signal.
    const kurtJul2 = dailyRows().find(r => String(r.name).includes('Kurt') && r.date === '2026-07-02')
    expect(kurtJul2.status).toBe('Present')
    expect(kurtJul2.minsLate).toBe(90)
  })

  it('accents a nonzero Minutes Late cell in amber as the lateness indicator', () => {
    // Kurt owns rows 8–11; row 9 = Jul 2 (90 min late), row 11 = Jul 8 (on time).
    const lateCell = ws.getCell(9, 8)
    expect(lateCell.fill?.fgColor?.argb).toBe('FFFFF8E1')
    expect(lateCell.font?.color?.argb).toBe('FFB26A00')
    expect(lateCell.font?.bold).toBe(true)
    const onTimeCell = ws.getCell(11, 8)
    expect(onTimeCell.fill?.fgColor?.argb).not.toBe('FFFFF8E1')
    expect(onTimeCell.font?.color?.argb).not.toBe('FFB26A00')
  })

  it('marks a day with no sessions as Absent with blank times', () => {
    const kurtJul3 = dailyRows().find(r => String(r.name).includes('Kurt') && r.date === '2026-07-03')
    expect(kurtJul3.status).toBe('Absent')
    expect(kurtJul3.timeIn === '' || kurtJul3.timeIn == null).toBe(true)
  })

  it('spans first-in → last-out minus 1h lunch (Kurt Jul 1: 10:05–18:30 ≈ 7.42h)', () => {
    const kurtJul1 = dailyRows().find(r => String(r.name).includes('Kurt') && r.date === '2026-07-01')
    // Window 10:05 → 18:30 = 8.42h, − 1h lunch = 7.42h
    expect(kurtJul1.hours).toBeCloseTo(7.42, 1)
  })

  it('credits the whole clamped span across a same-day gap between sessions, not just the summed session time (windowed hours, not summed)', () => {
    // Kurt Jul1's own gap (13:00→14:00) happens to be exactly 1h, coinciding
    // with the lunch deduction and masking this from that fixture alone — use
    // a 3h gap here so the window-vs-sum distinction is unambiguous: only 5h
    // were actually logged in (10:00–12:00 + 15:00–18:00), but Hours is the
    // first-in→last-out span minus the fixed lunch, not a sum of sessions.
    const gapLogs = [
      { username: 'gap', role: 'Staff', name: 'Gap Tester', logged_in_at: iso(1, 10, 0), logged_out_at: iso(1, 12, 0) },
      { username: 'gap', role: 'Staff', name: 'Gap Tester', logged_in_at: iso(1, 15, 0), logged_out_at: iso(1, 18, 0) },
    ]
    const wb = buildAttendanceWorkbook(gapLogs, shift, new Date(2026, 6, 15))
    const sheet = wb.getWorksheet(1)
    const hoursCell = sheet.getCell(3, 7).value // only row for this isolated fixture
    // Span 10:00 → 18:00 = 8h, − 1h lunch = 7h (not 5h).
    expect(hoursCell.result).toBe(7)
  })


  it('writes Time In / Time Out as real date+time values formatted hh:mm AM/PM', () => {
    // Aria owns rows 3–6; row 3 = Jul 1, Time In 10:00 AM. The cell carries a
    // full date+time Excel serial (not just a time-of-day fraction — the
    // integer part is the calendar date, needed so the Hours/Minutes Late
    // formulas can tell an overnight logout apart from a same-day one by
    // real date order), so only the fractional (time-of-day) part is 10/24.
    expect(memWs.getCell(3, 5).value % 1).toBeCloseTo(10 / 24, 5)
    const reopened = ws.getCell(3, 5)
    expect(reopened.numFmt).toBe('hh:mm AM/PM')
    expect(reopened.value instanceof Date ? reopened.value.getUTCHours() : NaN).toBe(10)
  })

  it('clamps to the shift window and caps at 8h (Zed Jul 1: 8:00–20:00 → 8)', () => {
    const zedJul1 = dailyRows().find(r => String(r.name).includes('Zed') && r.date === '2026-07-01')
    expect(zedJul1.hours).toBe(8)
  })

  it('counts an overnight logout only up to 7 PM of the login day (Zed Jul 2: 14:00→4:00 = 4h)', () => {
    const zedJul2 = dailyRows().find(r => String(r.name).includes('Zed') && r.date === '2026-07-02')
    expect(zedJul2.hours).toBe(4) // 14:00 → 19:00 = 5h, − 1h lunch
  })

  it('gives 0 hours when the first login is after shift end (Aria Jul 2: 20:00)', () => {
    // The file carries the cached 0, but ExcelJS's `value` getter masks falsy
    // results — assert at model level. Aria row 4 = Jul 2.
    expect(ws.getCell(4, 7).model.result).toBe(0)
  })

  it('leaves Hours blank for a day whose session never closed', () => {
    const ariaJul3 = dailyRows().find(r => String(r.name).includes('Aria') && r.date === '2026-07-03')
    expect(ariaJul3.hours === '' || ariaJul3.hours == null).toBe(true)
  })

  it('shows an em dash for an unclosed session out-time', () => {
    const ariaJul3 = dailyRows().find(r => String(r.name).includes('Aria') && r.date === '2026-07-03')
    expect(ariaJul3.timeOut).toBe('—')
  })

  it('computes Minutes Late from shift start (0 when early, blank when absent)', () => {
    const rows = dailyRows()
    const find = (who, date) => rows.find(r => String(r.name).includes(who) && r.date === date)
    expect(find('Kurt', '2026-07-01').minsLate).toBe(5)   // 10:05
    expect(find('Kurt', '2026-07-02').minsLate).toBe(90)  // 11:30
    expect(find('Aria', '2026-07-02').minsLate).toBe(600) // 20:00
    // Zero results: ExcelJS's `value` getter masks a falsy cached result —
    // assert at model level. Zed row 13 = Jul 1 (8:00, early → 0); Aria
    // row 3 = Jul 1 (10:00 exactly on shift start → 0).
    expect(ws.getCell(13, 8).model.result).toBe(0)
    expect(ws.getCell(3, 8).model.result).toBe(0)
    const absent = find('Kurt', '2026-07-03')
    expect(absent.minsLate === '' || absent.minsLate == null).toBe(true)
  })

  it('writes Hours and Minutes Late as live formulas over the time cells', () => {
    // Row 3 = Aria Jul 1. G = Hours, H = Minutes Late.
    const g = ws.getCell(3, 7).value
    const h = ws.getCell(3, 8).value
    expect(g?.formula).toContain('ISNUMBER(E3)')
    expect(g?.formula).toContain('TIME(19,0,0)')
    expect(g?.formula).toContain('TIME(10,0,0)')
    expect(h?.formula).toContain('*1440')
    // Overnight handling: shift-end is anchored to Time In's own calendar day
    // (INT(E)+TIME(19,0,0)), not guessed from comparing time-of-day numbers —
    // that anchor is what lets MIN(F, dayEnd) roll a next-day logout back to
    // shift end of the login day regardless of what clock time it falls on.
    const zedJul2 = ws.getCell(14, 7).value // Zed block rows 13–16; row 14 = Jul 2
    expect(zedJul2?.formula).toContain('MIN(F14,(INT(E14)+TIME(19,0,0)))')
    expect(zedJul2?.formula).not.toContain('F14<E14')
  })

  it('correctly zeroes a same-day-numeric overnight session the old F<E heuristic would have mis-handled', () => {
    // Regression case for the anchor-based overnight fix: login 1:00 AM,
    // forgotten logout closed 5:00 AM the NEXT day. Time-of-day-only, this
    // logout (5:00) is numerically greater than the login (1:00), so a
    // "F < E means overnight" heuristic would misread it as a same-day
    // session and clamp incorrectly. The date-anchored formula/JS both key
    // off the real calendar date instead and get the capped window.
    const oddLogs = [
      { username: 'odd', role: 'Staff', name: 'Odd Hours', logged_in_at: iso(1, 1, 0), logged_out_at: iso(2, 5, 0) },
    ]
    const wb = buildAttendanceWorkbook(oddLogs, shift, new Date(2026, 6, 15))
    const sheet = wb.getWorksheet(1)
    const hoursCell = sheet.getCell(3, 7).value // only row for this isolated fixture
    // 10:00 (shift start, since login 1:00 is before it) → 19:00 (shift end,
    // since the logout is past it) = 9h − 1h lunch = 8h, capped at 8.
    expect(hoursCell.result).toBe(8)
    expect(hoursCell.formula).toContain('MIN(F3,(INT(E3)+TIME(19,0,0)))')
  })

  it('puts the per-employee Summary on its own worksheet with totals', () => {
    expect(summarySheet).toBeTruthy()
    expect(String(summarySheet.getCell(1, 1).value)).toContain('Summary')
    expect(summarySheet.getRow(2).values.slice(1)).toEqual(
      ['Employee', 'Present', 'Late', 'Absent', 'Off-shift', 'Total Hours']
    )

    const summary = []
    summarySheet.eachRow((row, n) => {
      if (n <= 2) return
      summary.push(row.values.slice(1))
    })
    // Summary row layout: [name, present, late, absent, offShift, totalHours]
    // Kurt: present Jul1+Jul2+Jul8 (3) — his Saturday Jul4 login gives NO
    // present credit — late 2 (Jul1 10:05, Jul2 11:30), absent Jul3 (1), off-shift 0.
    const kurt = summary.find(r => String(r[0]).includes('Kurt'))
    expect(kurt).toBeTruthy()
    expect(kurt[1]).toBe(3) // Present — weekend login not counted
    expect(kurt[2]).toBe(2) // Late — minute-exact (10:05 counts)
    expect(kurt[3]).toBe(1) // Absent
    expect(kurt[4]).toBe(0) // Off-shift
    // Windowed hours: Jul1 7.42 + Jul2 6.5 (11:30→19:00 − lunch) + Jul8 3 (10→14 − lunch)
    expect(kurt[5]).toBeCloseTo(16.92, 2)
    // Aria: present Jul1,Jul2,Jul3,Jul8 (4), late 1 (Jul2 20:00), absent 0, off-shift 1 (Jul2)
    const aria = summary.find(r => String(r[0]).includes('Aria'))
    expect(aria).toBeTruthy()
    expect(aria[1]).toBe(4) // Present
    expect(aria[3]).toBe(0) // Absent
    expect(aria[4]).toBe(1) // Off-shift
    // Jul1 6 + Jul2 0 (after-shift) + Jul3 unclosed (excluded) + Jul8 5
    expect(aria[5]).toBeCloseTo(11, 2)
    // Zed: cap day (8) + overnight day (4) + Jul8 (1); late Jul2 (14:00), off-shift Jul1 (8:00)
    const zed = summary.find(r => String(r[0]).includes('Zed'))
    expect(zed).toBeTruthy()
    expect(zed[1]).toBe(3) // Present
    expect(zed[2]).toBe(1) // Late
    expect(zed[3]).toBe(1) // Absent
    expect(zed[4]).toBe(1) // Off-shift
    expect(zed[5]).toBeCloseTo(13, 2)
  })
})

describe('buildAttendanceWorkbook — live account names', () => {
  const liveFile = join(tmpdir(), `vrxe-attendance-live-test-${Date.now()}.xlsx`)
  afterAll(async () => { await unlink(liveFile).catch(() => {}) })

  it('prefers the current (live) account name over the log-row snapshot', async () => {
    const liveNames = {
      Staff:      { aria: 'Ariel Mina Lumbuan' }, // renamed since the logs were written
      Technician: {}, // kurt missing → falls back to his snapshot name
    }
    const wb = buildAttendanceWorkbook(logs, shift, new Date(2026, 6, 15), liveNames)
    await wb.xlsx.writeFile(liveFile)
    const reopened = new ExcelJS.Workbook()
    await reopened.xlsx.readFile(liveFile)
    const sheet = reopened.getWorksheet(1)

    const names = new Set()
    sheet.eachRow((row, n) => {
      if (n <= 2) return
      const v = row.values[1]
      if (typeof v === 'string' && v) names.add(v)
    })
    expect(names.has('Ariel Mina Lumbuan')).toBe(true)   // live name used
    expect(names.has('Aria Mina Lumbao')).toBe(false)    // stale snapshot gone
    expect(names.has('Kurt Tristan Rain Mina')).toBe(true) // snapshot fallback intact
  })
})
