import { useState, useEffect, useMemo, useRef } from 'react'
import { format } from 'date-fns'
import { TrendingUp, Calendar, Wrench, Shield, ChevronDown, Check } from 'lucide-react'
import { supabase }            from '../../lib/supabase'
import { useRole }             from '../../hooks/useRole.jsx'
import { laborFee, technicianCommission, staffCommission } from '../../lib/commission'

const PESO = n => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const COLUMNS = [
  'id', 'ticket_id', 'created_at',
  'client_name', 'unit_brand', 'unit_model',
  'labor_items',
].join(', ')

export default function EarningsPage() {
  const { isTechnician } = useRole()

  const [tickets,       setTickets]       = useState([])
  const [loading,       setLoading]       = useState(true)
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [filterOpen,    setFilterOpen]    = useState(false)
  const filterRef = useRef(null)

  useEffect(() => {
    if (!filterOpen) return
    function handleClickOutside(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filterOpen])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase.from('tickets').select(COLUMNS).order('created_at', { ascending: false })
      setTickets(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const monthOptions = useMemo(() => {
    const seen = new Set()
    tickets.forEach(t => {
      const d = new Date(t.created_at)
      if (!isNaN(d)) seen.add(format(d, 'yyyy-MM'))
    })
    return [...seen].sort().reverse()
  }, [tickets])

  const relevantTickets = useMemo(() => tickets.filter(t => laborFee(t) > 0), [tickets])

  const filteredTickets = useMemo(() => {
    if (selectedMonth === 'all') return relevantTickets
    return relevantTickets.filter(t => {
      const d = new Date(t.created_at)
      return !isNaN(d) && format(d, 'yyyy-MM') === selectedMonth
    })
  }, [relevantTickets, selectedMonth])

  function myCommission(ticket) {
    const fee = laborFee(ticket)
    return isTechnician ? technicianCommission(fee) : staffCommission(fee)
  }

  const totalCommission = filteredTickets.reduce((sum, t) => sum + myCommission(t), 0)

  const monthLabel = selectedMonth === 'all'
    ? 'All Time'
    : format(new Date(selectedMonth + '-01'), 'MMMM yyyy')

  const RoleIcon = isTechnician ? Wrench : Shield

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Title row */}
      <div className="flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-brand-500" />
        <h1 className="text-xl font-display font-bold text-gray-900">Earnings</h1>
      </div>

      {/* ── Earnings banner ── */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white overflow-hidden">
        <div className="flex flex-col sm:flex-row">

          {/* Left — total */}
          <div className="flex-1 px-7 py-8">
            {/* Month filter — top-right inside banner */}
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-1.5">
                <RoleIcon className="w-3 h-3 text-brand-300" />
                <p className="text-brand-300 text-xs font-sans font-semibold uppercase tracking-wider">
                  {isTechnician ? 'Technician' : 'Staff'} Commission
                </p>
              </div>

              {/* Filter button — same pattern as All Tickets */}
              <div className="relative shrink-0" ref={filterRef}>
                <button
                  onClick={() => setFilterOpen(o => !o)}
                  aria-expanded={filterOpen}
                  className="btn-secondary text-sm"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{monthLabel}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${filterOpen ? 'rotate-180' : ''}`} />
                </button>

                {filterOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 animate-fade-in">
                    {['all', ...monthOptions].map(m => {
                      const label = m === 'all' ? 'All Time' : format(new Date(m + '-01'), 'MMMM yyyy')
                      const active = selectedMonth === m
                      return (
                        <button
                          key={m}
                          onClick={() => { setSelectedMonth(m); setFilterOpen(false) }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-sans text-left transition-colors
                            ${active ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                        >
                          <Calendar className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                          <span className="flex-1">{label}</span>
                          {active && <Check className="w-3.5 h-3.5 text-brand-500 shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <p className="text-6xl font-display font-bold leading-none tracking-tight bg-gradient-to-r from-brand-400 to-accent-400 bg-clip-text text-transparent">
              {PESO(totalCommission)}
            </p>
            <p className="text-brand-300 text-sm font-body mt-3">
              {filteredTickets.length} job{filteredTickets.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px bg-white/10 my-6" />
          <div className="block sm:hidden h-px bg-white/10 mx-7" />

          {/* Right — commission rate info */}
          <div className="sm:w-64 px-7 py-8 flex flex-col justify-center gap-3">
            <p className="text-brand-300 text-xs font-sans font-semibold uppercase tracking-wider">How it's calculated</p>
            <div>
              <p className="text-3xl font-display font-bold leading-none">
                {isTechnician ? '20%' : '5%'}
              </p>
              <p className="text-brand-200 text-xs font-body mt-2 leading-relaxed">
                {isTechnician
                  ? 'of the labor fee on each completed job'
                  : 'of the net labor fee (after technician cut) on each job'}
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* ── Job breakdown ── */}
      {filteredTickets.length === 0 ? (
        <div className="card p-12 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-gray-300" />
          </div>
          <div>
            <p className="text-sm font-sans font-semibold text-gray-500">No jobs yet</p>
            <p className="text-xs font-body text-gray-400 mt-1">
              {selectedMonth === 'all'
                ? 'Jobs appear here once a labor fee is added to a ticket.'
                : 'No commissionable jobs in this month.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <p className="text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Job Breakdown</p>
          </div>
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col style={{ width: '16%' }} />
              <col style={{ width: '35%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '17%' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2.5 text-left text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Ticket</th>
                <th className="px-4 py-2.5 text-left text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Client / Unit</th>
                <th className="px-4 py-2.5 text-left text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Date</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Labor Fee</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Your Cut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTickets.map(t => {
                const fee        = laborFee(t)
                const commission = myCommission(t)
                return (
                  <tr key={t.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-4 py-3.5 font-mono text-xs font-semibold text-gray-500 truncate">
                      {t.ticket_id}
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-xs font-sans font-semibold text-gray-800 truncate">{t.client_name}</p>
                      <p className="text-xs font-body text-gray-400 truncate mt-0.5">{t.unit_brand} {t.unit_model}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-body text-gray-500">
                      {format(new Date(t.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-700">{PESO(fee)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-gray-900">
                      {PESO(commission)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td colSpan={4} className="px-4 py-3.5 text-xs font-sans font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Total Commission
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-sm font-bold bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent">
                  {PESO(totalCommission)}
                </td>
              </tr>
            </tfoot>
          </table>

        </div>
      )}
    </div>
  )
}
