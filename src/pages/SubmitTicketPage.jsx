import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CheckCircle, Copy, ExternalLink, ChevronRight, ChevronLeft,
  User, Cpu, AlertCircle, CalendarClock, Send
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  generateTicketId, generateTrackingToken, getTrackingUrl,
  PLATFORMS, UNIT_TYPES, VR_BRANDS, VR_ISSUES, MODES_OF_SERVICE
} from '../lib/utils'
import Logo from '../components/ui/Logo.jsx'

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

// Fields required per step
const STEP_REQUIRED = {
  1: ['client_name', 'contact_number', 'email', 'address', 'platform'],
  2: ['unit_brand', 'unit_model', 'unit_type'],
  3: ['issue_description'],
  4: ['mode_of_service'],
}

export default function SubmitTicketPage() {
  const [form, setForm]         = useState(FORM_INITIAL)
  const [errors, setErrors]     = useState({})
  const [step, setStep]         = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(null)
  const [copied, setCopied]         = useState(false)

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
    if (errors[name]) setErrors(prev => { const n = { ...prev }; delete n[name]; return n })
  }

  function handleIssuePreset(issue) {
    setForm(f => ({
      ...f,
      issue_preset: issue,
      issue_description: issue === 'Others' ? f.issue_description : issue,
    }))
    if (errors.issue_description) setErrors(prev => { const n = { ...prev }; delete n.issue_description; return n })
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
    if (s === 1 && form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
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
      const ticket_id      = generateTicketId()
      const tracking_token = generateTrackingToken()
      const resolvedBrand  = form.unit_brand === 'Others' ? form.unit_brand_custom : form.unit_brand

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
        preferred_date:       form.preferred_date || null,
        preferred_time:       form.preferred_time || null,
        mode_of_service:      form.mode_of_service,
        ticket_id,
        tracking_token,
        status: 'Pending',
      }

      const { data, error } = await supabase.from('tickets').insert([payload]).select().single()
      if (error) throw error

      setSubmitted(data)
      setForm(FORM_INITIAL)
      setStep(1)
    } catch (err) {
      console.error(err)
      alert('Submission failed: ' + (err.message || 'Unknown error'))
    } finally {
      setSubmitting(false)
    }
  }

  function copyUrl() {
    if (!submitted) return
    navigator.clipboard.writeText(getTrackingUrl(submitted.tracking_token))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Success screen ──────────────────────────────────────────────────
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
            <p className="text-gray-500 font-body text-sm mb-8">Your repair request has been received. We'll review it shortly.</p>

            <div className="card p-6 mb-5 text-left">
              <p className="text-xs font-sans font-semibold tracking-widest text-gray-400 uppercase mb-1">Ticket ID</p>
              <p className="font-mono text-2xl font-bold text-gray-900 tracking-wider mb-5">{submitted.ticket_id}</p>

              <p className="text-xs font-sans font-semibold text-gray-500 mb-2">Your tracking link:</p>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
                <span className="flex-1 text-xs font-mono text-gray-600 truncate">{trackingUrl}</span>
                <button onClick={copyUrl} className="shrink-0 text-gray-400 hover:text-brand-600 transition-colors">
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

  const progress = ((step - 1) / (STEPS.length - 1)) * 100

  // ── Multi-step form ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicHeader />

      {/* Hero */}
      <div className="relative bg-dark-900 overflow-hidden">
        {/* Gradient mesh background */}
        <div className="absolute inset-0 opacity-40"
          style={{ background: 'radial-gradient(ellipse at 20% 60%, #7317e8 0%, transparent 50%), radial-gradient(ellipse at 80% 40%, #d4007f 0%, transparent 50%)' }}
        />
        <div className="relative z-10 max-w-2xl mx-auto px-6 py-10">
          <p className="font-mono text-xs tracking-widest text-brand-300 uppercase mb-2 opacity-80">VR Repair Request</p>
          <h1 className="font-display text-5xl tracking-widest text-white mb-2">
            SUBMIT A <span className="text-accent-400">TICKET</span>
          </h1>
          <p className="text-gray-400 font-body text-sm">Complete the form below to get your VR gear repaired by our expert technicians.</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon
              const isComplete = step > s.id
              const isCurrent  = step === s.id
              return (
                <div key={s.id} className="flex items-center flex-1">
                  <div className={`flex items-center gap-2 ${i > 0 ? '' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-300
                      ${isComplete ? 'bg-brand-600 text-white' : isCurrent ? 'bg-dark-900 text-white ring-2 ring-brand-500 ring-offset-1' : 'bg-gray-200 text-gray-400'}`}>
                      {isComplete
                        ? <CheckCircle className="w-4 h-4" />
                        : <Icon className="w-4 h-4" />
                      }
                    </div>
                    <span className={`text-xs font-sans font-semibold tracking-wide hidden sm:block
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
          <div className="text-xs font-body text-gray-400 text-center">Step {step} of {STEPS.length} — <span className="font-semibold text-gray-700">{STEPS[step - 1].label}</span></div>
        </div>
      </div>

      {/* Form content */}
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
                    <option value="">Select platform...</option>
                    {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </Field>
              </div>
            )}

            {/* Step 2 — Unit Info */}
            {step === 2 && (
              <div className="space-y-4">
                <StepHeading icon={Cpu} title="Your VR Unit" subtitle="Tell us about the device that needs repair" />
                <Field label="Unit Brand *" error={errors.unit_brand}>
                  <select className="input-field" name="unit_brand" value={form.unit_brand} onChange={handleChange}>
                    <option value="">Select brand...</option>
                    {VR_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
                {form.unit_brand === 'Others' && (
                  <Field label="Specify Brand *" error={errors.unit_brand_custom}>
                    <input className="input-field" name="unit_brand_custom" value={form.unit_brand_custom} onChange={handleChange} placeholder="Enter brand name" />
                  </Field>
                )}
                <Field label="Unit Model *" error={errors.unit_model}>
                  <input className="input-field" name="unit_model" value={form.unit_model} onChange={handleChange} placeholder="e.g. Quest 3, PSVR2, Vive Pro 2" />
                </Field>
                <Field label="Unit Type *" error={errors.unit_type}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {UNIT_TYPES.map(t => (
                      <label key={t} className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 cursor-pointer transition-all
                        ${form.unit_type === t
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}>
                        <input type="radio" name="unit_type" value={t} checked={form.unit_type === t} onChange={handleChange} className="sr-only" />
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0
                          ${form.unit_type === t ? 'border-brand-600' : 'border-gray-300'}`}>
                          {form.unit_type === t && <div className="w-2 h-2 rounded-full bg-brand-600" />}
                        </div>
                        <span className="text-sm font-sans font-semibold">{t}</span>
                      </label>
                    ))}
                  </div>
                  {errors.unit_type && <p className="text-xs text-red-500 mt-1">{errors.unit_type}</p>}
                </Field>
                <Field label="Accessories Included" error={errors.accessories_included}>
                  <input className="input-field" name="accessories_included" value={form.accessories_included} onChange={handleChange} placeholder="e.g. Charging cable, controllers, case (optional)" />
                </Field>
              </div>
            )}

            {/* Step 3 — Issue */}
            {step === 3 && (
              <div className="space-y-4">
                <StepHeading icon={AlertCircle} title="Describe the Issue" subtitle="Select a common issue or describe it in your own words" />

                <div>
                  <label className="label">Common Issues (optional — select one)</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {VR_ISSUES.map(issue => (
                      <button
                        key={issue}
                        type="button"
                        onClick={() => handleIssuePreset(issue)}
                        className={`text-left px-3 py-2.5 rounded-lg border-2 text-sm font-body transition-all
                          ${form.issue_preset === issue
                            ? 'border-accent-500 bg-accent-50 text-accent-700 font-semibold'
                            : 'border-gray-200 hover:border-gray-300 text-gray-600'}`}
                      >
                        {issue}
                      </button>
                    ))}
                  </div>
                </div>

                <Field label="Issue Description *" error={errors.issue_description}>
                  <textarea
                    className="input-field resize-none"
                    rows={5}
                    name="issue_description"
                    value={form.issue_description}
                    onChange={handleChange}
                    placeholder="Describe what's happening with your unit in detail. When did it start? Any error messages?"
                  />
                </Field>
              </div>
            )}

            {/* Step 4 — Appointment */}
            {step === 4 && (
              <div className="space-y-4">
                <StepHeading icon={CalendarClock} title="Service Preferences" subtitle="Choose how and when you'd like your unit serviced" />

                <Field label="Mode of Service *" error={errors.mode_of_service}>
                  <div className="grid grid-cols-3 gap-3">
                    {MODES_OF_SERVICE.map(m => (
                      <label key={m} className={`flex flex-col items-center justify-center gap-2 px-3 py-4 rounded-lg border-2 cursor-pointer transition-all text-center
                        ${form.mode_of_service === m
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-gray-200 hover:border-gray-300 text-gray-500'}`}>
                        <input type="radio" name="mode_of_service" value={m} checked={form.mode_of_service === m} onChange={handleChange} className="sr-only" />
                        <span className="text-2xl">
                          {m === 'Drop-off' ? '🏪' : m === 'Courier' ? '📦' : '💬'}
                        </span>
                        <span className="text-sm font-sans font-semibold">{m}</span>
                      </label>
                    ))}
                  </div>
                  {errors.mode_of_service && <p className="text-xs text-red-500 mt-1">{errors.mode_of_service}</p>}
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Preferred Date" error={errors.preferred_date}>
                    <input className="input-field" type="date" name="preferred_date" value={form.preferred_date} onChange={handleChange} min={new Date().toISOString().split('T')[0]} />
                  </Field>
                  <Field label="Preferred Time" error={errors.preferred_time}>
                    <input className="input-field" type="time" name="preferred_time" value={form.preferred_time} onChange={handleChange} />
                  </Field>
                </div>

                {/* Summary */}
                <div className="mt-2 bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-2">
                  <p className="text-xs font-sans font-semibold tracking-widest text-gray-400 uppercase mb-3">Review Summary</p>
                  <SummaryRow label="Name"    value={form.client_name} />
                  <SummaryRow label="Email"   value={form.email} />
                  <SummaryRow label="Unit"    value={`${form.unit_brand === 'Others' ? form.unit_brand_custom : form.unit_brand} ${form.unit_model}`} />
                  <SummaryRow label="Type"    value={form.unit_type} />
                  <SummaryRow label="Issue"   value={form.issue_description.slice(0, 80) + (form.issue_description.length > 80 ? '…' : '')} />
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
                {submitting
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Submitting...</>
                  : <><Send className="w-4 h-4" /> Submit Ticket</>
                }
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
        <h2 className="font-sans font-bold text-lg text-gray-900 tracking-wide">{title}</h2>
        <p className="text-sm font-body text-gray-400">{subtitle}</p>
      </div>
    </div>
  )
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1 font-body">{error}</p>}
    </div>
  )
}

function SummaryRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex gap-3 text-sm">
      <span className="text-gray-400 font-sans w-14 shrink-0">{label}</span>
      <span className="text-gray-800 font-body">{value}</span>
    </div>
  )
}
