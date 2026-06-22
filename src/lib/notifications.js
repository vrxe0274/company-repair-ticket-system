import { supabase } from './supabase'
import { softFail } from './errors'

// Role constants (kept local so this module has no circular import with hooks).
// Notifications are routed to the Staff queue or the Technician. The Admin acts
// on the Staff queue, so Admin-actor changes are normalized to Staff and the
// Admin reads the Staff notification stream (see useNotifications).
export const NOTIFY_ROLES = { STAFF: 'Staff', TECHNICIAN: 'Technician' }

/**
 * Insert a notification row.
 * Fails softly (logs only) so a notification problem never blocks the
 * underlying action (status change, ticket submission, etc.).
 */
export async function createNotification({
  recipientRole,
  message,
  type = 'info',
  ticketUuid = null,
  ticketHumanId = null,
  status = null, // ticket status for the colored indicator (nullable)
}) {
  try {
    const { error } = await supabase.from('notifications').insert([{
      recipient_role:  recipientRole,
      message,
      type,
      status,
      ticket_uuid:     ticketUuid,
      ticket_human_id: ticketHumanId,
      seen:            false,
    }])
    if (error) softFail('createNotification', error)
  } catch (err) {
    softFail('createNotification', err)
  }
}

/**
 * Build the right message + recipient for a status change.
 *
 * Messages follow the "<action/status>: <clientName>'s <Brand> <Model>"
 * format, e.g. "Ready for pickup: Juan Dela Cruz's Meta Quest 3".
 *
 * @param {Object}  args
 * @param {string}  args.actorRole    Who made the change ('Admin' | 'Staff' | 'Technician')
 * @param {string}  args.newStatus    The status it was moved to
 * @param {string}  args.ticketLabel  Human-readable label from formatClientUnitLabel(),
 *                                    e.g. "Juan Dela Cruz's Meta Quest 3"
 * @returns {{ recipientRole: string, message: string } | null}
 */
export function buildStatusNotification({ actorRole, newStatus, ticketLabel }) {
  const label = ticketLabel || 'Unnamed Ticket'
  // Admin operates the Staff queue — treat an Admin actor as Staff for routing.
  const actor = actorRole === 'Admin' ? NOTIFY_ROLES.STAFF : actorRole
  const other = actor === NOTIFY_ROLES.STAFF ? NOTIFY_ROLES.TECHNICIAN : NOTIFY_ROLES.STAFF

  switch (newStatus) {
    case 'Inspection & Quote':
      // Staff approved a pending ticket — let the technician know.
      return {
        recipientRole: NOTIFY_ROLES.TECHNICIAN,
        message: `Approved: ${label}`,
      }
    case 'Denied':
      return {
        recipientRole: NOTIFY_ROLES.TECHNICIAN,
        message: `Denied: ${label}`,
      }
    case 'Repair in Progress':
      return {
        recipientRole: other,
        message: `Repair started: ${label}`,
      }
    case 'Done':
      // Technician finished — staff should review / mark paid.
      return {
        recipientRole: NOTIFY_ROLES.STAFF,
        message: `Ready for pickup: ${label}`,
      }
    case 'Paid':
      return {
        recipientRole: NOTIFY_ROLES.TECHNICIAN,
        message: `Paid: ${label}`,
      }
    default:
      return {
        recipientRole: other,
        message: `${newStatus}: ${label}`,
      }
  }
}
