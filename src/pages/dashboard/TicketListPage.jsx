/**
 * @file TicketListPage.jsx
 * @description Filterable, searchable list of all repair tickets.
 *
 * Filtering is done entirely client-side after a single fetch of all tickets.
 * The active status filter is stored in the URL query string (?status=...) so
 * that deep links and the stat-card links from DashboardHome work correctly.
 *
 * // PERF: For large databases (thousands of tickets), consider moving
 * // filtering and search to server-side Supabase queries with pagination
 * // rather than fetching all rows and filtering in-memory.
 */

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Search, Download, RefreshCw, ChevronRight, Filter } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { STATUS_ORDER, STATUS_DENIED } from '../../lib/utils'
import { exportTicketsToXLSX } from '../../lib/export'
import StatusBadge from '../../components/ui/StatusBadge.jsx'

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * All valid status filter values for the filter pill row.
 * 'All' is a virtual value — it clears the status filter entirely.
 */
const ALL_STATUSES = ['All', ...STATUS_ORDER, STATUS_DENIED]

/**
 * Fields searched when the user types in the search box.
 * Kept as a constant so it's clear what is and isn't searched.
 */
const SEARCHABLE_FIELDS = ['ticket_id', 'client_name', 'email', 'unit_brand', 'unit_model', 'contact_number']

// ── Page component ─────────────────────────────────────────────────────────────

/** TicketListPage — master list with status filter pills and full-text search. */
export default function TicketListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')

  // Derive active status filter from URL; defaults to 'All' when absent.
  const activeStatus = searchParams.get('status') || 'All'

  useEffect(() => { fetchTickets() }, [])

  /** Fetch all tickets, newest first. */
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
   * Client-side filter: AND of status match + search term.
   * Search is case-insensitive and checked against SEARCHABLE_FIELDS.
   */
  const filtered = tickets.filter(t => {
    const matchesStatus = activeStatus === 'All' || t.status === activeStatus
    const q = search.toLowerCase()
    const matchesSearch = !q || SEARCHABLE_FIELDS.some(f => t[f]?.toLowerCase().includes(q))
    return matchesStatus && matchesSearch
  })

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-widest text-gray-900">ALL TICKETS</h1>
          <p className="text-sm font-body text-gray-500 mt-0.5">
            {filtered.length} ticket{filtered.length !== 1 ? 's' : ''} shown
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

      {/* Search + filter controls */}
      <div className="card p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by ticket ID, name, email, unit..."
            className="input-field pl-9"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-gray-400 mr-1" />
          {ALL_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setSearchParams(s === 'All' ? {} : { status: s })}
              className={`text-sm px-3 py-1.5 rounded-full font-sans font-semibold transition-colors min-h-[34px]
                ${activeStatus === s
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
            >
              {s}
              {s !== 'All' && (
                <span className={`ml-1.5 ${activeStatus === s ? 'text-white/70' : 'text-gray-400'}`}>
                  {tickets.filter(t => t.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Ticket table / list */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-500 text-base font-body">No tickets found</div>
        ) : (
          <>
            {/* Desktop table (hidden on small screens) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left bg-gray-50">
                    {['Ticket ID', 'Client', 'Unit', 'Status', 'Date', ''].map(h => (
                      <th key={h} className="px-5 py-3 text-xs font-sans font-semibold text-gray-400 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {t.ticket_id}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-sans font-semibold text-gray-900">{t.client_name}</p>
                        <p className="text-sm font-body text-gray-500">{t.email}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-body text-gray-700">{t.unit_brand} {t.unit_model}</p>
                        <p className="text-sm font-body text-gray-500">{t.unit_type}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={t.status} />
                      </td>
                      <td className="px-5 py-3.5 text-sm font-body text-gray-500">
                        {format(new Date(t.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-5 py-3.5">
                        <Link
                          to={`/tickets/${t.id}`}
                          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline font-sans font-semibold"
                        >
                          View <ChevronRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-gray-50">
              {filtered.map(t => (
                <Link
                  key={t.id}
                  to={`/tickets/${t.id}`}
                  className="flex items-center gap-4 px-4 py-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs text-gray-400">{t.ticket_id}</span>
                      <StatusBadge status={t.status} size="sm" />
                    </div>
                    <p className="font-sans font-semibold text-base text-gray-900 truncate">{t.client_name}</p>
                    <p className="text-sm font-body text-gray-500">{t.unit_brand} {t.unit_model}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}