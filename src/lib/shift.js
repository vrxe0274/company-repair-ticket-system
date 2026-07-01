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

/** 0 → "12 AM", 10 → "10 AM", 19 → "7 PM" */
export function fmtShiftHour(h) {
  if (h === 0)  return '12 AM'
  if (h < 12)   return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}
