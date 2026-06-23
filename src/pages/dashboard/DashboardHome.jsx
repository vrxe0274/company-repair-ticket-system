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
  ClipboardList, ChevronRight, Bell, Search,
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
const STATUS_BAR_COLORS = {
  'Pending':            '#facc15',
  'Inspection & Quote': '#c084fc',
  'Repair in Progress': '#818cf8',
  'Done':               '#60a5fa',
  'Paid':               '#10b981',
  'Denied':             '#ef4444',
}

const STAT_CONFIGS = [
  { label: 'Pending',     key: 'Pending',            color: 'text-yellow-700',  bg: 'bg-yellow-50',    border: 'border-yellow-200',  accent: 'border-t-yellow-400',  icon: Clock },
  { label: 'Inspection',  key: 'Inspection & Quote', color: 'text-purple-700',  bg: 'bg-purple-50',    border: 'border-purple-200',  accent: 'border-t-purple-500',  icon: Search },
  { label: 'In Progress', key: 'Repair in Progress', color: 'text-brand-700',   bg: 'bg-brand-50',     border: 'border-brand-200',   accent: 'border-t-brand-500',   icon: Wrench },
  { label: 'Done',        key: 'Done',               color: 'text-blue-700',    bg: 'bg-blue-50',      border: 'border-blue-200',    accent: 'border-t-blue-500',    icon: CheckCircle },
  { label: 'Paid',        key: 'Paid',               color: 'text-emerald-700', bg: 'bg-emerald-50',   border: 'border-emerald-200', accent: 'border-t-emerald-500', icon: DollarSign },
  { label: 'Denied',      key: 'Denied',             color: 'text-red-700',     bg: 'bg-red-50',       border: 'border-red-200',     accent: 'border-t-red-500',     icon: AlertTriangle },
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
  const { role, getAllowedTransitions, staffUsername, staffName } = useRole()
  const { notifications, loading: notifLoading } = useNotifications()

  // Tasks: tickets the current role can act on right now (has an allowed
  // status transition). Oldest first — it's a work queue.
  const tasks = tickets
    .filter(t => getAllowedTransitions(t).length > 0)
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
      <div className="-mx-5 -mt-5 lg:-mx-7 lg:-mt-7 bg-white border-b border-gray-200 mb-1">
        <div className="h-1 bg-gradient-to-r from-brand-500 to-accent-500" />
        <div className="px-5 lg:px-7 py-5 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-4xl sm:text-5xl tracking-wide text-gray-900 leading-none">OVERVIEW</h1>
            <p className="text-sm font-body text-gray-400 mt-2">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <div className="text-right pb-0.5">
            <p className="text-[11px] font-sans font-semibold tracking-[0.14em] text-gray-400 uppercase mb-1">Welcome back</p>
            <p className="font-sans font-bold text-xl text-gray-900 leading-tight">{staffName ?? staffUsername ?? role}</p>
          </div>
        </div>
      </div>

      {/* Total — distinct full-width banner */}
      <Link
        to="tickets"
        className="flex items-center justify-between gap-4 px-5 sm:px-7 py-4 sm:py-5 rounded-xl bg-white border-t-2 border border-brand-200 border-t-brand-500 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group max-w-sm mx-auto w-full"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
            <Ticket className="w-5 h-5 sm:w-6 sm:h-6 text-brand-600" />
          </div>
          <div>
            <p className="text-[11px] font-sans font-semibold tracking-[0.14em] text-brand-600 uppercase">All Tickets</p>
            <p className="font-display text-3xl sm:text-4xl tracking-wider text-gray-900 leading-none mt-0.5">
              {loading ? '–' : tickets.length}
            </p>
          </div>
        </div>
        <p className="text-xs font-sans font-semibold text-gray-400 group-hover:text-brand-500 transition-colors hidden sm:block">
          View all →
        </p>
      </Link>

      {/* Status cards */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {STAT_CONFIGS.map(({ label, key, color, bg, border, accent, icon: Icon }) => (
          <Link
            key={key}
            to={`tickets?status=${encodeURIComponent(key)}`}
            className={`rounded-xl border border-t-2 p-3 sm:p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 ${bg} ${border} ${accent}`}
          >
            <Icon className={`w-5 h-5 sm:w-6 sm:h-6 mb-2 sm:mb-3 ${color}`} />
            <p className={`text-2xl sm:text-3xl font-display tracking-wider leading-none ${color}`}>
              {loading ? '–' : countByStatus(key)}
            </p>
            <p className={`text-[10px] sm:text-xs font-sans font-semibold tracking-wide mt-1.5 ${color} opacity-80`}>
              {label}
            </p>
          </Link>
        ))}
      </div>

      {/* Status breakdown — stacked proportional bar */}
      {!loading && tickets.length > 0 && (
        <div className="card p-5 sm:p-6">
          <p className="section-title flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5" /> Status Breakdown
          </p>
          <div className="flex h-3 rounded-full overflow-hidden">
            {[...STATUS_ORDER, STATUS_DENIED].map(status => {
              const count = countByStatus(status)
              if (count === 0) return null
              const pct = (count / tickets.length) * 100
              return (
                <div
                  key={status}
                  className="h-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: STATUS_BAR_COLORS[status] }}
                />
              )
            })}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">
            {[...STATUS_ORDER, STATUS_DENIED].map(status => {
              const count = countByStatus(status)
              if (count === 0) return null
              return (
                <div key={status} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: STATUS_BAR_COLORS[status] }} />
                  <span className="text-xs font-body text-gray-600">{status}</span>
                  <span className="text-xs font-mono text-gray-400">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tasks + Recent Activities — side by side, desktop only */}
      {!loading && tickets.length > 0 && (
        <div className="hidden lg:grid grid-cols-2 gap-6">

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
                View all
              </Link>
            </div>

            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                <CheckCircle className="w-8 h-8 text-green-300" />
                <p className="text-base font-body text-gray-500">
                  All caught up — nothing needs your action right now.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {tasks.map(t => (
                  <Link
                    key={t.id}
                    to={`tickets/${t.id}`}
                    className="group flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/80 transition-all border-l-[3px] border-transparent hover:border-brand-400"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <StatusBadge status={t.status} size="sm" />
                        <span className="font-mono text-xs text-gray-400">{t.ticket_id}</span>
                      </div>
                      <p className="font-sans font-semibold text-sm text-gray-900 truncate">
                        {t.client_name}
                      </p>
                      <p className="text-xs font-body text-brand-600 font-medium mt-0.5">
                        {TASK_ACTIONS[role]?.[t.status] || 'Action required'}
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <p className="text-xs font-body text-gray-400">
                        {format(new Date(t.created_at), 'MMM d, yyyy')}
                      </p>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-400 transition-colors" />
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
              <div className="flex items-center justify-center py-12">
                <div className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                <Bell className="w-8 h-8 text-gray-200" />
                <p className="text-base font-body text-gray-500">No recent activity</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.slice(0, 5).map(n => (
                  <Link
                    key={n.id}
                    to={n.ticket_uuid ? `tickets/${n.ticket_uuid}` : 'notifications'}
                    className={`group flex items-start gap-3 px-5 py-3.5 transition-all border-l-[3px]
                      ${n.seen
                        ? 'hover:bg-gray-50/80 border-transparent'
                        : 'bg-brand-50/30 hover:bg-brand-50/60 border-brand-400'
                      }`}
                  >
                    <div className="shrink-0 mt-2">
                      <span className={`block w-2 h-2 rounded-full ${n.seen ? 'bg-gray-200' : 'bg-brand-500'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-body leading-snug truncate ${n.seen ? 'text-gray-600' : 'text-gray-900 font-semibold'}`}>
                        {n.message?.replace(/(?:VRXE-\d{8}-[A-Z0-9]{4}|VR-\d{4}-\d{3})/g, '').trim()}
                      </p>
                      <p className="text-xs font-body text-gray-400 mt-0.5">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    {n.ticket_uuid && (
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-400 shrink-0 mt-1 transition-colors" />
                    )}
                  </Link>
                ))}
              </div>
            )}
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