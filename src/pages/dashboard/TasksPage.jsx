/**
 * @file TasksPage.jsx
 * @description Dedicated Tasks page — every ticket the current role can act on
 * right now (i.e. has at least one allowed status transition). Same work-queue
 * logic as the "Your Tasks" card on the Overview page, but as a full page
 * reachable from the sidebar.
 *
 * Ordered oldest-first: it's a work queue, the oldest waiting ticket comes first.
 */

import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ClipboardList, CheckCircle, RefreshCw, ChevronRight } from 'lucide-react'
import { useLiveTickets } from '../../hooks/useLiveTickets.jsx'
import { useRole } from '../../hooks/useRole.jsx'
import { TASK_ACTIONS } from '../../lib/utils'
import StatusBadge from '../../components/ui/StatusBadge.jsx'

/** TasksPage — the /tasks route of the staff dashboard. */
export default function TasksPage() {
  const { tickets, loading, refetch: fetchTickets } = useLiveTickets()
  const { role, getAllowedTransitions } = useRole()

  // Tickets the current role can act on right now, oldest first.
  const tasks = tickets
    .filter(t => getAllowedTransitions(t.status).length > 0)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-widest text-gray-900">TASKS</h1>
          <p className="text-sm font-body text-gray-500 mt-0.5">
            {loading
              ? 'Loading…'
              : tasks.length === 0
                ? 'Nothing needs your action right now'
                : `${tasks.length} ticket${tasks.length === 1 ? '' : 's'} waiting for your action`}
          </p>
        </div>
        <button onClick={fetchTickets} className="btn-secondary text-sm">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Task list */}
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
          <Link to="/tickets" className="text-xs font-sans font-semibold text-brand-600 hover:underline">
            View all tickets
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <span className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
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
                to={`/tickets/${t.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <StatusBadge status={t.status} size="sm" />
                  </div>
                  <p className="font-sans font-semibold text-base text-gray-900 truncate">
                    {t.client_name}
                    <span className="hidden sm:inline font-normal text-gray-500"> · {t.unit_brand} {t.unit_model}</span>
                  </p>
                  <p className="text-sm font-body text-brand-700 mt-0.5">
                    {TASK_ACTIONS[role]?.[t.status] || 'Action required'}
                  </p>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <p className="text-sm font-body text-gray-500">
                    {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                  </p>
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
