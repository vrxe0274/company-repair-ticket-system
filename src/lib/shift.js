import { supabase } from './supabase'

export const DEFAULT_SHIFT = { start: 10, end: 19 } // 10 AM – 7 PM

export async function getShiftHours() {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'shift_hours')
    .maybeSingle()
  if (!data?.value) return DEFAULT_SHIFT
  return {
    start: data.value.start ?? DEFAULT_SHIFT.start,
    end:   data.value.end   ?? DEFAULT_SHIFT.end,
  }
}

export async function saveShiftHours(start, end) {
  await supabase
    .from('app_settings')
    .upsert({ key: 'shift_hours', value: { start, end } })
}

export function isOutsideShift(isoString, shift) {
  const h = new Date(isoString).getHours()
  return h < shift.start || h >= shift.end
}

/** Date set to a given hour (0 min/sec) on the same calendar day as `d`. */
export const atHour = (d, h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x }

/**
 * Fixed daily lunch deduction, in hours. Shared constant so the cached JS
 * hours calc (attendanceExport.js's windowedHours) and the live Excel
 * formula it writes can't drift apart on this value.
 */
export const LUNCH_HOURS = 1

/** Max payable hours for a shift window: window size minus the lunch deduction. */
export const shiftHoursCap = shift => (shift.end - shift.start) - LUNCH_HOURS

/**
 * Whole minutes a login falls after a shift-start anchor (0 when on-time/early).
 * Single source of truth for lateness: a day is "Late" exactly when this is
 * > 0, so the Late status and the exported Minutes Late column always agree.
 *
 * @param {Date|string} loginAt
 * @param {Date} shiftStart  shift-start Date anchored to loginAt's calendar day
 *                           (i.e. `atHour(loginAt, shift.start)`) — passed in
 *                           rather than recomputed so callers that also need
 *                           the same anchor (e.g. windowedHours) don't rebuild it.
 */
export function minutesLate(loginAt, shiftStart) {
  const d = loginAt instanceof Date ? loginAt : new Date(loginAt)
  return Math.max(0, Math.round((d - shiftStart) / 60000))
}

/** 0 → "12 AM", 10 → "10 AM", 19 → "7 PM" */
export function fmtShiftHour(h) {
  if (h === 0)  return '12 AM'
  if (h < 12)   return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}
