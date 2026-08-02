import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'

// commissionExport.js pulls in salary.js, which imports the supabase client.
vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn(), functions: { invoke: vi.fn() } } }))

import { buildCommissionWorkbook } from '../../lib/commissionExport'

const shift = { start: 10, end: 19 }
const RATE  = 704.55
const iso = (d, h, m) => new Date(2026, 6, d, h, m).toISOString() // July = month 6

const techs = [{ username: 'kurt',  name: 'Kurt Mina' }]
const staff = [{ username: 'ariel', name: 'Ariel Cruz' }]

const tickets = [
  // Kurt: 2 000 labor × 20% = 400. Ariel: (2 000 − 400) × 10% = 160.
  {
    id: 't1', ticket_id: 'VR-2607-001', status: 'Paid', created_at: iso(1, 12, 0),
    client_name: 'Juan Dela Cruz', unit_brand: 'Meta', unit_model: 'Quest 3',
    labor_items: [{ amount: 2000 }],
    technician_usernames: ['kurt'], assigned_staff: ['ariel'],
    tech_commission_pct: 0.2, staff_commission_pct: 0.1,
  },
  // Percentages not inputted yet — must never read as ₱0.00.
  {
    id: 't2', ticket_id: 'VR-2607-002', status: 'Paid', created_at: iso(2, 12, 0),
    client_name: 'Maria Santos', unit_brand: 'Pico', unit_model: '4',
    labor_items: [{ amount: 1000 }],
    technician_usernames: ['kurt'], assigned_staff: [],
    tech_commission_pct: null, staff_commission_pct: null,
  },
  // Different month — must be excluded.
  {
    id: 't3', ticket_id: 'VR-2606-009', status: 'Paid', created_at: new Date(2026, 5, 10, 12).toISOString(),
    client_name: 'Old Job', unit_brand: 'Meta', unit_model: 'Quest 2',
    labor_items: [{ amount: 5000 }],
    technician_usernames: ['kurt'], assigned_staff: [],
    tech_commission_pct: 0.2, staff_commission_pct: null,
  },
  // Not commissionable — Admin marked it N/A.
  {
    id: 't4', ticket_id: 'VR-2607-003', status: 'Paid', created_at: iso(3, 12, 0),
    client_name: 'Freebie', unit_brand: 'Meta', unit_model: 'Quest 3',
    labor_items: [{ amount: 900 }], commission_not_applicable: true,
    technician_usernames: ['kurt'], assigned_staff: [],
    tech_commission_pct: 0.2, staff_commission_pct: null,
  },
]

const logs = [
  // Kurt Jul 1: on time, full shift → full daily rate.
  { username: 'kurt', role: 'Technician', name: 'Kurt Mina', logged_in_at: iso(1, 10, 0), logged_out_at: iso(1, 19, 0) },
  // Kurt Jul 2: 30 late + 45 undertime → 594.46 (the worked example).
  { username: 'kurt', role: 'Technician', name: 'Kurt Mina', logged_in_at: iso(2, 10, 30), logged_out_at: iso(2, 18, 15) },
  // Kurt Jul 3: never clocked out.
  { username: 'kurt', role: 'Technician', name: 'Kurt Mina', logged_in_at: iso(3, 10, 0), logged_out_at: null },
  // Ariel Jul 1, but on a zero daily rate — commission only.
  { username: 'ariel', role: 'Staff', name: 'Ariel Cruz', logged_in_at: iso(1, 10, 0), logged_out_at: iso(1, 19, 0) },
  // June — excluded by the month filter.
  { username: 'kurt', role: 'Technician', name: 'Kurt Mina', logged_in_at: new Date(2026, 5, 10, 10).toISOString(), logged_out_at: new Date(2026, 5, 10, 19).toISOString() },
]

const file = join(tmpdir(), `vrxe-commission-test-${Date.now()}.xlsx`)
let payroll, commission, regular

beforeAll(async () => {
  const wb = buildCommissionWorkbook({
    tickets, logs, techs, staff,
    rates: { kurt: RATE, ariel: 0 },
    shift,
    monthDate: new Date(2026, 6, 15),
  })
  await wb.xlsx.writeFile(file)
  // Round-trip through disk to prove the file is valid & re-openable by Excel.
  const reopened = new ExcelJS.Workbook()
  await reopened.xlsx.readFile(file)
  payroll    = reopened.getWorksheet('Payroll')
  commission = reopened.getWorksheet('Commission')
  regular    = reopened.getWorksheet('Regular Pay')
})

afterAll(async () => { await unlink(file).catch(() => {}) })

/** Body rows of a sheet as plain arrays (skips title + header). */
function bodyRows(sheet) {
  const out = []
  sheet.eachRow((row, n) => { if (n > 2) out.push(row.values.slice(1)) })
  return out
}

/**
 * Detail sheets are written as per-employee blocks with the name in a single
 * merged column-A cell. ExcelJS reports the master's value on every merged
 * slave, so rows are grouped by the merge's master address rather than by
 * "which row carries a name". `lines`/`subtotal` are column B onward.
 */
function blocks(sheet) {
  const byBlock = new Map()
  sheet.eachRow((row, n) => {
    if (n <= 2) return
    const nameCell = sheet.getCell(n, 1)
    if (typeof nameCell.value !== 'string' || !nameCell.value.trim()) return // spacer
    const key = nameCell.master?.address ?? nameCell.address
    if (!byBlock.has(key)) byBlock.set(key, { name: nameCell.value, lines: [], subtotal: null })
    const rest = row.values.slice(2)
    // The block's last row is its subtotal — "2 jobs …" / "2 days paid …".
    if (rest.some(v => typeof v === 'string' && /^\d+ (job|day)/.test(v))) {
      byBlock.get(key).subtotal = rest
    } else {
      byBlock.get(key).lines.push(rest)
    }
  })
  return [...byBlock.values()]
}

const blockFor = (sheet, namePart) => blocks(sheet).find(b => b.name.includes(namePart))

describe('buildCommissionWorkbook — structure', () => {
  it('writes the three payroll worksheets', () => {
    expect(payroll).toBeTruthy()
    expect(commission).toBeTruthy()
    expect(regular).toBeTruthy()
  })

  it('names each sheet for the exported month', () => {
    expect(String(payroll.getCell(1, 1).value)).toBe('Payroll — July 2026')
    expect(String(commission.getCell(1, 1).value)).toContain('July 2026')
    expect(String(regular.getCell(1, 1).value)).toContain('July 2026')
  })

  it('reports the three pay columns separately on the Payroll sheet', () => {
    expect(payroll.getRow(2).values.slice(1)).toEqual([
      'Employee', 'Role', 'Jobs', 'Commission Pay',
      'Daily Rate', 'Days Worked', 'Late Mins', 'Undertime Mins', 'Regular Pay',
      'Total Pay',
    ])
  })
})

describe('buildCommissionWorkbook — Payroll summary', () => {
  const rowFor = name => bodyRows(payroll).find(r => String(r[0]).includes(name))

  it('reports Total Pay as Commission Pay + Regular Pay', () => {
    const kurt = rowFor('Kurt')
    // Commission: 400 (t1) + nothing yet for t2. Regular: 704.55 + 594.46.
    expect(kurt[3]).toBeCloseTo(400, 2)
    expect(kurt[8]).toBeCloseTo(1299.01, 2)
    expect(kurt[9]).toBeCloseTo(1699.01, 2)
    expect(kurt[9]).toBeCloseTo(kurt[3] + kurt[8], 2)
  })

  it('keeps a commission-only employee on a zero daily rate at zero regular pay', () => {
    const ariel = rowFor('Ariel')
    expect(ariel[4]).toBe(0)             // daily rate
    expect(ariel[5]).toBe(1)             // still credited the day worked
    expect(ariel[8]).toBe(0)             // regular pay
    expect(ariel[9]).toBeCloseTo(160, 2) // commission only
  })

  it('counts only days that produced a payable figure', () => {
    // Kurt worked 3 days in July but never clocked out on the 3rd.
    expect(rowFor('Kurt')[5]).toBe(2)
  })

  it('totals Total Pay alone, matching the page', () => {
    const rows = bodyRows(payroll)
    const total = rows.find(r => String(r[0]).includes('TOTAL PAY'))
    expect(total).toBeTruthy()
    expect(total[total.length - 1]).toBeCloseTo(1859.01, 2) // 1699.01 + 160
  })
})

describe('buildCommissionWorkbook — Commission sheet', () => {
  it('names each employee once, in a merged block header', () => {
    expect(commission.getCell(3, 1).isMerged).toBe(true)
    // Kurt's two job rows + subtotal all share the one name cell.
    expect(commission.getCell(4, 1).master.address).toBe('A3')
    expect(blocks(commission).map(b => b.name.split('\n')[0])).toEqual(['Kurt Mina', 'Ariel Cruz'])
  })

  it('carries the role on the block header rather than on every line', () => {
    expect(blockFor(commission, 'Kurt').name).toContain('Technician')
    expect(blockFor(commission, 'Ariel').name).toContain('Staff')
    // No line repeats it.
    expect(blockFor(commission, 'Kurt').lines.flat()).not.toContain('Technician')
  })

  it('writes one line per paid job under its employee', () => {
    expect(blockFor(commission, 'Kurt').lines).toHaveLength(2)
    expect(blockFor(commission, 'Ariel').lines).toHaveLength(1)
  })

  it('excludes other months and non-commissionable repairs', () => {
    const ids = blocks(commission).flatMap(b => b.lines.map(l => l[0]))
    expect(ids).toContain('VR-2607-001')
    expect(ids).not.toContain('VR-2606-009') // June
    expect(ids).not.toContain('VR-2607-003') // marked not applicable
  })

  it('combines client and unit into one column', () => {
    const line = blockFor(commission, 'Kurt').lines.find(l => l[0] === 'VR-2607-001')
    expect(line[1]).toBe('Juan Dela Cruz — Meta Quest 3')
  })

  it('writes a not-yet-inputted cut as text, never as 0.00', () => {
    const line = blockFor(commission, 'Kurt').lines.find(l => l[0] === 'VR-2607-002')
    expect(line[4]).toBe('Not yet inputted') // rate
    expect(line[5]).toBe('Not yet inputted') // cut
  })

  it('stores the rate as a real percentage so Excel can recompute the cut', () => {
    const line = blockFor(commission, 'Kurt').lines.find(l => l[0] === 'VR-2607-001')
    expect(line[4]).toBeCloseTo(0.2, 5)
    expect(line[5]).toBeCloseTo(400, 2)
  })

  it('closes each block with a subtotal that flags outstanding input', () => {
    const kurt = blockFor(commission, 'Kurt')
    expect(kurt.subtotal[0]).toBe('2 jobs · 1 not yet inputted')
    expect(kurt.subtotal.at(-3)).toBeCloseTo(3000, 2) // labor fee subtotal
    expect(kurt.subtotal.at(-1)).toBeCloseTo(400, 2)  // commission subtotal
  })
})

describe('buildCommissionWorkbook — Regular Pay sheet', () => {
  it('names each employee once and carries their daily rate on the block header', () => {
    expect(regular.getCell(3, 1).isMerged).toBe(true)
    expect(blockFor(regular, 'Kurt').name).toContain('704.55/day')
    expect(blockFor(regular, 'Ariel').name).toContain('0.00/day')
  })

  it('writes one line per working day, oldest first', () => {
    const kurt = blockFor(regular, 'Kurt')
    expect(kurt.lines.map(l => l[0])).toEqual(['2026-07-01', '2026-07-02', '2026-07-03'])
  })

  it('shows the deductions behind the worked example', () => {
    const jul2 = blockFor(regular, 'Kurt').lines.find(l => l[0] === '2026-07-02')
    expect(jul2[4]).toBe(30)              // late mins
    expect(jul2[5]).toBeCloseTo(44.03, 2) // late deduction
    expect(jul2[6]).toBe(45)              // undertime mins
    expect(jul2[7]).toBeCloseTo(66.05, 2)
    expect(jul2[8]).toBeCloseTo(594.46, 2)
  })

  it('marks an unclosed day as text instead of paying it out as zero', () => {
    const jul3 = blockFor(regular, 'Kurt').lines.find(l => l[0] === '2026-07-03')
    expect(jul3[3]).toBe('Not clocked out') // time out
    expect(jul3.at(-1)).toBe('Not clocked out')
  })

  it('subtotals the block and separates paid days from unclosed ones', () => {
    const kurt = blockFor(regular, 'Kurt')
    expect(kurt.subtotal[0]).toBe('2 days paid · 1 not clocked out')
    expect(kurt.subtotal.at(-1)).toBeCloseTo(1299.01, 2)
  })

  it('excludes attendance from other months', () => {
    const dates = blocks(regular).flatMap(b => b.lines.map(l => String(l[0])))
    expect(dates.some(d => d.startsWith('2026-06'))).toBe(false)
  })
})

describe('buildCommissionWorkbook — pay period', () => {
  const bookedInJune = {
    id: 't5', ticket_id: 'VR-2606-020', status: 'Paid',
    created_at: new Date(2026, 5, 28, 12).toISOString(), // booked June 28
    paid_at:    iso(5, 12, 0),                           // collected July 5
    client_name: 'Late Payer', unit_brand: 'Meta', unit_model: 'Quest 3',
    labor_items: [{ amount: 1000 }],
    technician_usernames: ['kurt'], assigned_staff: [],
    tech_commission_pct: 0.2, staff_commission_pct: null,
  }
  const build = monthDate => buildCommissionWorkbook({
    tickets: [bookedInJune], logs: [], techs, staff, rates: { kurt: RATE }, shift, monthDate,
  })
  const ids = wb => blocks(wb.getWorksheet('Commission')).flatMap(b => b.lines.map(l => l[0]))

  it('credits a repair to the month it was PAID, not the month it was booked', () => {
    expect(ids(build(new Date(2026, 6, 15)))).toContain('VR-2606-020') // July
    expect(ids(build(new Date(2026, 5, 15)))).not.toContain('VR-2606-020') // June
  })

  it('falls back to created_at so a Paid ticket with no stamp still lands somewhere', () => {
    const unstamped = { ...bookedInJune, paid_at: null }
    const wb = buildCommissionWorkbook({
      tickets: [unstamped], logs: [], techs, staff, rates: {}, shift,
      monthDate: new Date(2026, 5, 15),
    })
    expect(blocks(wb.getWorksheet('Commission')).flatMap(b => b.lines.map(l => l[0])))
      .toContain('VR-2606-020')
  })

  it('dates each commission line by when it was paid', () => {
    const line = blockFor(build(new Date(2026, 6, 15)).getWorksheet('Commission'), 'Kurt').lines[0]
    expect(line[2]).toBe('Jul 5, 2026')
  })
})

describe('buildCommissionWorkbook — provisional totals', () => {
  it('flags Total Pay, not just Commission Pay, while an input is outstanding', () => {
    // Kurt's t2 has no percentage yet and Jul 3 never closed, so his Total Pay
    // can only be too low — the cell an employer reads as "what I owe".
    const kurtRow = bodyRows(payroll).findIndex(r => String(r[0]).includes('Kurt')) + 3
    const totalCell = payroll.getCell(kurtRow, 10)
    expect(totalCell.font.color.argb).toBe('FFB26A00')
    expect(String(totalCell.note)).toContain('awaiting a commission percentage')
    expect(String(totalCell.note)).toContain('never clocked out')
  })

  it('carries the flag to the bottom line', () => {
    const totalRow = bodyRows(payroll).find(r => String(r[0]).includes('TOTAL PAY'))
    expect(String(totalRow[0])).toContain('provisional')
  })
})

describe('buildCommissionWorkbook — empty month', () => {
  it('still produces a valid workbook with headers only', () => {
    const wb = buildCommissionWorkbook({
      tickets, logs, techs, staff, rates: {}, shift,
      monthDate: new Date(2026, 0, 15), // January — no data
    })
    const sheet = wb.getWorksheet('Commission')
    expect(sheet.getRow(2).values.slice(1)[0]).toBe('Employee')
    expect(blocks(sheet)).toHaveLength(0) // no employee blocks at all
    // Every employee still appears on the summary, at zero.
    const summaryRows = bodyRows(wb.getWorksheet('Payroll'))
    expect(summaryRows.find(r => String(r[0]).includes('Kurt'))[9]).toBe(0)
  })
})
