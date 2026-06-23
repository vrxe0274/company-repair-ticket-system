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

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  CheckCircle, XCircle, AlertCircle,
  Image as ImageIcon, FileText, DollarSign, Package, Receipt, User,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { TRACK_POLL_INTERVAL_MS } from '../lib/constants'
import {
  STATUS_ORDER, STATUS_DENIED, STATUS_DESCRIPTIONS,
  PAYMENT_OPTIONS, paymentPlanLabel, discountCapFor,
  DEFAULT_PARTIAL_HIGH_PCT, DEFAULT_PARTIAL_LOW_PCT,
} from '../lib/utils'
import { downloadReceiptPDF }   from '../lib/receipt'
import { downloadQuotationPDF } from '../lib/quotation'
import StatusBadge from '../components/ui/StatusBadge.jsx'
import Logo from '../components/ui/Logo.jsx'

// ── Constants ──────────────────────────────────────────────────────────────────


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

/** Styled labelled cell for unit/client details. */
function InfoCell({ label, value, className = '' }) {
  return (
    <div className={`bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 ${className}`}>
      <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-[0.08em] mb-0.5">{label}</p>
      <p className="text-sm font-sans font-semibold text-gray-800">{value || '—'}</p>
    </div>
  )
}

/** Icon + label section header used throughout the tracker. */
function SectionHeader({ icon: Icon, label, iconBg = 'bg-brand-50', iconColor = 'text-brand-600' }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
      </div>
      <p className="text-xs font-sans font-bold text-gray-700 uppercase tracking-[0.1em]">{label}</p>
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
  const [savingPlan, setSavingPlan] = useState(false)
  const intervalRef    = useRef(null)
  const ticketLoadedRef = useRef(false)

  /**
   * Client picks their payment plan from the tracker once the quotation is
   * ready. Writes payment_option directly (public update is allowed by RLS).
   * This is purely the client's choice — it never changes pricing or applies
   * any discount; partial plans only cap the up-front deposit.
   */
  async function choosePaymentPlan(value) {
    // Selection is final — once a plan is set it cannot be changed by the client.
    if (savingPlan || ticket?.payment_option) return
    setSavingPlan(true)
    const prev = ticket?.payment_option ?? null
    setTicket(t => ({ ...t, payment_option: value }))  // optimistic
    const { error: updateError } = await supabase
      .from('tickets')
      .update({ payment_option: value })
      .eq('tracking_token', token)
    if (updateError) {
      setTicket(t => ({ ...t, payment_option: prev }))  // revert on failure
      alert('Could not save your payment plan. Please try again.')
    }
    setSavingPlan(false)
  }

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
      ticketLoadedRef.current = true
      setError(null)
    } catch {
      // Shown only while no ticket is loaded — a failed background poll
      // must not replace an already-rendered ticket with the error page.
      setError('Ticket not found. Please check your tracking link.')
      // Stop polling once we know the token is invalid — no point retrying.
      if (!ticketLoadedRef.current && intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
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

    intervalRef.current = setInterval(fetchTicket, TRACK_POLL_INTERVAL_MS)
    return () => { supabase.removeChannel(channel); clearInterval(intervalRef.current) }
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
  // Payment-plan chooser appears once the workflow reaches "Inspection & Quote"
  // (the inspection/quotation stage) and stays until the ticket is paid.
  const quoteStageReached = !isDenied && currentStep >= STATUS_ORDER.indexOf('Inspection & Quote')
  // No payment plan choice for diagnosis/cleaning-only tickets — client pays full price.
  const filledLabor = (ticket.labor_items || []).filter(i => i.description || i.amount)
  const filledParts = (ticket.parts_items || []).filter(i => i.description || i.amount)
  const isDiagCleanOnly =
    filledLabor.length > 0 &&
    filledParts.length === 0 &&
    filledLabor.every(i => /diagnosis|cleaning/i.test(i.description || ''))

  // ── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <TrackHeader />

      <main className="flex-1 px-4 py-8 max-w-2xl mx-auto w-full animate-fade-in">

        {/* Unified card: hero + all sections */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mb-5">

          {/* Hero header — brand-aligned dark palette */}
          <div className="bg-dark-900 relative overflow-hidden px-4 pt-7 pb-6">
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 10% 70%, rgba(115,23,232,0.25) 0%, transparent 55%), radial-gradient(ellipse at 90% 20%, rgba(212,0,127,0.15) 0%, transparent 50%)' }} />
            <div className="relative flex items-start gap-4">
              {/* Client initial avatar */}
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-600/50 to-accent-600/40 border border-white/20 flex items-center justify-center shrink-0 mt-0.5 text-white font-bold text-lg select-none">
                {ticket.client_name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-xl sm:text-2xl text-white tracking-wider">{ticket.ticket_id}</span>
                  <StatusBadge status={ticket.status} size="sm" />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 mt-1.5 gap-0.5">
                  <p className="text-xs font-body text-gray-400">
                    Submitted {format(new Date(ticket.created_at), 'MMM d, yyyy · h:mm a')}
                  </p>
                  {ticket.receipt_number && (
                    <>
                      <span className="hidden sm:inline text-gray-600 text-xs">·</span>
                      <p className="text-xs font-mono text-gray-400">Receipt No: {ticket.receipt_number}</p>
                    </>
                  )}
                  {ticket.paid_at && (
                    <p className="text-xs font-body text-emerald-400 font-semibold">
                      ✓ Paid {format(new Date(ticket.paid_at), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="divide-y divide-gray-200">

            {/* Payment confirmed banner */}
            {isPaid && ticket.paid_at && (
              <div className="bg-emerald-50 border-b border-emerald-100 px-5 py-4 flex items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-sans font-bold text-emerald-800">Payment Confirmed</p>
                    <p className="text-xs font-body text-emerald-600 mt-0.5">
                      Paid on {format(new Date(ticket.paid_at), 'MMMM d, yyyy · h:mm a')}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => downloadReceiptPDF(ticket)}
                  className="inline-flex items-center gap-1.5 text-xs font-sans font-semibold px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shrink-0"
                >
                  <Receipt className="w-3.5 h-3.5" /> Receipt
                </button>
              </div>
            )}

            {/* Denied banner */}
            {isDenied && (
              <div className="bg-red-50 border-b border-red-100 px-5 py-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <XCircle className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-sans font-bold text-red-800">Ticket Denied</p>
                  <p className="text-xs font-body text-red-600 mt-0.5">
                    This ticket was not approved. Please contact us for more information.
                  </p>
                </div>
              </div>
            )}

            {/* Progress tracker */}
            {!isDenied && (
              <div className="p-5">
                <SectionHeader icon={CheckCircle} label="Repair Progress" iconBg="bg-brand-50" iconColor="text-brand-600" />
                <div className="relative">
                  <div className="absolute left-3.5 top-4 bottom-4 w-0.5 bg-gray-100" />
                  <div className="space-y-1">
                    {STATUS_ORDER.map((statusStep, i) => {
                      const isCompleted = i < currentStep
                      const isCurrent   = i === currentStep
                      const isPaidStep  = statusStep === 'Paid' && isPaid
                      return (
                        <div
                          key={statusStep}
                          className={`relative flex items-start gap-4 py-3 px-2 rounded-lg transition-colors
                            ${isCurrent ? 'bg-brand-50' : isPaidStep ? 'bg-emerald-50' : ''}`}
                        >
                          <div className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all mt-0.5
                            ${isCompleted || isPaidStep ? 'bg-emerald-500'
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
                          <div className="flex-1 min-w-0 pt-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-sm font-sans font-semibold
                                ${(isCompleted || isPaidStep) ? 'text-gray-400 line-through'
                                  : isCurrent ? 'text-brand-700'
                                  : 'text-gray-400'}`}
                              >
                                {statusStep}
                              </p>
                              {(isCompleted || isPaidStep) && (
                                <span className="text-[10px] font-sans font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-full shrink-0">
                                  ✓ Done
                                </span>
                              )}
                              {isCurrent && (
                                <span className="text-[10px] font-sans font-bold text-brand-600 bg-brand-50 border border-brand-100 px-1.5 py-0.5 rounded-full shrink-0">
                                  In Progress
                                </span>
                              )}
                            </div>
                            {(isCompleted || isPaidStep) && STATUS_DESCRIPTIONS[statusStep] && (
                              <p className="text-xs font-body text-gray-400 mt-0.5 leading-relaxed">
                                {STATUS_DESCRIPTIONS[statusStep]}
                              </p>
                            )}
                            {isCurrent && ticket.updated_at && (
                              <p className="text-xs font-body text-brand-500 mt-0.5">
                                Updated {format(new Date(ticket.updated_at), 'MMM d, h:mm a')}
                              </p>
                            )}
                            {isPaidStep && ticket.paid_at && (
                              <p className="text-xs font-body text-emerald-500 mt-0.5">
                                {format(new Date(ticket.paid_at), 'MMM d, h:mm a')}
                              </p>
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
            <div className="p-5">
              <SectionHeader icon={Package} label="Unit Details" iconBg="bg-gray-100" iconColor="text-gray-500" />
              <div className="grid grid-cols-2 gap-2">
                <InfoCell label="Brand"           value={ticket.unit_brand} />
                <InfoCell label="Model"           value={ticket.unit_model} />
                <InfoCell label="Type"            value={ticket.unit_type} />
                <InfoCell label="Mode of Service" value={ticket.mode_of_service} />
                {ticket.accessories_included && (
                  <InfoCell label="Accessories" value={ticket.accessories_included} className="col-span-2" />
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-wider mb-2">Issue Description</p>
                <p className="text-sm font-body text-gray-700 leading-relaxed bg-gray-50 rounded-lg px-3 py-2.5">{ticket.issue_description}</p>
              </div>
            </div>

            {/* Repair photos */}
            {isApproved && ticket.repair_photos?.length > 0 && (
              <div className="p-5">
                <SectionHeader icon={ImageIcon} label="Documentation" iconBg="bg-slate-100" iconColor="text-slate-500" />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {ticket.repair_photos.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                       className="aspect-square rounded-xl overflow-hidden bg-gray-100 block hover:opacity-90 transition-opacity">
                      <img src={url} alt={`Repair photo ${i + 1}`} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Technician notes */}
            {isApproved && (ticket.diagnosis_notes || ticket.repair_notes) && (
              <div className="p-5">
                <SectionHeader icon={FileText} label="Technician Notes" iconBg="bg-indigo-50" iconColor="text-indigo-500" />
                <div className="space-y-3">
                  {ticket.diagnosis_notes && (
                    <div>
                      <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Diagnosis</p>
                      <p className="text-sm font-body text-gray-700 leading-relaxed bg-gray-50 rounded-lg px-3 py-2.5">
                        {ticket.diagnosis_notes}
                      </p>
                    </div>
                  )}
                  {ticket.repair_notes && (
                    <div>
                      <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Repair</p>
                      <p className="text-sm font-body text-gray-700 leading-relaxed bg-gray-50 rounded-lg px-3 py-2.5">
                        {ticket.repair_notes}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Pricing */}
            {isApproved && (ticket.labor_items?.length > 0 || ticket.parts_items?.length > 0 || ticket.quotation_amount || ticket.final_price) && (
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <p className="text-xs font-sans font-bold text-gray-700 uppercase tracking-[0.1em]">Pricing</p>
                  </div>
                  {ticket.quotation_amount != null && (
                    <button
                      onClick={() => downloadQuotationPDF(ticket)}
                      className="inline-flex items-center gap-1.5 text-xs font-sans font-semibold px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white transition-colors shrink-0"
                    >
                      <FileText className="w-3.5 h-3.5" /> Quotation
                    </button>
                  )}
                </div>

                {/* Labor items */}
                {ticket.labor_items?.filter(i => i.description || i.amount).length > 0 && (
                  <div className="mb-4">
                    <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-wider mb-2">Labor</p>
                    <div className="rounded-lg border border-gray-100 overflow-hidden">
                      {ticket.labor_items.filter(i => i.description || i.amount).map((item, i, arr) => (
                        <div key={i} className={`flex justify-between items-center px-3 py-2.5 text-sm ${i < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                          <span className="font-body text-gray-700">{item.description || '—'}</span>
                          <span className="font-mono font-semibold text-gray-900 shrink-0 ml-4">{formatPeso(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Parts items */}
                {ticket.parts_items?.filter(i => i.description || i.amount).length > 0 && (
                  <div className="mb-4">
                    <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-wider mb-2">Parts</p>
                    <div className="rounded-lg border border-gray-100 overflow-hidden">
                      {ticket.parts_items.filter(i => i.description || i.amount).map((item, i, arr) => (
                        <div key={i} className={`flex justify-between items-center px-3 py-2.5 text-sm ${i < arr.length - 1 ? 'border-b border-gray-50' : ''}`}>
                          <span className="font-body text-gray-700">{item.description || '—'}</span>
                          <span className="font-mono font-semibold text-gray-900 shrink-0 ml-4">{formatPeso(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Totals summary */}
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  {ticket.discount_amount > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-body text-emerald-700 font-semibold">Discount</span>
                      <span className="font-mono text-emerald-700">− {formatPeso(ticket.discount_amount)}</span>
                    </div>
                  )}
                  {ticket.quotation_amount && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-body text-gray-600">Quotation Total</span>
                      <span className="font-mono font-semibold text-gray-800">{formatPeso(ticket.quotation_amount)}</span>
                    </div>
                  )}
                  {ticket.payment_option && !isDiagCleanOnly && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-body text-gray-600">Payment Plan</span>
                      <span className="font-sans font-semibold text-gray-800 text-right">
                        {paymentPlanLabel(ticket.payment_option, ticket.payment_partial_high_pct ?? DEFAULT_PARTIAL_HIGH_PCT, ticket.payment_partial_low_pct ?? DEFAULT_PARTIAL_LOW_PCT)}
                      </span>
                    </div>
                  )}
                  {ticket.final_price && (
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200 mt-1">
                      <span className="text-sm font-sans font-bold text-gray-800">Amount Due</span>
                      <span className="text-2xl font-display tracking-wider text-brand-600">{formatPeso(ticket.final_price)}</span>
                    </div>
                  )}
                  {ticket.paid_at && (
                    <p className="text-xs font-body text-emerald-600 font-semibold pt-1">
                      ✓ Paid on {format(new Date(ticket.paid_at), 'MMMM d, yyyy · h:mm a')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Payment plan — client chooses once the workflow reaches the
                inspection/quotation stage, until the ticket is paid. */}
            {quoteStageReached && !isPaid && !isDiagCleanOnly && (
              <div className="p-5">
                <SectionHeader icon={DollarSign} label="Choose Your Payment Plan" iconBg="bg-accent-50" iconColor="text-accent-600" />
                <p className="text-sm font-body text-gray-500 mb-3">
                  How you choose to pay determines the discount you’re eligible for.
                  Your selection is final and can’t be changed once submitted.
                </p>
                <div className="space-y-2">
                  {PAYMENT_OPTIONS.map(opt => {
                    const fullCap = ticket.payment_partial_high_pct ?? DEFAULT_PARTIAL_HIGH_PCT
                    const halfCap = ticket.payment_partial_low_pct  ?? DEFAULT_PARTIAL_LOW_PCT
                    const checked = ticket.payment_option === opt.value
                    const cap     = discountCapFor(opt.value, fullCap, halfCap)
                    return (
                      <div
                        key={opt.value}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-colors
                          ${checked ? 'bg-accent-50 border-accent-300 ring-1 ring-accent-200' : 'bg-white border-gray-200'}`}
                      >
                        <span className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center
                          ${checked ? 'border-accent-500' : 'border-gray-300'}`}>
                          {checked && <span className="w-2 h-2 rounded-full bg-accent-500" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-sans font-semibold text-gray-800">
                            {paymentPlanLabel(opt.value, fullCap, halfCap)}
                          </p>
                          <p className="text-xs font-body text-gray-500 mt-0.5">
                            {cap > 0
                              ? `Eligible for up to ${cap}% off your repair quotation.`
                              : 'No discount — pay the full quotation on completion.'}
                          </p>
                        </div>
                        {/* Once a plan is chosen, only the selected option keeps
                            its button ("Selected"); the others show none. */}
                        {checked ? (
                          <span className="shrink-0 text-xs font-sans font-semibold px-4 py-2 rounded-lg bg-accent-100 text-accent-700">
                            Selected
                          </span>
                        ) : !ticket.payment_option && (
                          <button
                            type="button"
                            onClick={() => choosePaymentPlan(opt.value)}
                            disabled={savingPlan}
                            className="shrink-0 text-xs font-sans font-semibold px-4 py-2 rounded-lg bg-accent-600 hover:bg-accent-700 text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            Select
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                {ticket.payment_option && !isDiagCleanOnly && (
                  <p className="text-xs font-body text-emerald-600 font-semibold mt-3">
                    ✓ You chose: {paymentPlanLabel(ticket.payment_option, ticket.payment_partial_high_pct ?? DEFAULT_PARTIAL_HIGH_PCT, ticket.payment_partial_low_pct ?? DEFAULT_PARTIAL_LOW_PCT)}
                  </p>
                )}
              </div>
            )}

          </div>
        </div>

        {/* Refresh notice */}
        <div className="flex items-start gap-3 bg-blue-50 rounded-xl p-4 text-sm font-body text-blue-700">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Status changes are not shown in real time — please refresh this page
            periodically to see the latest status. Bookmark this link to check
            your repair anytime.
          </p>
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