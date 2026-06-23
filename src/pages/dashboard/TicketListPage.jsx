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

import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Search, Download, RefreshCw, ChevronRight, ChevronDown, Filter, MoreHorizontal } from 'lucide-react'
import { useLiveTickets } from '../../hooks/useLiveTickets.jsx'
import { STATUS_ORDER, STATUS_DENIED, STATUS_COLORS } from '../../lib/utils'
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

/** Matches viewports below Tailwind's `md` breakpoint — the app's mobile layout. */
const MOBILE_QUERY = '(max-width: 767px)'

// ── Page component ─────────────────────────────────────────────────────────────

/** TicketListPage — master list with status filter pills and full-text search. */
export default function TicketListPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  // Live data — realtime keeps the list in sync without a refresh.
  const { tickets, loading, refetch: fetchTickets } = useLiveTickets()
  const [search, setSearch] = useState('')

  // Status filter panel — collapsed by default, toggled by the filter button.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterRef = useRef(null)

  // Actions kebab menu
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  // Placeholder text can't be styled responsively with CSS, so track the
  // mobile breakpoint in JS to swap in a shorter placeholder on small screens.
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches)

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = e => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!filtersOpen) return
    function handleClickOutside(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFiltersOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filtersOpen])

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  // Derive active status filter from URL; defaults to 'All' when absent.
  const activeStatus = searchParams.get('status') || 'All'

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
      <div className="-mx-5 -mt-5 lg:-mx-7 lg:-mt-7 bg-white border-b border-gray-200 mb-1">
        <div className="h-0.5 bg-gradient-to-r from-brand-500 to-accent-500" />
        <div className="px-5 lg:px-7 py-5">
          <h1 className="font-display text-4xl sm:text-5xl tracking-widest text-gray-900 leading-none">ALL TICKETS</h1>
          <p className="text-sm font-body text-gray-400 mt-2">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
      </div>

      {/* Actions kebab menu */}
      <div className="flex justify-end" ref={menuRef}>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-expanded={menuOpen}
            className="inline-flex items-center justify-center w-[44px] h-[44px] rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-gray-800 hover:bg-gray-50 hover:border-gray-300 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-gray-200"
            aria-label="More actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1.5 animate-fade-in">
              <button
                onClick={() => { fetchTickets(); setMenuOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-sans text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                Refresh
              </button>
              <button
                onClick={() => { exportTicketsToXLSX(tickets).catch(console.error); setMenuOpen(false) }}
                disabled={!tickets.length}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-sans text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                Export XLSX
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Search + filter controls */}
      <div className="flex items-center gap-2 sm:max-w-2xl sm:mx-auto">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isMobile ? 'Search' : 'Search by ticket ID, name, email, unit...'}
            className="input-field pl-9"
          />
        </div>

        {/* Filter dropdown */}
        <div className="relative shrink-0" ref={filterRef}>
          <button
            onClick={() => setFiltersOpen(o => !o)}
            aria-expanded={filtersOpen}
            aria-controls="status-filter-panel"
            className="btn-secondary text-sm"
          >
            <Filter className="w-3.5 h-3.5" />
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${filtersOpen ? 'rotate-180' : ''}`} />
          </button>

          {filtersOpen && (
            <div
              id="status-filter-panel"
              className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 animate-fade-in"
            >
              {ALL_STATUSES.map(s => (
                <button
                  key={s}
                  onClick={() => {
                    setSearchParams(s === 'All' ? {} : { status: s })
                    setFiltersOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-sans text-left transition-colors
                    ${activeStatus === s ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0
                    ${s === 'All' ? 'bg-gray-300' : STATUS_COLORS[s]?.dot || 'bg-gray-300'}`}
                  />
                  <span className="flex-1">{s}</span>
                  {s !== 'All' && (
                    <span className="text-xs font-mono text-gray-400">
                      {tickets.filter(t => t.status === s).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
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
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    {['Ticket ID', 'Client', 'Unit', 'Status', 'Date', ''].map(h => (
                      <th key={h} className="px-5 py-3.5 text-left text-[11px] font-sans font-semibold text-gray-400 uppercase tracking-[0.08em] whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(t => (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/tickets/${t.id}`)}
                      className="bg-white hover:bg-brand-50/25 transition-colors cursor-pointer group"
                    >
                      {/* Ticket ID */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-gray-600 bg-gray-100 px-2.5 py-1 rounded-md">
                          {t.ticket_id}
                        </span>
                      </td>

                      {/* Client — letter avatar + name/email */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center shrink-0 text-sm font-bold text-brand-700 select-none">
                            {t.client_name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-sans font-semibold text-sm text-gray-900 truncate">{t.client_name}</p>
                            <p className="text-xs font-body text-gray-400 truncate">{t.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Unit — brand + model, type pill */}
                      <td className="px-5 py-4">
                        <p className="text-sm font-sans font-medium text-gray-800">{t.unit_brand} {t.unit_model}</p>
                        <span className="inline-block text-[11px] font-sans font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full mt-0.5 leading-tight">
                          {t.unit_type}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <StatusBadge status={t.status} />
                      </td>

                      {/* Date */}
                      <td className="px-5 py-4 whitespace-nowrap">
                        <p className="text-sm font-body text-gray-500">{format(new Date(t.created_at), 'MMM d, yyyy')}</p>
                      </td>

                      {/* Row arrow */}
                      <td className="px-4 py-4 w-8">
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-500 transition-colors" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-gray-100">
              {filtered.map(t => (
                <Link
                  key={t.id}
                  to={`/tickets/${t.id}`}
                  className="group flex items-center gap-3 px-4 py-4 hover:bg-brand-50/20 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center shrink-0 text-sm font-bold text-brand-700 select-none">
                    {t.client_name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-mono text-xs text-gray-400">{t.ticket_id}</span>
                      <StatusBadge status={t.status} size="sm" />
                    </div>
                    <p className="font-sans font-semibold text-sm text-gray-900 truncate">{t.client_name}</p>
                    <p className="text-xs font-body text-gray-400 truncate">{t.unit_brand} {t.unit_model}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-500 shrink-0 transition-colors" />
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

    </div>
  )
}