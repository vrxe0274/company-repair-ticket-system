import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
const vrxeLogo = '/vrxe-logo.png'

/**
 * Generate a receipt number for a ticket
 */
export function generateReceiptNumber(ticketId) {
  const year = new Date().getFullYear().toString().slice(2)
  const rand = Math.floor(Math.random() * 9000 + 1000)
  return `26${year.padStart(2, '0')}-00VR02-${rand}`
}

/**
 * Format peso — use 'P' prefix since jsPDF helvetica cannot render the peso glyph
 */
function peso(n) {
  return 'P' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ─────────────────────────────────────────────────────────────────────────────
// Core render function — draws one receipt page onto `doc`
// ─────────────────────────────────────────────────────────────────────────────
function renderReceiptPage(doc, ticket) {
  const pageWidth  = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin     = 15
  const cw         = pageWidth - margin * 2

  // ── HEADER ───────────────────────────────────────────────────────────────────
  const headerH = 30

  // VRXE logo image inside the black panel
  doc.addImage(vrxeLogo, 'PNG', 5, 4, 30, 30)

  // Right white panel
  doc.setFillColor(255, 255, 255)
  doc.rect(pageWidth * 0.45, 0, pageWidth * 0.55, headerH, 'F')

  // RECEIPT title
  doc.setTextColor(20, 20, 20)
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.text('RECEIPT', pageWidth - margin, 22, { align: 'right' })

  let y = headerH + 5

  // ── BILL TO + RECEIPT NUMBER ──────────────────────────────────────────────────
  const billW = cw * 0.54
  const billH = 30
  const rnX   = margin + billW + 2
  const rnW   = cw - billW - 2

  // Black BILL TO block
  doc.setFillColor(0, 0, 0)
  doc.rect(margin, y, billW, billH, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('BILL TO:', margin + 3, y + 7)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(ticket.client_name || '—', margin + 3, y + 14)

  const addrLines = doc.splitTextToSize(ticket.address || '', billW - 6)
  addrLines.slice(0, 2).forEach((line, i) => {
    doc.text(line, margin + 3, y + 20 + i * 5)
  })
  doc.text(ticket.contact_number || '', margin + 3, y + (addrLines.length > 1 ? 30 : 26))

  // Light grey receipt number block
  doc.setFillColor(240, 240, 240)
  doc.rect(rnX, y, rnW, billH, 'F')

  doc.setTextColor(20, 20, 20)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('RECEIPT NUMBER', rnX + 3, y + 7)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(ticket.receipt_number || generateReceiptNumber(ticket.ticket_id), rnX + 3, y + 15)

  y += billH + 5

  // ── SERVICE AVAILED / DATE / REP ─────────────────────────────────────────────
  const col3 = cw / 3
  const headerLabels = ['SERVICE AVAILED', 'DATE OF SERVICE', 'REPRESENTATIVE NAME']
  headerLabels.forEach((lbl, i) => {
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(20, 20, 20)
    doc.text(lbl, margin + i * col3, y + 5)
  })

  const serviceDate    = ticket.paid_at
    ? format(new Date(ticket.paid_at), 'M/d/yyyy')
    : format(new Date(), 'M/d/yyyy')
  const serviceAvailed = `${ticket.unit_brand || ''} ${ticket.unit_model || ''}`.trim()
  const rowValues      = [serviceAvailed, serviceDate, ticket.representative_name || 'NA']

  rowValues.forEach((val, i) => {
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(50, 50, 50)
    doc.text(val, margin + i * col3, y + 12)
  })

  y += 20

  // Thin divider
  doc.setDrawColor(180, 180, 180)
  doc.line(margin, y, pageWidth - margin, y)
  y += 4

  // ── SERVICES TABLE (no QTY column) ───────────────────────────────────────────
  const hasLabor = ticket.labor_items?.some(i => i.description || i.amount)
  const hasParts = ticket.parts_items?.some(i => i.description || i.amount)

  const tableBody = []

  if (hasLabor) {
    const laborRows = ticket.labor_items.filter(i => i.description || i.amount)
    laborRows.forEach((item, idx) => {
      if (idx === 0) {
        tableBody.push([
          {
            content: `VR Unit:\n${ticket.unit_brand} ${ticket.unit_model}`,
            rowSpan: laborRows.length,
            styles: { fontStyle: 'bold', valign: 'top' },
          },
          { content: item.description || '—' },
          { content: peso(item.amount), styles: { halign: 'right', fontStyle: 'bold' } },
        ])
      } else {
        tableBody.push([
          { content: item.description || '—' },
          { content: peso(item.amount), styles: { halign: 'right', fontStyle: 'bold' } },
        ])
      }
    })
  }

  if (hasParts) {
    const partsRows  = ticket.parts_items.filter(i => i.description || i.amount)
    const partsTotal = partsRows.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
    const partsList  = partsRows.map(i => `- ${i.description || '—'}`).join('\n')
    tableBody.push([
      { content: 'Inclusion parts', styles: { fontStyle: 'bold', valign: 'top' } },
      { content: partsList, styles: { valign: 'top' } },
      { content: peso(partsTotal), styles: { halign: 'right', fontStyle: 'bold', valign: 'top' } },
    ])
  }

  if (tableBody.length === 0) {
    tableBody.push([
      { content: 'Repair Service', styles: { fontStyle: 'bold' } },
      { content: ticket.issue_description?.slice(0, 100) || 'General repair' },
      {
        content: peso(ticket.final_price || ticket.quotation_amount || 0),
        styles: { halign: 'right', fontStyle: 'bold' },
      },
    ])
  }

  autoTable(doc, {
    startY: y,
    head: [[
      { content: 'SERVICE',                    styles: { halign: 'left'  } },
      { content: 'DESCRIPTION / PARTICULARS',  styles: { halign: 'left'  } },
      { content: 'SUBTOTAL',                   styles: { halign: 'right' } },
    ]],
    body: tableBody,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      lineColor: [200, 200, 200],
      lineWidth: 0.25,
      overflow: 'linebreak',
      textColor: [30, 30, 30],
    },
    headStyles: {
      fontStyle: 'bold',
      fontSize: 8.5,
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineWidth: { bottom: 0.5 },
      lineColor: [0, 0, 0],
      cellPadding: { top: 3, bottom: 4, left: 3, right: 3 },
    },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 32, halign: 'right' },
    },
  })

  y = doc.lastAutoTable.finalY + 4

  // ── TOTAL + WARRANTY BULLETS ──────────────────────────────────────────────────
  const discountAmt = parseFloat(ticket.discount_amount) || 0
  const finalAmt    = parseFloat(ticket.final_price) || parseFloat(ticket.quotation_amount) || 0
  const origAmt     = finalAmt + discountAmt

  const totalBoxH = discountAmt > 0 ? 24 : 20
  const totalBoxW = cw * 0.40
  const totalBoxX = pageWidth - margin - totalBoxW
  const warrantyW = cw * 0.56

  // Warranty bullet points
  const warrantyBullets = [
    '6 months warranty for parts and services (free of charge)',
    'Unlimited adjustment (case/housing of the unit)',
    'Unlimited cleaning for headstrap',
  ]

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(40, 40, 40)
  doc.text('Inclusions:', margin, y + 4)

  doc.setFont('helvetica', 'normal')
  let bulletY = y + 4
  warrantyBullets.forEach(bullet => {
    bulletY += 5
    const lines = doc.splitTextToSize(`\u2022  ${bullet}`, warrantyW - 4)
    doc.text(lines, margin, bulletY)
    bulletY += (lines.length - 1) * 4
  })

  // Black TOTAL box
  doc.setFillColor(0, 0, 0)
  doc.rect(totalBoxX, y, totalBoxW, totalBoxH, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')

  if (discountAmt > 0) {
    doc.setFontSize(10)
    doc.text('TOTAL', totalBoxX + 4, y + 7)
    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(255, 100, 100)
    doc.text(`(Discounted: ${peso(origAmt)})`, totalBoxX + 4, y + 13)
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(peso(finalAmt), pageWidth - margin - 2, y + 21, { align: 'right' })
  } else {
    doc.setFontSize(10)
    doc.text('TOTAL', totalBoxX + 4, y + 8)
    doc.setFontSize(14)
    doc.text(peso(finalAmt), pageWidth - margin - 2, y + 17, { align: 'right' })
  }

  y += totalBoxH + 6

  // Thin divider
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 6

  // ── ORDER TERMS + PAYMENT TERMS (two-column) ──────────────────────────────────
  const leftColW  = cw * 0.53
  const rightColX = margin + leftColW + 6
  const rightColW = cw - leftColW - 6

  let leftY  = y
  let rightY = y

  // Left column — Order Terms
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(0, 0, 0)
  doc.text('Order and Payment Terms:', margin, leftY)
  leftY += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(50, 50, 50)
  const orderText =
    'VRXE will exercise due care in handling and delivering the product. However, we shall ' +
    'not be held liable for any damages incurred during or after delivery, except in cases ' +
    'where negligence on our part is clearly established.'
  const orderLines = doc.splitTextToSize('- ' + orderText, leftColW - 2)
  doc.text(orderLines, margin, leftY)
  leftY += orderLines.length * 4 + 4

  // Left column — Warranty Approval
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(0, 0, 0)
  doc.text('Warranty Approval:', margin, leftY)
  leftY += 5

  const warrantyTerms = [
    'The warranty covers manufacturer defects only, valid for one year from the delivery date.',
    'It does not cover physical damage, water damage, or issues resulting from misuse or unauthorized repairs after the Unit has been received by the client.',
    'All warranty claims will be subject to inspection and approval by VRXE.',
  ]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(50, 50, 50)
  warrantyTerms.forEach(term => {
    const lines = doc.splitTextToSize('- ' + term, leftColW - 2)
    doc.text(lines, margin, leftY)
    leftY += lines.length * 4 + 2
  })

  // Right column — Payment Terms
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(0, 0, 0)
  doc.text('PAYMENT TERMS', rightColX, rightY)
  rightY += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(50, 50, 50)
  const payLines = doc.splitTextToSize('Please make the payment to the following account:', rightColW)
  doc.text(payLines, rightColX, rightY)
  rightY += payLines.length * 4 + 4

  // Payment info box
  const payBoxH = 16
  doc.setFillColor(245, 245, 245)
  doc.rect(rightColX, rightY, rightColW, payBoxH, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(0, 0, 0)
  doc.text('BANK / E-WALLET', rightColX + 3, rightY + 6)
  doc.text('ACCOUNT NUMBER',  rightColX + 3, rightY + 12)

  doc.setFont('helvetica', 'normal')
  doc.text('GCASH',       rightColX + 38, rightY + 6)
  doc.text('09760244320', rightColX + 38, rightY + 12)

  rightY += payBoxH + 5

  // Notes
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(0, 0, 0)
  doc.text('NOTES', rightColX, rightY)
  rightY += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(50, 50, 50)
  const noteLines = doc.splitTextToSize(
    'If you have any questions regarding this invoice, please contact us as soon as possible.',
    rightColW
  )
  doc.text(noteLines, rightColX, rightY)

  // ── FOOTER ────────────────────────────────────────────────────────────────────
  doc.setFillColor(0, 0, 0)
  doc.rect(0, pageHeight - 14, pageWidth, 14, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('THANK YOU FOR CHOOSING VRXE SERVICES', pageWidth / 2, pageHeight - 5, { align: 'center' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate and download a single receipt PDF
 */
export function downloadReceiptPDF(ticket) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  renderReceiptPage(doc, ticket)
  doc.save(`VRXE_Receipt_${ticket.receipt_number || ticket.ticket_id}.pdf`)
}

/**
 * Generate and download all paid receipts as one combined PDF (one page each)
 */
export async function downloadCombinedReceiptsPDF(tickets) {
  const paidTickets = tickets.filter(t => t.status === 'Paid' && t.final_price)
  if (!paidTickets.length) {
    alert('No paid tickets with receipts found.')
    return
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  paidTickets.forEach((ticket, index) => {
    if (index > 0) doc.addPage()
    renderReceiptPage(doc, ticket)
  })

  const dateStr = format(new Date(), 'yyyyMMdd_HHmm')
  doc.save(`VRXE_All_Receipts_${dateStr}.pdf`)
}

/**
 * Alias kept for backwards compatibility
 */
export async function downloadAllReceiptsPDF(tickets) {
  return downloadCombinedReceiptsPDF(tickets)
}
