import { User, Cpu, AlertCircle, CalendarClock, ScrollText } from 'lucide-react'

export const COPY_FEEDBACK_MS = 2000

export const FORM_INITIAL = {
  client_name: '', contact_number: '', email: '', address: '', platform: '',
  unit_brand: '', unit_brand_custom: '', unit_model: '', unit_type: '', unit_type_custom: '',
  accessories_included: '', issue_description: '', issue_preset: '',
  preferred_date: '', preferred_time: '', mode_of_service: '', mode_courier: '', mode_custom: '',
}

export const STEPS = [
  { id: 1, label: 'Your Info',    icon: User },
  { id: 2, label: 'Your Unit',   icon: Cpu },
  { id: 3, label: 'Issue',       icon: AlertCircle },
  { id: 4, label: 'Appointment', icon: CalendarClock },
  { id: 5, label: 'Terms',       icon: ScrollText },
]

export const STEP_REQUIRED = {
  1: ['client_name', 'contact_number', 'email', 'address', 'platform'],
  2: ['unit_brand', 'unit_model', 'unit_type'],
  3: ['issue_description'],
  4: ['mode_of_service'],
  5: [],
}

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
