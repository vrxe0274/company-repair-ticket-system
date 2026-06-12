import ExcelJS from 'exceljs'
import { format } from 'date-fns'

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

/**
 * Flatten labor/parts items into a readable string for the spreadsheet.
 */
function formatLineItems(items) {
  if (!items?.length) return ''
  return items
    .filter(i => i.description || i.amount)
    .map(i => `${i.description || '—'}: ₱${Number(i.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`)
    .join('\n')
}

export async function exportTicketsToXLSX(tickets) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'VRXE Repair Services'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Tickets', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })

  // ── Column definitions ────────────────────────────────────────────
  // Columns marked blank:true are always empty — for manual staff use only
  const columns = [
    { header: 'Ticket ID',           key: 'ticket_id',           width: 22 },
    { header: 'Submitted',           key: 'submitted',            width: 18 },
    { header: 'Status',              key: 'status',               width: 20 },
    { header: 'Client Name',         key: 'client_name',          width: 22 },
    { header: 'Contact Number',      key: 'contact_number',       width: 18 },
    { header: 'Email',               key: 'email',                width: 28 },
    { header: 'Address',             key: 'address',              width: 32 },
    { header: 'Platform',            key: 'platform',             width: 16 },
    { header: 'Unit Brand',          key: 'unit_brand',           width: 16 },
    { header: 'Unit Model',          key: 'unit_model',           width: 18 },
    { header: 'Unit Type',           key: 'unit_type',            width: 14 },
    { header: 'Accessories',         key: 'accessories_included', width: 24 },
    { header: 'Issue Description',   key: 'issue_description',    width: 40 },
    { header: 'Mode of Service',     key: 'mode_of_service',      width: 16 },
    { header: 'Preferred Date',      key: 'preferred_date',       width: 16 },
    { header: 'Preferred Time',      key: 'preferred_time',       width: 15 },
    { header: 'Diagnosis Notes',     key: 'diagnosis_notes',      width: 36 },
    { header: 'Repair Notes',        key: 'repair_notes',         width: 36 },
    { header: 'Labor Fees',          key: 'labor_items',          width: 36 },
    { header: 'Parts / Materials',   key: 'parts_items',          width: 36 },
    { header: 'Discount (₱)',        key: 'discount_amount',      width: 14 },
    { header: 'Quotation Total (₱)', key: 'quotation_amount',     width: 18 },
    { header: 'Final Price (₱)',     key: 'final_price',          width: 16 },
    { header: 'Paid At',             key: 'paid_at',              width: 20 },
    { header: 'Last Updated',        key: 'last_updated',         width: 20 },
    // ── Staff-only columns (always blank in export) ──────────────────
    { header: 'Repair Commission for the Technician', key: '_commission',         width: 34, blank: true },
    { header: 'Amount of Commission Released',        key: '_commission_released', width: 30, blank: true },
    { header: 'Remarks',                              key: '_remarks',            width: 28, blank: true },
  ]

  sheet.columns = columns.map(({ blank: _blank, ...col }) => col)

  // ── Style header row ──────────────────────────────────────────────
  const headerRow = sheet.getRow(1)
  headerRow.eachCell((cell, colNum) => {
    const isBlankCol = columns[colNum - 1]?.blank
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isBlankCol ? 'FF2D2D45' : 'FF7317E8' }, // purple for data, dark for blank cols
    }
    cell.font = {
      bold: true,
      color: { argb: isBlankCol ? 'FFAAAACC' : 'FFFFFFFF' },
      size: 10,
      name: 'Calibri',
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }
    cell.border = {
      bottom: { style: 'thin', color: { argb: isBlankCol ? 'FF444466' : 'FF5500CC' } },
    }
  })
  headerRow.height = 22

  // ── Add data rows ─────────────────────────────────────────────────
  tickets.forEach((t, index) => {
    const isEven = index % 2 === 0
    const rowFill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8F5FF' }, // white / light purple tint
    }
    const blankFill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isEven ? 'FFF5F5F8' : 'FFEFEFF5' }, // slightly darker for blank cols
    }

    const row = sheet.addRow({
      ticket_id:           t.ticket_id,
      submitted:           format(new Date(t.created_at), 'yyyy-MM-dd HH:mm'),
      status:              t.status,
      client_name:         t.client_name,
      contact_number:      t.contact_number,
      email:               t.email,
      address:             t.address,
      platform:            t.platform,
      unit_brand:          t.unit_brand,
      unit_model:          t.unit_model,
      unit_type:           t.unit_type,
      accessories_included:t.accessories_included || '',
      issue_description:   t.issue_description,
      mode_of_service:     t.mode_of_service,
      preferred_date:      t.preferred_date || '',
      preferred_time:      t.preferred_time || '',
      diagnosis_notes:     t.diagnosis_notes || '',
      repair_notes:        t.repair_notes || '',
      labor_items:         formatLineItems(t.labor_items),
      parts_items:         formatLineItems(t.parts_items),
      discount_amount:     t.discount_amount > 0 ? Number(t.discount_amount) : '',
      quotation_amount:    t.quotation_amount != null ? Number(t.quotation_amount) : '',
      final_price:         t.final_price != null ? Number(t.final_price) : '',
      paid_at:             t.paid_at ? format(new Date(t.paid_at), 'yyyy-MM-dd HH:mm') : '',
      last_updated:        format(new Date(t.updated_at), 'yyyy-MM-dd HH:mm'),
      _commission:          '',
      _commission_released: '',
      _remarks:             '',
    })

    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      const isBlankCol = columns[colNum - 1]?.blank
      cell.fill  = isBlankCol ? blankFill : rowFill
      cell.font  = { size: 10, name: 'Calibri', color: isBlankCol ? { argb: 'FFAAAAAA' } : undefined }
      cell.alignment = { vertical: 'top', wrapText: true }
    })

    // Format currency cells
    const currencyCols = ['discount_amount', 'quotation_amount', 'final_price']
    currencyCols.forEach(key => {
      const cell = row.getCell(key)
      if (cell.value !== '') {
        cell.numFmt = '\u20B1#,##0.00'
        cell.alignment = { horizontal: 'right', vertical: 'top' }
      }
    })

    row.height = 18
  })

  // ── Auto-fit column widths ────────────────────────────────────────
  sheet.columns.forEach(col => {
    let maxLen = col.header?.length || 10
    col.eachCell({ includeEmpty: false }, cell => {
      const val = cell.value != null ? String(cell.value) : ''
      const firstLine = val.split('\n')[0] || ''
      if (firstLine.length > maxLen) maxLen = firstLine.length
    })
    col.width = Math.min(maxLen + 2, 60)
  })

  // ── Download ──────────────────────────────────────────────────────
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
