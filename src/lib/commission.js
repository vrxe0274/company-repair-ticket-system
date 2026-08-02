/**
 * @file commission.js
 * @description Commission is manual and per-repair — there is no default or
 * fallback rate. After a ticket is marked Paid, Admin assigns who worked it
 * (tickets.technician_usernames / assigned_staff) and types in that specific
 * repair's tech_commission_pct / staff_commission_pct. A null pct means "not
 * yet inputted by Admin" and every function below propagates that as `null`
 * rather than silently substituting a default.
 */

/**
 * The date a repair's commission belongs to: when the money was COLLECTED
 * (tickets.paid_at, stamped by the status trigger), not when the job was
 * booked. A repair created Jun 28 and paid Jul 5 is owed in the July payroll
 * run — bucketing it by created_at would credit it to a period that has
 * already been paid out and hide it from the one that hasn't.
 *
 * Falls back to created_at so a Paid ticket with no stamp (rows predating the
 * column, or a hand-edited status) still lands in some month rather than
 * vanishing from every payroll sheet.
 *
 * @returns {Date|null} null only when neither timestamp parses
 */
export function commissionDate(ticket) {
  for (const iso of [ticket?.paid_at, ticket?.created_at]) {
    if (!iso) continue
    const d = new Date(iso)
    if (!isNaN(d)) return d
  }
  return null
}

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
 * Every ticket assigned to one payee, with that repair's own rate and cut.
 *
 * `commission: null` means Admin hasn't inputted the percentage this payee's
 * cut depends on yet — for Staff that includes the *technician* percentage,
 * since staff's cut is net-of-technician. Shared by the Commission page and
 * its Excel export so both show the same jobs and the same figures.
 *
 * @param {Array}  tickets   already filtered to paid, commissionable repairs
 * @param {'Technician'|'Staff'} role
 * @param {string} username
 * @returns {Array<{ticket: object, fee: number, pct: number|null, commission: number|null}>}
 */
export function payeeJobs(tickets, role, username) {
  const rows = []
  for (const t of tickets) {
    const assigned = role === 'Technician'
      ? (t.technician_usernames ?? []).includes(username)
      : (t.assigned_staff ?? []).includes(username)
    if (!assigned) continue
    const fee = laborFee(t)
    rows.push({
      ticket:     t,
      fee,
      pct:        role === 'Technician' ? t.tech_commission_pct : t.staff_commission_pct,
      commission: role === 'Technician'
        ? technicianCommission(fee, t.tech_commission_pct)
        : staffCommission(fee, t.tech_commission_pct, t.staff_commission_pct),
    })
  }
  return rows
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
