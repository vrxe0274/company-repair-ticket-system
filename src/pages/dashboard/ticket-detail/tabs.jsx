import { useState } from 'react'
import { format } from 'date-fns'
import {
  User, Package, FileText, Wrench,
  Image as ImageIcon, Upload, ExternalLink, X, Save, CheckCircle,
  DollarSign, Plus, Trash2, Settings,
} from 'lucide-react'
import { InfoBox, LockedSection, ProgressCard, LineItem, SummaryLine } from './components'
import { peso } from './helpers'
import { DIAGNOSIS_FEE } from '../../../lib/constants'
import { paymentPlanLabel, discountCapFor } from '../../../lib/utils'

export function OverviewTab({
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
            <InfoBox label="Condition"       value={ticket.unit_condition || '—'} />
            <InfoBox label="Mode of Service" value={ticket.mode_of_service} />
            <InfoBox label="Appointment Date" value={ticket.preferred_date ? format(new Date(ticket.preferred_date), 'MMM d, yyyy') : '—'} />
            <InfoBox label="Appointment Time" value={ticket.preferred_time || '—'} />
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

export function TechTab({
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

export function QuotationTab({
  canSeePricing, canEdit,
  laborItems, partsItems,
  discount, setDiscount,
  quotationNotes, setQuotationNotes,
  finalPrice, setFinalPrice,
  paymentOption, partialHighPct, partialLowPct,
  saving, saveMsg,
  laborTotal, partsTotal, discountValue, quotationLive,
  paymentProofUrl, uploadingProof, proofInputRef, onUploadProof, onDeleteProof,
  onSaveQuotation, onSaveFinalPayment,
  onUpdateLaborItem, onAddLaborItem, onRemoveLaborItem,
  onUpdatePartsItem, onAddPartsItem, onRemovePartsItem,
  onToggleDiagnosis,
}) {
  const [discountOpen, setDiscountOpen] = useState(parseFloat(discount) > 0)
  const diagnosisIncluded = laborItems.some(it => it.description === 'Diagnosis')
  // The payment plan is chosen by the CLIENT on the tracker page — read-only here.
  // The chosen plan caps how large a discount the admin may grant:
  //   full_now → up to partialHighPct%, half_now → up to partialLowPct%, pay_later → 0%.
  const discountCap = discountCapFor(paymentOption, partialHighPct, partialLowPct)
  // Effective discount after the plan cap — what is actually applied / displayed.
  const effDiscountPct = Math.min(discountCap, Math.max(0, parseFloat(discount) || 0))
  // No payment plan for diagnosis/cleaning-only tickets.
  const filledLabor = laborItems.filter(i => i.description || i.amount)
  const filledParts = partsItems.filter(i => i.description || i.amount)
  const isDiagCleanOnly =
    filledLabor.length > 0 &&
    filledParts.length === 0 &&
    filledLabor.every(i => /diagnosis|cleaning/i.test(i.description || ''))
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

              {/* Diagnosis fee toggle — admin sets this before starting repairs */}
              <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${diagnosisIncluded ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-gray-200'}`}>
                {canEdit ? (
                  <label className="flex items-start gap-3 cursor-pointer select-none w-full">
                    <input
                      type="checkbox"
                      checked={diagnosisIncluded}
                      onChange={onToggleDiagnosis}
                      className="mt-0.5 w-4 h-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
                    />
                    <div>
                      <p className="text-sm font-sans font-semibold text-gray-800">Include Diagnosis Fee</p>
                      <p className="text-xs font-body text-gray-500">{peso(DIAGNOSIS_FEE)} flat fee — required to start repair</p>
                    </div>
                  </label>
                ) : (
                  <div className="flex items-start gap-3 w-full">
                    <span className={`mt-0.5 w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center ${diagnosisIncluded ? 'bg-brand-600 border-brand-600' : 'border-gray-300'}`}>
                      {diagnosisIncluded && <CheckCircle className="w-3 h-3 text-white" />}
                    </span>
                    <div>
                      <p className="text-sm font-sans font-semibold text-gray-800">Diagnosis Fee</p>
                      <p className="text-xs font-body text-gray-500">{diagnosisIncluded ? `${peso(DIAGNOSIS_FEE)} — included` : 'Not included'}</p>
                    </div>
                  </div>
                )}
              </div>

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
                        canRemove={true}
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

              {/* Quotation notes — internal only (Staff/Admin). Not shown to the
                  client on the tracker page or the quotation/receipt PDFs. */}
              <div className="border-t border-gray-100 pt-5">
                <label className="label mb-2 flex items-center gap-1.5">
                  <FileText className="w-3 h-3" /> Notes
                  <span className="font-normal text-gray-400">(internal)</span>
                </label>
                {canEdit ? (
                  <textarea
                    value={quotationNotes}
                    onChange={e => setQuotationNotes(e.target.value)}
                    rows={3}
                    placeholder="Parts sourcing, price justification, follow-ups…"
                    className="input-field text-sm w-full resize-y"
                  />
                ) : quotationNotes ? (
                  <p className="text-sm font-body text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">
                    {quotationNotes}
                  </p>
                ) : (
                  <p className="text-sm font-body text-gray-400 italic">No notes.</p>
                )}
              </div>
            </div>

            {/* Discount + save — pinned to bottom of card */}
            <div className="border-t border-gray-100 pt-4 mt-4 space-y-3 shrink-0">
              {discountCap > 0 && (
                <div className="flex items-center gap-3 flex-wrap">
                  {canEdit ? (
                    discountOpen ? (
                      <>
                        <label className="label w-24 shrink-0 mb-0">Discount %</label>
                        <div className="flex items-center gap-3 flex-1 flex-wrap">
                          <div className="relative w-28">
                            <input type="number" min="0" max={discountCap} step="0.01" value={discount}
                              onChange={e => setDiscount(e.target.value)} placeholder="0"
                              className="input-field pr-7 text-sm text-right font-mono" />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">%</span>
                          </div>
                          {discountValue > 0 && (
                            <span className="text-xs font-body text-gray-500">= − {peso(discountValue)}</span>
                          )}
                          <button type="button"
                            onClick={() => { setDiscount('0'); setDiscountOpen(false) }}
                            className="ml-auto text-xs font-sans font-semibold text-gray-400 hover:text-red-500">
                            Remove
                          </button>
                          <span className="text-xs font-body text-gray-400 w-full">
                            Max {discountCap}%{Number(discount) > discountCap ? ' — capped on save' : ''}
                          </span>
                        </div>
                      </>
                    ) : (
                      <button type="button" onClick={() => setDiscountOpen(true)}
                        className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-sans font-semibold">
                        <Plus className="w-3.5 h-3.5" /> Add Discount
                      </button>
                    )
                  ) : discountValue > 0 ? (
                    <>
                      <label className="label w-24 shrink-0 mb-0">Discount %</label>
                      <span className="font-mono text-sm text-gray-700">− {peso(discountValue)}</span>
                    </>
                  ) : null}
                </div>
              )}
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
              {!isDiagCleanOnly && (
                <div className="pb-3 mb-1 border-b border-gray-100">
                  <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Payment Plan <span className="normal-case font-normal text-gray-400">(client's choice)</span>
                  </p>
                  {paymentOption ? (
                    <>
                      <p className="text-sm font-sans font-semibold text-gray-800">
                        {paymentPlanLabel(paymentOption, partialHighPct, partialLowPct)}
                      </p>
                      <p className="text-xs font-body text-gray-500 mt-0.5">
                        {discountCap > 0 ? `Up to ${discountCap}% discount allowed` : 'No discount for this plan.'}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs font-body text-gray-400 italic">Not chosen yet.</p>
                  )}
                </div>
              )}
              <SummaryLine label="Labor Subtotal" value={peso(laborTotal)} />
              <SummaryLine label="Parts Subtotal" value={peso(partsTotal)} />
              {discountValue > 0 && (
                <SummaryLine label={`Discount${effDiscountPct ? ` (${effDiscountPct}%)` : ''}`} value={`− ${peso(discountValue)}`} valueClass="text-green-600" />
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
                  {/* Payment proof — required before the final payment can be saved */}
                  <div className="border-t border-gray-100 pt-3">
                    <p className="label mb-2 flex items-center gap-1.5">
                      Payment Proof <span className="text-red-500">*</span>
                    </p>
                    <input
                      ref={proofInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="payment-proof-upload"
                      onChange={onUploadProof}
                    />
                    {paymentProofUrl ? (
                      <div className="flex items-center gap-3">
                        <a href={paymentProofUrl} target="_blank" rel="noopener noreferrer"
                           className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shrink-0 block hover:opacity-90">
                          <img src={paymentProofUrl} alt="Payment proof" className="w-full h-full object-cover" />
                        </a>
                        <div className="flex flex-col gap-1">
                          <label htmlFor="payment-proof-upload" className="text-xs font-sans font-semibold text-brand-600 hover:text-brand-700 cursor-pointer">
                            Replace
                          </label>
                          <button onClick={onDeleteProof} className="text-xs font-sans font-semibold text-red-500 hover:text-red-600 text-left">
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label htmlFor="payment-proof-upload"
                        className="flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg border border-dashed border-gray-300 text-sm font-sans font-semibold text-gray-500 hover:border-brand-400 hover:text-brand-600 cursor-pointer transition-colors">
                        {uploadingProof
                          ? <span className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                          : <Upload className="w-3.5 h-3.5" />
                        }
                        {uploadingProof ? 'Uploading…' : 'Upload screenshot'}
                      </label>
                    )}
                  </div>

                  <button onClick={onSaveFinalPayment} disabled={saving || uploadingProof || !paymentProofUrl}
                    className="btn-primary text-sm bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 focus:ring-emerald-400 w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                    {saving
                      ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Save className="w-3.5 h-3.5" />
                    }
                    Save Final Payment
                  </button>
                  {!paymentProofUrl && (
                    <p className="text-xs font-body text-gray-400 text-center">Upload proof to enable saving.</p>
                  )}
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
          <LockedSection message="Hidden until the ticket is approved." />
        </div>
      )}
    </div>
  )
}

export function SettingsTab({ isManager, deleteConfirm, setDeleteConfirm, onDelete }) {
  const [pw, setPw]     = useState('')
  const [err, setErr]   = useState('')
  const [busy, setBusy] = useState(false)

  async function confirmDelete() {
    if (!pw) { setErr('Enter the admin password.'); return }
    setBusy(true); setErr('')
    const error = await onDelete(pw) // navigates away on success
    if (error) { setErr(error); setBusy(false) }
  }

  function cancelDelete() {
    setDeleteConfirm(false); setPw(''); setErr('')
  }

  return (
    <div className="space-y-5">
      {isManager ? (
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
            <div className="space-y-3 max-w-xs">
              <p className="text-sm font-body text-red-700">Enter the admin password to permanently delete this ticket.</p>
              <input
                type="password"
                value={pw}
                onChange={e => { setPw(e.target.value); setErr('') }}
                onKeyDown={e => { if (e.key === 'Enter' && pw && !busy) confirmDelete() }}
                className="input-field"
                placeholder="Admin password"
                autoFocus
              />
              {err && <p className="text-xs text-red-500 font-sans">{err}</p>}
              <div className="flex items-center gap-3">
                <button onClick={confirmDelete} disabled={busy || !pw} className="btn-danger text-sm disabled:opacity-50">
                  {busy ? 'Deleting…' : 'Yes, Delete'}
                </button>
                <button onClick={cancelDelete} className="btn-secondary text-sm">Cancel</button>
              </div>
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
