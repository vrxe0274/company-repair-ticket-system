import { useState, useEffect, useMemo, useRef } from 'react'
import { format } from 'date-fns'
import { Banknote, Calendar, Wrench, Shield, ChevronDown, Check, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { laborFee, technicianCommission, staffCommission } from '../../lib/commission'

const PESO = n => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const COLUMNS = ['id', 'ticket_id', 'created_at', 'labor_items'].join(', ')

export default function PayrollPage() {
  const [tickets,       setTickets]       = useState([])
  const [staff,         setStaff]         = useState([])
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
      const [ticketRes, staffRes] = await Promise.all([
        supabase.from('tickets').select(COLUMNS).order('created_at', { ascending: false }),
        supabase.functions.invoke('staff-manage', { body: { action: 'list-names' } }),
      ])
      setTickets(ticketRes.data ?? [])
      setStaff(staffRes.data?.staff ?? [])
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

  const techTotal  = useMemo(() => filteredTickets.reduce((sum, t) => sum + technicianCommission(laborFee(t)), 0), [filteredTickets])
  const perStaff   = useMemo(() => filteredTickets.reduce((sum, t) => sum + staffCommission(laborFee(t)), 0),     [filteredTickets])
  const grandTotal = techTotal + staff.length * perStaff

  const monthLabel = selectedMonth === 'all'
    ? 'All Time'
    : format(new Date(selectedMonth + '-01'), 'MMMM yyyy')

  const payeeCount = 1 + staff.length

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
        <Banknote className="w-5 h-5 text-brand-500" />
        <h1 className="text-xl font-display font-bold text-gray-900">Payroll</h1>
      </div>

      {/* ── Summary banner ── */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white overflow-hidden">
        <div className="flex flex-col sm:flex-row">

          {/* Left — grand total */}
          <div className="flex-1 px-7 py-8">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-1.5">
                <Users className="w-3 h-3 text-brand-300" />
                <p className="text-brand-300 text-xs font-sans font-semibold uppercase tracking-wider">
                  Total Payroll
                </p>
              </div>

              {/* Month filter */}
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
                      const label  = m === 'all' ? 'All Time' : format(new Date(m + '-01'), 'MMMM yyyy')
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

            <p className="text-6xl font-display font-bold leading-none tracking-tight text-white">
              {PESO(grandTotal)}
            </p>
            <p className="text-brand-300 text-sm font-body mt-3">
              {filteredTickets.length} job{filteredTickets.length !== 1 ? 's' : ''} · {payeeCount} payee{payeeCount !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px bg-white/10 my-6" />
          <div className="block sm:hidden h-px bg-white/10 mx-7" />

          {/* Right — per-payee breakdown */}
          <div className="sm:w-64 px-7 py-8 flex flex-col justify-center gap-4">
            <p className="text-brand-300 text-xs font-sans font-semibold uppercase tracking-wider">Breakdown</p>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Wrench className="w-3.5 h-3.5 text-accent-400 shrink-0" />
                  <span className="text-brand-200 text-sm font-body truncate">Technician</span>
                </div>
                <span className="font-mono text-sm text-white shrink-0">{PESO(techTotal)}</span>
              </div>
              {staff.map(s => (
                <div key={s.username} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-brand-200 text-sm font-body truncate">{s.name || s.username}</span>
                  </div>
                  <span className="font-mono text-sm text-white shrink-0">{PESO(perStaff)}</span>
                </div>
              ))}
              {staff.length === 0 && (
                <p className="text-brand-400 text-xs font-body">No staff accounts yet.</p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Payee table ── */}
      {filteredTickets.length === 0 ? (
        <div className="card p-12 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <Banknote className="w-5 h-5 text-gray-300" />
          </div>
          <div>
            <p className="text-sm font-sans font-semibold text-gray-500">No payroll data</p>
            <p className="text-xs font-body text-gray-400 mt-1">
              {selectedMonth === 'all'
                ? 'Payroll appears once labor fees are added to tickets.'
                : 'No commissionable jobs in this month.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <p className="text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Payees</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2.5 text-left  text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Name</th>
                <th className="px-4 py-2.5 text-left  text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Role</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Jobs</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Rate</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Amount Owed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">

              {/* Technician row */}
              <tr className="hover:bg-gray-50/70 transition-colors">
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-accent-50 flex items-center justify-center shrink-0">
                      <Wrench className="w-3.5 h-3.5 text-accent-500" />
                    </div>
                    <span className="text-sm font-sans font-semibold text-gray-800">Technician</span>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-sans font-semibold bg-accent-50 text-accent-600">
                    Technician
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-500">{filteredTickets.length}</td>
                <td className="px-4 py-3.5 text-right text-xs font-sans text-gray-500">
                  20% <span className="text-gray-400">of labor fee</span>
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-sm font-bold text-gray-900">{PESO(techTotal)}</td>
              </tr>

              {/* Staff rows */}
              {staff.map(s => (
                <tr key={s.username} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                        <Shield className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-sans font-semibold text-gray-800 truncate">{s.name || s.username}</p>
                        {s.name && (
                          <p className="text-xs font-mono text-gray-400 truncate mt-0.5">{s.username}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-sans font-semibold bg-emerald-50 text-emerald-700">
                      Staff
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-500">{filteredTickets.length}</td>
                  <td className="px-4 py-3.5 text-right text-xs font-sans text-gray-500">
                    5% <span className="text-gray-400">of net labor fee</span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-sm font-bold text-gray-900">{PESO(perStaff)}</td>
                </tr>
              ))}

            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td colSpan={4} className="px-4 py-3.5 text-xs font-sans font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Total Payroll
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-sm font-bold bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent">
                  {PESO(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

    </div>
  )
}
