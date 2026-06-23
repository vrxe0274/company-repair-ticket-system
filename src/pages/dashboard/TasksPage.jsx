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
import { format, formatDistanceToNow } from 'date-fns'
import { ClipboardList, CheckCircle, RefreshCw, ChevronRight, Shield, ShieldCheck, Wrench } from 'lucide-react'
import { useLiveTickets } from '../../hooks/useLiveTickets.jsx'
import { useRole } from '../../hooks/useRole.jsx'
import { TASK_ACTIONS, STATUS_COLORS } from '../../lib/utils'

/** TasksPage — the /tasks route of the staff dashboard. */
export default function TasksPage() {
  const { tickets, loading, refetch: fetchTickets } = useLiveTickets()
  const { role, getAllowedTransitions } = useRole()

  // Tickets the current role can act on right now, oldest first.
  const tasks = tickets
    .filter(t => getAllowedTransitions(t).length > 0)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="-mx-5 -mt-5 lg:-mx-7 lg:-mt-7 bg-white border-b border-gray-200 mb-1">
        <div className="h-0.5 bg-gradient-to-r from-brand-500 to-accent-500" />
        <div className="px-5 lg:px-7 py-5">
          <h1 className="font-display text-4xl sm:text-5xl tracking-widest text-gray-900 leading-none">TASKS</h1>
          <p className="text-sm font-body text-gray-400 mt-2">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
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
            <button
              onClick={fetchTickets}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-400 hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-brand-100"
              aria-label="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="w-5 h-5 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-sans font-semibold text-gray-700">All caught up</p>
                <p className="text-sm font-body text-gray-400 mt-0.5">Nothing needs your action right now.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {tasks.map((t, index) => (
                <Link
                  key={t.id}
                  to={`/tickets/${t.id}`}
                  className="group flex items-center gap-4 px-5 py-4 hover:bg-gray-50/80 transition-all border-l-[3px] border-transparent hover:border-brand-400"
                >
                  {/* Position number */}
                  <div className="flex-none w-7 h-7 rounded-lg bg-gray-100 group-hover:bg-brand-100 flex items-center justify-center shrink-0 transition-colors">
                    <span className="text-xs font-mono font-bold text-gray-400 group-hover:text-brand-600 leading-none transition-colors">
                      {index + 1}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-mono text-[10px] font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">{t.ticket_id}</span>
                    </div>
                    <p className="font-sans font-semibold text-sm text-gray-900 truncate">
                      {t.client_name}
                      <span className="hidden sm:inline font-normal text-gray-500"> · {t.unit_brand} {t.unit_model}</span>
                    </p>
                    <p className="text-xs font-body text-brand-600 font-medium mt-0.5">
                      {TASK_ACTIONS[role]?.[t.status] || 'Action required'}
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <p className="text-xs font-body text-gray-400 whitespace-nowrap">
                      {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                    </p>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-400 transition-colors" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Role guidance card — desktop only */}
        {role && TASK_ACTIONS[role] && (
          <div className="hidden lg:block card p-5 w-full">
            <div className="flex items-center gap-2.5 mb-4">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${role === 'Technician' ? 'bg-accent-50' : 'bg-brand-50'}`}>
                {role === 'Admin'
                  ? <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
                  : role === 'Staff'
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
