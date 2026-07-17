/**
 * @file commission.js
 * @description Commission is manual and per-repair — there is no default or
 * fallback rate. After a ticket is marked Paid, Admin assigns who worked it
 * (tickets.technician_usernames / assigned_staff) and types in that specific
 * repair's tech_commission_pct / staff_commission_pct. A null pct means "not
 * yet inputted by Admin" and every function below propagates that as `null`
 * rather than silently substituting a default.
 */

/** Sum all labor_items amounts for a ticket. Returns 0 if none. */
export function laborFee(ticket) {
  return (ticket.labor_items ?? []).reduce((sum, i) => sum + Number(i.amount || 0), 0)
}

/**
 * Technician earns techPct of the labor fee, or null if not yet inputted.
 * When multiple technicians are assigned to a repair, each one individually
 * earns this same techPct — it is not split between them (mirrors how
 * multiple assigned staff each earn the same staffPct).
 */
export function technicianCommission(fee, techPct) {
  return techPct == null ? null : fee * techPct
}

/**
 * Staff earns staffPct of (labor fee − technician commission), or null if
 * either percentage for this repair hasn't been inputted yet — staff's cut
 * is net-of-technician, so it depends on techPct too.
 */
export function staffCommission(fee, techPct, staffPct) {
  if (techPct == null || staffPct == null) return null
  return (fee - technicianCommission(fee, techPct)) * staffPct
}

/**
 * True when a Paid ticket still needs Admin action on commission — either
 * nobody has been assigned to it yet, or someone's assigned but their
 * percentage hasn't been inputted yet. Drives the Admin task-list item.
 * `commission_not_applicable` is Admin's explicit "nothing to assign here"
 * — without it, an intentionally-empty assignment is indistinguishable from
 * one nobody has touched yet, and the task would never clear.
 */
export function ticketNeedsCommissionInput(ticket) {
  if (ticket.status !== 'Paid') return false
  if (ticket.commission_not_applicable) return false
  const techCount  = ticket.technician_usernames?.length ?? 0
  const staffCount = ticket.assigned_staff?.length ?? 0
  const needsAssignment = techCount === 0 && staffCount === 0
  const needsTechPct  = techCount > 0 && ticket.tech_commission_pct == null
  const needsStaffPct = staffCount > 0 && ticket.staff_commission_pct == null
  return needsAssignment || needsTechPct || needsStaffPct
}
