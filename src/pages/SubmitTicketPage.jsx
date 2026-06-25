/**
 * @file SubmitTicketPage.jsx
 * @description Public 5-step ticket submission form. No auth required.
 *
 * Flow:
 *   Step 1 — Terms & Conditions (must accept before proceeding)
 *   Step 2 — Client info (name, contact, email, address, platform)
 *   Step 3 — Unit info  (brand, model, type, condition)
 *   Step 4 — Issue      (preset selector + free-text description)
 *   Step 5 — Appointment (date, time, mode of service) → submit
 *
 * On success the form resets and a confirmation screen is shown with the
 * generated Ticket ID and a copyable tracking URL.
 */

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Send, CheckCircle } from 'lucide-react'
import { supabase }              from '../lib/supabase'
import { sendGlobalPush }        from '../lib/push'
import {
  generateTicketId, generateTrackingToken, getTrackingUrl,
  formatUnitLabel, formatClientUnitLabel,
} from '../lib/utils'
import { PublicHeader } from './submit-ticket/components'
import {
  COPY_FEEDBACK_MS, FORM_INITIAL, STEPS,
} from './submit-ticket/constants'
import { validateStep } from './submit-ticket/validation'
import {
  Step1ClientInfo, Step2UnitInfo, Step3Issue,
  Step4Appointment, Step5Terms, SuccessScreen,
} from './submit-ticket/steps'

export default function SubmitTicketPage() {
  const [form, setForm]             = useState(FORM_INITIAL)
  const [errors, setErrors]         = useState({})
  const [step, setStep]             = useState(1)
  const [submitting, setSubmitting]       = useState(false)
  const [submitted, setSubmitted]         = useState(null)
  const [copied, setCopied]               = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)

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

  function next() {
    const errs = validateStep(form, step)
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
    const errs = validateStep(form, 5)  // step 5 = Appointment (the submit step)
    if (Object.keys(errs).length) { setErrors(errs); return }
    if (!termsAccepted) { setStep(1); return }  // safety net — Terms is step 1
    setSubmitting(true)
    try {
      const ticketId      = await generateTicketId(supabase)
      const trackingToken = generateTrackingToken()
      const resolvedBrand = form.unit_brand === 'Others' ? form.unit_brand_custom : form.unit_brand
      const resolvedType  = form.unit_type === 'Others' ? form.unit_type_custom : form.unit_type
      const resolvedMode  = form.mode_of_service === 'Delivery via courier' ? `Delivery via courier - ${form.mode_courier}` : form.mode_of_service === 'Others' ? form.mode_custom : form.mode_of_service
      const payload = {
        client_name:          form.client_name,
        contact_number:       form.contact_number,
        email:                form.email.trim(),
        address:              form.address,
        platform:             form.platform,
        unit_brand:           resolvedBrand,
        unit_model:           form.unit_model,
        unit_type:            resolvedType,
        unit_condition:       form.unit_condition,
        accessories_included: form.accessories_included || null,
        issue_description:    form.issue_description,
        preferred_date:       form.preferred_date  || null,
        preferred_time:       form.preferred_time  || null,
        mode_of_service:      resolvedMode,
        ticket_id:            ticketId,
        tracking_token:       trackingToken,
        status:               'Pending',
        labor_items:          [],
        quotation_amount:     null,
      }
      const { data, error } = await supabase.from('tickets').insert([payload]).select().single()
      if (error) throw error
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

  async function devQuickSubmit() {
    setSubmitting(true)
    try {
      const ticketId      = await generateTicketId(supabase)
      const trackingToken = generateTrackingToken()
      const payload = {
        client_name:          'Dev Tester',
        contact_number:       '09171234567',
        email:                'dev@vrxe.local',
        address:              '123 Test Street, Quezon City, Metro Manila',
        platform:             'Facebook',
        unit_brand:           'Meta',
        unit_model:           'Quest 3',
        unit_type:            'VR Headset',
        unit_condition:       'First Owner',
        accessories_included: 'Charging cable, carry case',
        issue_description:    'Display not working / black screen',
        preferred_date:       '2026-07-01',
        preferred_time:       '10:00',
        mode_of_service:      'Walk-in or Drop-Off',
        ticket_id:            ticketId,
        tracking_token:       trackingToken,
        status:               'Pending',
        labor_items:          [],
        quotation_amount:     null,
      }
      const { data, error } = await supabase.from('tickets').insert([payload]).select().single()
      if (error) throw error
      sendGlobalPush({
        title: 'New repair ticket',
        body:  `New ticket: ${formatUnitLabel(data)}.`,
        url:   `/tickets/${data.id}`,
      })
      setSubmitted(data)
      setForm(FORM_INITIAL)
      setStep(1)
      setTermsAccepted(false)
    } catch (err) {
      console.error('[DEV] devQuickSubmit failed:', err)
      alert('Dev submit failed: ' + (err.message || 'Unknown error'))
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

  if (submitted) {
    return (
      <SuccessScreen
        submitted={submitted}
        copied={copied}
        copyUrl={copyUrl}
        setSubmitted={setSubmitted}
      />
    )
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicHeader />

      {/* Hero banner */}
      <div className="relative bg-dark-900 overflow-hidden">
        {/* Main radial glow — stronger than before */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 15% 70%, rgba(115,23,232,0.65) 0%, transparent 50%),' +
              'radial-gradient(ellipse at 88% 25%, rgba(212,0,127,0.55) 0%, transparent 50%),' +
              'radial-gradient(ellipse at 50% 110%, rgba(115,23,232,0.25) 0%, transparent 55%)',
          }}
        />
        {/* Subtle grid overlay — tech grid texture on the hero */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
        <div className="relative z-10 max-w-2xl mx-auto px-6 py-12">
          <p className="font-mono text-xs tracking-widest text-brand-300 uppercase mb-2">VR Repair Request</p>
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
          <div className="flex items-start mb-3">
            {STEPS.flatMap((s, i) => {
              const Icon       = s.icon
              const isComplete = step > s.id
              const isCurrent  = step === s.id
              const els = []
              if (i > 0) {
                els.push(
                  <div key={`line-${s.id}`} className="flex-1 mx-2 sm:mx-3 h-0.5 bg-gray-200 rounded-full overflow-hidden mt-4 shrink">
                    <div className={`h-full bg-brand-500 transition-all duration-500 ${step >= s.id ? 'w-full' : 'w-0'}`} />
                  </div>
                )
              }
              els.push(
                <div key={s.id} className="flex flex-col items-center gap-1 shrink-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
                    ${isComplete ? 'bg-brand-600 text-white' : isCurrent ? 'bg-dark-900 text-white ring-2 ring-brand-500 ring-offset-1' : 'bg-gray-200 text-gray-400'}`}
                  >
                    {isComplete ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className={`text-xs font-sans font-medium hidden sm:block text-center leading-tight
                    ${isCurrent ? 'text-gray-900' : isComplete ? 'text-brand-600' : 'text-gray-400'}`}>
                    {s.label}
                  </span>
                </div>
              )
              return els
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
            {step === 1 && <Step5Terms termsAccepted={termsAccepted} setTermsAccepted={setTermsAccepted} />}
            {step === 2 && <Step1ClientInfo form={form} errors={errors} handleChange={handleChange} />}
            {step === 3 && <Step2UnitInfo   form={form} errors={errors} handleChange={handleChange} />}
            {step === 4 && <Step3Issue      form={form} errors={errors} handleChange={handleChange} handleIssuePreset={handleIssuePreset} />}
            {step === 5 && <Step4Appointment form={form} errors={errors} handleChange={handleChange} />}
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
              <button
                type="button"
                onClick={next}
                disabled={step === 1 && !termsAccepted}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button type="submit" disabled={submitting || !termsAccepted} className="btn-accent disabled:opacity-50 disabled:cursor-not-allowed">
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

          {import.meta.env.DEV && step === 1 && (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={devQuickSubmit}
                disabled={submitting}
                className="text-xs font-mono px-4 py-2 rounded border border-dashed border-yellow-400 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? '⏳ Submitting…' : '[DEV] Quick Submit Test Ticket'}
              </button>
            </div>
          )}
        </form>
      </main>
    </div>
  )
}
