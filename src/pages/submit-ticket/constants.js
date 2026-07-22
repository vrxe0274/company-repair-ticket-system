import { User, Cpu, AlertCircle, CalendarClock, ScrollText } from 'lucide-react'

export const COPY_FEEDBACK_MS = 2000

export const FORM_INITIAL = {
  client_name: '', contact_number: '', email: '', address: '', platform: '',
  unit_brand: '', unit_brand_custom: '', unit_model: '', unit_type: '', unit_type_custom: '',
  unit_condition: '',
  accessories_included: '', issue_description: '', issue_preset: '',
  preferred_date: '', preferred_time: '', mode_of_service: '', mode_courier: '', mode_custom: '',
}

// Terms is intentionally step 1 — the client must accept before anything else.
export const STEPS = [
  { id: 1, label: 'Terms',       icon: ScrollText },
  { id: 2, label: 'Your Info',   icon: User },
  { id: 3, label: 'Your Unit',   icon: Cpu },
  { id: 4, label: 'Issue',       icon: AlertCircle },
  { id: 5, label: 'Appointment', icon: CalendarClock },
]

export const STEP_REQUIRED = {
  1: [],  // Terms — gated by the acceptance checkbox, not by required fields
  2: ['client_name', 'contact_number', 'email', 'address', 'platform'],
  3: ['unit_brand', 'unit_model', 'unit_type', 'unit_condition'],
  4: ['issue_description'],
  5: ['mode_of_service'],
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// PH mobile number, e.g. "09XX XXX XXXX" or "+639XX XXX XXXX" — spaces/dashes
// allowed and stripped before testing.
export const PHONE_REGEX = /^(\+63|0)9\d{9}$/
