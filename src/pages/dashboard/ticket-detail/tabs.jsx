import { useState } from 'react'
import { format } from 'date-fns'
import {
  User, Package, FileText, Wrench,
  Image as ImageIcon, Upload, ExternalLink, X, Save, CheckCircle,
  DollarSign, Plus, Trash2, Settings, Shield,
} from 'lucide-react'
import { InfoBox, LockedSection, ProgressCard, LineItem, SummaryLine, RequiredMark } from './components'
import { peso } from './helpers'
import { DIAGNOSIS_FEE } from '../../../lib/constants'
import { technicianCommission, staffCommission } from '../../../lib/commission'

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
 * Commission — its own tab, separate from Quotation & Payment. Admin assigns
 * who worked the repair + their per-repair cut, only actionable once the
 * ticket is Paid. Everyone else sees a read-only summary (or
 * "Not yet inputted"). Hidden entirely before Paid, since there's nothing to
 * assign yet.
 */
export function CommissionTab({
  isPaid,
  isAdmin,
  techAccounts, staffAccounts,
  commissionTech, toggleCommissionTech,
  commissionStaff, toggleCommissionStaff,
  commissionTechPct, setCommissionTechPct,
  commissionStaffPct, setCommissionStaffPct,
  commissionNotApplicable, setCommissionNotApplicable,
  commissionSaving, commissionError, onSaveCommission, saveMsg,
  laborTotal,
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {isPaid ? (
        <CommissionCard
          isAdmin={isAdmin}
          techAccounts={techAccounts} staffAccounts={staffAccounts}
          commissionTech={commissionTech} toggleCommissionTech={toggleCommissionTech}
          commissionStaff={commissionStaff} toggleCommissionStaff={toggleCommissionStaff}
          commissionTechPct={commissionTechPct} setCommissionTechPct={setCommissionTechPct}
          commissionStaffPct={commissionStaffPct} setCommissionStaffPct={setCommissionStaffPct}
          commissionNotApplicable={commissionNotApplicable} setCommissionNotApplicable={setCommissionNotApplicable}
          commissionSaving={commissionSaving} commissionError={commissionError}
          onSaveCommission={onSaveCommission} saveMsg={saveMsg}
          laborTotal={laborTotal}
        />
      ) : (
        <div className="card p-5 flex-1 flex items-center justify-center">
          <LockedSection message="Commission can be assigned once the ticket is marked Paid." />
        </div>
      )}
    </div>
  )
}

/**
 * Multi-select checklist of accounts, used for both technicians and staff.
 * Admin gets an editable checkbox roster; everyone else gets a plain
 * read-only list of just the assigned people (no interactive-looking
 * unchecked checkboxes).
 */
function PersonPicker({ icon: Icon, label, accounts, selected, onToggle, readOnly, noAccountsMessage }) {
  if (readOnly) {
    const assigned = accounts.filter(a => selected.includes(a.username))
    return (
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <Icon className="w-3.5 h-3.5 text-gray-400" />
          <label className="label mb-0">{label}</label>
        </div>
        {assigned.length === 0 ? (
          <p className="text-sm font-body text-gray-300 italic">Not assigned</p>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-1 -mr-1">
            {assigned.map(a => (
              <div key={a.username} className="flex items-center gap-2.5 text-sm px-2.5 py-2 rounded-lg bg-gray-50">
                <CheckCircle className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                <span className="font-sans font-semibold text-gray-800 truncate">{a.name || a.username}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <Icon className="w-3.5 h-3.5 text-gray-400" />
        <label className="label mb-0">{label}</label>
        {selected.length > 0 && (
          <span className="ml-auto text-[11px] font-mono font-semibold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">
            {selected.length} selected
          </span>
        )}
      </div>
      {accounts.length === 0 ? (
        <p className="text-xs font-body text-gray-400 italic">{noAccountsMessage}</p>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pr-1 -mr-1">
          {accounts.map(a => (
            <label
              key={a.username}
              className={`flex items-center gap-2.5 text-sm px-2.5 py-2 rounded-lg cursor-pointer select-none transition-colors
                ${selected.includes(a.username) ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
            >
              <input
                type="checkbox"
                checked={selected.includes(a.username)}
                onChange={() => onToggle(a.username)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500 shrink-0"
              />
              <span className="font-body text-gray-700 truncate">{a.name || a.username}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Commission — who worked this repair + their per-ticket cut. Only shown once
 * the ticket is Paid. Admin can assign/edit multiple technicians and/or
 * staff (each earns the full percentage independently, not split); everyone
 * else sees a read-only summary ("Not yet inputted" when a percentage hasn't
 * been set). Laid out to use the full tab width — two picker panels plus a
 * live payout preview, instead of a single narrow stacked card.
 */
function CommissionCard({
  isAdmin,
  techAccounts, staffAccounts,
  commissionTech, toggleCommissionTech,
  commissionStaff, toggleCommissionStaff,
  commissionTechPct, setCommissionTechPct,
  commissionStaffPct, setCommissionStaffPct,
  commissionNotApplicable, setCommissionNotApplicable,
  commissionSaving, commissionError, onSaveCommission, saveMsg,
  laborTotal,
}) {
  const noOneAssigned = commissionTech.length === 0 && commissionStaff.length === 0
  const nameFor = (accounts, username) => accounts.find(a => a.username === username)?.name || username

  const techPctNum   = commissionTechPct  === '' ? null : parseFloat(commissionTechPct)  / 100
  const staffPctNum  = commissionStaffPct === '' ? null : parseFloat(commissionStaffPct) / 100
  // Each assigned technician/staff earns the FULL pct independently (not
  // split among them) — see lib/commission.js.
  const techEach          = technicianCommission(laborTotal, techPctNum)
  const staffEach         = staffCommission(laborTotal, techPctNum, staffPctNum)
  const techPayoutTotal   = techEach  != null ? techEach  * commissionTech.length  : null
  const staffPayoutTotal  = staffEach != null ? staffEach * commissionStaff.length : null
  const netAfterPayouts   = techEach != null ? laborTotal - (techPayoutTotal ?? 0) - (staffPayoutTotal ?? 0) : null

  return (
    <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_1fr_280px] gap-5 min-h-0">

      {/* Technicians */}
      <div className="card p-4 sm:p-5 flex flex-col min-h-0">
        <PersonPicker
          icon={Wrench} label="Technicians"
          accounts={techAccounts} selected={commissionTech}
          onToggle={toggleCommissionTech} readOnly={!isAdmin}
          noAccountsMessage="No technician accounts."
        />
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 shrink-0">
          <span className="text-xs font-sans font-semibold text-gray-500">Commission</span>
          {isAdmin ? (
            <div className="relative w-24 ml-auto">
              <input
                type="number" min="0" max="100" step="0.1"
                value={commissionTechPct}
                onChange={e => setCommissionTechPct(e.target.value)}
                placeholder="0"
                disabled={commissionTech.length === 0}
                className="input-field pr-6 text-sm text-right font-mono disabled:bg-gray-100 disabled:text-gray-400"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-mono">%</span>
            </div>
          ) : (
            <span className="ml-auto font-mono text-sm font-semibold text-gray-800">
              {commissionTechPct !== '' ? `${commissionTechPct}%` : <span className="text-gray-400 italic font-normal text-xs">Not yet inputted</span>}
            </span>
          )}
        </div>
        <p className="text-[11px] font-body text-gray-400 mt-1">of the labor fee, each</p>
      </div>

      {/* Staff */}
      <div className="card p-4 sm:p-5 flex flex-col min-h-0">
        <PersonPicker
          icon={Shield} label="Staff"
          accounts={staffAccounts} selected={commissionStaff}
          onToggle={toggleCommissionStaff} readOnly={!isAdmin}
          noAccountsMessage="No staff accounts."
        />
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 shrink-0">
          <span className="text-xs font-sans font-semibold text-gray-500">Commission</span>
          {isAdmin ? (
            <div className="relative w-24 ml-auto">
              <input
                type="number" min="0" max="100" step="0.1"
                value={commissionStaffPct}
                onChange={e => setCommissionStaffPct(e.target.value)}
                placeholder="0"
                disabled={commissionStaff.length === 0}
                className="input-field pr-6 text-sm text-right font-mono disabled:bg-gray-100 disabled:text-gray-400"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-mono">%</span>
            </div>
          ) : (
            <span className="ml-auto font-mono text-sm font-semibold text-gray-800">
              {commissionStaffPct !== '' ? `${commissionStaffPct}%` : <span className="text-gray-400 italic font-normal text-xs">Not yet inputted</span>}
            </span>
          )}
        </div>
        <p className="text-[11px] font-body text-gray-400 mt-1">of net labor fee (after technician cut), each</p>
      </div>

      {/* Payout preview */}
      <div className="flex flex-col gap-4">
        <div className="card p-4 sm:p-5 space-y-2.5">
          <p className="section-title text-xs mb-1">Payout Preview</p>
          <SummaryLine label="Labor Fee" value={peso(laborTotal)} />
          <SummaryLine
            label={`Technician${commissionTech.length !== 1 ? 's' : ''}${commissionTech.length ? ` (×${commissionTech.length})` : ''}`}
            value={techPayoutTotal != null ? peso(techPayoutTotal) : '—'}
          />
          <SummaryLine
            label={`Staff${commissionStaff.length !== 1 ? 's' : ''}${commissionStaff.length ? ` (×${commissionStaff.length})` : ''}`}
            value={staffPayoutTotal != null ? peso(staffPayoutTotal) : '—'}
          />
          <div className="border-t border-gray-200 pt-2.5 mt-1 flex items-center justify-between">
            <span className="text-sm font-sans font-bold text-gray-700">Net After Payouts</span>
            <span className="text-lg font-display tracking-wider text-brand-600">
              {netAfterPayouts != null ? peso(Math.max(0, netAfterPayouts)) : '—'}
            </span>
          </div>
        </div>

        {(commissionTech.length > 0 || commissionStaff.length > 0) && (techEach != null || staffEach != null) && (
          <div className="card p-4 sm:p-5 space-y-1.5">
            <p className="section-title text-xs mb-1">Per Person</p>
            {commissionTech.map(u => (
              <div key={u} className="flex items-center justify-between text-xs">
                <span className="font-body text-gray-600 truncate flex items-center gap-1.5"><Wrench className="w-3 h-3 text-accent-500 shrink-0" /> {nameFor(techAccounts, u)}</span>
                <span className="font-mono font-semibold text-gray-800 shrink-0">{techEach != null ? peso(techEach) : '—'}</span>
              </div>
            ))}
            {commissionStaff.map(u => (
              <div key={u} className="flex items-center justify-between text-xs">
                <span className="font-body text-gray-600 truncate flex items-center gap-1.5"><Shield className="w-3 h-3 text-emerald-500 shrink-0" /> {nameFor(staffAccounts, u)}</span>
                <span className="font-mono font-semibold text-gray-800 shrink-0">{staffEach != null ? peso(staffEach) : '—'}</span>
              </div>
            ))}
          </div>
        )}

        {isAdmin && (
          <div className="flex flex-col gap-2">
            {noOneAssigned && (
              <label className="flex items-center gap-2 text-xs font-sans font-medium text-gray-600 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={commissionNotApplicable}
                  onChange={e => setCommissionNotApplicable(e.target.checked)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                No commission needed for this ticket
              </label>
            )}
            {commissionError && <p className="text-xs text-red-500 font-sans">{commissionError}</p>}
            <button onClick={onSaveCommission} disabled={commissionSaving} className="btn-primary text-sm justify-center">
              {commissionSaving
                ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Save className="w-3.5 h-3.5" />
              }
              Save Commission
            </button>
            {saveMsg === 'Commission saved!' && (
              <span className="text-sm font-sans font-semibold text-green-600 flex items-center justify-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> {saveMsg}
              </span>
            )}
          </div>
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
