import { describe, it, expect } from 'vitest'
import { validateStep } from '../../pages/submit-ticket/validation'
import { FORM_INITIAL } from '../../pages/submit-ticket/constants'

// Step order: 1 Terms, 2 Client info, 3 Unit info, 4 Issue, 5 Appointment.

// ─── Step 1 — Terms ───────────────────────────────────────────────────────────

describe('validateStep — step 1 (terms)', () => {
  it('has no required fields — always valid (acceptance is gated in the UI)', () => {
    expect(validateStep(FORM_INITIAL, 1)).toEqual({})
  })
})

// ─── Step 2 — Client info ─────────────────────────────────────────────────────

describe('validateStep — step 2 (client info)', () => {
  it('returns errors for all required fields when form is empty', () => {
    const errs = validateStep(FORM_INITIAL, 2)
    expect(errs).toHaveProperty('client_name', 'Required')
    expect(errs).toHaveProperty('contact_number', 'Required')
    expect(errs).toHaveProperty('email', 'Required')
    expect(errs).toHaveProperty('address', 'Required')
    expect(errs).toHaveProperty('platform', 'Required')
  })

  it('returns no errors when all required fields are filled', () => {
    const form = {
      ...FORM_INITIAL,
      client_name: 'Juan Cruz',
      contact_number: '09171234567',
      email: 'juan@example.com',
      address: '123 Main St',
      platform: 'Walk-in',
    }
    expect(validateStep(form, 2)).toEqual({})
  })

  it('rejects invalid email format', () => {
    const form = {
      ...FORM_INITIAL,
      client_name: 'Juan',
      contact_number: '09171234567',
      email: 'not-an-email',
      address: 'Somewhere',
      platform: 'Walk-in',
    }
    expect(validateStep(form, 2)).toHaveProperty('email', 'Invalid email')
  })

  it('accepts valid email format', () => {
    const form = {
      ...FORM_INITIAL,
      client_name: 'Juan',
      contact_number: '09171234567',
      email: 'juan@example.com',
      address: 'Somewhere',
      platform: 'Walk-in',
    }
    expect(validateStep(form, 2)).not.toHaveProperty('email')
  })

  it('does not add email error when email is empty (required error covers it)', () => {
    const errs = validateStep({ ...FORM_INITIAL }, 2)
    // email is empty → 'Required', not 'Invalid email'
    expect(errs.email).toBe('Required')
  })

  it('flags whitespace-only fields as Required', () => {
    const form = { ...FORM_INITIAL, client_name: '   ', contact_number: '09171234567', email: 'a@b.com', address: 'x', platform: 'Walk-in' }
    expect(validateStep(form, 2)).toHaveProperty('client_name', 'Required')
  })
})

// ─── Step 3 — Unit info ───────────────────────────────────────────────────────

describe('validateStep — step 3 (unit info)', () => {
  it('requires unit_brand, unit_model, unit_type, unit_condition', () => {
    const errs = validateStep(FORM_INITIAL, 3)
    expect(errs).toHaveProperty('unit_brand', 'Required')
    expect(errs).toHaveProperty('unit_model', 'Required')
    expect(errs).toHaveProperty('unit_type', 'Required')
    expect(errs).toHaveProperty('unit_condition', 'Required')
  })

  it('resolves unit_brand "Others" to unit_brand_custom', () => {
    const form = { ...FORM_INITIAL, unit_brand: 'Others', unit_brand_custom: '', unit_model: 'X', unit_type: 'Phone', unit_condition: 'First Owner' }
    expect(validateStep(form, 3)).toHaveProperty('unit_brand', 'Required')
  })

  it('passes when unit_brand is Others and custom is filled', () => {
    const form = { ...FORM_INITIAL, unit_brand: 'Others', unit_brand_custom: 'Acme', unit_model: 'X1', unit_type: 'Phone', unit_condition: 'First Owner' }
    expect(validateStep(form, 3)).toEqual({})
  })

  it('resolves unit_type "Others" to unit_type_custom', () => {
    const form = { ...FORM_INITIAL, unit_brand: 'Apple', unit_model: 'X', unit_type: 'Others', unit_type_custom: '', unit_condition: 'First Owner' }
    expect(validateStep(form, 3)).toHaveProperty('unit_type', 'Required')
  })

  it('requires unit_condition even when other unit fields are filled', () => {
    const form = { ...FORM_INITIAL, unit_brand: 'Apple', unit_model: 'X', unit_type: 'Phone' }
    expect(validateStep(form, 3)).toHaveProperty('unit_condition', 'Required')
  })
})

// ─── Step 4 — Issue ───────────────────────────────────────────────────────────

describe('validateStep — step 4 (issue)', () => {
  it('requires issue_description', () => {
    expect(validateStep(FORM_INITIAL, 4)).toHaveProperty('issue_description', 'Required')
  })

  it('passes when issue_description is filled', () => {
    const form = { ...FORM_INITIAL, issue_description: 'Screen cracked' }
    expect(validateStep(form, 4)).toEqual({})
  })
})

// ─── Step 5 — Appointment ─────────────────────────────────────────────────────

describe('validateStep — step 5 (appointment)', () => {
  it('requires mode_of_service', () => {
    expect(validateStep(FORM_INITIAL, 5)).toHaveProperty('mode_of_service', 'Required')
  })

  it('passes when mode_of_service is set', () => {
    const form = { ...FORM_INITIAL, mode_of_service: 'Walk-in' }
    expect(validateStep(form, 5)).toEqual({})
  })

  it('resolves courier delivery mode to mode_courier', () => {
    const form = { ...FORM_INITIAL, mode_of_service: 'Delivery via courier', mode_courier: '' }
    expect(validateStep(form, 5)).toHaveProperty('mode_of_service', 'Required')
  })

  it('passes when courier delivery mode has a courier value', () => {
    const form = { ...FORM_INITIAL, mode_of_service: 'Delivery via courier', mode_courier: 'LBC' }
    expect(validateStep(form, 5)).toEqual({})
  })

  it('resolves Others mode to mode_custom', () => {
    const form = { ...FORM_INITIAL, mode_of_service: 'Others', mode_custom: '' }
    expect(validateStep(form, 5)).toHaveProperty('mode_of_service', 'Required')
  })
})
