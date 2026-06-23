import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import { DEFAULT_PARTIAL_HIGH_PCT, DEFAULT_PARTIAL_LOW_PCT } from './utils'

const vrxeLogo = '/vrxe-logo.png'

function peso(n) {
  return 'P' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function sumItems(items) {
  return (items || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
}

function renderQuotationPage(doc, ticket) {
  const pageWidth  = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin     = 15
  const cw         = pageWidth - margin * 2

  // ── HEADER ──────────────────────────────────────────────────────────────────
  doc.addImage(vrxeLogo, 'PNG', margin, 5, 28, 28)

  doc.setFontSize(36)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(15, 15, 15)
  doc.text('QUOTATION', pageWidth - margin, 23, { align: 'right' })

  doc.setDrawColor(210, 210, 210)
  doc.setLineWidth(0.3)
  doc.line(margin, 37, pageWidth - margin, 37)

  let y = 42

  // ── BILL TO + QUOTATION NO. ──────────────────────────────────────────────────
  const billW = cw * 0.58
  const billH = 36
  const qnX   = margin + billW + 4
  const qnW   = cw - billW - 4

  // Black BILL TO block
  doc.setFillColor(12, 12, 12)
  doc.rect(margin, y, billW, billH, 'F')

  doc.setTextColor(150, 150, 150)
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.text('BILL TO:', margin + 4, y + 7)

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  const clientNameLines = doc.splitTextToSize(ticket.client_name || '—', billW - 10)
  clientNameLines.slice(0, 2).forEach((ln, i) => doc.text(ln, margin + 4, y + 14 + i * 5.5))

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(210, 210, 210)
  const addrLines = doc.splitTextToSize(ticket.address || '', billW - 10)
  addrLines.slice(0, 2).forEach((ln, i) => doc.text(ln, margin + 4, y + 22 + i * 4.5))
  if (ticket.contact_number) {
    doc.text(ticket.contact_number, margin + 4, y + 31)
  }

  // Light QUOTATION NO. block
  doc.setFillColor(248, 248, 248)
  doc.rect(qnX, y, qnW, billH, 'F')
  doc.setDrawColor(228, 228, 228)
  doc.setLineWidth(0.2)
  doc.rect(qnX, y, qnW, billH, 'S')

  doc.setTextColor(130, 130, 130)
  doc.setFontSize(6.5)
  doc.setFont('helvetica', 'bold')
  doc.text('QUOTATION NO.', qnX + 4, y + 8)

  doc.setTextColor(15, 15, 15)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(ticket.ticket_id || '—', qnX + 4, y + 16)

  // Date issued sub-row
  doc.setDrawColor(220, 220, 220)
  doc.line(qnX + 2, y + 20, qnX + qnW - 2, y + 20)

  doc.setTextColor(130, 130, 130)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text('DATE ISSUED', qnX + 4, y + 27)

  doc.setTextColor(40, 40, 40)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const issuedDate = ticket.updated_at
    ? format(new Date(ticket.updated_at), 'd.MMMM.yyyy')
    : format(new Date(), 'd.MMMM.yyyy')
  doc.text(issuedDate, qnX + 4, y + 33)

  y += billH + 8

  // ── META ROW ─────────────────────────────────────────────────────────────────
  const col3    = cw / 3
  const labels  = ['SERVICE AVAILED', 'DATE OF SERVICE', 'REPRESENTATIVE NAME']
  const svcDate = ticket.updated_at
    ? format(new Date(ticket.updated_at), 'd.MMMM.yyyy')
    : format(new Date(), 'd.MMMM.yyyy')
  const svcName = `${ticket.unit_brand || ''} ${ticket.unit_model || ''}`.trim() || 'Repair Unit'
  const values  = [svcName, svcDate, ticket.representative_name || 'NA']

  labels.forEach((lbl, i) => {
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(110, 110, 110)
    doc.text(lbl, margin + i * col3, y + 4)
  })
  values.forEach((val, i) => {
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(20, 20, 20)
    const wrapped = doc.splitTextToSize(val, col3 - 5)
    doc.text(wrapped[0] || '—', margin + i * col3, y + 12)
  })

  y += 20

  doc.setLineWidth(0.3)
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 5

  // ── ITEMS TABLE ──────────────────────────────────────────────────────────────
  const laborRows = (ticket.labor_items || []).filter(i => i.description || i.amount)
  const partsRows = (ticket.parts_items || []).filter(i => i.description || i.amount)
  const tableBody = []

  if (laborRows.length > 0) {
    laborRows.forEach((item, idx) => {
      if (idx === 0) {
        tableBody.push([
          {
            content: `VR Unit:\n${svcName}`,
            rowSpan: laborRows.length,
            styles: { fontStyle: 'bold', valign: 'top', fontSize: 8, textColor: [15, 15, 15] },
          },
          {
            content: '1',
            rowSpan: laborRows.length,
            styles: { halign: 'center', valign: 'top', fontStyle: 'bold' },
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

  if (partsRows.length > 0) {
    partsRows.forEach((item, idx) => {
      if (idx === 0) {
        tableBody.push([
          {
            content: 'Inclusion\nParts',
            rowSpan: partsRows.length,
            styles: { fontStyle: 'bold', valign: 'top', fontSize: 8, textColor: [15, 15, 15] },
          },
          { content: '', styles: { halign: 'center', valign: 'top' } },
          { content: item.description || '—' },
          { content: peso(item.amount), styles: { halign: 'right', fontStyle: 'bold' } },
        ])
      } else {
        tableBody.push([
          { content: '', styles: { halign: 'center' } },
          { content: item.description || '—' },
          { content: peso(item.amount), styles: { halign: 'right', fontStyle: 'bold' } },
        ])
      }
    })
  }

  if (tableBody.length === 0) {
    tableBody.push([
      { content: 'Repair Service', styles: { fontStyle: 'bold' } },
      { content: '1', styles: { halign: 'center', fontStyle: 'bold' } },
      { content: ticket.issue_description?.slice(0, 80) || 'General repair' },
      { content: peso(ticket.quotation_amount || 0), styles: { halign: 'right', fontStyle: 'bold' } },
    ])
  }

  // End-of-items marker
  tableBody.push([
    { content: '', styles: { lineWidth: { top: 0.3 }, lineColor: [210, 210, 210] } },
    { content: '', styles: { lineWidth: { top: 0.3 }, lineColor: [210, 210, 210] } },
    {
      content: '*nothing follows*',
      styles: {
        fontStyle: 'italic',
        textColor: [160, 160, 160],
        fontSize: 7.5,
        lineWidth: { top: 0.3 },
        lineColor: [210, 210, 210],
      },
    },
    { content: '', styles: { lineWidth: { top: 0.3 }, lineColor: [210, 210, 210] } },
  ])

  autoTable(doc, {
    startY: y,
    head: [[
      { content: 'ITEMS',                     styles: { halign: 'left'   } },
      { content: 'QTY',                       styles: { halign: 'center' } },
      { content: 'DESCRIPTION / PARTICULARS', styles: { halign: 'left'  } },
      { content: 'SUBTOTAL',                  styles: { halign: 'right'  } },
    ]],
    body: tableBody,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 },
      lineColor: [218, 218, 218],
      lineWidth: 0.2,
      overflow: 'linebreak',
      textColor: [35, 35, 35],
    },
    headStyles: {
      fontStyle: 'bold',
      fontSize: 8,
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      lineWidth: { bottom: 0.6 },
      lineColor: [0, 0, 0],
      cellPadding: { top: 4, bottom: 5, left: 4, right: 4 },
    },
    columnStyles: {
      0: { cellWidth: 38, fontStyle: 'bold' },
      1: { cellWidth: 12, halign: 'center' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 33, halign: 'right', fontStyle: 'bold' },
    },
  })

  y = doc.lastAutoTable.finalY + 6

  // ── TOTAL BOX + CONFORME ─────────────────────────────────────────────────────
  const laborTotal   = sumItems(ticket.labor_items)
  const partsTotal   = sumItems(ticket.parts_items)
  const itemsTotal   = laborTotal + partsTotal
  const discountAmt  = parseFloat(ticket.discount_amount) || 0
  const quotationAmt = parseFloat(ticket.quotation_amount) || 0
  // Use live item sum when available, fall back to DB quotation_amount
  const displayTotal = itemsTotal > 0 ? itemsTotal : quotationAmt

  const totalBoxW = cw * 0.38
  const totalBoxX = pageWidth - margin - totalBoxW
  const totalBoxH = discountAmt > 0 ? 28 : 22

  // CONFORME — left
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(25, 25, 25)
  doc.text('CONFORME:', margin, y + 6)

  doc.setDrawColor(40, 40, 40)
  doc.setLineWidth(0.4)
  doc.line(margin, y + 18, margin + 72, y + 18)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(70, 70, 70)
  const cLines = doc.splitTextToSize(ticket.client_name || '—', 72)
  cLines.slice(0, 2).forEach((ln, i) => doc.text(ln, margin, y + 23 + i * 4.5))

  // Black TOTAL box — right
  doc.setFillColor(12, 12, 12)
  doc.rect(totalBoxX, y, totalBoxW, totalBoxH, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')

  if (discountAmt > 0) {
    const origTotal = displayTotal + discountAmt
    doc.setFontSize(8)
    doc.text('QUOTATION TOTAL', totalBoxX + 5, y + 7)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(255, 120, 120)
    doc.text(`(Before discount: ${peso(origTotal)})`, totalBoxX + 5, y + 13)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(peso(quotationAmt), pageWidth - margin - 3, y + 24, { align: 'right' })
  } else {
    doc.setFontSize(8)
    doc.text('QUOTATION TOTAL', totalBoxX + 5, y + 8)
    doc.setFontSize(14)
    doc.text(peso(displayTotal), pageWidth - margin - 3, y + 18, { align: 'right' })
  }

  y += totalBoxH + 8

  // Divider
  doc.setLineWidth(0.25)
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, pageWidth - margin, y)
  y += 7

  // ── BOTTOM SECTION ───────────────────────────────────────────────────────────
  const leftColW  = cw * 0.54
  const rightColX = margin + leftColW + 8
  const rightColW = cw - leftColW - 8
  let leftY  = y
  let rightY = y

  // Left — 6-month warranty bullet
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(40, 40, 40)
  const wl = doc.splitTextToSize('•  6 months warranty for parts and services (free of charge)', leftColW - 4)
  doc.text(wl, margin, leftY)
  leftY += wl.length * 4.2 + 5

  // Order and Payment Terms
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(0, 0, 0)
  doc.text('Order and Payment Terms:', margin, leftY)
  leftY += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(60, 60, 60)
  const ot = doc.splitTextToSize(
    '- VRXE will exercise due care in handling and delivering the product. However, we shall ' +
    'not be held liable for any damages incurred during or after delivery, except in cases ' +
    'where negligence on our part is clearly established.',
    leftColW - 4
  )
  doc.text(ot, margin, leftY)
  leftY += ot.length * 3.8 + 4

  // Warranty Approval
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(0, 0, 0)
  doc.text('Warranty Approval:', margin, leftY)
  leftY += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(60, 60, 60)
  const warrantyTerms = [
    'The warranty covers manufacturer defects only, valid for one year from the delivery date.',
    'It does not cover physical damage, water damage, or issues resulting from misuse or unauthorized repairs after the Unit has been received by the client.',
    'All warranty claims will be subject to inspection and approval by VRXE.',
  ]
  warrantyTerms.forEach(term => {
    const ls = doc.splitTextToSize('- ' + term, leftColW - 4)
    doc.text(ls, margin, leftY)
    leftY += ls.length * 3.8 + 2
  })

  // Right — Payment Terms
  const highPct = Number(ticket.payment_partial_high_pct ?? DEFAULT_PARTIAL_HIGH_PCT)
  const lowPct  = Number(ticket.payment_partial_low_pct  ?? DEFAULT_PARTIAL_LOW_PCT)
  const base    = displayTotal

  const ph = (n) => `Php ${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

  // No payment plan discounts when the ticket is diagnosis/cleaning only —
  // i.e. no parts and every labor item is a Diagnosis or Cleaning charge.
  const isDiagCleanOnly =
    partsRows.length === 0 &&
    laborRows.length > 0 &&
    laborRows.every(i => /diagnosis|cleaning/i.test(i.description || ''))

  const paymentPlans = [
    {
      label: `OPTION 1: Pay full price now — ${highPct}% discount`,
      body:
        `Full payment upon receipt of the quotation. A ${highPct}% discount from the total ` +
        `price is applicable. Fee of ${ph(base * (1 - highPct / 100))}`,
    },
    {
      label: `OPTION 2: Pay half price now — ${lowPct}% discount`,
      body:
        `Pay half the discounted total upon receipt of the quotation. A ${lowPct}% discount ` +
        `is applicable. First payment: ${ph((base * (1 - lowPct / 100)) / 2)}. ` +
        `Remaining ${ph((base * (1 - lowPct / 100)) / 2)} upon completion.`,
    },
    {
      label: 'OPTION 3: Pay later — no discount',
      body:
        `Full payment after the completion of the VR repair. No discount. Total fee is ${ph(base)}`,
    },
  ]

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(0, 0, 0)
  doc.text('PAYMENT TERMS', rightColX, rightY)
  rightY += 7

  if (isDiagCleanOnly) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.setTextColor(60, 60, 60)
    const flatLines = doc.splitTextToSize(
      `Full payment upon completion of service. Total fee is ${ph(base)}`,
      rightColW
    )
    doc.text(flatLines, rightColX, rightY)
    rightY += flatLines.length * 4
  } else {
    paymentPlans.forEach(({ label, body }) => {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(0, 0, 0)
      const labelLines = doc.splitTextToSize(label, rightColW)
      doc.text(labelLines, rightColX, rightY)
      rightY += labelLines.length * 4 + 2

      doc.setFont('helvetica', 'italic')
      doc.setFontSize(7)
      doc.setTextColor(60, 60, 60)
      const bodyLines = doc.splitTextToSize(body, rightColW)
      doc.text(bodyLines, rightColX, rightY)
      rightY += bodyLines.length * 3.8 + 5
    })
  }

  // Bank / e-wallet box
  const payBoxH = 16
  doc.setFillColor(248, 248, 248)
  doc.rect(rightColX, rightY, rightColW, payBoxH, 'F')
  doc.setDrawColor(220, 220, 220)
  doc.setLineWidth(0.2)
  doc.rect(rightColX, rightY, rightColW, payBoxH, 'S')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(0, 0, 0)
  doc.text('BANK / E-WALLET', rightColX + 3, rightY + 6)
  doc.text('ACCOUNT NUMBER',  rightColX + 3, rightY + 12)
  doc.setFont('helvetica', 'normal')
  doc.text('GCASH',       rightColX + 44, rightY + 6)
  doc.text('09760244320', rightColX + 44, rightY + 12)
  rightY += payBoxH + 6

  // Notes
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(0, 0, 0)
  doc.text('NOTES', rightColX, rightY)
  rightY += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(60, 60, 60)
  const nl = doc.splitTextToSize(
    'If you have any questions regarding this document, please contact us as soon as possible.',
    rightColW
  )
  doc.text(nl, rightColX, rightY)

  // ── FOOTER ───────────────────────────────────────────────────────────────────
  doc.setFillColor(12, 12, 12)
  doc.rect(0, pageHeight - 14, pageWidth, 14, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('THANK YOU FOR CHOOSING VRXE SERVICES', pageWidth / 2, pageHeight - 5, { align: 'center' })
}

export function downloadQuotationPDF(ticket) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  renderQuotationPage(doc, ticket)
  doc.save(`VRXE_Quotation_${ticket.ticket_id || 'draft'}.pdf`)
}
