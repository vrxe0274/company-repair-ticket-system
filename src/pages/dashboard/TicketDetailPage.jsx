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

import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowLeft, Download, ExternalLink, Upload, X, Save,
  CheckCircle, User, Package, Wrench, FileText, DollarSign,
  Image as ImageIcon, Trash2, Plus, Minus, Lock, Shield,
  Settings, Eye, CreditCard, AlertTriangle,
} from 'lucide-react'
import { supabase }                                    from '../../lib/supabase'
import { getTrackingUrl, STATUS_ORDER }                from '../../lib/utils'
import { createNotification, buildStatusNotification } from '../../lib/notifications'
import { downloadTicketPDF }                           from '../../lib/pdf'
import { useRole }                                     from '../../hooks/useRole.jsx'
import StatusBadge                                     from '../../components/ui/StatusBadge.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────
const SAVE_MSG_DURATION_MS  = 2500
const PDF_DOWNLOAD_DELAY_MS = 300
const MAX_PHOTO_BYTES       = 10 * 1024 * 1024

const TICKET_COLUMNS = [
  'id', 'ticket_id', 'status', 'created_at', 'updated_at', 'paid_at',
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
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={item.description}
        onChange={e => onChange(item.id, 'description', e.target.value)}
        placeholder="Description"
        className="input-field w-48 sm:w-56 text-sm shrink-0"
      />
      <div className="relative w-32 shrink-0">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">₱</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={item.amount}
          onChange={e => onChange(item.id, 'amount', e.target.value)}
          placeholder="0.00"
          className="input-field pl-7 text-sm text-right font-mono"
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
    <div className={`rounded-lg px-3 py-2.5 border ${accent ? 'bg-brand-50 border-brand-100' : 'bg-gray-50 border-gray-100'}`}>
      <p className="text-xs font-mono uppercase tracking-widest text-gray-500 mb-0.5">{label}</p>
      <p className={`text-sm font-sans font-semibold ${accent ? 'text-brand-700' : 'text-gray-800'}`}>
        {value || <span className="text-gray-300 italic font-normal">—</span>}
      </p>
    </div>
  )
}

function TabButton({ active, onClick, icon: Icon, label, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-sans font-semibold rounded-t-lg border-b-2 transition-all whitespace-nowrap
        ${active
          ? 'text-brand-700 border-brand-600 bg-white'
          : 'text-gray-500 border-transparent hover:text-gray-800 hover:border-gray-300 bg-gray-50 hover:bg-white'
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

    // Gate 1: quotation must be saved before starting repairs
    if (newStatus === 'Repair in Progress' && ticket.status === 'Inspection & Quote') {
      if (ticket.quotation_amount === null || ticket.quotation_amount === undefined) {
        setTransitionErrors(['A saved quotation is required before starting repairs. Fill in labor/parts items in the Quotation & Payment tab and save.'])
        return
      }
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
    const patch = { status: newStatus }
    if (newStatus === 'Paid') patch.paid_at = new Date().toISOString()
    const { data, error } = await supabase
      .from('tickets').update(patch).eq('id', id).select(TICKET_COLUMNS).single()
    if (error) {
      alert(`Status update failed: ${error.message}`)
    } else {
      hydrate(data)
      const note = buildStatusNotification({ actorRole: role, newStatus, ticketHumanId: data.ticket_id })
      if (note) {
        try {
          await createNotification({
            recipientRole: note.recipientRole,
            message:       note.message,
            type:          'status_change',
            ticketUuid:    data.id,
            ticketHumanId: data.ticket_id,
          })
        } catch (err) {
          console.error('Notification failed:', err)
        }
      }
      if (newStatus === 'Paid') {
        setTimeout(() => downloadTicketPDF(data), PDF_DOWNLOAD_DELAY_MS)
      }
    }
    setStatusUpdating(false)
  }

  async function saveNotesAndPricing() {
    setSaving(true)
    const cleanLabor = laborItems
      .filter(it => it.description.trim() || String(it.amount).trim() !== '')
      .map(({ description, amount }) => ({ description: description.trim(), amount: parseFloat(amount) || 0 }))
    const cleanParts = partsItems
      .filter(it => it.description.trim() || String(it.amount).trim() !== '')
      .map(({ description, amount }) => ({ description: description.trim(), amount: parseFloat(amount) || 0 }))
    const hasItems  = cleanLabor.length > 0 || cleanParts.length > 0
    const quotation = computeQuotation(cleanLabor, cleanParts, discount)
    const notesPatch   = isTechnician
      ? { diagnosis_notes: notes.diagnosis_notes || null, repair_notes: notes.repair_notes || null }
      : {}
    const pricingPatch = isAdmin ? {
      labor_items:      cleanLabor,
      parts_items:      cleanParts,
      discount_amount:  parseFloat(discount) || 0,
      quotation_amount: hasItems ? quotation : null,
      final_price:      finalPrice !== '' && finalPrice !== null ? Number(finalPrice) : null,
    } : {}
    const { data, error } = await supabase
      .from('tickets').update({ ...notesPatch, ...pricingPatch }).eq('id', id).select(TICKET_COLUMNS).single()
    if (error) {
      alert(`Save failed: ${error.message}`)
    } else {
      hydrate(data)
      setSaveMsg('Saved!')
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
    isAdmin, isTechnician, getAllowedTransitions,
    updateStatus, saveNotesAndPricing,
    uploadPhotos, deletePhoto, deleteTicket,
    updateItem, addItem, removeItem,
  }
}

// ── Tab components ────────────────────────────────────────────────────────────

function OverviewTab({ ticket }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
              <User className="w-3.5 h-3.5 text-brand-600" />
            </div>
            <p className="section-title mb-0">Client Information</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2"><InfoBox label="Full Name" value={ticket.client_name} accent /></div>
            <InfoBox label="Contact"  value={ticket.contact_number} />
            <InfoBox label="Platform" value={ticket.platform} />
            <div className="col-span-2"><InfoBox label="Email"   value={ticket.email} /></div>
            <div className="col-span-2"><InfoBox label="Address" value={ticket.address} /></div>
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-accent-100 flex items-center justify-center">
              <Package className="w-3.5 h-3.5 text-accent-600" />
            </div>
            <p className="section-title mb-0">Unit Information</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <InfoBox label="Brand"           value={ticket.unit_brand} accent />
            <InfoBox label="Model"           value={ticket.unit_model} accent />
            <InfoBox label="Type"            value={ticket.unit_type} />
            <InfoBox label="Mode of Service" value={ticket.mode_of_service} />
            <InfoBox label="Preferred Date"  value={ticket.preferred_date ? format(new Date(ticket.preferred_date), 'MMMM d, yyyy') : '—'} />
            <InfoBox label="Preferred Time"  value={ticket.preferred_time || '—'} />
            <div className="col-span-2"><InfoBox label="Accessories" value={ticket.accessories_included || '—'} /></div>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <p className="section-title flex items-center gap-2"><FileText className="w-3.5 h-3.5" /> Issue Description</p>
        <p className="text-sm font-body text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-4">{ticket.issue_description}</p>
      </div>
    </div>
  )
}

function TechTab({
  ticket, notes, setNotes,
  isTechnician, isAdmin, canSeeNotes,
  saving, saveMsg, uploading, fileInputRef,
  onSaveNotes, onUpload, onDeletePhoto,
}) {
  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="section-title flex items-center gap-2 mb-0">
            <Wrench className="w-3.5 h-3.5" /> Technician Notes
          </p>
          {isTechnician ? (
            <span className="inline-flex items-center gap-1 text-xs font-mono text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
              <CheckCircle className="w-2.5 h-2.5" /> Editing enabled
            </span>
          ) : isAdmin ? (
            <span className="inline-flex items-center gap-1 text-xs font-mono text-brand-700 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-full">
              <Shield className="w-2.5 h-2.5" /> Admin view
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-mono text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
              <Lock className="w-2.5 h-2.5" /> View only
            </span>
          )}
        </div>

        {canSeeNotes ? (
          <div className="space-y-4">
            {isTechnician ? (
              <>
                <div>
                  <label className="label">Diagnosis Notes</label>
                  <textarea
                    className="input-field resize-none" rows={3}
                    value={notes.diagnosis_notes}
                    onChange={e => setNotes(n => ({ ...n, diagnosis_notes: e.target.value }))}
                    placeholder="Enter diagnosis findings..."
                  />
                </div>
                <div>
                  <label className="label">Repair Notes</label>
                  <textarea
                    className="input-field resize-none" rows={3}
                    value={notes.repair_notes}
                    onChange={e => setNotes(n => ({ ...n, repair_notes: e.target.value }))}
                    placeholder="Enter repair process notes..."
                  />
                </div>
                <div className="flex items-center gap-3 pt-1">
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
                <div>
                  <label className="label">Diagnosis Notes</label>
                  <div className="input-field bg-gray-50 text-gray-700 min-h-[72px]">
                    {ticket.diagnosis_notes || <span className="text-gray-300 italic text-xs">No notes added</span>}
                  </div>
                </div>
                <div>
                  <label className="label">Repair Notes</label>
                  <div className="input-field bg-gray-50 text-gray-700 min-h-[72px]">
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

      {/* Documentation / photos */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="section-title flex items-center gap-2 mb-0">
            <ImageIcon className="w-3.5 h-3.5" /> Documentation
          </p>
          {isTechnician && (
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
        {ticket.repair_photos && ticket.repair_photos.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {ticket.repair_photos.map((url) => (
              <div key={url} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                <img src={url} alt="Documentation photo" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-white/90 rounded-lg hover:bg-white">
                    <ExternalLink className="w-3.5 h-3.5 text-gray-700" />
                  </a>
                  {isTechnician && (
                    <button onClick={() => onDeletePhoto(url)} className="p-1.5 bg-red-500 rounded-lg hover:bg-red-600">
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center">
            <ImageIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm font-body text-gray-500">No documentation uploaded yet</p>
          </div>
        )}
      </div>
    </div>
  )
}

function QuotationTab({
  isAdmin, canSeePricing,
  laborItems, partsItems,
  discount, setDiscount,
  finalPrice, setFinalPrice,
  saving, saveMsg,
  laborTotal, partsTotal, discountValue, quotationLive,
  onSave,
  onUpdateLaborItem, onAddLaborItem, onRemoveLaborItem,
  onUpdatePartsItem, onAddPartsItem, onRemovePartsItem,
}) {
  return (
    <div className="space-y-5">
      {canSeePricing ? (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-5">
            <p className="section-title flex items-center gap-2 mb-0">
              <DollarSign className="w-3.5 h-3.5" /> Pricing & Quotation
            </p>
            {!isAdmin && (
              <span className="inline-flex items-center gap-1 text-xs font-mono text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                <Lock className="w-2.5 h-2.5" /> View only
              </span>
            )}
          </div>

          <div className="space-y-5">
            {/* Labor items */}
            <div>
              <label className="label mb-2">Labor Items</label>
              <div className="space-y-2">
                {isAdmin ? (
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
                    <div key={item.id} className="flex justify-between text-sm py-1">
                      <span className="font-body text-gray-700">{item.description || '—'}</span>
                      <span className="font-mono text-gray-800">{peso(item.amount)}</span>
                    </div>
                  ))
                )}
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={onAddLaborItem}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-sans font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Labor Item
                </button>
              )}
            </div>

            {/* Parts items */}
            <div>
              <label className="label mb-2">Parts Items</label>
              <div className="space-y-2">
                {isAdmin ? (
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
                    <div key={item.id} className="flex justify-between text-sm py-1">
                      <span className="font-body text-gray-700">{item.description || '—'}</span>
                      <span className="font-mono text-gray-800">{peso(item.amount)}</span>
                    </div>
                  ))
                )}
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={onAddPartsItem}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-sans font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Parts Item
                </button>
              )}
            </div>

            {/* Discount */}
            <div className="flex items-center gap-3">
              <label className="label w-40 shrink-0 mb-0">Discount</label>
              {isAdmin ? (
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">₱</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                    placeholder="0.00"
                    className="input-field pl-7 text-sm text-right font-mono"
                  />
                </div>
              ) : (
                <span className="font-mono text-sm text-gray-700">
                  {discountValue > 0 ? `− ${peso(discountValue)}` : '—'}
                </span>
              )}
            </div>

            {/* Totals summary */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
              <SummaryLine label="Labor Subtotal" value={peso(laborTotal)} />
              <SummaryLine label="Parts Subtotal" value={peso(partsTotal)} />
              {discountValue > 0 && (
                <SummaryLine label="Discount" value={`− ${peso(discountValue)}`} valueClass="text-green-600" />
              )}
              <div className="border-t border-gray-200 pt-2 mt-2 flex items-center justify-between">
                <span className="text-sm font-sans font-bold text-gray-700">Quotation Total</span>
                <span className="text-lg font-display tracking-wider text-brand-600">{peso(quotationLive)}</span>
              </div>
            </div>

            {/* Final price */}
            <div className="flex items-center gap-3 pt-1">
              <div className="flex items-center gap-2 w-40 shrink-0">
                <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                <label className="text-sm font-sans font-bold text-gray-700">Amount Paid</label>
              </div>
              {isAdmin ? (
                <div className="relative w-36">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">₱</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={finalPrice}
                    onChange={e => setFinalPrice(e.target.value)}
                    placeholder="0.00"
                    className="input-field pl-7 text-sm text-right font-mono"
                  />
                </div>
              ) : (
                <span className="font-mono text-sm font-semibold text-emerald-700">
                  {finalPrice ? peso(finalPrice) : '—'}
                </span>
              )}
              {isAdmin && (
                <span className="text-xs font-body text-gray-400">(set when payment is collected)</span>
              )}
            </div>

            {/* Save — Admin only */}
            {isAdmin && (
              <div className="flex items-center gap-3 pt-1">
                <button onClick={onSave} disabled={saving} className="btn-primary text-sm">
                  {saving
                    ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Save className="w-3.5 h-3.5" />
                  }
                  Save Changes
                </button>
                {saveMsg && (
                  <span className="text-sm font-sans font-semibold text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> {saveMsg}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card p-5">
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
    isAdmin, isTechnician, getAllowedTransitions,
    updateStatus, saveNotesAndPricing,
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
  const progressIdx     = STATUS_ORDER.indexOf(ticket.status)
  const laborTotal      = sumItems(laborItems)
  const partsTotal      = sumItems(partsItems)
  const discountValue   = parseFloat(discount) || 0
  const quotationLive   = Math.max(0, laborTotal + partsTotal - discountValue)
  const isApproved      = ticket.status !== 'Pending' && ticket.status !== 'Denied'
  const canSeeNotes     = isAdmin || isTechnician
  const canSeePricing   = isAdmin || isApproved

  return (
    <div className="space-y-5 animate-fade-in pb-10">

      {/* Back + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link to="/tickets" className="inline-flex items-center gap-2 text-sm font-body text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> All Tickets
        </Link>
        <div className="flex items-center gap-2">
          <a href={safeTrackingUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm">
            <ExternalLink className="w-3.5 h-3.5" /> Tracking Page
          </a>
          <button onClick={() => downloadTicketPDF(ticket)} className="btn-secondary text-sm">
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>

      {/* Ticket header */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <span className="font-mono font-bold text-xl text-gray-900 tracking-wider">{ticket.ticket_id}</span>
              <StatusBadge status={ticket.status} size="lg" />
            </div>
            <p className="text-xs font-body text-gray-400">
              Submitted {format(new Date(ticket.created_at), 'MMMM d, yyyy · h:mm a')} ·
              Updated {format(new Date(ticket.updated_at), 'MMM d, h:mm a')}
            </p>
            {ticket.paid_at && (
              <p className="text-xs font-body text-emerald-600 mt-0.5 font-semibold">
                ✓ Paid on {format(new Date(ticket.paid_at), 'MMMM d, yyyy · h:mm a')}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            {nextStatuses.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {nextStatuses.map(status => (
                  <button
                    key={status}
                    onClick={() => updateStatus(status)}
                    disabled={statusUpdating}
                    aria-label={`Transition to ${status}`}
                    className={`btn-primary text-sm ${status === 'Denied' ? 'bg-red-600 hover:bg-red-700 focus:ring-red-400' : ''}`}
                  >
                    {statusUpdating
                      ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : `→ ${status}`
                    }
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-xs font-body text-gray-500 italic">No transitions available</span>
            )}
            {transitionErrors.length > 0 && (
              <div className="flex flex-col gap-1 items-end max-w-xs">
                {transitionErrors.map((msg, i) => (
                  <p key={i} className="flex items-start gap-1 text-xs font-body text-red-600 text-right">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    {msg}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Status step indicator */}
        <div className="flex items-center">
          {STATUS_ORDER.map((s, i) => {
            const isComplete = i < progressIdx
            const isCurrent  = i === progressIdx
            return (
              <div key={s} className="flex items-center flex-1">
                <div className="flex items-center gap-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-300
                    ${isComplete ? 'bg-brand-600 text-white' : isCurrent ? 'bg-dark-900 text-white ring-2 ring-brand-500 ring-offset-1' : 'bg-gray-200 text-gray-400'}`}
                  >
                    {isComplete
                      ? <CheckCircle className="w-3.5 h-3.5" />
                      : <span className="text-xs font-bold">{i + 1}</span>
                    }
                  </div>
                  <span className={`text-xs font-sans font-semibold hidden lg:block
                    ${isCurrent ? 'text-gray-900' : isComplete ? 'text-brand-600' : 'text-gray-400'}`}>
                    {s}
                  </span>
                </div>
                {i < STATUS_ORDER.length - 1 && (
                  <div className="flex-1 mx-2 h-0.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className={`h-full bg-brand-500 transition-all duration-500 ${isComplete ? 'w-full' : 'w-0'}`} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-gray-200 -mb-1">
        <div className="flex gap-1 overflow-x-auto pb-0">
          <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} icon={Eye}        label="Overview" />
          <TabButton active={activeTab === 'tech'}     onClick={() => setActiveTab('tech')}     icon={Wrench}     label="Technical Details" />
          <TabButton active={activeTab === 'admin'}    onClick={() => setActiveTab('admin')}    icon={CreditCard} label="Quotation & Payment" />
          <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={Settings}   label="Settings" />
        </div>
      </div>

      {activeTab === 'overview' && <OverviewTab ticket={ticket} />}

      {activeTab === 'tech' && (
        <TechTab
          ticket={ticket}
          notes={notes}           setNotes={setNotes}
          isTechnician={isTechnician} isAdmin={isAdmin} canSeeNotes={canSeeNotes}
          saving={saving}         saveMsg={saveMsg}
          uploading={uploading}   fileInputRef={fileInputRef}
          onSaveNotes={saveNotesAndPricing}
          onUpload={uploadPhotos}
          onDeletePhoto={deletePhoto}
        />
      )}

      {activeTab === 'admin' && (
        <QuotationTab
          isAdmin={isAdmin}           canSeePricing={canSeePricing}
          laborItems={laborItems}     partsItems={partsItems}
          discount={discount}         setDiscount={setDiscount}
          finalPrice={finalPrice}     setFinalPrice={setFinalPrice}
          saving={saving}             saveMsg={saveMsg}
          laborTotal={laborTotal}     partsTotal={partsTotal}
          discountValue={discountValue} quotationLive={quotationLive}
          onSave={saveNotesAndPricing}
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

    </div>
  )
}
