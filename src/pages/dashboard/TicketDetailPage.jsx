/**
 * @file TicketDetailPage.jsx
 * @description Full detail view and editor for a single repair ticket.
 *
 * Organised into four tabs:
 *   Overview           — client info, unit info, issue description
 *   Technical Details  — technician notes + documentation (photos)
 *   Quotation & Payment — labor/parts line items, discount, final price (Admin)
 *   Settings           — delete ticket (Admin only)
 *
 * Role-based visibility:
 *   Admin      — can see and edit pricing; can see notes read-only; can delete; can change status
 *   Technician — can edit notes and upload photos; can see pricing read-only; can change status
 *   (other)    — pricing hidden until ticket is approved; notes always hidden
 */

import { Fragment, useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowLeft, ArrowRight, Download, ExternalLink, Upload, X, Save,
  CheckCircle, User, Package, Wrench, FileText, DollarSign,
  Image as ImageIcon, Trash2, Plus, Minus, Lock,
  Settings, Eye, CreditCard, AlertTriangle, Undo2,
  Clock, Search,
} from 'lucide-react'
import { supabase }                                    from '../../lib/supabase'
import { getTrackingUrl, STATUS_ORDER, formatClientUnitLabel } from '../../lib/utils'
import { createNotification, buildStatusNotification } from '../../lib/notifications'
import { sendGlobalPush } from '../../lib/push'
import { downloadTicketPDF }                           from '../../lib/pdf'
import { generateReceiptNumber }                       from '../../lib/receipt'
import { useRole }                                     from '../../hooks/useRole.jsx'
import StatusBadge                                     from '../../components/ui/StatusBadge.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────
const SAVE_MSG_DURATION_MS  = 2500
const PDF_DOWNLOAD_DELAY_MS = 300
const MAX_PHOTO_BYTES       = 10 * 1024 * 1024

/**
 * Role-specific guidance shown under the progress bar — what this viewer
 * should do next, or which role they are waiting on. Keyed by viewer role,
 * then ticket status (including the off-track 'Denied' status).
 */
const STATUS_GUIDANCE = {
  Admin: {
    'Pending':            'Your action: review the request — approve or deny.',
    'Inspection & Quote': 'Your action: add the quotation. The technician inspects the unit and saves the diagnosis.',
    'Repair in Progress': 'Waiting for the technician to finish the repair…',
    'Done':               'Your action: collect payment and mark the ticket as Paid.',
    'Paid':               'Ticket complete — payment received.',
    'Denied':             'Request denied — no further action needed.',
  },
  Technician: {
    'Pending':            'Waiting for the admin to review the request…',
    'Inspection & Quote': 'Your action: inspect the unit and save the diagnosis. The admin adds the quotation.',
    'Repair in Progress': 'Your action: finish the repair — add notes & photos, then mark Done.',
    'Done':               'Waiting for the admin to collect payment…',
    'Paid':               'Ticket complete — payment received.',
    'Denied':             'Request denied — no further action needed.',
  },
}

const TICKET_COLUMNS = [
  'id', 'ticket_id', 'status', 'previous_status', 'created_at', 'updated_at', 'paid_at', 'receipt_number',
  'tracking_token', 'client_name', 'contact_number', 'platform', 'email',
  'address', 'unit_brand', 'unit_model', 'unit_type', 'mode_of_service',
  'preferred_date', 'preferred_time', 'accessories_included', 'issue_description',
  'diagnosis_notes', 'repair_notes', 'repair_photos',
  'labor_items', 'parts_items', 'discount_amount', 'quotation_amount', 'final_price',
].join(', ')

// ── Helpers ───────────────────────────────────────────────────────────────────
const emptyItem = () => ({ id: crypto.randomUUID(), description: '', amount: '' })
const peso      = n  => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

function sumItems(items) {
  return items.reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0)
}

function computeQuotation(laborItems, partsItems, discount) {
  return Math.max(0, sumItems(laborItems) + sumItems(partsItems) - (parseFloat(discount) || 0))
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LineItem({ item, onChange, onRemove, canRemove }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <input
        type="text"
        value={item.description}
        onChange={e => onChange(item.id, 'description', e.target.value)}
        placeholder="Description"
        className="input-field flex-1 min-w-0 text-sm"
      />
      <div className="relative w-24 sm:w-32 shrink-0">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">₱</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={item.amount}
          onChange={e => onChange(item.id, 'amount', e.target.value)}
          placeholder="0.00"
          className="input-field pl-7 text-sm text-right font-mono w-full"
        />
      </div>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        disabled={!canRemove}
        className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-20 disabled:pointer-events-none shrink-0"
        aria-label="Remove line item"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function SummaryLine({ label, value, valueClass = 'text-gray-800' }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="font-body text-gray-500">{label}</span>
      <span className={`font-mono font-semibold ${valueClass}`}>{value}</span>
    </div>
  )
}

function InfoBox({ label, value, accent = false }) {
  return (
    <div className={`rounded-lg px-2.5 py-1.5 border ${accent ? 'bg-brand-50 border-brand-100' : 'bg-gray-50 border-gray-100'}`}>
      <p className="text-[10px] font-mono uppercase tracking-widest text-gray-500 mb-0">{label}</p>
      <p className={`text-xs font-sans font-semibold leading-snug ${accent ? 'text-brand-700' : 'text-gray-800'}`}>
        {value || <span className="text-gray-300 italic font-normal">—</span>}
      </p>
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-sans font-semibold rounded-t-lg transition-all whitespace-nowrap
        ${active
          ? 'text-gray-900 bg-gray-50 border-b-2 border-brand-600'
          : 'text-gray-400 border-b-2 border-transparent hover:text-gray-200 hover:bg-white/10'
        }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      {badge && (
        <span className="ml-1 text-xs font-mono bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </button>
  )
}

function LockedSection({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
        <Lock className="w-5 h-5 text-gray-400" />
      </div>
      <p className="text-sm font-body text-gray-500 max-w-xs">{message}</p>
    </div>
  )
}

/**
 * Status progress bar card. Rendered in two responsive slots: globally below
 * the ticket header on desktop, and inside the Overview tab on mobile.
 * `guidance` is the role-specific next-step text shown under the bar.
 */
const STEP_ICONS = {
  'Pending':            Clock,
  'Inspection & Quote': Search,
  'Repair in Progress': Wrench,
  'Done':               CheckCircle,
  'Paid':               CreditCard,
}

function ProgressCard({ status, guidance, className = '' }) {
  const progressIdx  = STATUS_ORDER.indexOf(status)
  const isActionable = guidance?.startsWith('Your action')

  return (
    <div className={`card overflow-hidden ${className}`}>
      {/* Step track */}
      <div className="px-3 sm:px-4 py-4">
        <div className="flex items-center w-full">
          {STATUS_ORDER.map((s, i) => {
            const isComplete = i < progressIdx
            const isCurrent  = i === progressIdx
            const isLast     = i === STATUS_ORDER.length - 1
            const Icon       = STEP_ICONS[s]

            return (
              <Fragment key={s}>
                {/* Node */}
                <div className="shrink-0">
                  <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center transition-all duration-300
                    ${isComplete
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : isCurrent
                        ? 'bg-dark-900 text-white shadow-md ring-2 ring-brand-400 ring-offset-1 sm:ring-offset-2'
                        : 'bg-gray-100 text-gray-300'
                    }`}
                  >
                    {isComplete
                      ? <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      : <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    }
                  </div>
                </div>

                {/* Connector — flex-1 fills equally between identical-width nodes */}
                {!isLast && (
                  <div className="flex-1 h-0.5 mx-1.5 sm:mx-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full bg-emerald-500 transition-all duration-700 ${isComplete ? 'w-full' : 'w-0'}`} />
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      </div>

      {/* Guidance banner */}
      {guidance && (
        <div className={`flex items-center gap-3 px-5 py-2.5 border-t
          ${isActionable ? 'bg-brand-50 border-brand-100' : 'bg-gray-50 border-gray-100'}`}
        >
          <div className={`w-1 self-stretch rounded-full shrink-0 ${isActionable ? 'bg-brand-400' : 'bg-gray-300'}`} />
          <p className={`text-xs font-body ${isActionable ? 'text-brand-700 font-semibold' : 'text-gray-500 italic'}`}>
            {guidance}
          </p>
        </div>
      )}
    </div>
  )
}

// ── useTicket hook ────────────────────────────────────────────────────────────
function useTicket(id) {
  const navigate     = useNavigate()
  const fileInputRef = useRef(null)
  const { role, getAllowedTransitions, isAdmin, isTechnician } = useRole()

  const [ticket,         setTicket]         = useState(null)
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [uploading,      setUploading]      = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [notes,          setNotes]          = useState({ diagnosis_notes: '', repair_notes: '' })
  const [laborItems,     setLaborItems]     = useState([emptyItem()])
  const [partsItems,     setPartsItems]     = useState([emptyItem()])
  const [discount,       setDiscount]       = useState('')
  const [finalPrice,     setFinalPrice]     = useState('')
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
        : [emptyItem()]
    )
    setPartsItems(
      data.parts_items?.length
        ? data.parts_items.map(it => ({ ...it, id: it.id ?? crypto.randomUUID() }))
        : [emptyItem()]
    )
    setDiscount(data.discount_amount ?? '')
    setFinalPrice(data.final_price ?? '')
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
        errs.push('A saved quotation is required before starting repairs. The admin must fill in labor/parts items in the Quotation & Payment tab and save.')
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

    // Gate 3: final price must be saved before marking paid
    if (newStatus === 'Paid' && ticket.status === 'Done') {
      if (ticket.final_price === null || ticket.final_price === undefined) {
        setTransitionErrors(['A saved final price is required before marking as paid. Fill in the final price in the Quotation & Payment tab and save.'])
        return
      }
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
    setSaving(true)
    const cleanLabor = laborItems
      .filter(it => it.description.trim() || String(it.amount).trim() !== '')
      .map(({ description, amount }) => ({ description: description.trim(), amount: parseFloat(amount) || 0 }))
    const cleanParts = partsItems
      .filter(it => it.description.trim() || String(it.amount).trim() !== '')
      .map(({ description, amount }) => ({ description: description.trim(), amount: parseFloat(amount) || 0 }))
    const hasItems  = cleanLabor.length > 0 || cleanParts.length > 0
    const quotation = computeQuotation(cleanLabor, cleanParts, discount)
    let patch = {}
    if (scope === 'notes' && isTechnician) {
      patch = { diagnosis_notes: notes.diagnosis_notes || null, repair_notes: notes.repair_notes || null }
    } else if (scope === 'quotation' && isAdmin) {
      patch = {
        labor_items:      cleanLabor,
        parts_items:      cleanParts,
        discount_amount:  parseFloat(discount) || 0,
        quotation_amount: hasItems ? quotation : null,
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

  async function deleteTicket() {
    if (!isAdmin) return
    const { error } = await supabase.from('tickets').delete().eq('id', id)
    if (error) { alert(`Delete failed: ${error.message}`); return }
    navigate('/tickets')
  }

  return {
    ticket, loading, saving, uploading, statusUpdating, fileInputRef,
    notes, setNotes,
    laborItems, setLaborItems,
    partsItems, setPartsItems,
    discount, setDiscount,
    finalPrice, setFinalPrice,
    saveMsg, transitionErrors, deleteConfirm, setDeleteConfirm,
    undoConfirm, setUndoConfirm,
    isAdmin, isTechnician, getAllowedTransitions,
    updateStatus, undoStatus, saveNotesAndPricing,
    uploadPhotos, deletePhoto, deleteTicket,
    updateItem, addItem, removeItem,
  }
}

// ── Tab components ────────────────────────────────────────────────────────────

function OverviewTab({
  ticket, statusGuidance,
  showActions, nextStatuses, canUndo, undoConfirm, setUndoConfirm,
  statusUpdating, transitionErrors, updateStatus, undoStatus,
}) {
  return (
    <div className="flex flex-col flex-1 gap-3 min-h-0">
      <ProgressCard status={ticket.status} guidance={statusGuidance} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0 lg:grid-rows-[auto_1fr]">
        <div className="card p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
              <User className="w-3 h-3 text-brand-600" />
            </div>
            <p className="section-title mb-0 text-xs">Client Information</p>
          </div>
          <div className="grid grid-cols-2 gap-1.5 flex-1 content-start">
            <div className="col-span-2"><InfoBox label="Full Name" value={ticket.client_name} accent /></div>
            <InfoBox label="Contact"  value={ticket.contact_number} />
            <InfoBox label="Platform" value={ticket.platform} />
            <div className="col-span-2"><InfoBox label="Email"   value={ticket.email} /></div>
            <div className="col-span-2"><InfoBox label="Address" value={ticket.address} /></div>
          </div>
        </div>

        <div className="card p-4 flex flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-lg bg-accent-100 flex items-center justify-center shrink-0">
              <Package className="w-3 h-3 text-accent-600" />
            </div>
            <p className="section-title mb-0 text-xs">Unit Information</p>
          </div>
          <div className="grid grid-cols-3 gap-1.5 flex-1 content-start">
            <InfoBox label="Brand"           value={ticket.unit_brand} accent />
            <InfoBox label="Model"           value={ticket.unit_model} accent />
            <InfoBox label="Type"            value={ticket.unit_type} />
            <InfoBox label="Mode of Service" value={ticket.mode_of_service} />
            <InfoBox label="Preferred Date"  value={ticket.preferred_date ? format(new Date(ticket.preferred_date), 'MMM d, yyyy') : '—'} />
            <InfoBox label="Preferred Time"  value={ticket.preferred_time || '—'} />
            <div className="col-span-3"><InfoBox label="Accessories" value={ticket.accessories_included || '—'} /></div>
          </div>
        </div>

        <div className="card p-4 flex flex-col lg:col-span-2">
          <p className="section-title flex items-center gap-2 text-xs mb-2 shrink-0"><FileText className="w-3 h-3" /> Issue Description</p>
          <p className="text-xs font-body text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3 flex-1 overflow-y-auto">{ticket.issue_description}</p>
        </div>
      </div>
    </div>
  )
}

function TechTab({
  ticket, notes, setNotes,
  canSeeNotes, canEdit,
  saving, saveMsg, uploading, fileInputRef,
  onSaveNotes, onUpload, onDeletePhoto,
}) {
  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-5 min-h-0">

      {/* Left — technician notes */}
      <div className="card p-5 flex flex-col min-h-0">
        <p className="section-title flex items-center gap-2 mb-4 shrink-0">
          <Wrench className="w-3.5 h-3.5" /> Technician Notes
        </p>

        {canSeeNotes ? (
          <div className="flex flex-col flex-1 min-h-0 gap-4">
            {canEdit ? (
              <>
                <div className="flex flex-col flex-1 min-h-0">
                  <label className="label shrink-0">Diagnosis Notes</label>
                  <textarea
                    className="input-field resize-none flex-1 min-h-0"
                    value={notes.diagnosis_notes}
                    onChange={e => setNotes(n => ({ ...n, diagnosis_notes: e.target.value }))}
                    placeholder="Enter diagnosis findings..."
                  />
                </div>
                <div className="flex flex-col flex-1 min-h-0">
                  <label className="label shrink-0">Repair Notes</label>
                  <textarea
                    className="input-field resize-none flex-1 min-h-0"
                    value={notes.repair_notes}
                    onChange={e => setNotes(n => ({ ...n, repair_notes: e.target.value }))}
                    placeholder="Enter repair process notes..."
                  />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={onSaveNotes} disabled={saving} className="btn-primary text-sm">
                    {saving
                      ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Save className="w-3.5 h-3.5" />
                    }
                    Save Notes
                  </button>
                  {saveMsg && (
                    <span className="text-sm font-sans font-semibold text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> {saveMsg}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col flex-1 min-h-0">
                  <label className="label shrink-0">Diagnosis Notes</label>
                  <div className="input-field bg-gray-50 text-gray-700 flex-1 overflow-y-auto">
                    {ticket.diagnosis_notes || <span className="text-gray-300 italic text-xs">No notes added</span>}
                  </div>
                </div>
                <div className="flex flex-col flex-1 min-h-0">
                  <label className="label shrink-0">Repair Notes</label>
                  <div className="input-field bg-gray-50 text-gray-700 flex-1 overflow-y-auto">
                    {ticket.repair_notes || <span className="text-gray-300 italic text-xs">No notes added</span>}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <LockedSection message="Technician notes are only visible to Admin and Technician roles." />
        )}
      </div>

      {/* Right — documentation / photos */}
      <div className="card p-5 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-4 shrink-0">
          <p className="section-title flex items-center gap-2 mb-0">
            <ImageIcon className="w-3.5 h-3.5" /> Documentation
          </p>
          {canEdit && (
            <div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onUpload} id="photo-upload" />
              <label htmlFor="photo-upload" className="btn-secondary text-sm cursor-pointer">
                {uploading
                  ? <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  : <Upload className="w-3.5 h-3.5" />
                }
                Upload
              </label>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {ticket.repair_photos && ticket.repair_photos.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 content-start">
              {ticket.repair_photos.map((url) => (
                <div key={url} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                  <img src={url} alt="Documentation photo" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-white/90 rounded-lg hover:bg-white">
                      <ExternalLink className="w-3.5 h-3.5 text-gray-700" />
                    </a>
                    {canEdit && (
                      <button onClick={() => onDeletePhoto(url)} className="p-1.5 bg-red-500 rounded-lg hover:bg-red-600">
                        <X className="w-3.5 h-3.5 text-white" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 text-center p-8">
              <ImageIcon className="w-10 h-10 text-gray-200" />
              <p className="text-sm font-body text-gray-400">No documentation uploaded yet</p>
              {canEdit && <p className="text-xs text-gray-300">Use the Upload button above to add photos</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function QuotationTab({
  isAdmin, canSeePricing, canEdit,
  laborItems, partsItems,
  discount, setDiscount,
  finalPrice, setFinalPrice,
  saving, saveMsg,
  laborTotal, partsTotal, discountValue, quotationLive,
  onSaveQuotation, onSaveFinalPayment,
  onUpdateLaborItem, onAddLaborItem, onRemoveLaborItem,
  onUpdatePartsItem, onAddPartsItem, onRemovePartsItem,
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {canSeePricing ? (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 min-h-0">

          {/* Left — scrollable line items + discount + save */}
          <div className="card p-3 sm:p-5 flex flex-col min-h-0">
            <p className="section-title flex items-center gap-2 mb-4 shrink-0">
              <DollarSign className="w-3.5 h-3.5" /> Pricing & Quotation
            </p>

            <div className="flex-1 overflow-y-auto min-h-0 space-y-5 pr-1">
              {/* Labor items */}
              <div>
                <label className="label mb-2">Labor Items</label>
                <div className="space-y-2">
                  {canEdit ? (
                    laborItems.map(item => (
                      <LineItem
                        key={item.id}
                        item={item}
                        onChange={onUpdateLaborItem}
                        onRemove={onRemoveLaborItem}
                        canRemove={laborItems.length > 1}
                      />
                    ))
                  ) : (
                    laborItems.filter(i => i.description || i.amount).map(item => (
                      <div key={item.id} className="flex justify-between text-sm py-1 border-b border-gray-50">
                        <span className="font-body text-gray-700">{item.description || '—'}</span>
                        <span className="font-mono text-gray-800">{peso(item.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
                {canEdit && (
                  <button type="button" onClick={onAddLaborItem}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-sans font-semibold">
                    <Plus className="w-3.5 h-3.5" /> Add Labor Item
                  </button>
                )}
              </div>

              {/* Parts items */}
              <div className="border-t border-gray-100 pt-5">
                <label className="label mb-2">Parts Items</label>
                <div className="space-y-2">
                  {canEdit ? (
                    partsItems.map(item => (
                      <LineItem
                        key={item.id}
                        item={item}
                        onChange={onUpdatePartsItem}
                        onRemove={onRemovePartsItem}
                        canRemove={partsItems.length > 1}
                      />
                    ))
                  ) : (
                    partsItems.filter(i => i.description || i.amount).map(item => (
                      <div key={item.id} className="flex justify-between text-sm py-1 border-b border-gray-50">
                        <span className="font-body text-gray-700">{item.description || '—'}</span>
                        <span className="font-mono text-gray-800">{peso(item.amount)}</span>
                      </div>
                    ))
                  )}
                </div>
                {canEdit && (
                  <button type="button" onClick={onAddPartsItem}
                    className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-sans font-semibold">
                    <Plus className="w-3.5 h-3.5" /> Add Parts Item
                  </button>
                )}
              </div>
            </div>

            {/* Discount + save — pinned to bottom of card */}
            <div className="border-t border-gray-100 pt-4 mt-4 space-y-3 shrink-0">
              <div className="flex items-center gap-3 flex-wrap">
                <label className="label w-24 shrink-0 mb-0">Discount</label>
                {canEdit ? (
                  <div className="relative flex-1 min-w-[10rem] sm:flex-none sm:w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">₱</span>
                    <input type="number" min="0" step="0.01" value={discount}
                      onChange={e => setDiscount(e.target.value)} placeholder="0.00"
                      className="input-field pl-7 text-sm text-right font-mono" />
                  </div>
                ) : (
                  <span className="font-mono text-sm text-gray-700">
                    {discountValue > 0 ? `− ${peso(discountValue)}` : '—'}
                  </span>
                )}
              </div>
              {canEdit && (
                <div className="flex items-center gap-3">
                  <button onClick={onSaveQuotation} disabled={saving} className="btn-primary text-sm">
                    {saving
                      ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Save className="w-3.5 h-3.5" />
                    }
                    Save Quotation
                  </button>
                  {saveMsg === 'Quotation saved!' && (
                    <span className="text-sm font-sans font-semibold text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> {saveMsg}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right — totals summary + amount paid, stacked vertically */}
          <div className="flex flex-col gap-4">
            {/* Totals */}
            <div className="card p-3 sm:p-5 space-y-2">
              <p className="section-title text-xs mb-3">Summary</p>
              <SummaryLine label="Labor Subtotal" value={peso(laborTotal)} />
              <SummaryLine label="Parts Subtotal" value={peso(partsTotal)} />
              {discountValue > 0 && (
                <SummaryLine label="Discount" value={`− ${peso(discountValue)}`} valueClass="text-green-600" />
              )}
              <div className="border-t border-gray-200 pt-3 mt-1 flex items-center justify-between">
                <span className="text-sm font-sans font-bold text-gray-700">Quotation Total</span>
                <span className="text-xl font-display tracking-wider text-brand-600">{peso(quotationLive)}</span>
              </div>
            </div>

            {/* Amount paid */}
            <div className="card p-3 sm:p-5 space-y-3 flex-1 flex flex-col">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                <p className="section-title text-xs mb-0">Amount Paid</p>
              </div>
              {canEdit ? (
                <div className="relative w-full">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">₱</span>
                  <input type="number" min="0" step="0.01" value={finalPrice}
                    onChange={e => setFinalPrice(e.target.value)} placeholder="0.00"
                    className="input-field pl-7 text-sm text-right font-mono w-full" />
                </div>
              ) : (
                <p className="text-3xl font-display tracking-wider text-emerald-700 flex-1 flex items-center">
                  {finalPrice ? peso(finalPrice) : <span className="text-gray-300 text-base italic font-sans font-normal">Not yet collected</span>}
                </p>
              )}
              {canEdit && (
                <div className="flex flex-col gap-2 mt-auto">
                  <button onClick={onSaveFinalPayment} disabled={saving}
                    className="btn-primary text-sm bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 focus:ring-emerald-400 w-full justify-center">
                    {saving
                      ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Save className="w-3.5 h-3.5" />
                    }
                    Save Final Payment
                  </button>
                  {saveMsg === 'Final payment saved!' && (
                    <span className="text-sm font-sans font-semibold text-green-600 flex items-center justify-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> {saveMsg}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      ) : (
        <div className="card p-5 flex-1 flex items-center justify-center">
          <LockedSection message="Pricing details are hidden until the ticket is approved." />
        </div>
      )}
    </div>
  )
}

function SettingsTab({ isAdmin, deleteConfirm, setDeleteConfirm, onDelete }) {
  return (
    <div className="space-y-5">
      {isAdmin ? (
        <div className="card border border-red-100 p-5">
          <p className="section-title text-red-400 flex items-center gap-2 mb-3">
            <Trash2 className="w-3.5 h-3.5" /> Delete Ticket
          </p>
          <p className="text-sm font-body text-gray-500 mb-4">
            Permanently delete this ticket and all associated data. This action cannot be undone.
          </p>
          {!deleteConfirm ? (
            <button onClick={() => setDeleteConfirm(true)} className="btn-danger text-sm">
              <Trash2 className="w-3.5 h-3.5" /> Delete This Ticket
            </button>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-sm font-body text-red-700">Are you sure? This cannot be undone.</p>
              <button onClick={onDelete} className="btn-danger text-sm">Yes, Delete</button>
              <button onClick={() => setDeleteConfirm(false)} className="btn-secondary text-sm">Cancel</button>
            </div>
          )}
        </div>
      ) : (
        <div className="card p-5">
          <p className="section-title flex items-center gap-2 mb-3">
            <Settings className="w-3.5 h-3.5" /> Settings
          </p>
          <LockedSection message="Settings are restricted to Admin role only." />
        </div>
      )}
    </div>
  )
}

// ── Page component ────────────────────────────────────────────────────────────
export default function TicketDetailPage() {
  const { id } = useParams()
  const [activeTab, setActiveTab] = useState('overview')

  const {
    ticket, loading, saving, uploading, statusUpdating, fileInputRef,
    notes, setNotes,
    laborItems, setLaborItems,
    partsItems, setPartsItems,
    discount, setDiscount,
    finalPrice, setFinalPrice,
    saveMsg, transitionErrors, deleteConfirm, setDeleteConfirm,
    undoConfirm, setUndoConfirm,
    isAdmin, isTechnician, getAllowedTransitions,
    updateStatus, undoStatus, saveNotesAndPricing,
    uploadPhotos, deletePhoto, deleteTicket,
    updateItem, addItem, removeItem,
  } = useTicket(id)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const nextStatuses    = getAllowedTransitions(ticket.status)
  const trackingUrl     = getTrackingUrl(ticket.tracking_token)
  const safeTrackingUrl = trackingUrl?.startsWith('http') ? trackingUrl : '#'
  const laborTotal      = sumItems(laborItems)
  const partsTotal      = sumItems(partsItems)
  const discountValue   = parseFloat(discount) || 0
  const quotationLive   = Math.max(0, laborTotal + partsTotal - discountValue)
  const isApproved      = ticket.status !== 'Pending' && ticket.status !== 'Denied'
  const isPaid          = ticket.status === 'Paid'
  const canSeeNotes     = isAdmin || isTechnician
  const canSeePricing   = isAdmin || isApproved
  // Once paid the ticket is locked — all fields become read-only regardless of role.
  const canEditNotes    = isTechnician && !isPaid
  const canEditPricing  = isAdmin && !isPaid
  const canUndo         = (isAdmin || isTechnician) && !!ticket.previous_status && ticket.previous_status !== ticket.status
  const showActions     = nextStatuses.length > 0 || canUndo
  const statusGuidance  = isAdmin ? STATUS_GUIDANCE.Admin[ticket.status]
    : isTechnician ? STATUS_GUIDANCE.Technician[ticket.status]
    : null

  return (
    // Extra mobile bottom padding keeps content clear of the fixed action bar
    <div className={`flex flex-col flex-1 gap-3 animate-fade-in min-h-0 ${showActions ? 'pb-32' : 'pb-0'}`}>

      {/* ── Hero — bleeds to edges of the main padding ── */}
      <div className="-mx-5 -mt-5 lg:-mx-7 lg:-mt-7 bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-800 px-5 lg:px-7 pt-7 lg:pt-12 pb-0">
        {/* Back + actions */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <Link to="/tickets" className="inline-flex items-center gap-2 text-sm font-body text-gray-400 hover:text-white transition-colors shrink-0">
            <ArrowLeft className="w-4 h-4" /> All Tickets
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            <a href={safeTrackingUrl} target="_blank" rel="noopener noreferrer"
              className="btn-secondary text-sm bg-teal-600 border-teal-600 text-white hover:bg-teal-700 hover:border-teal-700">
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tracking Page</span>
            </a>
            <button onClick={() => downloadTicketPDF(ticket)}
              className="btn-secondary text-sm bg-white border-white text-gray-900 hover:bg-gray-100 hover:border-gray-100">
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">PDF</span>
            </button>
          </div>
        </div>

        {/* Ticket header */}
        <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-start gap-4">
            {/* Profile avatar placeholder */}
            <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center shrink-0 mt-0.5">
              <User className="w-6 h-6 text-white/60" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-xl sm:text-2xl text-white tracking-wider">{ticket.ticket_id}</span>
                <StatusBadge status={ticket.status} size="sm" />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 mt-1.5 gap-0.5">
                <p className="text-xs font-body text-gray-500">
                  Submitted {format(new Date(ticket.created_at), 'MMM d, yyyy · h:mm a')}
                </p>
                <span className="hidden sm:inline text-gray-600 text-xs">·</span>
                <p className="text-xs font-body text-gray-500">
                  Updated {format(new Date(ticket.updated_at), 'MMM d, yyyy · h:mm a')}
                </p>
                {ticket.paid_at && (
                  <p className="text-xs font-body text-emerald-400 font-semibold">
                    ✓ Paid {format(new Date(ticket.paid_at), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tab bar anchored to bottom of hero — active tab bridges into content */}
        <div className="md:hidden mb-4">
          <select
            id="ticket-section-select"
            value={activeTab}
            onChange={e => setActiveTab(e.target.value)}
            className="input-field bg-dark-800 border-dark-600 text-white"
          >
            <option value="overview">Overview</option>
            <option value="tech">Technical Details</option>
            <option value="admin">Quotation &amp; Payment</option>
            <option value="settings">Settings</option>
          </select>
        </div>
        <div className="hidden md:flex gap-1 -mb-px">
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={Eye}        label="Overview" />
          <TabButton active={activeTab === 'tech'}     onClick={() => setActiveTab('tech')}     icon={Wrench}     label="Technical Details" />
          <TabButton active={activeTab === 'admin'}    onClick={() => setActiveTab('admin')}    icon={CreditCard} label="Quotation & Payment" />
          <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={Settings}   label="Settings" />
        </div>
      </div>

      {activeTab === 'overview' && (
        <OverviewTab
          ticket={ticket}           statusGuidance={statusGuidance}
          showActions={showActions} nextStatuses={nextStatuses}
          canUndo={canUndo}         undoConfirm={undoConfirm}   setUndoConfirm={setUndoConfirm}
          statusUpdating={statusUpdating} transitionErrors={transitionErrors}
          updateStatus={updateStatus}     undoStatus={undoStatus}
        />
      )}

      {activeTab === 'tech' && (
        <TechTab
          ticket={ticket}
          notes={notes}           setNotes={setNotes}
          canSeeNotes={canSeeNotes}   canEdit={canEditNotes}
          saving={saving}         saveMsg={saveMsg}
          uploading={uploading}   fileInputRef={fileInputRef}
          onSaveNotes={() => saveNotesAndPricing('notes')}
          onUpload={uploadPhotos}
          onDeletePhoto={deletePhoto}
        />
      )}

      {activeTab === 'admin' && (
        <QuotationTab
          isAdmin={isAdmin}           canSeePricing={canSeePricing}
          canEdit={canEditPricing}
          laborItems={laborItems}     partsItems={partsItems}
          discount={discount}         setDiscount={setDiscount}
          finalPrice={finalPrice}     setFinalPrice={setFinalPrice}
          saving={saving}             saveMsg={saveMsg}
          laborTotal={laborTotal}     partsTotal={partsTotal}
          discountValue={discountValue} quotationLive={quotationLive}
          onSaveQuotation={() => saveNotesAndPricing('quotation')}
          onSaveFinalPayment={() => saveNotesAndPricing('payment')}
          onUpdateLaborItem={(itemId, f, v) => updateItem(setLaborItems, itemId, f, v)}
          onAddLaborItem={() => addItem(setLaborItems)}
          onRemoveLaborItem={itemId => removeItem(setLaborItems, itemId)}
          onUpdatePartsItem={(itemId, f, v) => updateItem(setPartsItems, itemId, f, v)}
          onAddPartsItem={() => addItem(setPartsItems)}
          onRemovePartsItem={itemId => removeItem(setPartsItems, itemId)}
        />
      )}

      {activeTab === 'settings' && (
        <SettingsTab
          isAdmin={isAdmin}
          deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm}
          onDelete={deleteTicket}
        />
      )}

      {/* Mobile action bar — fixed to the bottom of the screen. Status
          transition button(s) fill ~90% of the row, undo the remaining ~10%.
          Stays below the sidebar drawer (z-50) and its overlay (z-40). */}
      {showActions && activeTab === 'overview' && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-64 z-30 bg-white border-t border-gray-200 px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {transitionErrors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 mb-3 flex flex-col gap-1">
              {transitionErrors.map((msg, i) => (
                <p key={i} className="flex items-start gap-2 text-xs font-body text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px text-red-500" />
                  {msg}
                </p>
              ))}
            </div>
          )}

          {undoConfirm ? (
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="text-sm font-body text-gray-600">
                Revert to <span className="font-semibold">{ticket.previous_status}</span>?
              </span>
              <button onClick={undoStatus} disabled={statusUpdating} className="btn-primary text-sm flex-1 justify-center">
                {statusUpdating
                  ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : 'Yes, Revert'
                }
              </button>
              <button onClick={() => setUndoConfirm(false)} disabled={statusUpdating} className="btn-secondary text-sm">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-3">
              {nextStatuses.map(status => (
                <button
                  key={status}
                  onClick={() => updateStatus(status)}
                  disabled={statusUpdating}
                  aria-label={`Transition to ${status}`}
                  className={`btn-primary text-sm px-6 ${status === 'Denied' ? 'bg-red-600 hover:bg-red-700 focus:ring-red-400' : 'bg-amber-500 hover:bg-amber-600 focus:ring-amber-400'}`}
                >
                  {statusUpdating
                    ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : `→ ${status}`
                  }
                </button>
              ))}
              {canUndo && (
                <button
                  onClick={() => setUndoConfirm(true)}
                  disabled={statusUpdating}
                  aria-label={`Undo — revert to ${ticket.previous_status}`}
                  className="btn-secondary text-sm px-5"
                >
                  <Undo2 className="w-3.5 h-3.5" /> Undo
                </button>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
