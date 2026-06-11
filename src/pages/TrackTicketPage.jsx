/**
 * @file TrackTicketPage.jsx
 * @description Public ticket tracking page. No auth required.
 *
 * Loads a ticket by its tracking token (URL param), then polls every 30s for
 * updates so the client sees live progress without manual refreshes.
 *
 * Pricing, notes, and photos are only shown once the ticket is approved
 * (i.e. status is neither Pending nor Denied), keeping internal workflow
 * details hidden until they're relevant to the client.
 */

import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  CheckCircle, XCircle, AlertCircle,
  Image as ImageIcon, FileText, DollarSign, Package, Receipt,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { STATUS_ORDER, STATUS_DENIED, STATUS_DESCRIPTIONS } from '../lib/utils'
import { downloadReceiptPDF } from '../lib/receipt'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import Logo from '../components/ui/Logo.jsx'

// ── Constants ──────────────────────────────────────────────────────────────────

/** Polling interval (ms) to re-fetch the ticket for live status updates. */
const POLL_INTERVAL_MS = 30_000

/** Currency formatter for Philippine Peso amounts. */
const formatPeso = n =>
  `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Shared page header with logo and "Ticket Tracker" label. */
function TrackHeader() {
  return (
    <header className="bg-dark-900 border-b border-dark-700 px-6 py-3">
      <div className="max-w-2xl mx-auto flex items-center justify-between">
        <Link to="/"><Logo size="sm" /></Link>
        <span className="text-xs font-mono text-gray-500 tracking-wider">Ticket Tracker</span>
      </div>
    </header>
  )
}

/**
 * A labelled data row inside the Unit Details card.
 *
 * @param {string} label
 * @param {string} value
 * @param {string} [className] - Extra Tailwind classes for the wrapper.
 */
function InfoRow({ label, value, className = '' }) {
  return (
    <div className={className}>
      <p className="text-xs font-body text-gray-500 mb-0.5">{label}</p>
      <p className="text-base font-sans font-semibold text-gray-800">{value}</p>
    </div>
  )
}

// ── Page component ─────────────────────────────────────────────────────────────

/** TrackTicketPage — public read-only view of a single ticket. */
export default function TrackTicketPage() {
  const { token } = useParams()
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  /**
   * Fetch the ticket matching the tracking token.
   * Wrapped in useCallback so it can be passed to setInterval without
   * changing identity on every render.
   */
  const fetchTicket = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('tickets')
        .select('*')
        .eq('tracking_token', token)
        .single()
      if (fetchError) throw fetchError
      setTicket(data)
      setError(null)
    } catch {
      // Shown only while no ticket is loaded — a failed background poll
      // must not replace an already-rendered ticket with the error page.
      setError('Ticket not found. Please check your tracking link.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    if (!token) return
    fetchTicket()

    // Realtime: status/pricing changes appear instantly. The 30s polling
    // below stays as a fallback in case the channel drops.
    const channel = supabase
      .channel(`track-${token}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tickets', filter: `tracking_token=eq.${token}` },
        ({ new: row }) => {
          setTicket(prev => (prev ? { ...prev, ...row } : row))
        }
      )
      .subscribe()

    const interval = setInterval(fetchTicket, POLL_INTERVAL_MS)
    return () => { supabase.removeChannel(channel); clearInterval(interval) }
  }, [token, fetchTicket])

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-base font-body text-gray-500">Loading your ticket...</p>
        </div>
      </div>
    )
  }

  // ── Error / not-found state ──────────────────────────────────────────────

  if (!ticket) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <TrackHeader />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <XCircle className="w-14 h-14 text-red-300 mx-auto mb-4" />
            <h2 className="text-lg font-sans font-bold text-gray-800 mb-2">Ticket Not Found</h2>
            <p className="text-gray-500 font-body text-base mb-6">
              {error || 'This tracking link is invalid or expired.'}
            </p>
            <Link to="/" className="btn-primary justify-center">Submit a New Ticket</Link>
          </div>
        </main>
      </div>
    )
  }

  // ── Derived state ────────────────────────────────────────────────────────

  const isDenied   = ticket.status === STATUS_DENIED
  const isPaid     = ticket.status === 'Paid'
  // Approved = any status that isn't the two terminal-before-work statuses.
  const isApproved = !isDenied && ticket.status !== 'Pending'
  const currentStep = isDenied ? -1 : STATUS_ORDER.indexOf(ticket.status)

  // ── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <TrackHeader />

      <main className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full animate-fade-in">

        {/* Ticket ID + status header */}
        <div className="card p-5 mb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-mono uppercase tracking-widest text-gray-500 mb-1">Ticket ID</p>
              <p className="font-mono text-xl font-bold text-gray-900 tracking-wider">{ticket.ticket_id}</p>
              <p className="text-sm font-body text-gray-500 mt-1">
                Submitted {format(new Date(ticket.created_at), 'MMMM d, yyyy · h:mm a')}
              </p>
              {ticket.receipt_number && (
                <p className="text-sm font-mono text-gray-500 mt-0.5">
                  Receipt No: {ticket.receipt_number}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge status={ticket.status} size="lg" />
            </div>
          </div>

          {/* Payment confirmed banner */}
          {isPaid && ticket.paid_at && (
            <div className="mt-4 flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-sans font-semibold text-emerald-800">Payment Confirmed</p>
                  <p className="text-sm font-body text-emerald-600 mt-0.5">
                    Paid on {format(new Date(ticket.paid_at), 'MMMM d, yyyy · h:mm a')}
                  </p>
                </div>
              </div>
              <button
                onClick={() => downloadReceiptPDF(ticket)}
                className="inline-flex items-center gap-1.5 text-sm font-sans font-semibold px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shrink-0 min-h-[36px]"
              >
                <Receipt className="w-3.5 h-3.5" /> Download Receipt
              </button>
            </div>
          )}

          {/* Denied banner */}
          {isDenied && (
            <div className="mt-4 flex items-start gap-3 bg-red-50 border border-red-100 rounded-lg p-3">
              <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-sans font-semibold text-red-800">Ticket Denied</p>
                <p className="text-sm font-body text-red-600 mt-0.5">
                  This ticket was not approved. Please contact us for more information.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Progress tracker (hidden for denied tickets) */}
        {!isDenied && (
          <div className="card p-5 mb-5">
            <p className="section-title mb-4">Repair Progress</p>
            <div className="relative">
              {/* Vertical connector line behind the dots */}
              <div className="absolute left-3.5 top-4 bottom-4 w-0.5 bg-gray-100" />
              <div className="space-y-1">
                {STATUS_ORDER.map((statusStep, i) => {
                  const isCompleted = i < currentStep
                  const isCurrent   = i === currentStep
                  const isPaidStep  = statusStep === 'Paid' && isPaid
                  return (
                    <div
                      key={statusStep}
                      className={`relative flex items-start gap-4 py-3 px-2 rounded-lg
                        ${isCurrent ? 'bg-brand-50' : isPaidStep ? 'bg-emerald-50' : ''}`}
                    >
                      <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all mt-0.5
                        ${isCompleted || isPaidStep ? 'bg-green-500'
                          : isCurrent ? 'bg-brand-600 ring-4 ring-brand-100'
                          : 'bg-gray-100'}`}
                      >
                        {(isCompleted || isPaidStep)
                          ? <CheckCircle className="w-4 h-4 text-white" />
                          : isCurrent
                            ? <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                            : <div className="w-2 h-2 bg-gray-300 rounded-full" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-sans font-semibold
                          ${(isCompleted || isPaidStep) ? 'text-gray-400 line-through'
                            : isCurrent ? 'text-brand-700'
                            : 'text-gray-400'}`}
                        >
                          {statusStep}
                        </p>
                        {STATUS_DESCRIPTIONS[statusStep] && (
                          <p className={`text-sm font-body mt-0.5 leading-relaxed
                            ${isCurrent ? 'text-brand-600' : 'text-gray-500'}`}
                          >
                            {STATUS_DESCRIPTIONS[statusStep]}
                          </p>
                        )}
                        {isCurrent && ticket.updated_at && (
                          <p className="text-sm font-body text-gray-500 mt-1">
                            Updated {format(new Date(ticket.updated_at), 'MMM d, h:mm a')}
                          </p>
                        )}
                        {isPaidStep && ticket.paid_at && (
                          <p className="text-sm font-body text-emerald-600 mt-0.5">
                            {format(new Date(ticket.paid_at), 'MMM d, h:mm a')}
                          </p>
                        )}
                        {(isCompleted || isPaidStep) && (
                          <span className="text-xs font-sans font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full inline-block mt-1">
                            ✓ Completed
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Unit details */}
        <div className="card p-5 mb-5">
          <p className="section-title flex items-center gap-2">
            <Package className="w-3.5 h-3.5" /> Unit Details
          </p>
          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Brand"           value={ticket.unit_brand} />
            <InfoRow label="Model"           value={ticket.unit_model} />
            <InfoRow label="Type"            value={ticket.unit_type} />
            <InfoRow label="Mode of Service" value={ticket.mode_of_service} />
            {ticket.accessories_included && (
              <InfoRow label="Accessories" value={ticket.accessories_included} className="col-span-2" />
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-sans font-semibold text-gray-500 mb-1">Issue Description</p>
            <p className="text-base font-body text-gray-700 leading-relaxed">{ticket.issue_description}</p>
          </div>
        </div>

        {/* Repair photos (shown after approval) */}
        {isApproved && ticket.repair_photos?.length > 0 && (
          <div className="card p-5 mb-5">
            <p className="section-title flex items-center gap-2">
              <ImageIcon className="w-3.5 h-3.5" /> Documentation
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ticket.repair_photos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                   className="aspect-square rounded-lg overflow-hidden bg-gray-100 block">
                  <img src={url} alt={`Repair photo ${i + 1}`} className="w-full h-full object-cover" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Repair notes (shown after approval) */}
        {isApproved && (ticket.diagnosis_notes || ticket.repair_notes) && (
          <div className="card p-5 mb-5">
            <p className="section-title flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" /> Technician Notes
            </p>
            {ticket.diagnosis_notes && (
              <div className="mb-3">
                <p className="text-xs font-sans font-semibold text-gray-500 mb-1">Diagnosis</p>
                <p className="text-base font-body text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3">
                  {ticket.diagnosis_notes}
                </p>
              </div>
            )}
            {ticket.repair_notes && (
              <div>
                <p className="text-xs font-sans font-semibold text-gray-500 mb-1">Repair</p>
                <p className="text-base font-body text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3">
                  {ticket.repair_notes}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Pricing (shown after approval) */}
        {isApproved && (ticket.labor_items?.length > 0 || ticket.parts_items?.length > 0 || ticket.quotation_amount || ticket.final_price) && (
          <div className="card p-5 mb-5">
            <p className="section-title flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5" /> Pricing
            </p>

            {/* Labor line items */}
            {ticket.labor_items?.filter(i => i.description || i.amount).length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-sans font-semibold text-gray-500 mb-2">Labor</p>
                <div className="space-y-1">
                  {ticket.labor_items.filter(i => i.description || i.amount).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="font-body text-gray-700">{item.description || '—'}</span>
                      <span className="font-mono text-gray-800">{formatPeso(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Parts line items */}
            {ticket.parts_items?.filter(i => i.description || i.amount).length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-sans font-semibold text-gray-500 mb-2">Parts</p>
                <div className="space-y-1">
                  {ticket.parts_items.filter(i => i.description || i.amount).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="font-body text-gray-700">{item.description || '—'}</span>
                      <span className="font-mono text-gray-800">{formatPeso(item.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ticket.discount_amount > 0 && (
              <div className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100">
                <span className="font-body text-green-600 font-semibold">Discount</span>
                <span className="font-mono text-green-600">− {formatPeso(ticket.discount_amount)}</span>
              </div>
            )}

            {ticket.quotation_amount && (
              <div className="flex items-center justify-between py-2 border-b border-gray-200 mt-1">
                <span className="text-sm font-sans font-semibold text-gray-700">Quotation Total</span>
                <span className="font-sans font-semibold text-gray-900">{formatPeso(ticket.quotation_amount)}</span>
              </div>
            )}

            {ticket.final_price && (
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-sans font-bold text-gray-700">Final Price</span>
                <span className="text-xl font-display tracking-wider text-brand-600">
                  {formatPeso(ticket.final_price)}
                </span>
              </div>
            )}

            {ticket.paid_at && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-sm font-body text-emerald-600 font-semibold">
                  ✓ Paid on {format(new Date(ticket.paid_at), 'MMMM d, yyyy · h:mm a')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Live-update notice */}
        <div className="flex items-start gap-3 bg-blue-50 rounded-xl p-4 text-sm font-body text-blue-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>This page updates automatically. Bookmark this link to check your repair status anytime.</p>
        </div>

        <div className="mt-6 text-center">
          <Link to="/" className="text-sm font-body text-gray-500 hover:text-gray-700 transition-colors">
            ← Submit another ticket
          </Link>
        </div>
      </main>
    </div>
  )
}