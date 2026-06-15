/**
 * @file DashboardHome.jsx
 * @description Dashboard overview — stat cards per status + a status breakdown
 * bar chart + a recent activity list. All data is fetched in a single query
 * then filtered client-side so counts are always consistent with each other.
 *
 * // PERF: The full tickets array is fetched to build client-side counts.
 * // For large datasets, replace with a Supabase RPC or aggregation query
 * // that returns counts only, rather than full rows.
 */

import { Link } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Ticket, Clock, Wrench, CheckCircle,
  AlertTriangle, BarChart2, DollarSign,
  ClipboardList, ChevronRight, Bell,
} from 'lucide-react'
import { useLiveTickets } from '../../hooks/useLiveTickets.jsx'
import { useRole } from '../../hooks/useRole.jsx'
import { useNotifications } from '../../hooks/useNotifications.jsx'
import { STATUS_ORDER, STATUS_DENIED, TASK_ACTIONS, STATUS_COLORS } from '../../lib/utils'
import StatusBadge from '../../components/ui/StatusBadge.jsx'

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Configuration for each stat card. `key` matches a ticket status string
 * (or 'total' for the aggregate count). Used to drive both the card grid and
 * the status breakdown bar below it — a single source of truth for the UI.
 */
const STAT_CONFIGS = [
  { label: 'Total',       key: 'total',             color: 'text-gray-900',    bg: 'bg-white',        border: 'border-gray-200',   icon: Ticket },
  { label: 'Pending',     key: 'Pending',            color: 'text-yellow-700',  bg: 'bg-yellow-50',    border: 'border-yellow-100', icon: Clock },
  { label: 'In Progress', key: 'Repair in Progress', color: 'text-brand-700',   bg: 'bg-brand-50',     border: 'border-brand-100',  icon: Wrench },
  { label: 'Done',        key: 'Done',               color: 'text-blue-700',    bg: 'bg-blue-50',      border: 'border-blue-100',   icon: CheckCircle },
  { label: 'Paid',        key: 'Paid',               color: 'text-emerald-700', bg: 'bg-emerald-50',   border: 'border-emerald-100',icon: DollarSign },
  { label: 'Denied',      key: 'Denied',             color: 'text-red-700',     bg: 'bg-red-50',       border: 'border-red-100',    icon: AlertTriangle },
]

// ── Page component ─────────────────────────────────────────────────────────────

/**
 * DashboardHome — the index route of the staff dashboard.
 * Shows aggregate stats, a visual status breakdown, and recent activity.
 */
export default function DashboardHome() {
  // Live data — realtime inserts/updates/deletes keep counts current
  // without a refresh (see useLiveTickets).
  const { tickets, loading } = useLiveTickets()
  const { role, getAllowedTransitions } = useRole()
  const { notifications, loading: notifLoading } = useNotifications()

  // Tasks: tickets the current role can act on right now (has an allowed
  // status transition). Oldest first — it's a work queue.
  const tasks = tickets
    .filter(t => getAllowedTransitions(t.status).length > 0)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  /**
   * Count tickets matching a status key.
   * The special key 'total' returns the full array length.
   *
   * @param {string} key - Status string or 'total'.
   * @returns {number}
   */
  function countByStatus(key) {
    if (key === 'total') return tickets.length
    return tickets.filter(t => t.status === key).length
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-widest text-gray-900">OVERVIEW</h1>
          <p className="text-sm font-body text-gray-500 mt-0.5">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>
      </div>

      {/* Stat cards — each links to the ticket list filtered by status */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STAT_CONFIGS.map(({ label, key, color, bg, border, icon: Icon }) => (
          <Link
            key={key}
            to={key === 'total' ? 'tickets' : `tickets?status=${encodeURIComponent(key)}`}
            className={`rounded-xl border p-4 hover:shadow-md transition-all duration-150 ${bg} ${border}`}
          >
            <Icon className={`w-5 h-5 mb-2 ${color}`} />
            <p className={`text-2xl font-display tracking-wider ${color}`}>
              {loading ? '–' : countByStatus(key)}
            </p>
            <p className={`text-xs font-sans font-semibold tracking-wide mt-0.5 ${color} opacity-80`}>
              {label}
            </p>
          </Link>
        ))}
      </div>

      {/* Tasks + Recent Activities — side by side */}
      {!loading && tickets.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Tasks — tickets the current role has a pending action on */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <p className="section-title mb-0 flex items-center gap-2">
                <ClipboardList className="w-3.5 h-3.5" /> Your Tasks
                {tasks.length > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-brand-600 text-white text-xs font-mono font-bold leading-none">
                    {tasks.length}
                  </span>
                )}
              </p>
              <Link to="tasks" className="text-xs font-sans font-semibold text-brand-600 hover:underline">
                View all tasks
              </Link>
            </div>

            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <CheckCircle className="w-8 h-8 text-green-300" />
                <p className="text-base font-body text-gray-500">
                  All caught up — nothing needs your action right now.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {tasks.map(t => (
                  <Link
                    key={t.id}
                    to={`tickets/${t.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <StatusBadge status={t.status} size="sm" />
                        <span className="font-mono text-xs text-gray-400">{t.ticket_id}</span>
                      </div>
                      <p className="font-sans font-semibold text-base text-gray-900 truncate">
                        {t.client_name} <span className="font-normal text-gray-500">· {t.unit_brand} {t.unit_model}</span>
                      </p>
                      <p className="text-sm font-body text-brand-700 mt-0.5">
                        {TASK_ACTIONS[role]?.[t.status] || 'Action required'}
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <p className="text-sm font-body text-gray-500">
                        {format(new Date(t.created_at), 'MMM d, yyyy')}
                      </p>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activities — latest notifications for this role */}
          <div className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <p className="section-title mb-0 flex items-center gap-2">
                <Bell className="w-3.5 h-3.5" /> Recent Activities
              </p>
              <Link to="notifications" className="text-xs font-sans font-semibold text-brand-600 hover:underline">
                View all
              </Link>
            </div>

            {notifLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <Bell className="w-8 h-8 text-gray-200" />
                <p className="text-base font-body text-gray-500">No recent activity</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {notifications.slice(0, 6).map(n => (
                  <Link
                    key={n.id}
                    to={n.ticket_uuid ? `tickets/${n.ticket_uuid}` : 'notifications'}
                    className={`flex items-start gap-3 px-5 py-3.5 transition-colors
                      ${n.seen ? 'hover:bg-gray-50' : 'bg-brand-50/60 hover:bg-brand-50'}`}
                  >
                    <div className="shrink-0 mt-2">
                      <span
                        className={`block w-2 h-2 rounded-full
                          ${STATUS_COLORS[n.status]?.dot || 'bg-gray-300'}
                          ${n.seen ? 'opacity-40' : ''}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-body leading-snug truncate ${n.seen ? 'text-gray-600' : 'text-gray-900 font-semibold'}`}>
                        {n.message?.replace(/VRXE-\d{8}-[A-Z0-9]{4}/g, '').trim()}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs font-body text-gray-400">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                        </p>
                        {n.ticket_human_id && (
                          <span className="text-xs font-mono text-gray-400">{n.ticket_human_id}</span>
                        )}
                      </div>
                    </div>
                    {n.ticket_uuid && (
                      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Status breakdown bar chart */}
      {!loading && tickets.length > 0 && (
        <div className="card p-5 max-w-2xl mx-auto">
          <p className="section-title flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5" /> Status Breakdown
          </p>
          <div className="space-y-2.5">
            {[...STATUS_ORDER, STATUS_DENIED].map(status => {
              const count = countByStatus(status)
              const pct   = Math.round((count / tickets.length) * 100)
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="text-sm font-body text-gray-600 w-36 shrink-0">{status}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        background: status === STATUS_DENIED
                          ? '#ef4444'
                          : 'linear-gradient(to right, #7317e8, #d4007f)',
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-400 w-8 text-right shrink-0">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && tickets.length === 0 && (
        <div className="card p-10 text-center">
          <Ticket className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-base font-body text-gray-500">No tickets yet</p>
          <Link to="/submit" className="btn-primary mt-4 inline-flex">
            Submit First Ticket
          </Link>
        </div>
      )}
    </div>
  )
}