import { useState } from 'react'
import { format } from 'date-fns'
import {
  User, Package, FileText, Wrench,
  Image as ImageIcon, Upload, ExternalLink, X, Save, CheckCircle,
  DollarSign, Plus, Trash2, Settings, Percent, Shield,
} from 'lucide-react'
import { InfoBox, LockedSection, ProgressCard, LineItem, SummaryLine, RequiredMark } from './components'
import { peso } from './helpers'
import { DIAGNOSIS_FEE } from '../../../lib/constants'

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
  diagnosisActive, repairActive,
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
                <div className={`flex flex-col flex-1 min-h-0 rounded-lg transition-opacity ${!diagnosisActive ? 'opacity-50' : ''}`}>
                  <label className="label shrink-0">
                    Diagnosis Notes {diagnosisActive && <RequiredMark />}
                  </label>
                  <textarea
                    className="input-field resize-none flex-1 min-h-0 disabled:bg-gray-100 disabled:text-gray-400"
                    value={notes.diagnosis_notes}
                    onChange={e => setNotes(n => ({ ...n, diagnosis_notes: e.target.value }))}
                    placeholder="Enter diagnosis findings..."
                    disabled={!diagnosisActive}
                  />
                </div>
                <div className={`flex flex-col flex-1 min-h-0 rounded-lg transition-opacity ${!repairActive ? 'opacity-50' : ''}`}>
                  <label className="label shrink-0">
                    Repair Notes {repairActive && <RequiredMark />}
                  </label>
                  <textarea
                    className="input-field resize-none flex-1 min-h-0 disabled:bg-gray-100 disabled:text-gray-400"
                    value={notes.repair_notes}
                    onChange={e => setNotes(n => ({ ...n, repair_notes: e.target.value }))}
                    placeholder="Enter repair process notes..."
                    disabled={!repairActive}
                  />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={onSaveNotes} disabled={saving || (!diagnosisActive && !repairActive)} className="btn-primary text-sm">
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
            <ImageIcon className="w-3.5 h-3.5" /> Documentation {canEdit && repairActive && <RequiredMark />}
          </p>
          {canEdit && (
            <div>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={onUpload} id="photo-upload" disabled={!repairActive} />
              <label
                htmlFor={repairActive ? 'photo-upload' : undefined}
                className={`btn-secondary text-sm ${repairActive ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed pointer-events-none'}`}
              >
                {uploading
                  ? <span className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                  : <Upload className="w-3.5 h-3.5" />
                }
                Upload
              </label>
            </div>
          )}
        </div>
        <div className={`flex-1 overflow-y-auto min-h-0 transition-opacity ${canEdit && !repairActive ? 'opacity-50' : ''}`}>
          {ticket.repair_photos && ticket.repair_photos.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 content-start">
              {ticket.repair_photos.map((url) => (
                <div key={url} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                  <img src={url} alt="Documentation photo" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <a href={url} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-white/90 rounded-lg hover:bg-white">
                      <ExternalLink className="w-3.5 h-3.5 text-gray-700" />
                    </a>
                    {canEdit && repairActive && (
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
  quotationActive, paymentActive,
  laborItems, partsItems,
  discount, setDiscount,
  quotationNotes, setQuotationNotes,
  finalPrice, setFinalPrice,
  saving, saveMsg,
  laborTotal, partsTotal, discountValue, quotationLive,
  paymentProofUrl, uploadingProof, proofInputRef, onUploadProof, onDeleteProof,
  onSaveQuotation, onSaveFinalPayment,
  onUpdateLaborItem, onAddLaborItem, onRemoveLaborItem,
  onUpdatePartsItem, onAddPartsItem, onRemovePartsItem,
  onToggleDiagnosis,
  isAdmin, isPaid,
  techAccounts, staffAccounts,
  commissionTech, setCommissionTech,
  commissionStaff, toggleCommissionStaff,
  commissionTechPct, setCommissionTechPct,
  commissionStaffPct, setCommissionStaffPct,
  commissionSaving, commissionError, onSaveCommission,
}) {
  const [discountOpen, setDiscountOpen] = useState(parseFloat(discount) > 0)
  const diagnosisIncluded = laborItems.some(it => it.description === 'Diagnosis')
  // `discount` is a manual percentage set entirely at the admin's discretion.
  const discountPct = Math.min(100, Math.max(0, parseFloat(discount) || 0))
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {canSeePricing ? (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 min-h-0">

          {/* Left — scrollable line items + discount + save */}
          <div className="card p-3 sm:p-5 flex flex-col min-h-0">
            <p className="section-title flex items-center gap-2 mb-4 shrink-0">
              <DollarSign className="w-3.5 h-3.5" /> Pricing & Quotation {canEdit && quotationActive && <RequiredMark />}
            </p>

            <div className={`flex-1 overflow-y-auto min-h-0 space-y-5 pr-1 transition-opacity ${canEdit && !quotationActive ? 'opacity-50' : ''}`}>

              {/* Diagnosis fee toggle — admin sets this before starting repairs */}
              <div className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${diagnosisIncluded ? 'bg-brand-50 border-brand-200' : 'bg-gray-50 border-gray-200'}`}>
                {canEdit ? (
                  <label className={`flex items-start gap-3 select-none w-full ${quotationActive ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                    <input
                      type="checkbox"
                      checked={diagnosisIncluded}
                      onChange={onToggleDiagnosis}
                      disabled={!quotationActive}
                      className="mt-0.5 w-4 h-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer disabled:cursor-not-allowed"
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
                        disabled={!quotationActive}
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
                {canEdit && quotationActive && (
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
                        disabled={!quotationActive}
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
                {canEdit && quotationActive && (
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
                    disabled={!quotationActive}
                    className="input-field text-sm w-full resize-y disabled:bg-gray-100 disabled:text-gray-400"
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
              <div className="flex items-center gap-3 flex-wrap">
                {canEdit ? (
                  discountOpen ? (
                    <>
                      <label className="label w-24 shrink-0 mb-0">Discount %</label>
                      <div className="flex items-center gap-3 flex-1 flex-wrap">
                        <div className="relative w-28">
                          <input type="number" min="0" max="100" step="0.01" value={discount}
                            onChange={e => setDiscount(e.target.value)} placeholder="0"
                            disabled={!quotationActive}
                            className="input-field pr-7 text-sm text-right font-mono disabled:bg-gray-100 disabled:text-gray-400" />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">%</span>
                        </div>
                        {discountValue > 0 && (
                          <span className="text-xs font-body text-gray-500">= − {peso(discountValue)}</span>
                        )}
                        <button type="button"
                          onClick={() => { setDiscount('0'); setDiscountOpen(false) }}
                          disabled={!quotationActive}
                          className="ml-auto text-xs font-sans font-semibold text-gray-400 hover:text-red-500 disabled:opacity-40 disabled:pointer-events-none">
                          Remove
                        </button>
                      </div>
                    </>
                  ) : (
                    <button type="button" onClick={() => setDiscountOpen(true)}
                      disabled={!quotationActive}
                      className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-sans font-semibold disabled:opacity-40 disabled:pointer-events-none">
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
              {canEdit && (
                <div className="flex items-center gap-3">
                  <button onClick={onSaveQuotation} disabled={saving || !quotationActive} className="btn-primary text-sm">
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
                <SummaryLine label={`Discount${discountPct ? ` (${discountPct}%)` : ''}`} value={`− ${peso(discountValue)}`} valueClass="text-green-600" />
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
                <p className="section-title text-xs mb-0">Amount Paid {canEdit && paymentActive && <RequiredMark />}</p>
              </div>
              {canEdit ? (
                <div className={`relative w-full transition-opacity ${!paymentActive ? 'opacity-50' : ''}`}>
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">₱</span>
                  <input type="number" min="0" step="0.01" value={finalPrice}
                    onChange={e => setFinalPrice(e.target.value)} placeholder="0.00"
                    disabled={!paymentActive}
                    className="input-field pl-7 text-sm text-right font-mono w-full disabled:bg-gray-100 disabled:text-gray-400" />
                </div>
              ) : (
                <p className="text-3xl font-display tracking-wider text-emerald-700 flex-1 flex items-center">
                  {finalPrice ? peso(finalPrice) : <span className="text-gray-300 text-base italic font-sans font-normal">Not yet collected</span>}
                </p>
              )}
              {canEdit && (
                <div className={`flex flex-col gap-2 mt-auto transition-opacity ${!paymentActive ? 'opacity-50' : ''}`}>
                  {/* Payment proof — required before the final payment can be saved */}
                  <div className="border-t border-gray-100 pt-3">
                    <p className="label mb-2 flex items-center gap-1.5">
                      Payment Proof {paymentActive && <RequiredMark />}
                    </p>
                    <input
                      ref={proofInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      id="payment-proof-upload"
                      onChange={onUploadProof}
                      disabled={!paymentActive}
                    />
                    {paymentProofUrl ? (
                      <div className="flex items-center gap-3">
                        <a href={paymentProofUrl} target="_blank" rel="noopener noreferrer"
                           className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shrink-0 block hover:opacity-90">
                          <img src={paymentProofUrl} alt="Payment proof" className="w-full h-full object-cover" />
                        </a>
                        <div className="flex flex-col gap-1">
                          <label
                            htmlFor={paymentActive ? 'payment-proof-upload' : undefined}
                            className={`text-xs font-sans font-semibold text-brand-600 hover:text-brand-700 ${paymentActive ? 'cursor-pointer' : 'cursor-not-allowed pointer-events-none'}`}
                          >
                            Replace
                          </label>
                          <button onClick={onDeleteProof} disabled={!paymentActive} className="text-xs font-sans font-semibold text-red-500 hover:text-red-600 text-left disabled:pointer-events-none">
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label
                        htmlFor={paymentActive ? 'payment-proof-upload' : undefined}
                        className={`flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg border border-dashed border-gray-300 text-sm font-sans font-semibold text-gray-500 transition-colors ${paymentActive ? 'hover:border-brand-400 hover:text-brand-600 cursor-pointer' : 'cursor-not-allowed'}`}
                      >
                        {uploadingProof
                          ? <span className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                          : <Upload className="w-3.5 h-3.5" />
                        }
                        {uploadingProof ? 'Uploading…' : 'Upload screenshot'}
                      </label>
                    )}
                  </div>

                  <button onClick={onSaveFinalPayment} disabled={saving || uploadingProof || !paymentProofUrl || !paymentActive}
                    className="btn-primary text-sm bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 focus:ring-emerald-400 w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed">
                    {saving
                      ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Save className="w-3.5 h-3.5" />
                    }
                    Save Final Payment
                  </button>
                  {!paymentProofUrl && paymentActive && (
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

            {/* Commission — Admin assigns who worked the repair + their cut,
                only actionable once the ticket is Paid. Everyone else sees a
                read-only summary (or "Not yet inputted"). */}
            {isPaid && (
              <CommissionCard
                isAdmin={isAdmin}
                techAccounts={techAccounts} staffAccounts={staffAccounts}
                commissionTech={commissionTech} setCommissionTech={setCommissionTech}
                commissionStaff={commissionStaff} toggleCommissionStaff={toggleCommissionStaff}
                commissionTechPct={commissionTechPct} setCommissionTechPct={setCommissionTechPct}
                commissionStaffPct={commissionStaffPct} setCommissionStaffPct={setCommissionStaffPct}
                commissionSaving={commissionSaving} commissionError={commissionError}
                onSaveCommission={onSaveCommission} saveMsg={saveMsg}
              />
            )}
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

/**
 * Commission — who worked this repair + their per-ticket cut. Only shown once
 * the ticket is Paid. Admin can assign/edit; everyone else sees a read-only
 * summary ("Not yet inputted" when a percentage hasn't been set).
 */
function CommissionCard({
  isAdmin,
  techAccounts, staffAccounts,
  commissionTech, setCommissionTech,
  commissionStaff, toggleCommissionStaff,
  commissionTechPct, setCommissionTechPct,
  commissionStaffPct, setCommissionStaffPct,
  commissionSaving, commissionError, onSaveCommission, saveMsg,
}) {
  const nameFor = (accounts, username) => accounts.find(a => a.username === username)?.name || username

  if (!isAdmin) {
    return (
      <div className="card p-3 sm:p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Percent className="w-4 h-4 text-brand-500" />
          <p className="section-title text-xs mb-0">Commission</p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-body text-gray-500 flex items-center gap-1.5"><Wrench className="w-3 h-3" /> Technician</span>
            {commissionTech ? (
              <span className="font-sans font-semibold text-gray-800">
                {nameFor(techAccounts, commissionTech)}
                {' — '}
                {commissionTechPct !== '' ? `${commissionTechPct}%` : <span className="text-gray-400 italic font-normal">Not yet inputted</span>}
              </span>
            ) : <span className="text-gray-300 italic">Not assigned</span>}
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-body text-gray-500 flex items-center gap-1.5"><Shield className="w-3 h-3" /> Staff</span>
            {commissionStaff.length ? (
              <span className="font-sans font-semibold text-gray-800 text-right">
                {commissionStaff.map(u => nameFor(staffAccounts, u)).join(', ')}
                {' — '}
                {commissionStaffPct !== '' ? `${commissionStaffPct}%` : <span className="text-gray-400 italic font-normal">Not yet inputted</span>}
              </span>
            ) : <span className="text-gray-300 italic">Not assigned</span>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-3 sm:p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Percent className="w-4 h-4 text-brand-500" />
        <p className="section-title text-xs mb-0">Commission</p>
      </div>

      <div className="space-y-1.5">
        <label className="label mb-0 flex items-center gap-1.5"><Wrench className="w-3 h-3" /> Technician</label>
        <select
          value={commissionTech}
          onChange={e => setCommissionTech(e.target.value)}
          className="input-field text-sm w-full"
        >
          <option value="">— None —</option>
          {techAccounts.map(t => (
            <option key={t.username} value={t.username}>{t.name || t.username}</option>
          ))}
        </select>
        <div className="relative w-28">
          <input
            type="number" min="0" max="100" step="0.1"
            value={commissionTechPct}
            onChange={e => setCommissionTechPct(e.target.value)}
            placeholder="0"
            disabled={!commissionTech}
            className="input-field pr-7 text-sm text-right font-mono disabled:bg-gray-100 disabled:text-gray-400"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">%</span>
        </div>
      </div>

      <div className="space-y-1.5 border-t border-gray-100 pt-3">
        <label className="label mb-0 flex items-center gap-1.5"><Shield className="w-3 h-3" /> Staff</label>
        {staffAccounts.length === 0 ? (
          <p className="text-xs font-body text-gray-400 italic">No staff accounts.</p>
        ) : (
          <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
            {staffAccounts.map(s => (
              <label key={s.username} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={commissionStaff.includes(s.username)}
                  onChange={() => toggleCommissionStaff(s.username)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="font-body text-gray-700">{s.name || s.username}</span>
              </label>
            ))}
          </div>
        )}
        <div className="relative w-28">
          <input
            type="number" min="0" max="100" step="0.1"
            value={commissionStaffPct}
            onChange={e => setCommissionStaffPct(e.target.value)}
            placeholder="0"
            disabled={commissionStaff.length === 0}
            className="input-field pr-7 text-sm text-right font-mono disabled:bg-gray-100 disabled:text-gray-400"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-mono">%</span>
        </div>
      </div>

      {commissionError && <p className="text-xs text-red-500 font-sans">{commissionError}</p>}

      <div className="flex items-center gap-3">
        <button onClick={onSaveCommission} disabled={commissionSaving} className="btn-primary text-sm">
          {commissionSaving
            ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Save className="w-3.5 h-3.5" />
          }
          Save Commission
        </button>
        {saveMsg === 'Commission saved!' && (
          <span className="text-sm font-sans font-semibold text-green-600 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" /> {saveMsg}
          </span>
        )}
      </div>
    </div>
  )
}

export function SettingsTab({ isAdmin, deleteConfirm, setDeleteConfirm, onDelete }) {
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
