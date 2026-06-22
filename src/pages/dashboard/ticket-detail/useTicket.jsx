import { useEffect, useState, useRef } from 'react'
import { useNavigate }                   from 'react-router-dom'
import { supabase }                      from '../../../lib/supabase'
import { adminDeleteTicket }             from '../../../lib/adminDelete'
import { formatClientUnitLabel }         from '../../../lib/utils'
import {
  createNotification, buildStatusNotification,
} from '../../../lib/notifications'
import { sendGlobalPush }    from '../../../lib/push'
import { downloadTicketPDF } from '../../../lib/pdf'
import { generateReceiptNumber } from '../../../lib/receipt'
import { useRole }           from '../../../hooks/useRole.jsx'
import { DIAGNOSIS_FEE }    from '../../../lib/constants'
import { DEFAULT_PARTIAL_HIGH_PCT, DEFAULT_PARTIAL_LOW_PCT, discountCapFor } from '../../../lib/utils'
import {
  TICKET_COLUMNS, SAVE_MSG_DURATION_MS, PDF_DOWNLOAD_DELAY_MS, MAX_PHOTO_BYTES,
} from './constants'
import { emptyItem, computeQuotation, discountAmount, sumItems } from './helpers'

export function useTicket(id) {
  const navigate      = useNavigate()
  const fileInputRef  = useRef(null)
  const proofInputRef = useRef(null)
  const { role, getAllowedTransitions, isAdmin, isTechnician } = useRole()

  const [ticket,         setTicket]         = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [uploading,      setUploading]      = useState(false)
  const [uploadingProof, setUploadingProof] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [notes,          setNotes]          = useState({ diagnosis_notes: '', repair_notes: '' })
  const [laborItems,     setLaborItems]     = useState([emptyItem()])
  const [partsItems,     setPartsItems]     = useState([emptyItem()])
  const [discount,       setDiscount]       = useState('')
  const [finalPrice,     setFinalPrice]     = useState('')
  // Payment plan (per-ticket). Caps are configurable per job — defaults applied
  // when the ticket has none yet. No plan applies any discount (see save below).
  const [paymentOption,  setPaymentOption]  = useState('')
  const [partialHighPct, setPartialHighPct] = useState(DEFAULT_PARTIAL_HIGH_PCT)
  const [partialLowPct,  setPartialLowPct]  = useState(DEFAULT_PARTIAL_LOW_PCT)
  const [saveMsg,          setSaveMsg]          = useState('')
  const [transitionErrors, setTransitionErrors] = useState([])
  const [deleteConfirm,    setDeleteConfirm]    = useState(false)
  const [undoConfirm,      setUndoConfirm]      = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('tickets')
        .select(TICKET_COLUMNS)
        .eq('id', id)
        .single()
      if (cancelled) return
      if (error || !data) { navigate('/tickets'); return }
      hydrate(data)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Realtime: reflect changes made by the other role without a refresh.
  // Only the `ticket` display state is merged — the editable form states
  // (notes, labor/parts items, pricing) are left alone so a live update
  // never clobbers what this user is currently typing.
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel(`ticket-${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tickets', filter: `id=eq.${id}` },
        ({ new: row }) => {
          setTicket(prev => (prev ? { ...prev, ...row } : prev))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'tickets', filter: `id=eq.${id}` },
        () => navigate('/tickets')
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  function hydrate(data) {
    setTicket(data)
    setNotes({
      diagnosis_notes: data.diagnosis_notes || '',
      repair_notes:    data.repair_notes    || '',
    })
    setLaborItems(
      data.labor_items?.length
        ? data.labor_items.map(it => ({ ...it, id: it.id ?? crypto.randomUUID() }))
        : []
    )
    setPartsItems(
      data.parts_items?.length
        ? data.parts_items.map(it => ({ ...it, id: it.id ?? crypto.randomUUID() }))
        : [emptyItem()]
    )
    setDiscount(data.discount_percent ?? '')  // discount is now a manual percentage
    setFinalPrice(data.final_price ?? '')
    setPaymentOption(data.payment_option ?? '')
    setPartialHighPct(data.payment_partial_high_pct ?? DEFAULT_PARTIAL_HIGH_PCT)
    setPartialLowPct(data.payment_partial_low_pct ?? DEFAULT_PARTIAL_LOW_PCT)
  }

  async function updateStatus(newStatus) {
    setTransitionErrors([])

    // Gate 1: technician diagnosis and admin quotation must be saved before starting repairs
    if (newStatus === 'Repair in Progress' && ticket.status === 'Inspection & Quote') {
      const errs = []
      if (!ticket.diagnosis_notes?.trim()) {
        errs.push('A saved diagnosis is required before starting repairs. The technician must fill in Diagnosis Notes in the Technical Details tab and save.')
      }
      if (ticket.quotation_amount === null || ticket.quotation_amount === undefined) {
        errs.push('A saved quotation is required before starting repairs. In the Quotation & Payment tab, check "Include Diagnosis Fee" (or add items) and save.')
      }
      if (errs.length) { setTransitionErrors(errs); return }
    }

    // Gate 2: technician notes and documentation required before marking done
    if (newStatus === 'Done' && ticket.status === 'Repair in Progress') {
      const errs = []
      if (!ticket.diagnosis_notes?.trim()) errs.push('Diagnosis notes are missing.')
      if (!ticket.repair_notes?.trim())    errs.push('Repair notes are missing.')
      if (!ticket.repair_photos?.length)   errs.push('Repair documentation (photos) is missing.')
      if (errs.length) { setTransitionErrors(errs); return }
    }

    // Gate 3: final price + payment proof must be saved before marking paid
    if (newStatus === 'Paid' && ticket.status === 'Done') {
      const errs = []
      if (ticket.final_price === null || ticket.final_price === undefined) {
        errs.push('A saved final price is required before marking as paid. Fill in the final price in the Quotation & Payment tab and save.')
      }
      if (!ticket.payment_proof_url) {
        errs.push('A payment-proof screenshot is required before marking as paid. Upload it in the Quotation & Payment tab.')
      }
      if (errs.length) { setTransitionErrors(errs); return }
    }

    setStatusUpdating(true)
    const patch = { status: newStatus, previous_status: ticket.status }
    if (newStatus === 'Paid') {
      patch.paid_at = new Date().toISOString()
      // Persist the receipt number once — receipt downloads must show the
      // same number forever (receipt.js only generates as a fallback).
      if (!ticket.receipt_number) patch.receipt_number = generateReceiptNumber(ticket.ticket_id)
    }
    const { data, error } = await supabase
      .from('tickets').update(patch).eq('id', id).select(TICKET_COLUMNS).single()
    if (error) {
      alert(`Status update failed: ${error.message}`)
    } else {
      hydrate(data)
      const note = buildStatusNotification({ actorRole: role, newStatus, ticketLabel: formatClientUnitLabel(data) })
      if (note) {
        try {
          await createNotification({
            recipientRole: note.recipientRole,
            message:       note.message,
            type:          'status_change',
            status:        newStatus,
            ticketUuid:    data.id,
            ticketHumanId: data.ticket_id,
          })
        } catch (err) {
          console.error('Notification failed:', err)
        }
      }
      if (newStatus === 'Paid') {
        // Global push milestone — broadcast to all devices regardless of role
        // (the role-scoped in-app notification above is unchanged).
        // Push body: client name only on Paid (no unit/ticket name —
        // those are reserved for ticket-creation pushes).
        sendGlobalPush({
          title: 'Ticket paid',
          body:  `${data.client_name?.trim() || 'A client'} marked Paid.`,
          url:   `/tickets/${data.id}`,
        })
        setTimeout(() => downloadTicketPDF(data), PDF_DOWNLOAD_DELAY_MS)
      }
    }
    setStatusUpdating(false)
  }

  /**
   * Revert the ticket to its previous status (Admin & Technician).
   * Clears previous_status so undo is single-level — you can't undo an undo.
   * Also clears paid_at when stepping back out of Paid.
   */
  async function undoStatus() {
    if (!ticket?.previous_status) return
    setTransitionErrors([])
    setStatusUpdating(true)
    const patch = { status: ticket.previous_status, previous_status: null }
    if (ticket.status === 'Paid') patch.paid_at = null
    const { data, error } = await supabase
      .from('tickets').update(patch).eq('id', id).select(TICKET_COLUMNS).single()
    if (error) {
      alert(`Undo failed: ${error.message}`)
    } else {
      hydrate(data)
      const other = role === 'Admin' ? 'Technician' : 'Admin'
      try {
        await createNotification({
          recipientRole: other,
          message:       `Reverted to ${data.status}: ${formatClientUnitLabel(data)}`,
          type:          'status_change',
          status:        data.status,
          ticketUuid:    data.id,
          ticketHumanId: data.ticket_id,
        })
      } catch (err) {
        console.error('Notification failed:', err)
      }
    }
    setUndoConfirm(false)
    setStatusUpdating(false)
  }

  /**
   * Save the editable form state, limited by scope:
   *   'notes'     — technician diagnosis/repair notes
   *   'quotation' — labor/parts items + discount + quotation total (Admin)
   *   'payment'   — final price only (Admin)
   */
  async function saveNotesAndPricing(scope) {
    if (ticket?.status === 'Paid') return  // locked once paid
    // Gate: a payment-proof screenshot must be uploaded before the final
    // payment can be saved (UI also disables the button — this is the safety net).
    if (scope === 'payment' && isAdmin && !ticket?.payment_proof_url) {
      alert('Upload a payment-proof screenshot before saving the final payment.')
      return
    }
    setSaving(true)
    const cleanLabor = laborItems
      .filter(it => it.description.trim() || String(it.amount).trim() !== '')
      .map(({ description, amount }) => ({ description: description.trim(), amount: parseFloat(amount) || 0 }))
    const cleanParts = partsItems
      .filter(it => it.description.trim() || String(it.amount).trim() !== '')
      .map(({ description, amount }) => ({ description: description.trim(), amount: parseFloat(amount) || 0 }))
    const hasItems  = cleanLabor.length > 0 || cleanParts.length > 0
    // `discount` holds a manual percentage. It is capped by the client's chosen
    // payment plan (full_now → high cap, half_now → low cap, pay_later/none → 0)
    // and resolved to a peso amount against the (labor + parts) base so
    // discount_amount stays the source of truth for PDF / receipt / export.
    const cap         = discountCapFor(paymentOption, partialHighPct, partialLowPct)
    const discountPct = Math.min(cap, Math.max(0, parseFloat(discount) || 0))
    const baseTotal   = sumItems(cleanLabor) + sumItems(cleanParts)
    const quotation   = computeQuotation(cleanLabor, cleanParts, discountPct)
    let patch = {}
    if (scope === 'notes' && isTechnician) {
      patch = { diagnosis_notes: notes.diagnosis_notes || null, repair_notes: notes.repair_notes || null }
    } else if (scope === 'quotation' && isAdmin) {
      patch = {
        labor_items:      cleanLabor,
        parts_items:      cleanParts,
        discount_percent: discountPct,
        discount_amount:  discountAmount(baseTotal, discountPct),
        quotation_amount: hasItems ? quotation : null,
        // NOTE: payment_option is intentionally NOT written here — the client
        // chooses their payment plan on the tracker page. Saving the quotation
        // must not clobber their selection.
      }
    } else if (scope === 'payment' && isAdmin) {
      patch = {
        final_price: finalPrice !== '' && finalPrice !== null ? Number(finalPrice) : null,
      }
    }
    if (!Object.keys(patch).length) { setSaving(false); return }
    const { data, error } = await supabase
      .from('tickets').update(patch).eq('id', id).select(TICKET_COLUMNS).single()
    if (error) {
      alert(`Save failed: ${error.message}`)
    } else {
      hydrate(data)
      setSaveMsg(
        scope === 'quotation' ? 'Quotation saved!'
        : scope === 'payment' ? 'Final payment saved!'
        : 'Saved!'
      )
      setTimeout(() => setSaveMsg(''), SAVE_MSG_DURATION_MS)
    }
    setSaving(false)
  }

  function updateItem(setter, itemId, field, value) {
    setter(prev => prev.map(it => it.id === itemId ? { ...it, [field]: value } : it))
  }
  function addItem(setter)            { setter(prev => [...prev, emptyItem()]) }
  function removeItem(setter, itemId) { setter(prev => prev.filter(it => it.id !== itemId)) }

  function toggleDiagnosis() {
    setLaborItems(prev => {
      const hasDiagnosis = prev.some(it => it.description === 'Diagnosis')
      if (hasDiagnosis) return prev.filter(it => it.description !== 'Diagnosis')
      return [{ id: crypto.randomUUID(), description: 'Diagnosis', amount: DIAGNOSIS_FEE }, ...prev]
    })
  }

  async function uploadPhotos(e) {
    if (ticket?.status === 'Paid') return  // locked once paid
    const files = Array.from(e.target.files)
    if (!files.length) return
    for (const file of files) {
      if (!file.type.startsWith('image/')) { alert('Only image files are allowed.'); return }
      if (file.size > MAX_PHOTO_BYTES)     { alert('Max file size is 10 MB per photo.'); return }
    }
    setUploading(true)
    const newUrls = []
    try {
      for (const file of files) {
        const ext  = file.name.split('.').pop()
        const path = `${ticket.ticket_id}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from('repair-photos').upload(path, file, { cacheControl: '3600', upsert: false })
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('repair-photos').getPublicUrl(path)
        newUrls.push(urlData.publicUrl)
      }
      const updatedPhotos = [...(ticket.repair_photos || []), ...newUrls]
      const { data, error } = await supabase
        .from('tickets').update({ repair_photos: updatedPhotos }).eq('id', id).select(TICKET_COLUMNS).single()
      if (error) throw new Error(error.message)
      setTicket(data)
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function deletePhoto(url) {
    if (ticket?.status === 'Paid') return  // locked once paid
    const updatedPhotos = (ticket.repair_photos || []).filter(u => u !== url)
    const { data, error } = await supabase
      .from('tickets').update({ repair_photos: updatedPhotos }).eq('id', id).select(TICKET_COLUMNS).single()
    if (error) { alert(`Failed to remove photo: ${error.message}`); return }
    setTicket(data)
  }

  /**
   * Upload the payment-proof screenshot (Admin). Single image, stored in the
   * repair-photos bucket under a payment-proof/ path, then its URL is saved to
   * payment_proof_url. Required before the final payment can be saved.
   */
  async function uploadPaymentProof(e) {
    if (ticket?.status === 'Paid') return  // locked once paid
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { alert('Only image files are allowed.'); return }
    if (file.size > MAX_PHOTO_BYTES)     { alert('Max file size is 10 MB.'); return }
    setUploadingProof(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `${ticket.ticket_id}/payment-proof/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('repair-photos').upload(path, file, { cacheControl: '3600', upsert: false })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('repair-photos').getPublicUrl(path)
      const { data, error } = await supabase
        .from('tickets').update({ payment_proof_url: urlData.publicUrl }).eq('id', id).select(TICKET_COLUMNS).single()
      if (error) throw new Error(error.message)
      setTicket(data)
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploadingProof(false)
      if (proofInputRef.current) proofInputRef.current.value = ''
    }
  }

  /** Remove the payment-proof screenshot (Admin). */
  async function deletePaymentProof() {
    if (ticket?.status === 'Paid') return  // locked once paid
    const { data, error } = await supabase
      .from('tickets').update({ payment_proof_url: null }).eq('id', id).select(TICKET_COLUMNS).single()
    if (error) { alert(`Failed to remove proof: ${error.message}`); return }
    setTicket(data)
  }

  /**
   * Delete this ticket via the admin-delete Edge Function (the anon client can
   * no longer delete — see lib/adminDelete.js). Requires the destructive
   * password, validated server-side. Returns an error message on failure, or
   * null on success (after which the page navigates away).
   */
  async function deleteTicket(password) {
    if (!isAdmin) return 'Not authorized.'
    try {
      await adminDeleteTicket(id, password)
      navigate('/tickets')
      return null
    } catch (err) {
      return err.message
    }
  }

  return {
    ticket, loading, saving, uploading, statusUpdating, fileInputRef,
    uploadingProof, proofInputRef,
    notes, setNotes,
    laborItems, setLaborItems,
    partsItems, setPartsItems,
    discount, setDiscount,
    finalPrice, setFinalPrice,
    paymentOption, setPaymentOption,
    partialHighPct, setPartialHighPct,
    partialLowPct, setPartialLowPct,
    saveMsg, transitionErrors, deleteConfirm, setDeleteConfirm,
    undoConfirm, setUndoConfirm,
    isAdmin, isTechnician, getAllowedTransitions,
    updateStatus, undoStatus, saveNotesAndPricing,
    uploadPhotos, deletePhoto, deleteTicket,
    uploadPaymentProof, deletePaymentProof,
    updateItem, addItem, removeItem, toggleDiagnosis,
  }
}
