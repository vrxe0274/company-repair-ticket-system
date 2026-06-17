/**
 * @file NotificationsPage.jsx
 * @description In-app notification inbox for the logged-in role.
 *
 * Notifications are fed via the useNotifications hook which maintains a
 * realtime Supabase subscription + 60s polling fallback. Clicking a
 * notification marks it seen and navigates to the related ticket.
 *
 * renderMessage() highlights embedded Ticket IDs (VRXE-YYYYMMDD-XXXX)
 * as styled chips so staff can instantly recognise which ticket a message
 * is about without reading the full text.
 */

import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { CheckCheck, Inbox, ChevronRight } from 'lucide-react'
import { useRole }          from '../../hooks/useRole.jsx'
import { useNotifications } from '../../hooks/useNotifications.jsx'
import { STATUS_COLORS }    from '../../lib/utils'

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Strip raw Ticket IDs (VRXE-YYYYMMDD-XXXX) from the message body entirely —
 * the ID is shown only in the meta line next to the timestamp. New messages
 * no longer contain IDs; this cleans up legacy rows in the database.
 *
 * @param {string} message - Raw notification message string.
 * @returns {string}
 */
function cleanMessage(message) {
  return message
    .replace(/VRXE-\d{8}-[A-Z0-9]{4}/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,])/g, '$1')
    .trim()
}

// ── Page component ─────────────────────────────────────────────────────────────

/** NotificationsPage — role-scoped notification inbox. */
export default function NotificationsPage() {
  const navigate = useNavigate()
  const { role } = useRole()
  const { notifications, unseenCount, loading, markAllSeen, markSeen } = useNotifications()

  /**
   * Mark a notification as seen (optimistically, then persisted via the hook)
   * and navigate to the related ticket if one exists.
   *
   * @param {Object} n - Notification row from Supabase.
   */
  function openNotification(n) {
    if (!n.seen) markSeen(n.id)
    if (n.ticket_uuid) navigate(`/tickets/${n.ticket_uuid}`)
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="-mx-5 -mt-5 lg:-mx-7 lg:-mt-7 bg-white border-b border-gray-200 mb-1">
        <div className="h-1 bg-gradient-to-r from-brand-500 to-accent-500" />
        <div className="px-5 lg:px-7 py-5">
          <p className="text-[11px] font-sans font-semibold tracking-[0.14em] text-brand-600 uppercase mb-2 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-brand-500 inline-block" />Inbox</p>
          <h1 className="font-display text-4xl sm:text-5xl tracking-wide text-gray-900 leading-none">NOTIFICATIONS</h1>
          <p className="text-sm font-body text-gray-400 mt-2">
            {role} · {unseenCount > 0 ? `${unseenCount} unread` : 'All caught up'}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={markAllSeen}
          disabled={unseenCount === 0}
          className="btn-secondary text-sm disabled:opacity-40 disabled:pointer-events-none"
        >
          <CheckCheck className="w-3.5 h-3.5" /> Mark all read
        </button>
      </div>

      {/* Notification list */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <Inbox className="w-5 h-5 text-gray-400" />
            </div>
            <p className="text-base font-body text-gray-500">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map(n => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={`w-full text-left flex items-start gap-4 px-5 py-4 transition-all
                  border-l-[3px] group
                  ${n.seen
                    ? 'hover:bg-gray-50 border-transparent'
                    : 'bg-brand-50/30 hover:bg-brand-50/60 border-brand-400'
                  }`}
              >
                {/* Read/unread indicator dot */}
                <div className="shrink-0 pt-1.5">
                  <span className={`block w-2 h-2 rounded-full transition-colors
                    ${n.seen ? 'bg-gray-200' : 'bg-brand-500'}`}
                  />
                </div>

                <div className="flex-1 min-w-0 text-left">
                  <p className={`text-sm leading-snug
                    ${n.seen ? 'text-gray-600 font-normal' : 'text-gray-900 font-semibold'}`}>
                    {cleanMessage(n.message)}
                  </p>

                  {/* Meta row: time · status · ticket ID chip */}
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs font-body text-gray-400">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                    {n.status && (
                      <span className={`text-xs font-sans font-semibold ${STATUS_COLORS[n.status]?.text || 'text-gray-500'}`}>
                        · {n.status}
                      </span>
                    )}
                    {n.ticket_human_id && (
                      <span className="font-mono text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md leading-tight">
                        {n.ticket_human_id}
                      </span>
                    )}
                  </div>
                </div>

                {n.ticket_uuid && (
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-400 shrink-0 mt-0.5 transition-colors" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}