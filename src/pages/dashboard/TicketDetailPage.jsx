/**
 * @file TicketDetailPage.jsx
 * @description Full detail view and editor for a single repair ticket.
 *
 * Organised into five tabs:
 *   Overview           — client info, unit info, issue description
 *   Technical Details  — technician notes + documentation (photos)
 *   Quotation & Payment — labor/parts line items, discount, final price (Admin)
 *   Commission         — who worked the repair + their per-repair cut (Admin edits, others read-only; Paid only)
 *   Settings           — delete ticket (Admin only)
 *
 * Role-based visibility:
 *   Admin      — can see and edit pricing; can see notes read-only; can delete; can change status
 *   Technician — can edit notes and upload photos; can see pricing read-only; can change status
 *   (other)    — pricing hidden until ticket is approved; notes always hidden
 */

import { useState, useRef, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { format }                from 'date-fns'
import {
  ArrowLeft, Download, ExternalLink,
  Eye, Wrench, CreditCard, Settings, Percent,
  AlertTriangle, Undo2, FileText, Receipt, MoreHorizontal,
  Search, CheckCircle, XCircle,
} from 'lucide-react'
import { getTrackingUrl }        from '../../lib/utils'
import { downloadTicketPDF }     from '../../lib/pdf'
import { downloadReceiptPDF }    from '../../lib/receipt'
import { downloadQuotationPDF }  from '../../lib/quotation'
import StatusBadge               from '../../components/ui/StatusBadge.jsx'
import { useTicket }             from './ticket-detail/useTicket'
import { TabButton }             from './ticket-detail/components'
import { OverviewTab, TechTab, QuotationTab, CommissionTab, SettingsTab } from './ticket-detail/tabs'
import { sumItems, discountAmount } from './ticket-detail/helpers'
import { STATUS_GUIDANCE, STATUS_ACTION_LABELS } from './ticket-detail/constants'

// Icons for the status-transition action buttons, keyed by destination status.
const STATUS_ACTION_ICONS = {
  'Inspection & Quote': Search,
  'Repair in Progress': Wrench,
  'Done':               CheckCircle,
  'Paid':               CreditCard,
  'Denied':             XCircle,
}

export default function TicketDetailPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const initialTab = ['overview', 'tech', 'admin', 'commission', 'settings'].includes(requestedTab) ? requestedTab : 'overview'
  const [activeTab, setActiveTab]     = useState(initialTab)
  const [actionsOpen, setActionsOpen] = useState(false)
  const actionsRef                    = useRef(null)

  useEffect(() => {
    function handleClickOutside(e) {
      if (actionsRef.current && !actionsRef.current.contains(e.target)) {
        setActionsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const {
    ticket, loading, saving, uploading, statusUpdating, fileInputRef,
    uploadingProof, proofInputRef,
    notes, setNotes,
    laborItems, setLaborItems,
    partsItems, setPartsItems,
    discount, setDiscount,
    quotationNotes, setQuotationNotes,
    finalPrice, setFinalPrice,
    saveMsg, transitionErrors, deleteConfirm, setDeleteConfirm,
    undoConfirm, setUndoConfirm,
    isManager, isTechnician, isAdmin, getAllowedTransitions,
    updateStatus, undoStatus, saveNotesAndPricing,
    uploadPhotos, deletePhoto, deleteTicket,
    uploadPaymentProof, deletePaymentProof,
    updateItem, addItem, removeItem, toggleDiagnosis,
    techAccounts, staffAccounts,
    commissionTech, toggleCommissionTech,
    commissionStaff, toggleCommissionStaff,
    commissionTechPct, setCommissionTechPct,
    commissionStaffPct, setCommissionStaffPct,
    commissionSaving, commissionError, saveCommission,
  } = useTicket(id)

  // While Pending, only Overview is available — other tabs need an approved
  // ticket to have anything to act on. If the ticket is undone back to
  // Pending while on another tab, snap back to Overview.
  useEffect(() => {
    if (ticket?.status === 'Pending' && activeTab !== 'overview') setActiveTab('overview')
  }, [ticket?.status]) // eslint-disable-line react-hooks/exhaustive-deps

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
  // `discount` is a manual percentage set entirely at the admin's discretion.
  const discountPct     = Math.min(100, Math.max(0, parseFloat(discount) || 0))
  const discountValue   = discountAmount(laborTotal + partsTotal, discountPct)
  const quotationLive   = Math.max(0, laborTotal + partsTotal - discountValue)
  const isPending       = ticket.status === 'Pending'
  const effectiveTab    = isPending ? 'overview' : (activeTab === 'settings' && !isAdmin ? 'overview' : activeTab)
  const isApproved      = ticket.status !== 'Pending' && ticket.status !== 'Denied'
  const isPaid          = ticket.status === 'Paid'
  const canSeeNotes     = isManager || isTechnician
  const canSeePricing   = isManager || isApproved
  // Once paid the ticket is locked — all fields become read-only regardless of role.
  const canEditNotes    = isTechnician && !isPaid
  const canEditPricing  = isManager && !isPaid
  // Step-aware gates — within an editable role, only the field(s) the
  // current status actually needs are enabled; the rest are disabled/grayed.
  const diagnosisActive = canEditNotes   && ticket.status === 'Inspection & Quote'
  const repairActive    = canEditNotes   && ticket.status === 'Repair in Progress'
  const quotationActive = canEditPricing && ticket.status === 'Inspection & Quote'
  const paymentActive   = canEditPricing && ticket.status === 'Done'
  const canUndo         = (isManager || isTechnician) && !!ticket.previous_status && ticket.previous_status !== ticket.status
  const showActions     = nextStatuses.length > 0 || canUndo
  const statusGuidance  = isManager ? STATUS_GUIDANCE.Staff[ticket.status]
    : isTechnician ? STATUS_GUIDANCE.Technician[ticket.status]
    : null

  return (
    // Extra mobile bottom padding keeps content clear of the fixed action bar
    <div className={`flex flex-col flex-1 gap-3 animate-fade-in min-h-0 ${showActions ? 'pb-32' : 'pb-0'}`}>

      {/* ── Hero — bleeds to edges of the main padding ── */}
      <div className="-mx-5 -mt-5 lg:-mx-7 lg:-mt-7 bg-dark-900 relative overflow-hidden px-5 lg:px-7 pt-7 lg:pt-10 pb-0">
        {/* Brand ambient glows — ties hero to sidebar palette */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 8% 60%, rgba(115,23,232,0.22) 0%, transparent 55%), radial-gradient(ellipse at 92% 15%, rgba(212,0,127,0.13) 0%, transparent 50%)' }} />
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
            {/* Downloads dropdown */}
            <div className="relative" ref={actionsRef}>
              <button
                onClick={() => setActionsOpen(o => !o)}
                className="btn-secondary text-sm bg-white border-white text-gray-900 hover:bg-gray-100 hover:border-gray-100"
                aria-label="More actions"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {actionsOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-44 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50 animate-fade-in">
                  <button
                    onClick={() => { downloadTicketPDF(ticket); setActionsOpen(false) }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-sans text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    Ticket PDF
                  </button>
                  {ticket.quotation_amount != null && (
                    <button
                      onClick={() => { downloadQuotationPDF(ticket); setActionsOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-sans text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <FileText className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                      Quotation Slip
                    </button>
                  )}
                  {isPaid && (
                    <button
                      onClick={() => { downloadReceiptPDF(ticket); setActionsOpen(false) }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm font-sans text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <Receipt className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      Receipt
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Ticket header */}
        <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-start gap-4">
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

        {/* Tab bar anchored to bottom of hero — active tab bridges into content.
            While Pending there's nothing to diagnose, quote, or configure yet,
            so only Overview is shown. */}
        {isPending ? (
          <div className="hidden md:flex gap-1 -mb-px">
            <TabButton active icon={Eye} label="Overview" onClick={() => {}} />
          </div>
        ) : (
          <>
            <div className="md:hidden mb-4">
              <select
                id="ticket-section-select"
                value={effectiveTab}
                onChange={e => setActiveTab(e.target.value)}
                className="input-field bg-dark-800 border-dark-600 text-white"
              >
                <option value="overview">Overview</option>
                <option value="tech">Technical Details</option>
                <option value="admin">Quotation &amp; Payment</option>
                <option value="commission">Commission</option>
                {isAdmin && <option value="settings">Settings</option>}
              </select>
            </div>
            <div className="hidden md:flex gap-1 -mb-px">
              <TabButton active={effectiveTab === 'overview'}  onClick={() => setActiveTab('overview')}     icon={Eye}        label="Overview" />
              <TabButton active={effectiveTab === 'tech'}      onClick={() => setActiveTab('tech')}         icon={Wrench}     label="Technical Details" />
              <TabButton active={effectiveTab === 'admin'}     onClick={() => setActiveTab('admin')}        icon={CreditCard} label="Quotation & Payment" />
              <TabButton active={effectiveTab === 'commission'} onClick={() => setActiveTab('commission')}  icon={Percent}    label="Commission" />
              {isAdmin && (
                <TabButton active={effectiveTab === 'settings'} onClick={() => setActiveTab('settings')}    icon={Settings}   label="Settings" />
              )}
            </div>
          </>
        )}
      </div>

      {effectiveTab === 'overview' && (
        <OverviewTab
          ticket={ticket}           statusGuidance={statusGuidance}
          showActions={showActions} nextStatuses={nextStatuses}
          canUndo={canUndo}         undoConfirm={undoConfirm}   setUndoConfirm={setUndoConfirm}
          statusUpdating={statusUpdating} transitionErrors={transitionErrors}
          updateStatus={updateStatus}     undoStatus={undoStatus}
        />
      )}

      {effectiveTab === 'tech' && (
        <TechTab
          ticket={ticket}
          notes={notes}           setNotes={setNotes}
          canSeeNotes={canSeeNotes}   canEdit={canEditNotes}
          diagnosisActive={diagnosisActive} repairActive={repairActive}
          saving={saving}         saveMsg={saveMsg}
          uploading={uploading}   fileInputRef={fileInputRef}
          onSaveNotes={() => saveNotesAndPricing('notes')}
          onUpload={uploadPhotos}
          onDeletePhoto={deletePhoto}
        />
      )}

      {effectiveTab === 'admin' && (
        <QuotationTab
          canSeePricing={canSeePricing}
          canEdit={canEditPricing}
          quotationActive={quotationActive} paymentActive={paymentActive}
          laborItems={laborItems}     partsItems={partsItems}
          discount={discount}         setDiscount={setDiscount}
          quotationNotes={quotationNotes} setQuotationNotes={setQuotationNotes}
          finalPrice={finalPrice}     setFinalPrice={setFinalPrice}
          saving={saving}             saveMsg={saveMsg}
          laborTotal={laborTotal}     partsTotal={partsTotal}
          discountValue={discountValue} quotationLive={quotationLive}
          paymentProofUrl={ticket.payment_proof_url}
          uploadingProof={uploadingProof}  proofInputRef={proofInputRef}
          onUploadProof={uploadPaymentProof}  onDeleteProof={deletePaymentProof}
          onSaveQuotation={() => saveNotesAndPricing('quotation')}
          onSaveFinalPayment={() => saveNotesAndPricing('payment')}
          onToggleDiagnosis={toggleDiagnosis}
          onUpdateLaborItem={(itemId, f, v) => updateItem(setLaborItems, itemId, f, v)}
          onAddLaborItem={() => addItem(setLaborItems)}
          onRemoveLaborItem={itemId => removeItem(setLaborItems, itemId)}
          onUpdatePartsItem={(itemId, f, v) => updateItem(setPartsItems, itemId, f, v)}
          onAddPartsItem={() => addItem(setPartsItems)}
          onRemovePartsItem={itemId => removeItem(setPartsItems, itemId)}
        />
      )}

      {effectiveTab === 'commission' && (
        <CommissionTab
          isAdmin={isAdmin} isPaid={isPaid}
          techAccounts={techAccounts} staffAccounts={staffAccounts}
          commissionTech={commissionTech} toggleCommissionTech={toggleCommissionTech}
          commissionStaff={commissionStaff} toggleCommissionStaff={toggleCommissionStaff}
          commissionTechPct={commissionTechPct} setCommissionTechPct={setCommissionTechPct}
          commissionStaffPct={commissionStaffPct} setCommissionStaffPct={setCommissionStaffPct}
          commissionSaving={commissionSaving} commissionError={commissionError}
          laborTotal={laborTotal}
          saveMsg={saveMsg}
          onSaveCommission={saveCommission}
        />
      )}

      {effectiveTab === 'settings' && (
        <SettingsTab
          isAdmin={isAdmin}
          deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm}
          onDelete={deleteTicket}
        />
      )}

      {/* Action bar — fixed to the bottom of the screen. Shown on every tab
          (not just Overview) so the admin/tech doesn't have to hop back to
          Overview after doing the actual work (quotation, notes, payment).
          Status transition button(s) fill ~90% of the row, undo the
          remaining ~10%. Stays below the sidebar drawer (z-50) and its
          overlay (z-40). */}
      {showActions && (
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
              <button onClick={undoStatus} disabled={statusUpdating} className="btn-primary text-sm px-5">
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
              {nextStatuses.map(status => {
                const Icon = STATUS_ACTION_ICONS[status]
                return (
                  <button
                    key={status}
                    onClick={() => updateStatus(status)}
                    disabled={statusUpdating}
                    aria-label={STATUS_ACTION_LABELS[status] || `Transition to ${status}`}
                    className={`btn-primary text-sm px-6 ${status === 'Denied' ? 'bg-red-600 hover:bg-red-700 focus:ring-red-400' : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-400'}`}
                  >
                    {statusUpdating
                      ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <>{Icon && <Icon className="w-3.5 h-3.5" />} {STATUS_ACTION_LABELS[status] || status}</>
                    }
                  </button>
                )
              })}
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
