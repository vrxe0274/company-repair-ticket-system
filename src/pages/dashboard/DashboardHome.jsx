import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { Ticket, Clock, Wrench, CheckCircle, RefreshCw, AlertTriangle, BarChart2, DollarSign, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { STATUS_ORDER, STATUS_DENIED } from '../../lib/utils'
import { exportTicketsToXLSX } from '../../lib/export'

const STAT_STATUSES = [
  { label: 'Total',       key: 'total',              color: 'text-gray-900',    bg: 'bg-white',         border: 'border-gray-200', icon: Ticket },
  { label: 'Pending',     key: 'Pending',             color: 'text-yellow-700',  bg: 'bg-yellow-50',     border: 'border-yellow-100', icon: Clock },
  { label: 'In Progress', key: 'Repair in Progress',  color: 'text-brand-700',   bg: 'bg-brand-50',      border: 'border-brand-100', icon: Wrench },
  { label: 'Done',        key: 'Done',                color: 'text-green-700',   bg: 'bg-green-50',      border: 'border-green-100', icon: CheckCircle },
  { label: 'Paid',        key: 'Paid',                color: 'text-emerald-700', bg: 'bg-emerald-50',    border: 'border-emerald-100', icon: DollarSign },
  { label: 'Denied',      key: 'Denied',              color: 'text-red-700',     bg: 'bg-red-50',        border: 'border-red-100', icon: AlertTriangle },
]

export default function DashboardHome() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchTickets() }, [])

  async function fetchTickets() {
    setLoading(true)
    const { data } = await supabase
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false })
    setTickets(data || [])
    setLoading(false)
  }

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
          <p className="text-sm font-body text-gray-400 mt-0.5">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STAT_STATUSES.map(({ label, key, color, bg, border, icon: Icon }) => (
          <Link
            key={key}
            to={key === 'total' ? 'tickets' : `tickets?status=${encodeURIComponent(key)}`}
            className={`rounded-xl border p-4 hover:shadow-md transition-all duration-150 ${bg} ${border}`}
          >
            <Icon className={`w-5 h-5 mb-2 ${color}`} />
            <p className={`text-2xl font-display tracking-wider ${color}`}>
              {loading ? '–' : countByStatus(key)}
            </p>
            <p className={`text-xs font-sans font-semibold tracking-wide mt-0.5 ${color} opacity-80`}>{label}</p>
          </Link>
        ))}
      </div>

      {/* Status breakdown */}
      {!loading && tickets.length > 0 && (
        <div className="card p-5">
          <p className="section-title flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5" /> Status Breakdown
          </p>
          <div className="space-y-2.5">
            {[...STATUS_ORDER, STATUS_DENIED].map(status => {
              const count = countByStatus(status)
              const pct = tickets.length ? Math.round((count / tickets.length) * 100) : 0
              return (
                <div key={status} className="flex items-center gap-3">
                  <span className="text-xs font-body text-gray-500 w-36 shrink-0">{status}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-2 rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        background: status === STATUS_DENIED
                          ? '#ef4444'
                          : `linear-gradient(to right, #7317e8, #d4007f)`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono text-gray-500 w-6 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
