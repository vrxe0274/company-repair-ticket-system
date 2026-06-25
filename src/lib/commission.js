/**
 * Reusable commission calculation functions.
 * Used by both EarningsPage and the XLSX export so results stay consistent.
 */

/** Sum all labor_items amounts for a ticket. Returns 0 if none. */
export function laborFee(ticket) {
  return (ticket.labor_items ?? []).reduce((sum, i) => sum + Number(i.amount || 0), 0)
}

/** Technician earns 20% of the labor fee. */
export function technicianCommission(fee) {
  return fee * 0.20
}

/** Each staff member earns 5% of (labor fee − technician commission). */
export function staffCommission(fee) {
  return (fee - technicianCommission(fee)) * 0.05
}
