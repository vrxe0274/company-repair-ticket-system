/**
 * @file SubmitTicketPage.jsx
 * @description Public 4-step ticket submission form. No auth required.
 *
 * Flow:
 *   Step 1 — Client info (name, contact, email, address, platform)
 *   Step 2 — Unit info  (brand, model, type)
 *   Step 3 — Issue      (preset selector + free-text description)
 *   Step 4 — Appointment (date, time, mode of service) → submit
 *
 * On success the form resets and a confirmation screen is shown with the
 * generated Ticket ID and a copyable tracking URL.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle, Copy, ExternalLink, ChevronRight, ChevronLeft,
  User, Cpu, AlertCircle, CalendarClock, Send,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { sendGlobalPush } from '../lib/push'
import { createNotification, NOTIFY_ROLES } from '../lib/notifications'
import {
  generateTicketId, generateTrackingToken, getTrackingUrl,
  formatUnitLabel, formatClientUnitLabel,
  PLATFORMS, UNIT_TYPES, VR_BRANDS, VR_ISSUES, MODES_OF_SERVICE,
} from '../lib/utils'
import Logo from '../components/ui/Logo.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────
const COPY_FEEDBACK_MS = 2000

const FORM_INITIAL = {
  client_name: '', contact_number: '', email: '', address: '', platform: '',
  unit_brand: '', unit_brand_custom: '', unit_model: '', unit_type: '',
  accessories_included: '', issue_description: '', issue_preset: '',
  preferred_date: '', preferred_time: '', mode_of_service: '',
}

const STEPS = [
  { id: 1, label: 'Your Info',    icon: User },
  { id: 2, label: 'Your Unit',   icon: Cpu },
  { id: 3, label: 'Issue',       icon: AlertCircle },
  { id: 4, label: 'Appointment', icon: CalendarClock },
]

const STEP_REQUIRED = {
  1: ['client_name', 'contact_number', 'email', 'address', 'platform'],
  2: ['unit_brand', 'unit_model', 'unit_type'],
  3: ['issue_description'],
  4: ['mode_of_service'],
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Sub-components ────────────────────────────────────────────────────────────
function PublicHeader() {
  return (
    <header className="bg-dark-900 border-b border-dark-700 px-6 py-3 flex items-center justify-between">
      <Logo size="sm" />
    </header>
  )
}

function StepHeading({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3 pb-4 border-b border-gray-100 mb-2">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-accent-600 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <h2 className="font-sans font-bold text-lg text-gray-900">{title}</h2>
        <p className="text-base font-body text-gray-500">{subtitle}</p>
      </div>
    </div>
  )
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="text-sm text-red-500 mt-1 font-body">{error}</p>}
    </div>
  )
}

function SummaryRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex gap-3 text-base">
      <span className="text-gray-500 font-sans font-medium w-14 shrink-0">{label}</span>
      <span className="text-gray-800 font-body">{value}</span>
    </div>
  )
}

// ── Page component ────────────────────────────────────────────────────────────
export default function SubmitTicketPage() {
  const [form, setForm]             = useState(FORM_INITIAL)
  const [errors, setErrors]         = useState({})
  const [step, setStep]             = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(null)
  const [copied, setCopied]         = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    if (errors[name]) {
      setErrors(prev => { const n = { ...prev }; delete n[name]; return n })
    }
  }

  function handleIssuePreset(issue) {
    setForm(f => ({
      ...f,
      issue_preset:      issue,
      issue_description: issue === 'Others' ? f.issue_description : issue,
    }))
    if (errors.issue_description) {
      setErrors(prev => { const n = { ...prev }; delete n.issue_description; return n })
    }
  }

  function validateStep(s) {
    const required = STEP_REQUIRED[s] || []
    const errs = {}
    required.forEach(field => {
      const val = field === 'unit_brand'
        ? (form.unit_brand === 'Others' ? form.unit_brand_custom : form.unit_brand)
        : form[field]
      if (!val || !String(val).trim()) errs[field] = 'Required'
    })
    if (s === 1 && form.email && !EMAIL_REGEX.test(form.email)) {
      errs.email = 'Invalid email'
    }
    return errs
  }

  function next() {
    const errs = validateStep(step)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setStep(s => Math.min(s + 1, STEPS.length))
  }

  function prev() {
    setErrors({})
    setStep(s => Math.max(s - 1, 1))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const errs = validateStep(4)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSubmitting(true)
    try {
      const ticketId      = generateTicketId()
      const trackingToken = generateTrackingToken()
      const resolvedBrand = form.unit_brand === 'Others' ? form.unit_brand_custom : form.unit_brand
      const payload = {
        client_name:          form.client_name,
        contact_number:       form.contact_number,
        email:                form.email,
        address:              form.address,
        platform:             form.platform,
        unit_brand:           resolvedBrand,
        unit_model:           form.unit_model,
        unit_type:            form.unit_type,
        accessories_included: form.accessories_included || null,
        issue_description:    form.issue_description,
        preferred_date:       form.preferred_date  || null,
        preferred_time:       form.preferred_time  || null,
        mode_of_service:      form.mode_of_service,
        ticket_id:            ticketId,
        tracking_token:       trackingToken,
        status:               'Pending',
      }
      const { data, error } = await supabase.from('tickets').insert([payload]).select().single()
      if (error) throw error
      // In-app notification for Admin (the role that reviews Pending tickets) —
      // fire-and-forget, fails softly like the push below.
      createNotification({
        recipientRole: NOTIFY_ROLES.ADMIN,
        message:       `New ticket: ${formatClientUnitLabel(data)}`,
        type:          'new_ticket',
        status:        'Pending',
        ticketUuid:    data.id,
        ticketHumanId: data.ticket_id,
      })
      // Global push (all subscribed staff devices) — fire-and-forget, fails softly.
      // Creation events show the ticket (unit) name only — no client name.
      sendGlobalPush({
        title: 'New repair ticket',
        body:  `New ticket: ${formatUnitLabel(data)}.`,
        url:   `/tickets/${data.id}`,
      })
      setSubmitted(data)
      setForm(FORM_INITIAL)
      setStep(1)
    } catch (err) {
      console.error('[SubmitTicketPage] handleSubmit failed:', err)
      alert('Submission failed: ' + (err.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  function copyUrl() {
    if (!submitted) return
    navigator.clipboard.writeText(getTrackingUrl(submitted.tracking_token))
    setCopied(true)
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS)
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (submitted) {
    const trackingUrl = getTrackingUrl(submitted.tracking_token)
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <PublicHeader />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full animate-slide-up text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-brand-500 to-accent-600 mb-6 shadow-lg">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h1 className="font-display text-4xl tracking-widest text-gray-900 mb-2">SUBMITTED!</h1>
            <p className="text-gray-500 font-body text-base mb-8">
              Your repair request has been received. We'll review it shortly.
            </p>

            <div className="card p-6 mb-5 text-left">
              <p className="text-xs font-sans font-semibold tracking-widest text-gray-400 uppercase mb-1">Ticket ID</p>
              <p className="font-mono text-2xl font-bold text-gray-900 tracking-wider mb-5">{submitted.ticket_id}</p>
              <p className="text-xs font-sans font-semibold text-gray-500 mb-2">Your tracking link:</p>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
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
        </main>
      </div>
    )
  }

  // ── Multi-step form ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicHeader />

      {/* Hero banner */}
      <div className="relative bg-dark-900 overflow-hidden">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            background:
              'radial-gradient(ellipse at 20% 60%, #7317e8 0%, transparent 50%),' +
              'radial-gradient(ellipse at 80% 40%, #d4007f 0%, transparent 50%)',
          }}
        />
        <div className="relative z-10 max-w-2xl mx-auto px-6 py-10">
          <p className="font-mono text-xs tracking-widest text-brand-300 uppercase mb-2 opacity-80">VR Repair Request</p>
          <h1 className="font-display text-5xl tracking-widest text-white mb-2">
            SUBMIT A <span className="text-accent-400">TICKET</span>
          </h1>
          <p className="text-gray-400 font-body text-base">
            Complete the form below to get your VR gear repaired by our expert technicians.
          </p>
        </div>
      </div>

      {/* Step progress indicator */}
      <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((s, i) => {
              const Icon       = s.icon
              const isComplete = step > s.id
              const isCurrent  = step === s.id
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-300
                      ${isComplete ? 'bg-brand-600 text-white' : isCurrent ? 'bg-dark-900 text-white ring-2 ring-brand-500 ring-offset-1' : 'bg-gray-200 text-gray-400'}`}
                    >
                      {isComplete ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <span className={`text-sm font-sans font-medium hidden sm:block
                      ${isCurrent ? 'text-gray-900' : isComplete ? 'text-brand-600' : 'text-gray-400'}`}>
                      {s.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 mx-2 sm:mx-3 h-0.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className={`h-full bg-brand-500 transition-all duration-500 ${isComplete ? 'w-full' : 'w-0'}`} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="text-sm font-body text-gray-500 text-center">
            Step {step} of {STEPS.length} —{' '}
            <span className="font-semibold text-gray-800">{STEPS[step - 1].label}</span>
          </div>
        </div>
      </div>

      {/* Form */}
      <main className="flex-1 px-6 py-8">
        <form onSubmit={handleSubmit} noValidate className="max-w-2xl mx-auto">
          <div className="card p-6 animate-slide-up" key={step}>

            {/* Step 1 — Client Info */}
            {step === 1 && (
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
            )}

            {/* Step 2 — Unit Info */}
            {step === 2 && (
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
            )}

            {/* Step 3 — Issue */}
            {step === 3 && (
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
            )}

            {/* Step 4 — Appointment + Summary */}
            {step === 4 && (
              <div className="space-y-4">
                <StepHeading icon={CalendarClock} title="Appointment" subtitle="When would you like to bring in your device?" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Preferred Date">
                    <input className="input-field" type="date" name="preferred_date" value={form.preferred_date} onChange={handleChange} />
                  </Field>
                  <Field label="Preferred Time">
                    <input className="input-field" type="time" name="preferred_time" value={form.preferred_time} onChange={handleChange} />
                  </Field>
                </div>
                <Field label="Mode of Service *" error={errors.mode_of_service}>
                  <select className="input-field" name="mode_of_service" value={form.mode_of_service} onChange={handleChange}>
                    <option value="">Select mode</option>
                    {MODES_OF_SERVICE.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Field>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 border border-gray-100">
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
            )}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-5">
            <button
              type="button"
              onClick={prev}
              disabled={step === 1}
              className="btn-secondary disabled:opacity-0 disabled:pointer-events-none"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>

            {step < STEPS.length ? (
              <button type="button" onClick={next} className="btn-primary">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button type="submit" disabled={submitting} className="btn-accent">
                {submitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Submit Ticket
                  </>
                )}
              </button>
            )}
          </div>

          <p className="text-center text-xs text-gray-400 font-body mt-4">
            By submitting, you agree to be contacted regarding your repair request.
          </p>
        </form>
      </main>
    </div>
  )
}