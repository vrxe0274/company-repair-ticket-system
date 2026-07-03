import { supabase } from './supabase'

export const DEFAULT_TECH_PCT  = 0.20
export const DEFAULT_STAFF_PCT = 0.05

const RATES_KEY     = 'commission_rates'
const OVERRIDES_KEY = 'commission_overrides'

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

// ── Per-account commission overrides (date-versioned) ───────────────────────────
// Overrides are stored as a dated history — same shape/pattern as commission
// rates — so a change applies to NEW tickets only and past pay periods stay put.
// The account.commission_pct column is kept as the "current" value for display
// and editing; this history is the source of truth for what applied on a date.

/** Fetch the per-account override history from app_settings. Returns [] if none. */
export async function getCommissionOverrides() {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', OVERRIDES_KEY)
    .maybeSingle()
  return data?.value ?? []
}

/**
 * The override fraction that applied to an account when a ticket was created, or
 * null if the account had no override in effect then (caller falls back to the
 * role default). An entry with pct == null marks a reversion to the default.
 */
export function getApplicableOverride(role, username, ticketDate, overrides) {
  if (!overrides?.length) return null
  const ts = new Date(ticketDate).getTime()
  const match = overrides
    .filter(o => o.role === role && o.username === username && new Date(o.effective_from).getTime() <= ts)
    .sort((a, b) => new Date(b.effective_from) - new Date(a.effective_from))[0]
  return match ? (match.pct ?? null) : null
}

/**
 * Append dated override entries (effective now) to the history. Each change is
 * { role, username, pct } where pct is a fraction (0..1) or null (revert to
 * default). No-ops on an empty list.
 */
export async function appendCommissionOverrides(changes) {
  if (!changes?.length) return
  const existing = await getCommissionOverrides()
  const now      = new Date().toISOString()
  const updated  = [...existing, ...changes.map(c => ({
    role: c.role, username: c.username, effective_from: now, pct: c.pct,
  }))]
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: OVERRIDES_KEY, value: updated })
  if (error) throw error
}
