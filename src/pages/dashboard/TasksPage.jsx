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
import { ClipboardList, CheckCircle, RefreshCw, ChevronRight, Shield, Wrench } from 'lucide-react'
import { useLiveTickets } from '../../hooks/useLiveTickets.jsx'
import { useRole } from '../../hooks/useRole.jsx'
import { TASK_ACTIONS, STATUS_COLORS } from '../../lib/utils'
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
      <div className="-mx-5 -mt-5 lg:-mx-7 lg:-mt-7 bg-white border-b border-gray-200 mb-1">
        <div className="h-1 bg-gradient-to-r from-brand-500 to-accent-500" />
        <div className="px-5 lg:px-7 py-5">
          <p className="text-[11px] font-sans font-semibold tracking-[0.14em] text-brand-600 uppercase mb-2 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-brand-500 inline-block" />Action Required</p>
          <h1 className="font-display text-4xl sm:text-5xl tracking-wide text-gray-900 leading-none">TASKS</h1>
          <p className="text-sm font-body text-gray-400 mt-2">
            {loading
              ? 'Loading…'
              : tasks.length === 0
                ? 'Nothing needs your action right now'
                : `${tasks.length} ticket${tasks.length === 1 ? '' : 's'} waiting for your action`}
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2">
        <button onClick={fetchTickets} className="p-1.5 text-gray-400 hover:text-gray-700 transition-colors" aria-label="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Two-column layout on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">

        {/* Task list */}
        <div className="card overflow-hidden w-full">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <p className="section-title mb-0 flex items-center gap-2">
              <ClipboardList className="w-3.5 h-3.5" /> Your Tasks
              {tasks.length > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-brand-600 text-white text-xs font-mono font-bold leading-none">
                  {tasks.length}
                </span>
              )}
            </p>
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

        {/* Role guidance card */}
        {role && TASK_ACTIONS[role] && (
          <div className="card p-5 w-full">
            <div className="flex items-center gap-2.5 mb-4">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${role === 'Admin' ? 'bg-brand-50' : 'bg-accent-50'}`}>
                {role === 'Admin'
                  ? <Shield className="w-3.5 h-3.5 text-brand-600" />
                  : <Wrench className="w-3.5 h-3.5 text-accent-600" />
                }
              </div>
              <div>
                <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-wider leading-none mb-0.5">Role</p>
                <p className="text-sm font-sans font-bold text-gray-800">{role}</p>
              </div>
            </div>

            <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-wider mb-3">Your Responsibilities</p>
            <div className="space-y-3">
              {Object.entries(TASK_ACTIONS[role]).map(([status, action]) => (
                <div key={status} className="flex items-start gap-2.5">
                  <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${STATUS_COLORS[status]?.dot || 'bg-gray-300'}`} />
                  <div>
                    <p className="text-xs font-sans font-semibold text-gray-700">{status}</p>
                    <p className="text-xs font-body text-gray-500 leading-snug mt-0.5">{action}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
