// Role constants used for notification routing.
// Admin operates the Staff queue — treat an Admin actor as Staff for routing.
export const NOTIFY_ROLES = { STAFF: 'Staff', TECHNICIAN: 'Technician' }

/**
 * Build the right message + recipient for a status change.
 * Kept here as documentation for the routing logic that is now
 * implemented server-side in sql/notifications-trigger.sql.
 *
 * @param {Object}  args
 * @param {string}  args.actorRole    Who made the change ('Admin' | 'Staff' | 'Technician')
 * @param {string}  args.newStatus    The status it was moved to
 * @param {string}  args.ticketLabel  Human-readable label, e.g. "Juan Dela Cruz's Meta Quest 3"
 * @returns {{ recipientRole: string, message: string } | null}
 */
export function buildStatusNotification({ actorRole, newStatus, ticketLabel }) {
  const label = ticketLabel || 'Unnamed Ticket'
  const actor = actorRole === 'Admin' ? NOTIFY_ROLES.STAFF : actorRole
  const other = actor === NOTIFY_ROLES.STAFF ? NOTIFY_ROLES.TECHNICIAN : NOTIFY_ROLES.STAFF

  switch (newStatus) {
    case 'Inspection & Quote':
      return { recipientRole: NOTIFY_ROLES.TECHNICIAN, message: `Inspection & Quote: ${label}` }
    case 'Denied':
      return null
    case 'Repair in Progress':
      return { recipientRole: other, message: `Repair in Progress: ${label}` }
    case 'Done':
      return { recipientRole: NOTIFY_ROLES.STAFF, message: `Done: ${label}` }
    case 'Paid':
      return { recipientRole: NOTIFY_ROLES.STAFF, message: `Paid: ${label}` }
    default:
      return { recipientRole: other, message: `${newStatus}: ${label}` }
  }
}
