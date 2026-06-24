import jsPDF from 'jspdf'
import { format } from 'date-fns'

// ─────────────────────────────────────────────────────────────────────────────
// Brand palette (RGB)
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  brandPurple:  [115, 23, 232],
  brandMagenta: [212, 0,  127],
  dark:         [13,  13, 15],
  darkMid:      [30,  30, 40],
  gray:         [100, 100, 110],
  lightGray:    [220, 220, 228],
  veryLight:    [248, 246, 255],
  white:        [255, 255, 255],
  green:        [22,  163, 74],
  red:          [220, 38,  38],
  black:        [0,   0,   0],
}

const peso = n =>
  `P ${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// ─────────────────────────────────────────────────────────────────────────────
// Helper – set RGB fill / stroke / text color from array
// ─────────────────────────────────────────────────────────────────────────────
function fill(doc, rgb)   { doc.setFillColor(rgb[0], rgb[1], rgb[2]) }
function stroke(doc, rgb) { doc.setDrawColor(rgb[0], rgb[1], rgb[2]) }
function text(doc, rgb)   { doc.setTextColor(rgb[0], rgb[1], rgb[2]) }

// ─────────────────────────────────────────────────────────────────────────────
// Gradient bar simulation via thin filled rects
// ─────────────────────────────────────────────────────────────────────────────
function gradientBar(doc, x, y, w, h, colorA, colorB, steps = 60) {
  for (let i = 0; i < steps; i++) {
    const t  = i / (steps - 1)
    const r  = Math.round(colorA[0] + (colorB[0] - colorA[0]) * t)
    const g  = Math.round(colorA[1] + (colorB[1] - colorA[1]) * t)
    const b  = Math.round(colorA[2] + (colorB[2] - colorA[2]) * t)
    const sw = w / steps
    doc.setFillColor(r, g, b)
    doc.rect(x + i * sw, y, sw + 0.5, h, 'F') // +0.5 prevents thin white gaps
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Horizontal rule
// ─────────────────────────────────────────────────────────────────────────────
function hr(doc, y, x1, x2, rgb = C.lightGray, lw = 0.3) {
  stroke(doc, rgb)
  doc.setLineWidth(lw)
  doc.line(x1, y, x2, y)
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header chip
// ─────────────────────────────────────────────────────────────────────────────
function sectionHeader(doc, label, y, margin, pageWidth) {
  fill(doc, C.veryLight)
  doc.rect(margin, y, pageWidth - margin * 2, 7, 'F')
  // left accent line
  gradientBar(doc, margin, y, 3, 7, C.brandPurple, C.brandMagenta)
  text(doc, C.brandPurple)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text(label.toUpperCase(), margin + 6, y + 4.8)
  return y + 11
}

// ─────────────────────────────────────────────────────────────────────────────
// Two-column info row
// ─────────────────────────────────────────────────────────────────────────────
function infoRow(doc, label, value, y, lx, vx) {
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  text(doc, C.gray)
  doc.text(label, lx, y)
  doc.setFont('helvetica', 'bold')
  text(doc, C.darkMid)
  const val = value ? String(value) : '—'
  doc.text(val, vx, y)
  return y + 6
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────
export function downloadTicketPDF(ticket) {
  const doc       = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const PW        = doc.internal.pageSize.getWidth()   // 210
  const PH        = doc.internal.pageSize.getHeight()  // 297
  const M         = 16   // margin
  const CW        = PW - M * 2  // content width = 178

  // ── HEADER ─────────────────────────────────────────────────────────────────
  const headerH = 44

  // Dark background
  fill(doc, C.dark)
  doc.rect(0, 0, PW, headerH, 'F')

  // Bottom gradient accent bar (4 mm)
  gradientBar(doc, 0, headerH - 4, PW, 4, C.brandPurple, C.brandMagenta)

  // Company name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  text(doc, C.white)
  doc.text('VRXE', M, 17)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  text(doc, [180, 180, 200])
  doc.text('REPAIR SERVICES', M, 24)
  doc.text('vrxe-tickets.vercel.app', M, 30)

  // Right side — ticket info
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  text(doc, C.white)
  doc.text(ticket.ticket_id, PW - M, 14, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  text(doc, [180, 180, 200])
  doc.text(`Submitted: ${format(new Date(ticket.created_at), 'MMM d, yyyy')}`, PW - M, 21, { align: 'right' })
  doc.text(`Updated:   ${format(new Date(ticket.updated_at), 'MMM d, yyyy')}`, PW - M, 27, { align: 'right' })

  // Status pill (right-aligned)
  const statusLabel = ticket.status.toUpperCase()
  const statusW = doc.getTextWidth(statusLabel) + 8
  const pillX   = PW - M - statusW
  const pillY   = 32

  const statusColor = ticket.status === 'Paid' ? C.green : ticket.status === 'Denied' ? C.red : C.brandPurple
  fill(doc, statusColor)
  doc.roundedRect(pillX, pillY, statusW, 6, 1.5, 1.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  text(doc, C.white)
  doc.text(statusLabel, pillX + statusW / 2, pillY + 4.1, { align: 'center' })

  // ── BODY cursor ────────────────────────────────────────────────────────────
  let y = headerH + 10

  const lx = M       // label x
  const vx = M + 38  // value x (within info rows)

  // ── CLIENT INFORMATION ─────────────────────────────────────────────────────
  y = sectionHeader(doc, 'Client Information', y, M, PW)
  y = infoRow(doc, 'Full Name',  ticket.client_name,    y, lx, vx)
  y = infoRow(doc, 'Contact',    ticket.contact_number, y, lx, vx)
  y = infoRow(doc, 'Email',      ticket.email,          y, lx, vx)
  y = infoRow(doc, 'Address',    ticket.address,        y, lx, vx)
  y = infoRow(doc, 'Platform',   ticket.platform,       y, lx, vx)
  y += 5

  // ── UNIT INFORMATION ───────────────────────────────────────────────────────
  y = sectionHeader(doc, 'Unit Information', y, M, PW)
  // 2-up grid: left column + right column
  const col2x = M + CW / 2 + 4
  const col2lx = col2x
  const col2vx = col2x + 22

  const unitRows = [
    ['Brand',       ticket.unit_brand,   'Type',            ticket.unit_type],
    ['Model',       ticket.unit_model,   'Mode of Service', ticket.mode_of_service],
    ['Accessories', ticket.accessories_included || 'None', 'Appointment Date', ticket.preferred_date ? format(new Date(ticket.preferred_date), 'MMM d, yyyy') : '—'],
    ['Condition', ticket.unit_condition || '—', 'Appointment Time', ticket.preferred_time || '—'],
  ]

  unitRows.forEach(([l1, v1, l2, v2]) => {
    if (l1) {
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'normal')
      text(doc, C.gray)
      doc.text(l1, lx, y)
      doc.setFont('helvetica', 'bold')
      text(doc, C.darkMid)
      doc.text(String(v1 || '—'), vx, y)
    }
    if (l2) {
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'normal')
      text(doc, C.gray)
      doc.text(l2, col2lx, y)
      doc.setFont('helvetica', 'bold')
      text(doc, C.darkMid)
      doc.text(String(v2 || '—'), col2vx, y)
    }
    y += 6
  })
  y += 2

  // Vertical divider between the two columns
  stroke(doc, C.lightGray)
  doc.setLineWidth(0.2)
  doc.line(M + CW / 2, y - (unitRows.length * 6) - 2, M + CW / 2, y - 4)

  // ── ISSUE DESCRIPTION ──────────────────────────────────────────────────────
  y = sectionHeader(doc, 'Issue Description', y, M, PW)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  text(doc, C.darkMid)
  const issueLines = doc.splitTextToSize(ticket.issue_description, CW - 4)
  doc.text(issueLines, lx, y)
  y += issueLines.length * 5 + 6

  // ── TECHNICIAN NOTES (only if present) ────────────────────────────────────
  const hasDiagnosis = !!ticket.diagnosis_notes
  const hasRepair    = !!ticket.repair_notes

  if (hasDiagnosis || hasRepair) {
    y = sectionHeader(doc, 'Technician Notes', y, M, PW)

    if (hasDiagnosis) {
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      text(doc, C.brandPurple)
      doc.text('Diagnosis', lx, y)
      y += 4.5
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'normal')
      text(doc, C.darkMid)
      const dLines = doc.splitTextToSize(ticket.diagnosis_notes, CW - 4)
      doc.text(dLines, lx, y)
      y += dLines.length * 5 + 4
    }

    if (hasRepair) {
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      text(doc, C.brandMagenta)
      doc.text('Repair Notes', lx, y)
      y += 4.5
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'normal')
      text(doc, C.darkMid)
      const rLines = doc.splitTextToSize(ticket.repair_notes, CW - 4)
      doc.text(rLines, lx, y)
      y += rLines.length * 5 + 4
    }
    y += 2
  }

  // ── PRICING BREAKDOWN ──────────────────────────────────────────────────────
  const hasLabor   = ticket.labor_items?.some(i => i.description || i.amount)
  const hasParts   = ticket.parts_items?.some(i => i.description || i.amount)
  const hasPricing = hasLabor || hasParts || ticket.quotation_amount != null || ticket.final_price != null

  if (hasPricing) {
    y = sectionHeader(doc, 'Pricing Breakdown', y, M, PW)

    const priceRx  = PW - M           // right-align prices here
    const descMaxW = CW - 30          // max width for descriptions

    // ── Labor line items table ─────────────────────────────────────────────
    if (hasLabor) {
      // Sub-header
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      text(doc, C.brandPurple)
      doc.text('Labor Fees', lx, y)
      y += 5

      let laborSubtotal = 0
      ticket.labor_items.filter(i => i.description || i.amount).forEach(item => {
        const amt = parseFloat(item.amount) || 0
        laborSubtotal += amt

        // Row background (alternating)
        fill(doc, [252, 250, 255])
        doc.rect(M, y - 4, CW, 6, 'F')

        doc.setFontSize(8.5)
        doc.setFont('helvetica', 'normal')
        text(doc, C.darkMid)
        const descLines = doc.splitTextToSize(item.description || '—', descMaxW)
        doc.text(descLines, lx + 3, y)
        doc.setFont('helvetica', 'bold')
        doc.text(peso(amt), priceRx, y, { align: 'right' })
        y += Math.max(descLines.length * 4.5, 5.5)
      })

      // Labor subtotal line
      hr(doc, y, lx, PW - M, C.lightGray, 0.2)
      y += 3
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      text(doc, C.gray)
      doc.text('Labor Subtotal', lx + 3, y)
      doc.setFont('helvetica', 'bold')
      text(doc, C.brandPurple)
      doc.text(peso(laborSubtotal), priceRx, y, { align: 'right' })
      y += 7
    }

    // ── Parts line items table ─────────────────────────────────────────────
    if (hasParts) {
      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      text(doc, C.brandMagenta)
      doc.text('Parts / Materials', lx, y)
      y += 5

      let partsSubtotal = 0
      ticket.parts_items.filter(i => i.description || i.amount).forEach(item => {
        const amt = parseFloat(item.amount) || 0
        partsSubtotal += amt

        fill(doc, [255, 250, 253])
        doc.rect(M, y - 4, CW, 6, 'F')

        doc.setFontSize(8.5)
        doc.setFont('helvetica', 'normal')
        text(doc, C.darkMid)
        const descLines = doc.splitTextToSize(item.description || '—', descMaxW)
        doc.text(descLines, lx + 3, y)
        doc.setFont('helvetica', 'bold')
        doc.text(peso(amt), priceRx, y, { align: 'right' })
        y += Math.max(descLines.length * 4.5, 5.5)
      })

      hr(doc, y, lx, PW - M, C.lightGray, 0.2)
      y += 3
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      text(doc, C.gray)
      doc.text('Parts Subtotal', lx + 3, y)
      doc.setFont('helvetica', 'bold')
      text(doc, C.brandMagenta)
      doc.text(peso(partsSubtotal), priceRx, y, { align: 'right' })
      y += 7
    }

    // ── Summary totals box ─────────────────────────────────────────────────
    fill(doc, C.veryLight)
    stroke(doc, C.lightGray)
    doc.setLineWidth(0.3)
    const summaryStartY = y
    const SUMMARY_ROWS  = []

    if (ticket.discount_amount > 0) {
      const dLabel = ticket.discount_percent > 0 ? `Discount (${ticket.discount_percent}%)` : 'Discount'
      SUMMARY_ROWS.push({ label: dLabel, value: `- ${peso(ticket.discount_amount)}`, color: C.green })
    }
    if (ticket.quotation_amount != null) {
      SUMMARY_ROWS.push({ label: 'Quotation Total', value: peso(ticket.quotation_amount), color: C.brandPurple, bold: true })
    }
    // Payment plan chosen by the client (the applied discount, if any, is shown
    // on its own Discount row above).
    if (ticket.payment_option) {
      const planText = ticket.payment_option === 'pay_later' ? 'Pay later'
        : ticket.payment_option === 'full_now' ? 'Pay full now'
        : ticket.payment_option === 'half_now' ? 'Pay half now'
        : ''
      if (planText) SUMMARY_ROWS.push({ label: 'Payment Plan', value: planText, color: C.gray })
    }

    const boxH = SUMMARY_ROWS.length * 7 + 4
    doc.rect(M, summaryStartY, CW, boxH, 'FD')

    y += 5
    SUMMARY_ROWS.forEach(row => {
      doc.setFontSize(9)
      doc.setFont('helvetica', row.bold ? 'bold' : 'normal')
      text(doc, C.darkMid)
      doc.text(row.label, lx + 4, y)
      text(doc, row.color)
      doc.setFont('helvetica', 'bold')
      doc.text(row.value, priceRx - 4, y, { align: 'right' })
      y += 7
    })
    y += 3

    // ── Final price highlight ──────────────────────────────────────────────
    if (ticket.final_price != null) {
      gradientBar(doc, M, y, CW, 12, C.brandPurple, C.brandMagenta)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9.5)
      text(doc, C.white)
      doc.text('FINAL PRICE', lx + 4, y + 7.5)
      doc.setFontSize(11)
      doc.text(peso(ticket.final_price), priceRx - 4, y + 7.5, { align: 'right' })
      y += 18
    }

    // ── Paid stamp ────────────────────────────────────────────────────────
    if (ticket.paid_at) {
      fill(doc, [240, 253, 244])
      stroke(doc, [134, 239, 172])
      doc.setLineWidth(0.3)
      doc.roundedRect(M, y, CW, 9, 2, 2, 'FD')
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      text(doc, C.green)
      doc.text(
        `✓  Paid on ${format(new Date(ticket.paid_at), 'MMMM d, yyyy · h:mm a')}`,
        M + CW / 2,
        y + 5.8,
        { align: 'center' }
      )
      y += 15
    }
  }

  // ── FOOTER ─────────────────────────────────────────────────────────────────
  // Gradient top bar
  gradientBar(doc, 0, PH - 14, PW, 2, C.brandPurple, C.brandMagenta)

  fill(doc, C.dark)
  doc.rect(0, PH - 12, PW, 12, 'F')

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  text(doc, [180, 180, 200])
  doc.text('VRXE Repair Services', M, PH - 4.5)

  doc.setFont('helvetica', 'normal')
  text(doc, [120, 120, 140])
  doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy · h:mm a')}`, PW - M, PH - 4.5, { align: 'right' })

  // ── Save ───────────────────────────────────────────────────────────────────
  doc.save(`VRXE_${ticket.ticket_id}.pdf`)
}
