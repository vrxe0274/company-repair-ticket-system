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

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  Ticket, Clock, Wrench, CheckCircle, RefreshCw,
  AlertTriangle, BarChart2, DollarSign, Download,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { STATUS_ORDER, STATUS_DENIED } from '../../lib/utils'
import { exportTicketsToXLSX } from '../../lib/export'

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
  { label: 'Done',        key: 'Done',               color: 'text-green-700',   bg: 'bg-green-50',     border: 'border-green-100',  icon: CheckCircle },
  { label: 'Paid',        key: 'Paid',               color: 'text-emerald-700', bg: 'bg-emerald-50',   border: 'border-emerald-100',icon: DollarSign },
  { label: 'Denied',      key: 'Denied',             color: 'text-red-700',     bg: 'bg-red-50',       border: 'border-red-100',    icon: AlertTriangle },
]

/** Number of recent tickets to show in the activity list. */
const RECENT_TICKET_LIMIT = 5

// ── Page component ─────────────────────────────────────────────────────────────

/**
 * DashboardHome — the index route of the staff dashboard.
 * Shows aggregate stats, a visual status breakdown, and recent activity.
 */
export default function DashboardHome() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchTickets() }, [])

  /** Fetch all tickets ordered newest-first. Used for all stats on this page. */
  async function fetchTickets() {
    setLoading(true)
    const { data } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false })
    setTickets(data || [])
    setLoading(false)
  }

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
        <div className="flex items-center gap-2">
          <button onClick={fetchTickets} className="btn-secondary text-sm">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={() => exportTicketsToXLSX(tickets).catch(console.error)}
            disabled={!tickets.length}
            className="btn-secondary text-sm"
          >
            <Download className="w-3.5 h-3.5" /> Export XLSX
          </button>
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

      {/* Status breakdown bar chart */}
      {!loading && tickets.length > 0 && (
        <div className="card p-5">
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

      {/* Recent activity */}
      {!loading && tickets.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <p className="section-title mb-0">Recent Activity</p>
            <Link to="tickets" className="text-xs font-sans font-semibold text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {tickets.slice(0, RECENT_TICKET_LIMIT).map(t => (
              <Link
                key={t.id}
                to={`tickets/${t.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-xs text-gray-400">{t.ticket_id}</span>
                  </div>
                  <p className="font-sans font-semibold text-base text-gray-900 truncate">{t.client_name}</p>
                  <p className="text-sm font-body text-gray-500">{t.unit_brand} {t.unit_model}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-body text-gray-500">
                    {format(new Date(t.created_at), 'MMM d, yyyy')}
                  </p>
                  <p className={`text-sm font-sans font-semibold mt-0.5
                    ${t.status === 'Paid' ? 'text-emerald-600'
                      : t.status === 'Denied' ? 'text-red-500'
                      : t.status === 'Done' ? 'text-green-600'
                      : 'text-gray-500'}`}
                  >
                    {t.status}
                  </p>
                </div>
              </Link>
            ))}
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