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
  'Done':                { bg: 'bg-green-100',  text: 'text-green-800',  dot: 'bg-green-400' },
  'Paid':                { bg: 'bg-emerald-100',text: 'text-emerald-800',dot: 'bg-emerald-500' },
  'Denied':              { bg: 'bg-red-100',    text: 'text-red-800',    dot: 'bg-red-500' },
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
