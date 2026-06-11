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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-widest text-gray-900">NOTIFICATIONS</h1>
          <p className="text-sm font-body text-gray-500 mt-0.5">
            {role} account · {unseenCount > 0 ? `${unseenCount} unread` : 'All caught up'}
          </p>
        </div>
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
          <div className="divide-y divide-gray-50">
            {notifications.map(n => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={`w-full text-left flex items-start gap-3 px-5 py-4 transition-colors
                  ${n.seen ? 'hover:bg-gray-50' : 'bg-brand-50/60 hover:bg-brand-50'}`}
              >
                {/* Status indicator — colored by ticket status so stacked
                    notifications are distinguishable at a glance. Gray when
                    the notification has no status (info / legacy rows).
                    Unseen rows keep the solid dot; seen rows fade it. */}
                <div className="shrink-0 mt-1.5" title={n.status || undefined}>
                  <span
                    className={`block w-2.5 h-2.5 rounded-full
                      ${STATUS_COLORS[n.status]?.dot || 'bg-gray-300'}
                      ${n.seen ? 'opacity-40' : ''}`}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-base font-body leading-snug ${n.seen ? 'text-gray-600' : 'text-gray-900 font-semibold'}`}>
                    {cleanMessage(n.message)}
                  </p>
                  {/* Meta line — the only place the raw ticket ID appears */}
                  <p className="text-sm font-body text-gray-500 mt-0.5">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    {n.ticket_human_id && (
                      <span className="ml-2 font-mono text-gray-400">· {n.ticket_human_id}</span>
                    )}
                    {n.status && (
                      <span className={`ml-2 font-sans font-semibold ${STATUS_COLORS[n.status]?.text || 'text-gray-500'}`}>
                        · {n.status}
                      </span>
                    )}
                  </p>
                </div>

                {/* Navigate indicator — only shown when the notification links to a ticket */}
                {n.ticket_uuid && (
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}