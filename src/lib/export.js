import ExcelJS from 'exceljs'
import { format } from 'date-fns'
import { laborFee, technicianCommission, staffCommission } from './commission'
import { supabase } from './supabase'

/**
 * Build the export file name from the month(s)/year covered by the data:
 *   "VRXE_Report_June_2026.xlsx"                — single month
 *   "VRXE_Report_May-June_2026.xlsx"            — multi-month, same year
 *   "VRXE_Report_December_2025-February_2026.xlsx" — range spans years
 * Falls back to the current month when there are no dated rows.
 */
function reportFileName(tickets) {
  const dates = tickets
    .map(t => new Date(t.created_at))
    .filter(d => !isNaN(d))
  if (!dates.length) return `VRXE_Report_${format(new Date(), 'MMMM_yyyy')}.xlsx`

  const min = new Date(Math.min(...dates))
  const max = new Date(Math.max(...dates))
  const sameYear  = min.getFullYear() === max.getFullYear()
  const sameMonth = sameYear && min.getMonth() === max.getMonth()

  if (sameMonth) return `VRXE_Report_${format(min, 'MMMM_yyyy')}.xlsx`
  if (sameYear)  return `VRXE_Report_${format(min, 'MMMM')}-${format(max, 'MMMM_yyyy')}.xlsx`
  return `VRXE_Report_${format(min, 'MMMM_yyyy')}-${format(max, 'MMMM_yyyy')}.xlsx`
}

function sumLineItems(items) {
  if (!items?.length) return ''
  const total = items.reduce((sum, i) => sum + Number(i.amount || 0), 0)
  return total > 0 ? total : ''
}

// ── Header group colors (ARGB) ────────────────────────────────────────────────
const GROUP_COLORS = {
  ticket_id:            { bg: 'FFFF6F00', fg: 'FFFFFFFF' }, // amber  — Ticket ID
  submitted:            { bg: 'FF1565C0', fg: 'FFFFFFFF' }, // blue   — Ticket Meta
  status:               { bg: 'FF1565C0', fg: 'FFFFFFFF' },
  client_name:          { bg: 'FF2E7D32', fg: 'FFFFFFFF' }, // green  — Client Info
  contact_number:       { bg: 'FF2E7D32', fg: 'FFFFFFFF' },
  email:                { bg: 'FF2E7D32', fg: 'FFFFFFFF' },
  address:              { bg: 'FF2E7D32', fg: 'FFFFFFFF' },
  platform:             { bg: 'FF00838F', fg: 'FFFFFFFF' }, // teal   — Platform
  unit_brand:           { bg: 'FFE65100', fg: 'FFFFFFFF' }, // orange — Unit Info
  unit_model:           { bg: 'FFE65100', fg: 'FFFFFFFF' },
  unit_type:            { bg: 'FFE65100', fg: 'FFFFFFFF' },
  accessories_included: { bg: 'FFE65100', fg: 'FFFFFFFF' },
  issue_description:    { bg: 'FF6A1B9A', fg: 'FFFFFFFF' }, // purple — Service Request
  mode_of_service:      { bg: 'FF6A1B9A', fg: 'FFFFFFFF' },
  preferred_date:       { bg: 'FF6A1B9A', fg: 'FFFFFFFF' },
  preferred_time:       { bg: 'FF6A1B9A', fg: 'FFFFFFFF' },
  diagnosis_notes:      { bg: 'FF37474F', fg: 'FFFFFFFF' }, // slate  — Technical
  repair_notes:         { bg: 'FF37474F', fg: 'FFFFFFFF' },
  labor_items:          { bg: 'FF1B5E20', fg: 'FFFFFFFF' }, // emerald — Financial
  parts_items:          { bg: 'FF1B5E20', fg: 'FFFFFFFF' },
  discount_amount:      { bg: 'FF1B5E20', fg: 'FFFFFFFF' },
  quotation_amount:     { bg: 'FF1B5E20', fg: 'FFFFFFFF' },
  final_price:          { bg: 'FF1B5E20', fg: 'FFFFFFFF' },
  paid_at:              { bg: 'FF1B5E20', fg: 'FFFFFFFF' },
  last_updated:         { bg: 'FF4527A0', fg: 'FFFFFFFF' }, // indigo — Timestamps
}

// ── Static column definitions ─────────────────────────────────────────────────
const STATIC_COLUMNS = [
  { header: 'Ticket ID',           key: 'ticket_id',           width: 15 },
  { header: 'Submitted',           key: 'submitted',            width: 15 },
  { header: 'Status',              key: 'status',               width: 15 },
  { header: 'Client Name',         key: 'client_name',          width: 15 },
  { header: 'Contact Number',      key: 'contact_number',       width: 15 },
  { header: 'Email',               key: 'email',                width: 15 },
  { header: 'Address',             key: 'address',              width: 15 },
  { header: 'Platform',            key: 'platform',             width: 15 },
  { header: 'Unit Brand',          key: 'unit_brand',           width: 15 },
  { header: 'Unit Model',          key: 'unit_model',           width: 15 },
  { header: 'Unit Type',           key: 'unit_type',            width: 15 },
  { header: 'Accessories',         key: 'accessories_included', width: 15 },
  { header: 'Issue Description',   key: 'issue_description',    width: 15 },
  { header: 'Mode of Service',     key: 'mode_of_service',      width: 15 },
  { header: 'Appointment Date',    key: 'preferred_date',       width: 15 },
  { header: 'Appointment Time',    key: 'preferred_time',       width: 15 },
  { header: 'Diagnosis Notes',     key: 'diagnosis_notes',      width: 15 },
  { header: 'Repair Notes',        key: 'repair_notes',         width: 15 },
  { header: 'Labor Fees',          key: 'labor_items',          width: 15 },
  { header: 'Parts / Materials',   key: 'parts_items',          width: 15 },
  { header: 'Discount (₱)',        key: 'discount_amount',      width: 15 },
  { header: 'Quotation Total (₱)', key: 'quotation_amount',     width: 15 },
  { header: 'Final Price (₱)',     key: 'final_price',          width: 15 },
  { header: 'Paid At',             key: 'paid_at',              width: 15 },
  { header: 'Last Updated',        key: 'last_updated',         width: 15 },
]

// Commission column header color (gold)
const COMMISSION_COLOR = { bg: 'FF7B5E08', fg: 'FFFFFFFF' }

/**
 * Build commission column definitions from the full staff account list.
 * One column per staff member (every staff earns commission on every repair)
 * plus one generic technician commission column.
 *
 * @param {Array<{username: string, name: string}>} staffAccounts
 */
function buildCommissionColumns(staffAccounts) {
  const techCol = {
    header: 'Technician Commission',
    key:    '_tech_commission',
    width:  24,
    isCommission: true,
  }

  const staffCols = staffAccounts.map(({ username, name }) => ({
    header: `Staff ${name} Commission`,
    key:    `_staff_${username}`,
    width:  24,
    isCommission: true,
    staffName: name,
  }))

  // Fallback: if no staff accounts exist yet, keep a generic staff column
  if (staffCols.length === 0) {
    staffCols.push({
      header: 'Staff Commission',
      key:    '_staff_generic',
      width:  24,
      isCommission: true,
      staffName: null,
    })
  }

  return [techCol, ...staffCols]
}

/** Populate one worksheet with headers + styled data rows for the given tickets. */
function buildSheet(sheet, tickets, commCols) {
  const allCols = [...STATIC_COLUMNS, ...commCols]

  sheet.columns = allCols.map(({ isCommission: _c, staffName: _s, ...col }) => col)

  // ── Style header row ──────────────────────────────────────────────────────
  const headerRow = sheet.getRow(1)
  headerRow.eachCell((cell, colNum) => {
    const col        = allCols[colNum - 1]
    const isCommCol  = col?.isCommission
    const groupColor = GROUP_COLORS[col?.key]
    const bgArgb = isCommCol ? COMMISSION_COLOR.bg : (groupColor?.bg ?? 'FF7317E8')
    const fgArgb = isCommCol ? COMMISSION_COLOR.fg : (groupColor?.fg ?? 'FFFFFFFF')
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } }
    cell.font = { bold: true, color: { argb: fgArgb }, size: 10, name: 'Calibri' }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF000000' } } }
  })
  headerRow.height = 22

  // ── Add data rows ─────────────────────────────────────────────────────────
  tickets.forEach((t, index) => {
    const isEven  = index % 2 === 0
    const rowFill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8F5FF' },
    }
    const commFill = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: isEven ? 'FFFFF8E1' : 'FFFFF3CC' },
    }

    const fee        = laborFee(t)
    const commValues = {}
    commCols.forEach(col => {
      if (col.key === '_tech_commission') {
        commValues[col.key] = fee > 0 ? technicianCommission(fee) : ''
      } else {
        // Every staff member earns commission on every repair
        commValues[col.key] = fee > 0 ? staffCommission(fee) : ''
      }
    })

    const row = sheet.addRow({
      ticket_id:            t.ticket_id,
      submitted:            format(new Date(t.created_at), 'yyyy-MM-dd HH:mm'),
      status:               t.status,
      client_name:          t.client_name,
      contact_number:       t.contact_number,
      email:                t.email,
      address:              t.address,
      platform:             t.platform,
      unit_brand:           t.unit_brand,
      unit_model:           t.unit_model,
      unit_type:            t.unit_type,
      accessories_included: t.accessories_included || '',
      issue_description:    t.issue_description,
      mode_of_service:      t.mode_of_service,
      preferred_date:       t.preferred_date || '',
      preferred_time:       t.preferred_time || '',
      diagnosis_notes:      t.diagnosis_notes || '',
      repair_notes:         t.repair_notes || '',
      labor_items:          sumLineItems(t.labor_items),
      parts_items:          sumLineItems(t.parts_items),
      discount_amount:      t.discount_amount > 0 ? Number(t.discount_amount) : '',
      quotation_amount:     t.quotation_amount != null ? Number(t.quotation_amount) : '',
      final_price:          t.final_price != null ? Number(t.final_price) : '',
      paid_at:              t.paid_at ? format(new Date(t.paid_at), 'yyyy-MM-dd HH:mm') : '',
      last_updated:         format(new Date(t.updated_at), 'yyyy-MM-dd HH:mm'),
      ...commValues,
    })

    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.fill      = allCols[colNum - 1]?.isCommission ? commFill : rowFill
      cell.font      = { size: 10, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    })

    const currencyCols = ['labor_items', 'parts_items', 'discount_amount', 'quotation_amount', 'final_price']
    currencyCols.forEach(key => {
      const cell = row.getCell(key)
      if (cell.value !== '') {
        cell.numFmt    = '₱#,##0.00'
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      }
    })

    commCols.forEach(col => {
      const cell = row.getCell(col.key)
      if (cell.value !== '') {
        cell.numFmt    = '₱#,##0.00'
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      }
    })

    row.height = 50
  })
}

export async function exportTicketsToXLSX(tickets) {
  // Fetch all staff accounts so every staff member gets their own commission column
  let staffAccounts = []
  try {
    const { data } = await supabase.functions.invoke('staff-manage', {
      body: { action: 'list-names' },
    })
    if (data?.ok) staffAccounts = data.staff ?? []
  } catch {
    // Non-fatal — falls back to a generic staff column
  }

  const commCols = buildCommissionColumns(staffAccounts)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'VRXE Repair Services'
  workbook.created = new Date()

  // ── Group tickets by calendar month, sorted oldest → newest ──────────────
  const byMonth = new Map()
  tickets.forEach(t => {
    const d   = new Date(t.created_at)
    const key = isNaN(d) ? 'Unknown' : format(d, 'MMMM yyyy')
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key).push(t)
  })

  const sorted = [...byMonth.entries()].sort(([a], [b]) => {
    if (a === 'Unknown') return 1
    if (b === 'Unknown') return -1
    return new Date(`1 ${a}`) - new Date(`1 ${b}`)
  })

  for (const [monthName, monthTickets] of sorted) {
    const sheet = workbook.addWorksheet(monthName, {
      views: [{ state: 'frozen', ySplit: 1 }],
    })
    buildSheet(sheet, monthTickets, commCols)
  }

  // ── Download ──────────────────────────────────────────────────────────────
  const buffer = await workbook.xlsx.writeBuffer()
  const blob   = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url    = URL.createObjectURL(blob)
  const link   = document.createElement('a')
  link.href     = url
  link.download = reportFileName(tickets)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
