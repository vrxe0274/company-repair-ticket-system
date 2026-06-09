import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { Bell, CheckCheck, Inbox, ChevronRight } from 'lucide-react'
import { useRole } from '../../hooks/useRole.jsx'
import { useNotifications } from '../../hooks/useNotifications.jsx'

function renderMessage(message) {
  const parts = message.split(/(VRXE-\d{8}-[A-Z0-9]{4})/)
  return parts.map((part, i) =>
    /^VRXE-\d{8}-[A-Z0-9]{4}$/.test(part) ? (
      <span
        key={i}
        className="inline-flex items-center px-1.5 py-0.5 rounded font-mono text-[11px] font-bold
                     bg-amber-100 text-amber-800 border border-amber-200 mx-0.5 leading-none align-middle"
      >
        {part}
      </span>
    ) : part
  )
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { role } = useRole()
  const { notifications, unseenCount, loading, markAllSeen, markSeen } = useNotifications()

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
          <p className="text-sm font-body text-gray-400 mt-0.5">
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

      {/* List */}
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
            <p className="text-sm font-body text-gray-400">No notifications yet</p>
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
                {/* Unseen dot / icon */}
                <div className="shrink-0 mt-0.5">
                  {!n.seen ? (
                    <span className="block w-2.5 h-2.5 rounded-full bg-accent-500" />
                  ) : (
                    <Bell className="w-3.5 h-3.5 text-gray-300" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-body leading-snug ${n.seen ? 'text-gray-600' : 'text-gray-900 font-semibold'}`}>
                    {renderMessage(n.message)}
                  </p>
                  <p className="text-[13px] font-body text-gray-400 mt-0.5">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    {n.ticket_human_id && (
                      <span className="ml-2 font-mono text-gray-400">· {n.ticket_human_id}</span>
                    )}
                  </p>
                </div>

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
