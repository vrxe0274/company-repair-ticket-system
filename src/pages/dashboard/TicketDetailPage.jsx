import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import {
  ArrowLeft, Download, ExternalLink, Upload, X, Save,
  CheckCircle, User, Package, Wrench, FileText, DollarSign,
  Image as ImageIcon, Trash2, Plus, Minus, Tag, Lock, Shield,
  Settings, Eye, CreditCard
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { NEXT_STATUSES, getTrackingUrl, STATUS_ORDER, STATUS_DESCRIPTIONS } from '../../lib/utils'
import { createNotification, buildStatusNotification } from '../../lib/notifications'
import { downloadTicketPDF } from '../../lib/pdf'
import { useRole } from '../../hooks/useRole.jsx'
import StatusBadge from '../../components/ui/StatusBadge.jsx'

// ── Helpers ───────────────────────────────────────────────────────────────────
const emptyItem = () => ({ id: crypto.randomUUID(), description: '', amount: '' })

function sumItems(items) {
  return items.reduce((acc, it) => acc + (parseFloat(it.amount) || 0), 0)
}

function computeQuotation(laborItems, partsItems, discount) {
  const total = sumItems(laborItems) + sumItems(partsItems) - (parseFloat(discount) || 0)
  return Math.max(0, total)
}

// ── Line-item row ─────────────────────────────────────────────────────────────
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

// ── Info highlight box ─────────────────────────────────────────────────────────
function InfoBox({ label, value, accent = false }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 border ${accent
      ? 'bg-brand-50 border-brand-100'
      : 'bg-gray-50 border-gray-100'}`}>
      <p className="text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
      <p className={`text-sm font-sans font-semibold ${accent ? 'text-brand-700' : 'text-gray-800'}`}>
        {value || <span className="text-gray-300 italic font-normal">—</span>}
      </p>
    </div>
  )
}

// ── Tab button ─────────────────────────────────────────────────────────────────
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
        <span className="ml-1 text-[10px] font-mono bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full">{badge}</span>
      )}
    </button>
  )
}

// ── Locked section placeholder ─────────────────────────────────────────────────
function LockedSection({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
        <Lock className="w-5 h-5 text-gray-400" />
      </div>
      <p className="text-sm font-body text-gray-400 max-w-xs">{message}</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TicketDetailPage() {
  const { id }      = useParams()
  const navigate    = useNavigate()
  const fileInputRef = useRef(null)
  const { role, getAllowedTransitions, isAdmin, isTechnician } = useRole()

  const [ticket,         setTicket]         = useState(null)
  const [loading,        setLoading]         = useState(true)
  const [saving,         setSaving]          = useState(false)
  const [uploading,      setUploading]       = useState(false)
  const [statusUpdating, setStatusUpdating]  = useState(false)
  const [notes,          setNotes]           = useState({ diagnosis_notes: '', repair_notes: '' })
  const [laborItems,     setLaborItems]      = useState([emptyItem()])
  const [partsItems,     setPartsItems]      = useState([emptyItem()])
  const [discount,       setDiscount]        = useState('')
  const [finalPrice,     setFinalPrice]      = useState('')
  const [saveMsg,        setSaveMsg]         = useState('')
  const [deleteConfirm,  setDeleteConfirm]   = useState(false)
  const [activeTab,      setActiveTab]       = useState('overview')

  useEffect(() => { fetchTicket() }, [id])

  async function fetchTicket() {
    setLoading(true)
    const { data, error } = await supabase.from('tickets').select('*').eq('id', id).single()
    if (error || !data) { navigate('/dashboard/tickets'); return }
    hydrate(data)
    setLoading(false)
  }

  function hydrate(data) {
    setTicket(data)
    setNotes({ diagnosis_notes: data.diagnosis_notes || '', repair_notes: data.repair_notes || '' })
    setLaborItems(data.labor_items?.length ? data.labor_items.map(it => ({ ...it, id: crypto.randomUUID() })) : [emptyItem()])
    setPartsItems(data.parts_items?.length ? data.parts_items.map(it => ({ ...it, id: crypto.randomUUID() })) : [emptyItem()])
    setDiscount(data.discount_amount ?? '')
    setFinalPrice(data.final_price ?? '')
  }

  // ── Status update ──────────────────────────────────────────────────────────
  async function updateStatus(newStatus) {
    setStatusUpdating(true)
    const patch = { status: newStatus }
    if (newStatus === 'Paid') patch.paid_at = new Date().toISOString()
    const { data, error } = await supabase.from('tickets').update(patch).eq('id', id).select().single()
    if (!error) {
      hydrate(data)

      // Send an in-app notification to the other role
      const note = buildStatusNotification({
        actorRole:     role,
        newStatus,
        ticketHumanId: data.ticket_id,
      })
      if (note) {
        createNotification({
          recipientRole: note.recipientRole,
          message:       note.message,
          type:          'status_change',
          ticketUuid:    data.id,
          ticketHumanId: data.ticket_id,
        })
      }

      if (newStatus === 'Paid') {
        setTimeout(() => downloadTicketPDF(data), 300)
      }
    }
    setStatusUpdating(false)
  }

  // ── Save notes + pricing ──────────────────────────────────────────────────
  async function saveNotesAndPricing() {
    setSaving(true)

    const cleanLabor = laborItems
      .filter(it => it.description.trim() || String(it.amount).trim() !== '')
      .map(({ description, amount }) => ({ description: description.trim(), amount: parseFloat(amount) || 0 }))
    const cleanParts = partsItems
      .filter(it => it.description.trim() || String(it.amount).trim() !== '')
      .map(({ description, amount }) => ({ description: description.trim(), amount: parseFloat(amount) || 0 }))

    const hasItems  = cleanLabor.length > 0 || cleanParts.length > 0
    const quotation = computeQuotation(laborItems, partsItems, discount)

    const notesPatch = isTechnician
      ? {
          diagnosis_notes: notes.diagnosis_notes || null,
          repair_notes:    notes.repair_notes    || null,
        }
      : {}

    const pricingPatch = isAdmin ? {
      labor_items:      cleanLabor,
      parts_items:      cleanParts,
      discount_amount:  parseFloat(discount) || 0,
      quotation_amount: hasItems ? quotation : null,
      final_price:      finalPrice !== '' && finalPrice !== null ? Number(finalPrice) : null,
    } : {}

    const { data, error } = await supabase.from('tickets').update({
      ...notesPatch,
      ...pricingPatch,
    }).eq('id', id).select().single()

    if (!error) {
      hydrate(data)
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2500)
    }
    setSaving(false)
  }

  async function saveTechNotes() {
    setSaving(true)
    const { data, error } = await supabase.from('tickets').update({
      diagnosis_notes: notes.diagnosis_notes || null,
      repair_notes:    notes.repair_notes    || null,
    }).eq('id', id).select().single()
    if (!error) {
      hydrate(data)
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2500)
    }
    setSaving(false)
  }

  // ── Line-item helpers ──────────────────────────────────────────────────────
  function updateItem(setter, itemId, field, value) {
    setter(prev => prev.map(it => it.id === itemId ? { ...it, [field]: value } : it))
  }
  function addItem(setter)          { setter(prev => [...prev, emptyItem()]) }
  function removeItem(setter, itemId) { setter(prev => prev.filter(it => it.id !== itemId)) }

  // ── Photo upload ───────────────────────────────────────────────────────────
  async function uploadPhotos(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setUploading(true)
    const newUrls = []
    try {
      for (const file of files) {
        const ext  = file.name.split('.').pop()
        const path = `${ticket.ticket_id}/${Date.now()}-${Math.random().toString(36).substr(2, 6)}.${ext}`
        const { error: uploadError } = await supabase.storage.from('repair-photos').upload(path, file, { cacheControl: '3600', upsert: false })
        if (uploadError) throw uploadError
        const { data: urlData } = supabase.storage.from('repair-photos').getPublicUrl(path)
        newUrls.push(urlData.publicUrl)
      }
      const updatedPhotos = [...(ticket.repair_photos || []), ...newUrls]
      const { data, error } = await supabase.from('tickets').update({ repair_photos: updatedPhotos }).eq('id', id).select().single()
      if (!error) setTicket(data)
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function deletePhoto(url) {
    const updatedPhotos = (ticket.repair_photos || []).filter(u => u !== url)
    const { data, error } = await supabase.from('tickets').update({ repair_photos: updatedPhotos }).eq('id', id).select().single()
    if (!error) setTicket(data)
  }

  async function deleteTicket() {
    await supabase.from('tickets').delete().eq('id', id)
    navigate('/dashboard/tickets')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Role-filtered transitions
  const nextStatuses  = getAllowedTransitions(ticket.status)
  const trackingUrl   = getTrackingUrl(ticket.tracking_token)
  const progressIdx   = STATUS_ORDER.indexOf(ticket.status)

  const laborTotal    = sumItems(laborItems)
  const partsTotal    = sumItems(partsItems)
  const discountValue = parseFloat(discount) || 0
  const quotationLive = Math.max(0, laborTotal + partsTotal - discountValue)

  const peso = n => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

  // Visibility rules
  const isApproved = ticket.status !== 'Pending' && ticket.status !== 'Denied'
  const canSeeNotes = isAdmin || isTechnician
  const canSeePricing = isAdmin || isApproved

  return (
    <div className="space-y-5 animate-fade-in pb-10">

      {/* Back + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link to="/dashboard/tickets" className="inline-flex items-center gap-2 text-sm font-body text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /> All Tickets
        </Link>
        <div className="flex items-center gap-2">
          <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm">
            <ExternalLink className="w-3.5 h-3.5" /> Tracking Page
          </a>
          <button onClick={() => downloadTicketPDF(ticket)} className="btn-secondary text-sm">
            <Download className="w-3.5 h-3.5" /> PDF
          </button>
        </div>
      </div>

      {/* Ticket header + status */}
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

          {/* Status transition buttons */}
          {nextStatuses.length > 0 ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-sans font-semibold text-gray-500">Move to:</span>
              {nextStatuses.map(s => (
                <button
                  key={s}
                  onClick={() => updateStatus(s)}
                  disabled={statusUpdating}
                  className={`text-xs px-3 py-1.5 rounded-lg font-sans font-semibold tracking-wide transition-all border
                    ${s === 'Denied'
                      ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                      : s === 'Inspection & Quote'
                        ? 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                        : s === 'Paid'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100'
                    }`}
                >
                  {statusUpdating ? '...' : `→ ${s}`}
                </button>
              ))}
            </div>
          ) : (
            ticket.status !== 'Paid' && ticket.status !== 'Denied' && (
              <div className="inline-flex items-center gap-1.5 text-xs font-body text-gray-400 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg">
                <Lock className="w-3 h-3" />
                No transitions available for <span className="font-semibold">{role}</span> at this stage
              </div>
            )
          )}
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-1">
          {STATUS_ORDER.map((s, i) => (
            <div key={s} title={s} className="flex-1 h-1.5 rounded-full overflow-hidden bg-gray-100">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: i <= progressIdx && ticket.status !== 'Denied' ? '100%' : '0%',
                  background: 'linear-gradient(to right, #7317e8, #d4007f)',
                }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Tab Bar ────────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 -mb-1">
        <div className="flex gap-1 overflow-x-auto pb-0">
          <TabButton
            active={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            icon={Eye}
            label="Overview"
          />
          <TabButton
            active={activeTab === 'tech'}
            onClick={() => setActiveTab('tech')}
            icon={Wrench}
            label="Technical Details"
          />
          <TabButton
            active={activeTab === 'admin'}
            onClick={() => setActiveTab('admin')}
            icon={CreditCard}
            label="Quotation & Payment"
           
          />
          <TabButton
            active={activeTab === 'settings'}
            onClick={() => setActiveTab('settings')}
            icon={Settings}
            label="Settings"
          />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 1 — OVERVIEW
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          {/* Client + Unit info */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Client */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
                  <User className="w-3.5 h-3.5 text-brand-600" />
                </div>
                <p className="section-title mb-0">Client Information</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <InfoBox label="Full Name" value={ticket.client_name} accent />
                </div>
                <InfoBox label="Contact" value={ticket.contact_number} />
                <InfoBox label="Platform" value={ticket.platform} />
                <div className="col-span-2">
                  <InfoBox label="Email" value={ticket.email} />
                </div>
                <div className="col-span-2">
                  <InfoBox label="Address" value={ticket.address} />
                </div>
              </div>
            </div>

            {/* Unit */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-accent-100 flex items-center justify-center">
                  <Package className="w-3.5 h-3.5 text-accent-600" />
                </div>
                <p className="section-title mb-0">Unit Information</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <InfoBox label="Brand" value={ticket.unit_brand} accent />
                <InfoBox label="Model" value={ticket.unit_model} accent />
                <InfoBox label="Type" value={ticket.unit_type} />
                <InfoBox label="Mode of Service" value={ticket.mode_of_service} />
                <InfoBox label="Preferred Date" value={ticket.preferred_date ? format(new Date(ticket.preferred_date), 'MMMM d, yyyy') : '—'} />
                <InfoBox label="Preferred Time" value={ticket.preferred_time || '—'} />
                <div className="col-span-2">
                  <InfoBox label="Accessories" value={ticket.accessories_included || '—'} />
                </div>
              </div>
            </div>
          </div>

          {/* Issue */}
          <div className="card p-5">
            <p className="section-title flex items-center gap-2"><FileText className="w-3.5 h-3.5" />Issue Description</p>
            <p className="text-sm font-body text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-4">{ticket.issue_description}</p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 2 — TECHNICIAN / DOCUMENTATION
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'tech' && (
        <div className="space-y-5">
          {/* Technician Notes */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="section-title flex items-center gap-2 mb-0">
                <Wrench className="w-3.5 h-3.5" />Technician Notes
              </p>
              {isTechnician ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                  <CheckCircle className="w-2.5 h-2.5" /> Editing enabled
                </span>
              ) : isAdmin ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-brand-700 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-full">
                  <Shield className="w-2.5 h-2.5" /> Admin view
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
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
                      <textarea className="input-field resize-none" rows={3} value={notes.diagnosis_notes}
                        onChange={e => setNotes(n => ({ ...n, diagnosis_notes: e.target.value }))}
                        placeholder="Enter diagnosis findings..." />
                    </div>
                    <div>
                      <label className="label">Repair Notes</label>
                      <textarea className="input-field resize-none" rows={3} value={notes.repair_notes}
                        onChange={e => setNotes(n => ({ ...n, repair_notes: e.target.value }))}
                        placeholder="Enter repair process notes..." />
                    </div>
                    <div className="flex items-center gap-3 pt-1">
                      <button onClick={saveTechNotes} disabled={saving} className="btn-primary text-sm">
                        {saving
                          ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <Save className="w-3.5 h-3.5" />
                        }
                        Save Notes
                      </button>
                      {saveMsg && (
                        <span className="text-sm font-sans font-semibold text-green-600 flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" />{saveMsg}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  /* Admin read-only view */
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

          {/* Documentation (formerly Repair Photos) */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="section-title flex items-center gap-2 mb-0"><ImageIcon className="w-3.5 h-3.5" />Documentation</p>
              {isTechnician && (
                <div>
                  <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={uploadPhotos} id="photo-upload" />
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
                {ticket.repair_photos.map((url, i) => (
                  <div key={i} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                    <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-white/90 rounded-lg hover:bg-white">
                        <ExternalLink className="w-3.5 h-3.5 text-gray-700" />
                      </a>
                      {isTechnician && (
                        <button onClick={() => deletePhoto(url)} className="p-1.5 bg-red-500 rounded-lg hover:bg-red-600">
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
                <p className="text-sm font-body text-gray-400">No documentation uploaded yet</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 3 — ADMIN (Quotation & Payment)
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'admin' && (
        <div className="space-y-5">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-5">
              <p className="section-title flex items-center gap-2 mb-0">
                <DollarSign className="w-3.5 h-3.5" />Pricing & Quotation
              </p>
              {!isAdmin && (
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  <Lock className="w-2.5 h-2.5" /> View only — Admin can edit
                </span>
              )}
            </div>

            <div className="space-y-6">
              {/* Labor fees */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-brand-500" />
                    <span className="text-sm font-sans font-bold text-gray-700 tracking-wide">Labor Fees</span>
                  </div>
                  {isAdmin && (
                    <button type="button" onClick={() => addItem(setLaborItems)}
                      className="inline-flex items-center gap-1 text-xs font-sans font-semibold text-brand-600 hover:text-brand-700 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {isAdmin ? (
                    laborItems.map(item => (
                      <LineItem
                        key={item.id} item={item}
                        onChange={(id, field, val) => updateItem(setLaborItems, id, field, val)}
                        onRemove={id => removeItem(setLaborItems, id)}
                        canRemove={laborItems.length > 1}
                      />
                    ))
                  ) : (
                    laborItems.filter(i => i.description || i.amount).length > 0
                      ? laborItems.filter(i => i.description || i.amount).map((item, i) => (
                          <div key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg border border-gray-100 text-sm">
                            <span className="font-body text-gray-700">{item.description || '—'}</span>
                            <span className="font-mono text-gray-800 font-semibold">{peso(item.amount)}</span>
                          </div>
                        ))
                      : <p className="text-xs font-body text-gray-400 italic px-1">No labor fees added yet.</p>
                  )}
                </div>
                <div className="flex justify-end mt-2 pr-10">
                  <span className="text-xs font-mono text-gray-500">Subtotal: <span className="font-semibold text-gray-800">{peso(laborTotal)}</span></span>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-200" />

              {/* Parts fees */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-accent-500" />
                    <span className="text-sm font-sans font-bold text-gray-700 tracking-wide">Parts / Materials</span>
                  </div>
                  {isAdmin && (
                    <button type="button" onClick={() => addItem(setPartsItems)}
                      className="inline-flex items-center gap-1 text-xs font-sans font-semibold text-accent-600 hover:text-accent-700 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {isAdmin ? (
                    partsItems.map(item => (
                      <LineItem
                        key={item.id} item={item}
                        onChange={(id, field, val) => updateItem(setPartsItems, id, field, val)}
                        onRemove={id => removeItem(setPartsItems, id)}
                        canRemove={partsItems.length > 1}
                      />
                    ))
                  ) : (
                    partsItems.filter(i => i.description || i.amount).length > 0
                      ? partsItems.filter(i => i.description || i.amount).map((item, i) => (
                          <div key={i} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg border border-gray-100 text-sm">
                            <span className="font-body text-gray-700">{item.description || '—'}</span>
                            <span className="font-mono text-gray-800 font-semibold">{peso(item.amount)}</span>
                          </div>
                        ))
                      : <p className="text-xs font-body text-gray-400 italic px-1">No parts added yet.</p>
                  )}
                </div>
                <div className="flex justify-end mt-2 pr-10">
                  <span className="text-xs font-mono text-gray-500">Subtotal: <span className="font-semibold text-gray-800">{peso(partsTotal)}</span></span>
                </div>
              </div>

              <div className="border-t border-dashed border-gray-200" />

              {/* Discount + Summary */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 w-40 shrink-0">
                    <Tag className="w-3.5 h-3.5 text-gray-400" />
                    <label className="text-sm font-sans font-bold text-gray-700">Discount</label>
                  </div>
                  {isAdmin ? (
                    <div className="relative w-36">
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
                    <span className="font-mono text-sm text-gray-700 font-semibold">
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
                    <label className="text-sm font-sans font-bold text-gray-700">Final Price</label>
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
                  {isAdmin && <span className="text-xs font-body text-gray-400">(set when payment is collected)</span>}
                </div>
              </div>

              {/* Save — Admin only */}
              {isAdmin && (
                <div className="flex items-center gap-3 pt-1">
                  <button onClick={saveNotesAndPricing} disabled={saving} className="btn-primary text-sm">
                    {saving
                      ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Save className="w-3.5 h-3.5" />
                    }
                    Save Changes
                  </button>
                  {saveMsg && (
                    <span className="text-sm font-sans font-semibold text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />{saveMsg}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB 4 — SETTINGS
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'settings' && (
        <div className="space-y-5">
          {isAdmin ? (
            <div className="card border border-red-100 p-5">
              <p className="section-title text-red-400 flex items-center gap-2 mb-3"><Trash2 className="w-3.5 h-3.5" />Delete Ticket</p>
              <p className="text-sm font-body text-gray-500 mb-4">Permanently delete this ticket and all associated data. This action cannot be undone.</p>
              {!deleteConfirm ? (
                <button onClick={() => setDeleteConfirm(true)} className="btn-danger text-sm">
                  <Trash2 className="w-3.5 h-3.5" /> Delete This Ticket
                </button>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-sm font-body text-red-700">Are you sure? This cannot be undone.</p>
                  <button onClick={deleteTicket} className="btn-danger text-sm">Yes, Delete</button>
                  <button onClick={() => setDeleteConfirm(false)} className="btn-secondary text-sm">Cancel</button>
                </div>
              )}
            </div>
          ) : (
            <div className="card p-5">
              <p className="section-title flex items-center gap-2 mb-3"><Settings className="w-3.5 h-3.5" />Settings</p>
              <LockedSection message="Settings are restricted to Admin role only." />
            </div>
          )}
        </div>
      )}

    </div>
  )
}
