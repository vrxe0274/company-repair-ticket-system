import { supabase } from './supabase'

export const DEFAULT_TECH_PCT  = 0.20
export const DEFAULT_STAFF_PCT = 0.05

const RATES_KEY = 'commission_rates'

/** Sum all labor_items amounts for a ticket. Returns 0 if none. */
export function laborFee(ticket) {
  return (ticket.labor_items ?? []).reduce((sum, i) => sum + Number(i.amount || 0), 0)
}

/** Technician earns techPct of the labor fee. */
export function technicianCommission(fee, pct = DEFAULT_TECH_PCT) {
  return fee * pct
}

/** Each staff member earns staffPct of (labor fee − technician commission). */
export function staffCommission(fee, techPct = DEFAULT_TECH_PCT, staffPct = DEFAULT_STAFF_PCT) {
  return (fee - technicianCommission(fee, techPct)) * staffPct
}

/**
 * Returns the rate record that was active when a ticket was created.
 * Falls back to defaults if no rate entry existed before that date.
 */
export function getApplicableRate(ticketDate, rateHistory) {
  if (!rateHistory?.length) return { technician_pct: DEFAULT_TECH_PCT, staff_pct: DEFAULT_STAFF_PCT }
  const ts = new Date(ticketDate).getTime()
  const match = [...rateHistory]
    .filter(r => new Date(r.effective_from).getTime() <= ts)
    .sort((a, b) => new Date(b.effective_from) - new Date(a.effective_from))[0]
  return match ?? { technician_pct: DEFAULT_TECH_PCT, staff_pct: DEFAULT_STAFF_PCT }
}

/** Fetch the full rate history from app_settings. Returns [] if none saved yet. */
export async function getCommissionRates() {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', RATES_KEY)
    .maybeSingle()
  return data?.value ?? []
}

/** Append a new rate entry (effective now) to the history. */
export async function saveCommissionRate(techPct, staffPct) {
  const existing = await getCommissionRates()
  const updated  = [...existing, {
    effective_from: new Date().toISOString(),
    technician_pct: techPct,
    staff_pct:      staffPct,
  }]
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: RATES_KEY, value: updated })
  if (error) throw error
}
