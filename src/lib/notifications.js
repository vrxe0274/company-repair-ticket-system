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
}) {
  try {
    const { error } = await supabase.from('notifications').insert([{
      recipient_role:  recipientRole,
      message,
      type,
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
 * @param {Object}  args
 * @param {string}  args.actorRole    Who made the change ('Admin' | 'Technician')
 * @param {string}  args.newStatus    The status it was moved to
 * @param {string}  args.ticketLabel  Human-readable label from formatTicketLabel(),
 *                                    e.g. 'Maria Santos — Samsung Galaxy S24 (Phone)'
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
        message: `Admin approved ${label}. It's ready for inspection & quote.`,
      }
    case 'Denied':
      return {
        recipientRole: NOTIFY_ROLES.TECHNICIAN,
        message: `Admin denied ${label}.`,
      }
    case 'Repair in Progress':
      return {
        recipientRole: other,
        message: `${actorRole} moved ${label} to Repair in Progress.`,
      }
    case 'Done':
      // Technician finished — admin should review / mark paid.
      return {
        recipientRole: NOTIFY_ROLES.ADMIN,
        message: `Technician marked ${label} as Done — ready for your review.`,
      }
    case 'Paid':
      return {
        recipientRole: NOTIFY_ROLES.TECHNICIAN,
        message: `Admin marked ${label} as Paid. Job complete.`,
      }
    default:
      return {
        recipientRole: other,
        message: `${actorRole} updated ${label} to ${newStatus}.`,
      }
  }
}
