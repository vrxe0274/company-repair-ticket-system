import { format } from 'date-fns'

/**
 * Generate a human-readable Ticket ID like VRXE-20241210-A3F7
 */
export function generateTicketId() {
  const datePart = format(new Date(), 'yyyyMMdd')
  const randomPart = Math.random().toString(36).toUpperCase().substring(2, 6)
  return `VRXE-${datePart}-${randomPart}`
}

/**
 * Generate a random 32-char hex tracking token
 */
export function generateTrackingToken() {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Build the public tracking URL for a ticket
 */
export function getTrackingUrl(trackingToken) {
  const base = import.meta.env.VITE_APP_URL || window.location.origin
  return `${base}/track/${trackingToken}`
}

/** Builds "Samsung Galaxy S24 (Phone)" from whatever unit fields exist; '' if none. */
function buildUnitPart(ticket) {
  const unit = [ticket.unit_brand, ticket.unit_model]
    .map(v => v?.trim())
    .filter(Boolean)
    .join(' ')
  const type = ticket.unit_type?.trim()
  return unit && type ? `${unit} (${type})` : unit || type || ''
}

/**
 * Unit-only label (no client name) — used in push notifications for
 * ticket-creation events: "Samsung Galaxy S24 (Phone)".
 * Falls back to the raw ticket_id, then 'Unnamed Ticket'.
 */
export function formatUnitLabel(ticket) {
  if (!ticket) return 'Unnamed Ticket'
  return buildUnitPart(ticket) || ticket.ticket_id || 'Unnamed Ticket'
}

/**
 * Human-readable ticket label for in-app notification text:
 *   "Maria Santos — Samsung Galaxy S24 (Phone)"
 *
 * Falls back gracefully when fields are missing — uses whatever is present,
 * then the raw ticket_id, then 'Unnamed Ticket'.
 *
 * @param {Object|null} ticket - Row with client_name / unit_brand /
 *   unit_model / unit_type / ticket_id (extra fields are ignored).
 * @returns {string}
 */
export function formatTicketLabel(ticket) {
  if (!ticket) return 'Unnamed Ticket'
  const name = ticket.client_name?.trim()
  const unitPart = buildUnitPart(ticket)
  if (name && unitPart) return `${name} — ${unitPart}`
  return name || unitPart || ticket.ticket_id || 'Unnamed Ticket'
}

/**
 * Status workflow order — updated simplified statuses
 */
export const STATUS_ORDER = [
  'Pending',
  'Inspection & Quote',
  'Repair in Progress',
  'Done',
  'Paid',
]

export const STATUS_DESCRIPTIONS = {
  'Pending':             'Repair request has been received and is waiting for admin review.',
  'Inspection & Quote':  'Device has been checked and repair pricing/quotation has been prepared.',
  'Repair in Progress':  'Technician is currently repairing the device.',
  'Done':                'Repair has been completed and device is ready.',
  'Paid':                'Payment has been completed and device has been released.',
}

export const STATUS_DENIED = 'Denied'

export const STATUS_COLORS = {
  'Pending':             { bg: 'bg-yellow-100', text: 'text-yellow-800', dot: 'bg-yellow-400' },
  'Inspection & Quote':  { bg: 'bg-purple-100', text: 'text-purple-800', dot: 'bg-purple-400' },
  'Repair in Progress':  { bg: 'bg-indigo-100', text: 'text-indigo-800', dot: 'bg-indigo-400' },
  'Done':                { bg: 'bg-blue-100',   text: 'text-blue-800',   dot: 'bg-blue-400' },
  'Paid':                { bg: 'bg-emerald-100',text: 'text-emerald-800',dot: 'bg-emerald-500' },
  'Denied':              { bg: 'bg-red-100',    text: 'text-red-800',    dot: 'bg-red-500' },
}

/**
 * What the current role needs to do for a ticket in each status.
 * Eligibility itself comes from getAllowedTransitions() (useRole) so task
 * lists always match the actual workflow permissions; these strings are
 * just the human-readable instruction shown on each task row.
 */
export const TASK_ACTIONS = {
  Admin: {
    'Pending':            'Review request — approve or deny',
    'Inspection & Quote': 'Add quotation',
    'Done':               'Collect payment — mark as Paid',
  },
  Technician: {
    'Inspection & Quote': 'Inspect unit',
    'Repair in Progress': 'Finish repair — add notes & photos, mark Done',
  },
}

export const PLATFORMS = [
  'Facebook', 'Viber', 'Walk-in', 'Phone Call', 'Email', 'Others'
]

export const UNIT_TYPES = [
  'VR Headset',
  'VR Controller',
  'VR Charging Dock',
  'VR Cable / Accessory',
  'Others',
]

export const VR_BRANDS = [
  'Meta / Oculus',
  'PlayStation VR (PSVR)',
  'HTC Vive',
  'Pico',
  'Others',
]

export const VR_ISSUES = [
  'Display not working / black screen',
  'Blurry or distorted visuals',
  'Tracking issues (drift / lost tracking)',
  'Controller not pairing / unresponsive',
  'Lens scratched or damaged',
  'Audio / microphone not working',
  'Charging port damaged',
  'Strap or headband broken',
  'Overheating / shutting down',
  'Software / firmware issue',
  'Physical damage (cracked housing)',
  'Others',
]

export const MODES_OF_SERVICE = ['Drop-off', 'Courier', 'Others']

/**
 * Next possible statuses from each status (forward movement)
 */
export const NEXT_STATUSES = {
  'Pending':             ['Inspection & Quote', 'Denied'],
  'Inspection & Quote':  ['Repair in Progress'],
  'Denied':              [],
  'Repair in Progress':  ['Done'],
  'Done':                ['Paid'],
  'Paid':                [],
}

/**
 * Previous possible statuses from each status (backward movement)
 * Allows admins to revert a status
 */
export const PREV_STATUSES = {
  'Pending':             [],
  'Inspection & Quote':  ['Pending'],
  'Denied':              ['Pending'],
  'Repair in Progress':  ['Inspection & Quote'],
  'Done':                ['Repair in Progress'],
  'Paid':                ['Done'],
}
