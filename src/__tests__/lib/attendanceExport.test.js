import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'

// attendanceExport.js imports the supabase client at module level.
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn() } }))

import { buildAttendanceWorkbook } from '../../lib/attendanceExport'

const shift = { start: 10, end: 19 } // 10 AM – 7 PM
const iso = (d, h, m) => new Date(2026, 6, d, h, m).toISOString() // July = month 6

// Sample month:
//   Kurt — Jul1 two sessions on-time, Jul2 late (first login 11:30), Jul3 absent
//   Aria — Jul1 present on-time, Jul2 after-hours (20:00 → off-shift + late), Jul3 unclosed
const logs = [
  { username: 'kurt', role: 'Technician', name: 'Kurt Tristan Rain Mina', logged_in_at: iso(1, 10, 5),  logged_out_at: iso(1, 13, 0) },
  { username: 'kurt', role: 'Technician', name: 'Kurt Tristan Rain Mina', logged_in_at: iso(1, 14, 0),  logged_out_at: iso(1, 18, 30) },
  { username: 'kurt', role: 'Technician', name: 'Kurt Tristan Rain Mina', logged_in_at: iso(2, 11, 30), logged_out_at: iso(2, 19, 0) }, // late
  { username: 'aria', role: 'Staff',      name: 'Aria Mina Lumbao',        logged_in_at: iso(1, 10, 0),  logged_out_at: iso(1, 17, 0) },
  { username: 'aria', role: 'Staff',      name: 'Aria Mina Lumbao',        logged_in_at: iso(2, 20, 0),  logged_out_at: iso(2, 21, 0) }, // off-shift + late
  { username: 'aria', role: 'Staff',      name: 'Aria Mina Lumbao',        logged_in_at: iso(3, 10, 0),  logged_out_at: null }, // unclosed
]

let ws
const file = join(tmpdir(), `vrxe-attendance-test-${Date.now()}.xlsx`)

beforeAll(async () => {
  const wb = buildAttendanceWorkbook(logs, shift, new Date(2026, 6, 15))
  await wb.xlsx.writeFile(file)
  // Round-trip through disk to prove the file is valid & re-openable by Excel.
  const reopened = new ExcelJS.Workbook()
  await reopened.xlsx.readFile(file)
  ws = reopened.getWorksheet(1)
})

afterAll(async () => { await unlink(file).catch(() => {}) })

describe('buildAttendanceWorkbook — file validity & formatting', () => {
  it('produces a sheet named for the month', () => {
    expect(ws.name).toBe('July 2026')
  })

  it('freezes the title + header rows', () => {
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 2 })
  })

  it('has a bold, filled header row on row 2', () => {
    const header = ws.getRow(2)
    expect(header.values.slice(1)).toEqual(
      ['Employee', 'Username', 'Role', 'Date', 'Day', 'Status', 'Time In', 'Time Out', 'Sessions', 'Hours']
    )
    expect(header.getCell(1).font.bold).toBe(true)
    expect(header.getCell(1).fill.fgColor.argb).toBe('FF7317E8')
  })

  it('sets reasonable auto-sized column widths', () => {
    ws.columns.forEach(c => {
      expect(c.width).toBeGreaterThanOrEqual(8)
      expect(c.width).toBeLessThanOrEqual(40)
    })
  })

  it('borders data cells', () => {
    expect(ws.getRow(3).getCell(1).border?.top?.style).toBe('thin')
  })
})

describe('buildAttendanceWorkbook — derived attendance logic', () => {
  // Collect the daily detail rows (between header row 2 and the blank spacer).
  function dailyRows() {
    const rows = []
    ws.eachRow((row, n) => {
      if (n <= 2) return
      const v = row.values.slice(1)
      if (v.every(x => x == null || x === '')) return
      // Stop once we hit the Summary title (single merged cell of text).
      if (typeof v[0] === 'string' && v[0].startsWith('Summary')) { rows._sawSummary = true; return }
      if (rows._sawSummary) return
      rows.push({
        name: v[0], username: v[1], role: v[2], date: v[3], day: v[4],
        status: v[5], timeIn: v[6], timeOut: v[7], sessions: v[8], hours: v[9],
      })
    })
    return rows
  }

  it('emits one row per employee per operating day (2 employees × 3 days = 6)', () => {
    expect(dailyRows().length).toBe(6)
  })

  it('marks a first-login-after-shift-start as Late', () => {
    const kurtJul2 = dailyRows().find(r => r.username === 'kurt' && r.date === '2026-07-02')
    expect(kurtJul2.status).toBe('Late')
  })

  it('marks a day with no sessions as Absent with blank times', () => {
    const kurtJul3 = dailyRows().find(r => r.username === 'kurt' && r.date === '2026-07-03')
    expect(kurtJul3.status).toBe('Absent')
    expect(kurtJul3.timeIn === '' || kurtJul3.timeIn == null).toBe(true)
  })

  it('aggregates multiple sessions in a day (Kurt Jul 1: 2 sessions, ~7.4h)', () => {
    const kurtJul1 = dailyRows().find(r => r.username === 'kurt' && r.date === '2026-07-01')
    expect(kurtJul1.sessions).toBe(2)
    // 10:05–13:00 (175m) + 14:00–18:30 (270m) = 445m ≈ 7.42h
    expect(kurtJul1.hours).toBeCloseTo(7.42, 1)
    expect(kurtJul1.status).toBe('Present')
  })

  it('shows an em dash for an unclosed session out-time', () => {
    const ariaJul3 = dailyRows().find(r => r.username === 'aria' && r.date === '2026-07-03')
    expect(ariaJul3.timeOut).toBe('—')
  })

  it('includes a per-employee Summary section with totals', () => {
    let sawSummary = false
    const summary = []
    ws.eachRow((row) => {
      const v = row.values.slice(1)
      if (typeof v[0] === 'string' && v[0].startsWith('Summary')) { sawSummary = true; return }
      if (!sawSummary) return
      if (v[0] === 'Employee') return // summary header
      if (v[0] == null || v[0] === '') return
      summary.push(v)
    })
    expect(sawSummary).toBe(true)
    // Kurt: present Jul1+Jul2 (2), late 1 (Jul2), absent Jul3 (1), off-shift 0
    const kurt = summary.find(r => String(r[0]).includes('Kurt'))
    expect(kurt).toBeTruthy()
    expect(kurt[3]).toBe(2) // Present
    expect(kurt[4]).toBe(1) // Late
    expect(kurt[5]).toBe(1) // Absent
    expect(kurt[6]).toBe(0) // Off-shift
    // Aria: present all 3 days, late 1 (Jul2 20:00), absent 0, off-shift 1 (Jul2)
    const aria = summary.find(r => String(r[0]).includes('Aria'))
    expect(aria).toBeTruthy()
    expect(aria[3]).toBe(3) // Present
    expect(aria[5]).toBe(0) // Absent
    expect(aria[6]).toBe(1) // Off-shift
  })
})
