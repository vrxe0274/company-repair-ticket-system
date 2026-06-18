import {
  CheckCircle, Copy, ExternalLink, AlertCircle, ScrollText,
  User, Cpu, CalendarClock,
} from 'lucide-react'
import {
  PLATFORMS, VR_BRANDS, VR_ISSUES, UNIT_TYPES, MODES_OF_SERVICE, getTrackingUrl,
} from '../../lib/utils'
import { PublicHeader, StepHeading, Field, SummaryRow } from './components'

export function Step1ClientInfo({ form, errors, handleChange }) {
  return (
    <div className="space-y-4">
      <StepHeading icon={User} title="Client Information" subtitle="Tell us about yourself so we can reach you" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full Name *" error={errors.client_name}>
          <input className="input-field" name="client_name" value={form.client_name} onChange={handleChange} placeholder="Juan dela Cruz" />
        </Field>
        <Field label="Contact Number *" error={errors.contact_number}>
          <input className="input-field" name="contact_number" value={form.contact_number} onChange={handleChange} placeholder="09XX XXX XXXX" />
        </Field>
      </div>
      <Field label="Email Address *" error={errors.email}>
        <input className="input-field" type="email" name="email" value={form.email} onChange={handleChange} placeholder="juan@email.com" />
      </Field>
      <Field label="Address *" error={errors.address}>
        <textarea className="input-field resize-none" rows={2} name="address" value={form.address} onChange={handleChange} placeholder="Street, City, Province" />
      </Field>
      <Field label="How did you reach us? *" error={errors.platform}>
        <select className="input-field" name="platform" value={form.platform} onChange={handleChange}>
          <option value="">Select platform</option>
          {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </Field>
    </div>
  )
}

export function Step2UnitInfo({ form, errors, handleChange }) {
  return (
    <div className="space-y-4">
      <StepHeading icon={Cpu} title="Device Information" subtitle="Tell us about the VR unit you're bringing in" />
      <Field label="Brand *" error={errors.unit_brand}>
        <select className="input-field" name="unit_brand" value={form.unit_brand} onChange={handleChange}>
          <option value="">Select brand</option>
          {VR_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </Field>
      {form.unit_brand === 'Others' && (
        <Field label="Specify Brand *" error={errors.unit_brand}>
          <input className="input-field" name="unit_brand_custom" value={form.unit_brand_custom} onChange={handleChange} placeholder="Brand name" />
        </Field>
      )}
      <Field label="Model *" error={errors.unit_model}>
        <input className="input-field" name="unit_model" value={form.unit_model} onChange={handleChange} placeholder="e.g. Quest 3, PSVR2" />
      </Field>
      <Field label="Unit Type *" error={errors.unit_type}>
        <select className="input-field" name="unit_type" value={form.unit_type} onChange={handleChange}>
          <option value="">Select type</option>
          {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
      <Field label="Accessories Included">
        <input className="input-field" name="accessories_included" value={form.accessories_included} onChange={handleChange} placeholder="e.g. charging cable, carry case (optional)" />
      </Field>
    </div>
  )
}

export function Step3Issue({ form, errors, handleChange, handleIssuePreset }) {
  return (
    <div className="space-y-4">
      <StepHeading icon={AlertCircle} title="Issue Description" subtitle="What's wrong with your device?" />
      <div>
        <label className="label">Common Issues</label>
        <div className="flex flex-wrap gap-2 mb-3">
          {VR_ISSUES.map(issue => (
            <button
              key={issue}
              type="button"
              onClick={() => handleIssuePreset(issue)}
              className={`text-sm px-3 py-2 rounded-full font-sans font-semibold border transition-all min-h-[36px]
                ${form.issue_preset === issue
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'}`}
            >
              {issue}
            </button>
          ))}
        </div>
      </div>
      <Field label="Describe the Issue *" error={errors.issue_description}>
        <textarea
          className="input-field resize-none" rows={4}
          name="issue_description" value={form.issue_description} onChange={handleChange}
          placeholder="Describe what's happening with your device..."
        />
      </Field>
    </div>
  )
}

export function Step4Appointment({ form, errors, handleChange }) {
  return (
    <div className="space-y-4">
      <StepHeading icon={CalendarClock} title="Appointment" subtitle="When would you like to bring in your device?" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Preferred Date">
          <input className="input-field min-w-0 max-w-full" type="date" name="preferred_date" value={form.preferred_date} onChange={handleChange} />
        </Field>
        <Field label="Preferred Time">
          <input className="input-field min-w-0 max-w-full" type="time" name="preferred_time" value={form.preferred_time} onChange={handleChange} />
        </Field>
      </div>
      <Field label="Mode of Service *" error={errors.mode_of_service}>
        <select className="input-field" name="mode_of_service" value={form.mode_of_service} onChange={handleChange}>
          <option value="">Select mode</option>
          {MODES_OF_SERVICE.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </Field>
      <div className="bg-gray-50 rounded-xl p-4 space-y-2">
        <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">Summary</p>
        <SummaryRow label="Name"  value={form.client_name} />
        <SummaryRow
          label="Unit"
          value={`${form.unit_brand === 'Others' ? form.unit_brand_custom : form.unit_brand} ${form.unit_model}`}
        />
        <SummaryRow label="Type"  value={form.unit_type} />
        <SummaryRow
          label="Issue"
          value={form.issue_description.slice(0, 80) + (form.issue_description.length > 80 ? '…' : '')}
        />
      </div>
    </div>
  )
}

export function Step5Terms({ termsAccepted, setTermsAccepted }) {
  return (
    <div className="space-y-4">
      <StepHeading icon={ScrollText} title="Terms & Conditions" subtitle="Please read carefully before submitting your repair request" />

      <div className="border border-gray-200 rounded-xl overflow-hidden max-h-[420px] overflow-y-auto">

        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">1. Repair Turnaround Time</p>
          <div className="space-y-1.5">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-body text-gray-500 shrink-0">a.</span>
              <p className="text-sm font-body text-gray-700"><span className="font-semibold text-gray-900">Minor issue repairs</span> — estimated <span className="font-semibold">2–3 business days</span></p>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-body text-gray-500 shrink-0">b.</span>
              <p className="text-sm font-body text-gray-700"><span className="font-semibold text-gray-900">Major issue repairs</span> — estimated <span className="font-semibold">1–2 weeks</span></p>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-body text-gray-500 shrink-0">c.</span>
              <p className="text-sm font-body text-gray-600">Repair time may vary depending on the availability and shipping of parts.</p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">2. Inspection & Quotation</p>
          <p className="text-sm font-body text-gray-700 leading-relaxed mb-2">All units undergo a thorough inspection before any repair work begins. A repair quotation will be sent to you for approval — no work will proceed without your confirmation.</p>
          <p className="text-sm font-body text-gray-700 leading-relaxed">All services start with a flat rate of <span className="font-semibold text-gray-900">₱800 for diagnosis only</span>. Additional fees may be charged depending on the diagnosis findings, required parts, and labor involved in the repair.</p>
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">3. Payment</p>
          <p className="text-sm font-body text-gray-700 leading-relaxed">Full payment is required upon completion of the repair before the unit is released. If you choose to decline the quotation after inspection, a minimal inspection fee may apply.</p>
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">4. Data & Content</p>
          <p className="text-sm font-body text-gray-700 leading-relaxed">We are not responsible for any data, accounts, or saved content on the device. We strongly recommend backing up your data before submitting your unit for repair.</p>
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">5. Warranty on Repairs</p>
          <p className="text-sm font-body text-gray-700 leading-relaxed">Completed repairs carry a <span className="font-semibold text-gray-900">30-day warranty</span> covering the same issue that was repaired, though warranty coverage may vary depending on the type of repair performed. The warranty is void if the unit shows signs of physical damage, unauthorized tampering, or liquid exposure after it has been released to the client.</p>
        </div>

        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">6. Unclaimed Units</p>
          <p className="text-sm font-body text-gray-700 leading-relaxed">Units not claimed within <span className="font-semibold text-gray-900">30 days</span> after repair completion will be subject to a storage fee. Units left unclaimed for more than <span className="font-semibold text-gray-900">90 days</span> may be forfeited without further notice.</p>
        </div>

        <div className="px-5 py-4">
          <p className="text-xs font-sans font-semibold uppercase tracking-widest text-gray-400 mb-2">7. Liability</p>
          <p className="text-sm font-body text-gray-700 leading-relaxed">We handle all units with the utmost care. However, we are not liable for pre-existing damage or faults unrelated to the reported issue that may become apparent during the repair process.</p>
        </div>

      </div>

      <label className="flex items-start gap-3 cursor-pointer group pt-1">
        <div className="relative shrink-0 mt-0.5">
          <input
            type="checkbox"
            className="sr-only"
            checked={termsAccepted}
            onChange={e => setTermsAccepted(e.target.checked)}
          />
          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all
            ${termsAccepted
              ? 'bg-brand-600 border-brand-600'
              : 'bg-white border-gray-300 group-hover:border-brand-400'}`}
          >
            {termsAccepted && <CheckCircle className="w-3.5 h-3.5 text-white" />}
          </div>
        </div>
        <p className="text-sm font-body text-gray-700 leading-snug">
          I have read and agree to all the terms and conditions stated above.
        </p>
      </label>
    </div>
  )
}

export function SuccessScreen({ submitted, copied, copyUrl, setSubmitted }) {
  const trackingUrl = getTrackingUrl(submitted.tracking_token)
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full animate-slide-up">
          <div className="card p-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-brand-500 to-accent-600 mb-6" style={{ boxShadow: '0 8px 32px rgba(115,23,232,0.4), 0 4px 16px rgba(212,0,127,0.3)' }}>
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="font-display text-4xl tracking-widest text-gray-900 mb-2">SUBMITTED!</h1>
            <p className="text-gray-500 font-body text-base mb-8">
              Your repair request has been received. We'll review it shortly.
            </p>

            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-5 text-left">
              <p className="text-xs font-sans font-semibold tracking-widest text-gray-400 uppercase mb-1">Ticket ID</p>
              <p className="font-mono text-2xl font-bold text-gray-900 tracking-wider mb-5">{submitted.ticket_id}</p>
              <p className="text-xs font-sans font-semibold text-gray-500 mb-2">Your tracking link:</p>
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg p-3">
                <span className="flex-1 text-xs font-mono text-gray-600 truncate">{trackingUrl}</span>
                <button onClick={copyUrl} className="shrink-0 text-gray-400 hover:text-brand-600 transition-colors" aria-label="Copy tracking URL">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {copied && <p className="text-xs text-green-600 mt-1.5 font-semibold">✓ Copied!</p>}
            </div>

            <div className="flex flex-col gap-3">
              <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="btn-primary justify-center py-3">
                <ExternalLink className="w-4 h-4" /> Track My Repair
              </a>
              <button onClick={() => setSubmitted(null)} className="btn-secondary justify-center">
                Submit Another Ticket
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
