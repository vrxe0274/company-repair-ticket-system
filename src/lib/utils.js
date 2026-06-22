import { format } from 'date-fns'

/**
 * Generate a sequential Ticket ID like VR-2606-001.
 * Queries the DB for the highest existing number in the current YYMM period
 * and increments by 1. Requires supabase client as argument.
 */
export async function generateTicketId(supabase) {
  const yymm   = format(new Date(), 'yyMM')
  const prefix = `VR-${yymm}-`

  const { data } = await supabase
    .from('tickets')
    .select('ticket_id')
    .like('ticket_id', `${prefix}%`)
    .order('ticket_id', { ascending: false })
    .limit(1)

  let nextNum = 1
  if (data?.length) {
    const parsed = parseInt(data[0].ticket_id.slice(prefix.length), 10)
    if (!isNaN(parsed)) nextNum = parsed + 1
  }

  return `${prefix}${String(nextNum).padStart(3, '0')}`
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
 * Possessive client + unit label for in-app notification text:
 *   "Juan Dela Cruz's Meta Quest 3"
 *
 * No unit type suffix — notification messages follow the
 * "<action/status>: <clientName>'s <Brand> <Model>" format.
 * Falls back to whatever is present, then the raw ticket_id.
 *
 * @param {Object|null} ticket - Row with client_name / unit_brand /
 *   unit_model / ticket_id (extra fields are ignored).
 * @returns {string}
 */
export function formatClientUnitLabel(ticket) {
  if (!ticket) return 'Unnamed Ticket'
  const name = ticket.client_name?.trim()
  const unit = [ticket.unit_brand, ticket.unit_model]
    .map(v => v?.trim())
    .filter(Boolean)
    .join(' ')
  if (name && unit) return `${name}'s ${unit}`
  return name || unit || ticket.ticket_id || 'Unnamed Ticket'
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
    'Pending':            'Review request',
    'Inspection & Quote': 'Add quotation',
    'Done':               'Collect payment',
  },
  Staff: {
    'Pending':            'Review request',
    'Inspection & Quote': 'Add quotation',
    'Done':               'Collect payment',
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
  'Meta',
  'Oculus',
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
  'Cleaning Only',
  'Others',
]

export const MODES_OF_SERVICE = ['Drop-off', 'Courier', 'Others']

/** Condition the unit is in when brought to us — collected on the Unit step. */
export const UNIT_CONDITIONS = [
  'Brand new',
  'Opened by other technician',
  'Second-hand',
]

/**
 * Payment plans chosen by the client on the tracker page. The plan the client
 * picks determines the MAXIMUM discount the admin may grant on the quotation:
 *
 *   full_now  → pay the full price now  → up to {full}% discount
 *   half_now  → pay half the price now  → up to {half}% discount
 *   pay_later → pay on completion       → no discount
 *
 * The actual discount is still a manual percentage the admin enters, but it is
 * capped at the chosen plan's ceiling (see discountCapFor). The cap percentages
 * are stored per-ticket (payment_partial_high_pct = full cap, payment_partial_low_pct
 * = half cap) with the defaults below.
 */
export const PAYMENT_OPTIONS = [
  { value: 'full_now',  label: 'Pay full price now — up to {full}% discount' },
  { value: 'half_now',  label: 'Pay half price now — up to {half}% discount' },
  { value: 'pay_later', label: 'Pay later — no discount' },
]

// Default discount ceilings per plan. Stored per-ticket in the
// payment_partial_high_pct (full) / payment_partial_low_pct (half) columns.
export const DEFAULT_PARTIAL_HIGH_PCT = 40  // full_now ceiling
export const DEFAULT_PARTIAL_LOW_PCT  = 20  // half_now ceiling

/**
 * Maximum discount percentage allowed for a chosen payment plan.
 * full_now → fullCap, half_now → halfCap, pay_later / none → 0.
 */
export function discountCapFor(option, fullCap = DEFAULT_PARTIAL_HIGH_PCT, halfCap = DEFAULT_PARTIAL_LOW_PCT) {
  if (option === 'full_now') return Number(fullCap ?? DEFAULT_PARTIAL_HIGH_PCT)
  if (option === 'half_now') return Number(halfCap ?? DEFAULT_PARTIAL_LOW_PCT)
  return 0
}

/**
 * Human-readable label for a chosen payment plan, with the discount ceilings
 * filled in. Used on both the client tracker and the admin quotation view.
 */
export function paymentPlanLabel(option, fullCap = DEFAULT_PARTIAL_HIGH_PCT, halfCap = DEFAULT_PARTIAL_LOW_PCT) {
  const opt = PAYMENT_OPTIONS.find(o => o.value === option)
  if (!opt) return ''
  return opt.label
    .replace('{full}', fullCap ?? DEFAULT_PARTIAL_HIGH_PCT)
    .replace('{half}', halfCap ?? DEFAULT_PARTIAL_LOW_PCT)
}
