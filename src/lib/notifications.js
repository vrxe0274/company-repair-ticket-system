import { supabase } from './supabase'

// Role constants (kept local so this module has no circular import with hooks)
export const NOTIFY_ROLES = { ADMIN: 'Admin', TECHNICIAN: 'Technician' }

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
    if (error) console.error('createNotification failed:', error.message)
  } catch (err) {
    console.error('createNotification exception:', err)
  }
}

/**
 * Build the right message + recipient for a status change.
 *
 * Messages follow the "<action/status>: <clientName>'s <Brand> <Model>"
 * format, e.g. "Ready for pickup: Juan Dela Cruz's Meta Quest 3".
 *
 * @param {Object}  args
 * @param {string}  args.actorRole    Who made the change ('Admin' | 'Technician')
 * @param {string}  args.newStatus    The status it was moved to
 * @param {string}  args.ticketLabel  Human-readable label from formatClientUnitLabel(),
 *                                    e.g. "Juan Dela Cruz's Meta Quest 3"
 * @returns {{ recipientRole: string, message: string } | null}
 */
export function buildStatusNotification({ actorRole, newStatus, ticketLabel }) {
  const label = ticketLabel || 'Unnamed Ticket'
  const other = actorRole === NOTIFY_ROLES.ADMIN ? NOTIFY_ROLES.TECHNICIAN : NOTIFY_ROLES.ADMIN

  switch (newStatus) {
    case 'Inspection & Quote':
      // Admin approved a pending ticket — let the technician know.
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
      // Technician finished — admin should review / mark paid.
      return {
        recipientRole: NOTIFY_ROLES.ADMIN,
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
