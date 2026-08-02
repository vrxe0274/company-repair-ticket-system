import { useState, useEffect, useMemo, useRef } from 'react'
import { format } from 'date-fns'
import { Banknote, Calendar, Wrench, Shield, ChevronDown, Check, Users, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { laborFee, technicianCommission, staffCommission } from '../../lib/commission'

const PESO = n => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const COLUMNS = [
  'id', 'ticket_id', 'created_at', 'status', 'commission_not_applicable', 'labor_items',
  'technician_usernames', 'assigned_staff', 'tech_commission_pct', 'staff_commission_pct',
].join(', ')

/**
 * Sum a payee's commission across the tickets actually assigned to them.
 * Multiple technicians/staff can be assigned to one repair; each earns the
 * full percentage independently (not split), so a job counts fully for
 * every assigned person. `pending` counts tickets assigned to them where
 * Admin hasn't input the relevant percentage yet — those contribute 0 to
 * `amount`, not silently.
 */
function payeeStats(tickets, role, username) {
  let amount = 0, pending = 0, jobs = 0
  for (const t of tickets) {
    const assigned = role === 'Technician'
      ? (t.technician_usernames ?? []).includes(username)
      : (t.assigned_staff ?? []).includes(username)
    if (!assigned) continue
    jobs++
    const fee = laborFee(t)
    const commission = role === 'Technician'
      ? technicianCommission(fee, t.tech_commission_pct)
      : staffCommission(fee, t.tech_commission_pct, t.staff_commission_pct)
    if (commission == null) pending++
    else amount += commission
  }
  return { amount, pending, jobs }
}

export default function PayrollPage() {
  const [tickets,       setTickets]       = useState([])
  const [staff,         setStaff]         = useState([])
  const [techs,         setTechs]         = useState([])
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
      const [ticketRes, staffRes, techRes] = await Promise.all([
        supabase.from('tickets').select(COLUMNS).order('created_at', { ascending: false }),
        supabase.functions.invoke('staff-manage', { body: { action: 'list-names' } }),
        supabase.functions.invoke('tech-manage',  { body: { action: 'list-names' } }),
      ])
      setTickets(ticketRes.data ?? [])
      setStaff(staffRes.data?.staff ?? [])
      setTechs(techRes.data?.staff ?? [])
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

  const relevantTickets = useMemo(
    () => tickets.filter(t => t.status === 'Paid' && !t.commission_not_applicable && laborFee(t) > 0),
    [tickets],
  )

  const filteredTickets = useMemo(() => {
    if (selectedMonth === 'all') return relevantTickets
    return relevantTickets.filter(t => {
      const d = new Date(t.created_at)
      return !isNaN(d) && format(d, 'yyyy-MM') === selectedMonth
    })
  }, [relevantTickets, selectedMonth])

  const monthLabel = selectedMonth === 'all'
    ? 'All Time'
    : format(new Date(selectedMonth + '-01'), 'MMMM yyyy')

  const techStats = useMemo(() => Object.fromEntries(
    techs.map(t => [t.username, payeeStats(filteredTickets, 'Technician', t.username)])
  ), [filteredTickets, techs])

  const staffStats = useMemo(() => Object.fromEntries(
    staff.map(s => [s.username, payeeStats(filteredTickets, 'Staff', s.username)])
  ), [filteredTickets, staff])

  const payeeCount     = techs.length + staff.length
  const totalPending   = Object.values(techStats).reduce((a, s) => a + s.pending, 0)
                        + Object.values(staffStats).reduce((a, s) => a + s.pending, 0)
  const grandTotal     = Object.values(techStats).reduce((a, s) => a + s.amount, 0)
                        + Object.values(staffStats).reduce((a, s) => a + s.amount, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div className="-mx-5 -mt-5 lg:-mx-7 lg:-mt-7 bg-white border-b border-gray-200 mb-1">
        <div className="h-0.5 bg-gradient-to-r from-brand-500 to-accent-500" />
        <div className="px-5 lg:px-7 py-5 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display text-4xl sm:text-5xl tracking-widest text-gray-900 leading-none">PAYROLL</h1>
            <p className="text-sm font-body text-gray-400 mt-2">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
          </div>
        </div>
      </div>

      {/* ── Summary banner ── */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white overflow-hidden">
        <div className="flex flex-col sm:flex-row">

          {/* Left — grand total */}
          <div className="flex-1 px-5 sm:px-7 py-6 sm:py-8">
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

            <p className="text-[clamp(1.75rem,8vw,3.75rem)] sm:text-6xl font-display font-bold leading-none tracking-tight text-white whitespace-nowrap">
              {PESO(grandTotal)}
            </p>
            <p className="text-brand-300 text-sm font-body mt-3">
              {filteredTickets.length} job{filteredTickets.length !== 1 ? 's' : ''} · {payeeCount} payee{payeeCount !== 1 ? 's' : ''}
              {totalPending > 0 && (
                <span className="text-amber-300"> · {totalPending} commission{totalPending !== 1 ? 's' : ''} not yet inputted</span>
              )}
            </p>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px bg-white/10 my-6" />
          <div className="block sm:hidden h-px bg-white/10 mx-5" />

          {/* Right — per-payee breakdown */}
          <div className="sm:w-64 px-5 sm:px-7 py-6 sm:py-8 flex flex-col justify-center gap-4">
            <p className="text-brand-300 text-xs font-sans font-semibold uppercase tracking-wider">Breakdown</p>
            <div className="space-y-2.5">
              {techs.map(t => (
                <div key={t.username} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Wrench className="w-3.5 h-3.5 text-accent-400 shrink-0" />
                    <span className="text-brand-200 text-sm font-body truncate">{t.name || t.username}</span>
                  </div>
                  <span className="font-mono text-sm text-white shrink-0">{PESO(techStats[t.username]?.amount ?? 0)}</span>
                </div>
              ))}
              {staff.map(s => (
                <div key={s.username} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-brand-200 text-sm font-body truncate">{s.name || s.username}</span>
                  </div>
                  <span className="font-mono text-sm text-white shrink-0">{PESO(staffStats[s.username]?.amount ?? 0)}</span>
                </div>
              ))}
              {payeeCount === 0 && (
                <p className="text-brand-400 text-xs font-body">No staff or technician accounts yet.</p>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ── Payee table ── */}
      {payeeCount === 0 ? (
        <div className="card p-12 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <Banknote className="w-5 h-5 text-gray-300" />
          </div>
          <div>
            <p className="text-sm font-sans font-semibold text-gray-500">No payroll data</p>
            <p className="text-xs font-body text-gray-400 mt-1">
              Create staff/technician accounts, then assign them to a repair's commission after it's paid.
            </p>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <p className="text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Payees</p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2.5 text-left  text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Name</th>
                <th className="px-4 py-2.5 text-left  text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Role</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Jobs</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Amount Owed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">

              {/* Technician rows — one per individual account */}
              {techs.map(t => {
                const stats = techStats[t.username] ?? { amount: 0, pending: 0, jobs: 0 }
                return (
                  <tr key={t.username} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-accent-50 flex items-center justify-center shrink-0">
                          <Wrench className="w-3.5 h-3.5 text-accent-500" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-sans font-semibold text-gray-800 truncate">{t.name || t.username}</p>
                          {t.name && <p className="text-xs font-mono text-gray-400 truncate mt-0.5">{t.username}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-sans font-semibold bg-accent-50 text-accent-600">
                        Technician
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-500">{stats.jobs}</td>
                    <td className="px-4 py-3.5 text-right">
                      {stats.jobs === 0 ? (
                        <span className="font-mono text-sm text-gray-300">{PESO(0)}</span>
                      ) : stats.amount === 0 && stats.pending > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-sans font-semibold text-amber-600">
                          <AlertTriangle className="w-3 h-3" /> Not yet inputted
                        </span>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono text-sm font-bold text-gray-900">{PESO(stats.amount)}</span>
                          {stats.pending > 0 && (
                            <span className="text-[11px] font-sans font-semibold text-amber-600">{stats.pending} pending</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}

              {/* Staff rows */}
              {staff.map(s => {
                const stats = staffStats[s.username] ?? { amount: 0, pending: 0, jobs: 0 }
                return (
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
                    <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-500">{stats.jobs}</td>
                    <td className="px-4 py-3.5 text-right">
                      {stats.jobs === 0 ? (
                        <span className="font-mono text-sm text-gray-300">{PESO(0)}</span>
                      ) : stats.amount === 0 && stats.pending > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-sans font-semibold text-amber-600">
                          <AlertTriangle className="w-3 h-3" /> Not yet inputted
                        </span>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono text-sm font-bold text-gray-900">{PESO(stats.amount)}</span>
                          {stats.pending > 0 && (
                            <span className="text-[11px] font-sans font-semibold text-amber-600">{stats.pending} pending</span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}

            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td colSpan={3} className="px-4 py-3.5 text-xs font-sans font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Total Payroll
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-sm font-bold bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent">
                  {PESO(grandTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
      )}

    </div>
  )
}
