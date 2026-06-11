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

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Bell, CheckCheck, Inbox, ChevronRight, Send, Radio } from 'lucide-react'
import { useRole }          from '../../hooks/useRole.jsx'
import { useNotifications } from '../../hooks/useNotifications.jsx'
import { sendGlobalPush }   from '../../lib/push'

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Parse a notification message and wrap any embedded Ticket IDs in a styled
 * badge chip. Ticket IDs match the pattern VRXE-YYYYMMDD-XXXX.
 *
 * Using split + map rather than dangerouslySetInnerHTML keeps this XSS-safe.
 *
 * @param {string} message - Raw notification message string.
 * @returns {ReactNode[]}
 */
function renderMessage(message) {
  const TICKET_ID_REGEX = /(VRXE-\d{8}-[A-Z0-9]{4})/
  return message.split(TICKET_ID_REGEX).map((part, i) =>
    TICKET_ID_REGEX.test(part) ? (
      <span
        key={i}
        className="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-xs font-bold
                   bg-amber-100 text-amber-800 border border-amber-200 mx-0.5 leading-none align-middle"
      >
        {part}
      </span>
    ) : part
  )
}

// ── Admin: global push broadcast panel ─────────────────────────────────────────

/**
 * GlobalPushPanel — Admin-only form to manually broadcast a push notification
 * to EVERY subscribed device, regardless of role. Distinct from the role-scoped
 * in-app notifications listed below it (which are unchanged).
 */
function GlobalPushPanel() {
  const [title,   setTitle]   = useState('')
  const [body,    setBody]    = useState('')
  const [url,     setUrl]     = useState('')
  const [sending, setSending] = useState(false)
  const [result,  setResult]  = useState(null) // { ok, sent?, failed? }

  async function handleSend(e) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return
    setSending(true)
    setResult(null)
    const res = await sendGlobalPush({
      title: title.trim(),
      body:  body.trim(),
      url:   url.trim() || null,
    })
    setResult(res)
    if (res.ok) { setTitle(''); setBody(''); setUrl('') }
    setSending(false)
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-1">
        <Radio className="w-4 h-4 text-brand-600" />
        <h2 className="font-sans font-bold text-base text-gray-900">Send Global Push</h2>
      </div>
      <p className="text-sm font-body text-gray-500 mb-4">
        Broadcast a device notification to all subscribed staff (Admin and Technician).
      </p>

      <form onSubmit={handleSend} className="space-y-3">
        <div>
          <label className="label">Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="input-field"
            placeholder="e.g. Shop closing early today"
            maxLength={120}
            required
          />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            className="input-field min-h-[72px]"
            placeholder="The notification body shown on the lock screen"
            maxLength={500}
            required
          />
        </div>
        <div>
          <label className="label">Link (optional)</label>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            className="input-field"
            placeholder="/tickets or https://…  — opened when the notification is tapped"
            maxLength={500}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="submit"
            disabled={sending || !title.trim() || !body.trim()}
            className="btn-primary text-sm disabled:opacity-50 disabled:pointer-events-none"
          >
            {sending
              ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Send className="w-3.5 h-3.5" />
            }
            Send to all devices
          </button>

          {result && (
            <p className={`text-sm font-body ${result.ok ? 'text-green-600' : 'text-red-500'}`}>
              {result.ok
                ? `Sent to ${result.sent ?? 0} device${(result.sent ?? 0) === 1 ? '' : 's'}${result.failed ? ` (${result.failed} failed)` : ''}.`
                : 'Send failed — check that the send-push function is deployed.'}
            </p>
          )}
        </div>
      </form>
    </div>
  )
}

// ── Page component ─────────────────────────────────────────────────────────────

/** NotificationsPage — role-scoped notification inbox. */
export default function NotificationsPage() {
  const navigate = useNavigate()
  const { role, isAdmin } = useRole()
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

      {/* Admin-only: manual global push broadcast */}
      {isAdmin && <GlobalPushPanel />}

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
                {/* Seen/unseen indicator */}
                <div className="shrink-0 mt-0.5">
                  {n.seen
                    ? <Bell className="w-3.5 h-3.5 text-gray-300" />
                    : <span className="block w-2.5 h-2.5 rounded-full bg-accent-500" />
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-base font-body leading-snug ${n.seen ? 'text-gray-600' : 'text-gray-900 font-semibold'}`}>
                    {renderMessage(n.message)}
                  </p>
                  <p className="text-sm font-body text-gray-500 mt-0.5">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    {n.ticket_human_id && (
                      <span className="ml-2 font-mono text-gray-400">· {n.ticket_human_id}</span>
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