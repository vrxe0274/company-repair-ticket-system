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
//   Week 1 (Jun29–Jul3): Kurt — Jul1 two sessions on-time, Jul2 late (11:30), Jul3 absent,
//                                Jul4 (Sat) login — must be EXCLUDED from the report entirely
//                        Aria — Jul1 present on-time, Jul2 after-hours (off-shift + late), Jul3 unclosed
//   Week 2 (Jul6–Jul10): Kurt & Aria both present Jul8, so weekly grouping has 2 bands to check
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
]

let ws
let summarySheet
const file = join(tmpdir(), `vrxe-attendance-test-${Date.now()}.xlsx`)

beforeAll(async () => {
  const wb = buildAttendanceWorkbook(logs, shift, new Date(2026, 6, 15))
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
      ['Employee', 'Date', 'Day', 'Status', 'Time In', 'Time Out', 'Hours']
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
  // back blank — carry the last seen name forward.
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
        status: v[3], timeIn: v[4], timeOut: v[5], hours: v[6],
      })
    })
    return rows
  }

  it('emits one row per employee per weekday operating day (2 employees × 4 days = 8)', () => {
    expect(dailyRows().length).toBe(8)
  })

  it('completely removes weekend rows — a Saturday login produces no row at all', () => {
    const rows = dailyRows()
    expect(rows.some(r => r.date === '2026-07-04')).toBe(false) // Kurt's Sat login gone
    expect(rows.every(r => !['Sat', 'Sun'].includes(r.day))).toBe(true)
  })

  it('marks a first-login-after-shift-start as Late', () => {
    const kurtJul2 = dailyRows().find(r => String(r.name).includes('Kurt') && r.date === '2026-07-02')
    expect(kurtJul2.status).toBe('Late')
  })

  it('marks a day with no sessions as Absent with blank times', () => {
    const kurtJul3 = dailyRows().find(r => String(r.name).includes('Kurt') && r.date === '2026-07-03')
    expect(kurtJul3.status).toBe('Absent')
    expect(kurtJul3.timeIn === '' || kurtJul3.timeIn == null).toBe(true)
  })

  it('aggregates multiple sessions in a day (Kurt Jul 1: 2 sessions, ~7.4h)', () => {
    const kurtJul1 = dailyRows().find(r => String(r.name).includes('Kurt') && r.date === '2026-07-01')
    // 10:05–13:00 (175m) + 14:00–18:30 (270m) = 445m ≈ 7.42h
    expect(kurtJul1.hours).toBeCloseTo(7.42, 1)
    expect(kurtJul1.status).toBe('Present')
  })

  it('shows an em dash for an unclosed session out-time', () => {
    const ariaJul3 = dailyRows().find(r => String(r.name).includes('Aria') && r.date === '2026-07-03')
    expect(ariaJul3.timeOut).toBe('—')
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
    // present credit — late 1 (Jul2), absent Jul3 (1), off-shift 0.
    const kurt = summary.find(r => String(r[0]).includes('Kurt'))
    expect(kurt).toBeTruthy()
    expect(kurt[1]).toBe(3) // Present — weekend login not counted
    expect(kurt[2]).toBe(1) // Late
    expect(kurt[3]).toBe(1) // Absent
    expect(kurt[4]).toBe(0) // Off-shift
    // Aria: present Jul1,Jul2,Jul3,Jul8 (4), late 1 (Jul2 20:00), absent 0, off-shift 1 (Jul2)
    const aria = summary.find(r => String(r[0]).includes('Aria'))
    expect(aria).toBeTruthy()
    expect(aria[1]).toBe(4) // Present
    expect(aria[3]).toBe(0) // Absent
    expect(aria[4]).toBe(1) // Off-shift
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
