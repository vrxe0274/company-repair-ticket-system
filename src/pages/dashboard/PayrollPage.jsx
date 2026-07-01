import { useState, useEffect, useMemo, useRef } from 'react'
import { format } from 'date-fns'
import { Banknote, Calendar, Wrench, Shield, ChevronDown, Check, Users, Pencil, X } from 'lucide-react'
import { supabase, fnErrorMessage } from '../../lib/supabase'
import {
  laborFee, technicianCommission, staffCommission,
  getApplicableRate, getCommissionRates, saveCommissionRate,
} from '../../lib/commission'

const PESO   = n => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct = d => { const v = d * 100; return Number.isInteger(v) ? `${v}%` : `${v.toFixed(1)}%` }

const COLUMNS = ['id', 'ticket_id', 'created_at', 'labor_items'].join(', ')

async function callStaffManage(body) {
  const { data, error } = await supabase.functions.invoke('staff-manage', { body })
  if (error) throw new Error(await fnErrorMessage(error))
  if (!data?.ok) throw new Error(data?.error || 'Operation failed.')
  return data
}

async function callTechManage(body) {
  const { data, error } = await supabase.functions.invoke('tech-manage', { body })
  if (error) throw new Error(await fnErrorMessage(error))
  if (!data?.ok) throw new Error(data?.error || 'Operation failed.')
  return data
}

export default function PayrollPage() {
  const [tickets,       setTickets]       = useState([])
  const [staff,         setStaff]         = useState([])
  const [techs,         setTechs]         = useState([])
  const [rateHistory,   setRateHistory]   = useState([])
  const [loading,       setLoading]       = useState(true)
  const [selectedMonth, setSelectedMonth] = useState('all')
  const [filterOpen,    setFilterOpen]    = useState(false)
  const filterRef = useRef(null)

  const [editOpen,        setEditOpen]        = useState(false)
  const [editTech,        setEditTech]        = useState('')
  const [editStaff,       setEditStaff]       = useState('')
  const [techOverrides,   setTechOverrides]   = useState({}) // { username: '25' | '' }
  const [staffOverrides,  setStaffOverrides]  = useState({}) // { username: '6' | '' }
  const [editSaving,      setEditSaving]      = useState(false)
  const [editError,       setEditError]       = useState('')

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
      const [ticketRes, staffRes, techRes, rates] = await Promise.all([
        supabase.from('tickets').select(COLUMNS).order('created_at', { ascending: false }),
        supabase.functions.invoke('staff-manage', { body: { action: 'list-names' } }),
        supabase.functions.invoke('tech-manage',  { body: { action: 'list-names' } }),
        getCommissionRates(),
      ])
      setTickets(ticketRes.data ?? [])
      setStaff(staffRes.data?.staff ?? [])
      setTechs(techRes.data?.staff ?? [])
      setRateHistory(rates)
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

  const currentRate = useMemo(
    () => getApplicableRate(new Date().toISOString(), rateHistory),
    [rateHistory],
  )

  const techTotal = useMemo(() =>
    filteredTickets.reduce((sum, t) => {
      const fee  = laborFee(t)
      const rate = getApplicableRate(t.created_at, rateHistory)
      return sum + technicianCommission(fee, rate.technician_pct)
    }, 0), [filteredTickets, rateHistory])

  const perStaff = useMemo(() =>
    filteredTickets.reduce((sum, t) => {
      const fee  = laborFee(t)
      const rate = getApplicableRate(t.created_at, rateHistory)
      return sum + staffCommission(fee, rate.technician_pct, rate.staff_pct)
    }, 0), [filteredTickets, rateHistory])

  const monthLabel = selectedMonth === 'all'
    ? 'All Time'
    : format(new Date(selectedMonth + '-01'), 'MMMM yyyy')

  const techAmounts = useMemo(() => Object.fromEntries(
    techs.map(t => [t.username, filteredTickets.reduce((sum, ticket) => {
      const fee  = laborFee(ticket)
      const rate = getApplicableRate(ticket.created_at, rateHistory)
      return sum + technicianCommission(fee, t.commission_pct ?? rate.technician_pct)
    }, 0)])
  ), [filteredTickets, rateHistory, techs])

  const staffAmounts = useMemo(() => Object.fromEntries(
    staff.map(s => [s.username, filteredTickets.reduce((sum, ticket) => {
      const fee  = laborFee(ticket)
      const rate = getApplicableRate(ticket.created_at, rateHistory)
      return sum + staffCommission(fee, rate.technician_pct, s.commission_pct ?? rate.staff_pct)
    }, 0)])
  ), [filteredTickets, rateHistory, staff])

  const techCount  = techs.length || 1
  const payeeCount = techCount + staff.length
  const grandTotal = (techs.length === 0 ? techTotal : Object.values(techAmounts).reduce((a, b) => a + b, 0))
                   + Object.values(staffAmounts).reduce((a, b) => a + b, 0)

  function openEditModal() {
    setEditTech((currentRate.technician_pct * 100).toString())
    setEditStaff((currentRate.staff_pct * 100).toString())
    const techOvr = {}
    techs.forEach(t => { techOvr[t.username] = t.commission_pct != null ? (t.commission_pct * 100).toString() : '' })
    setTechOverrides(techOvr)
    const staffOvr = {}
    staff.forEach(s => { staffOvr[s.username] = s.commission_pct != null ? (s.commission_pct * 100).toString() : '' })
    setStaffOverrides(staffOvr)
    setEditError('')
    setEditOpen(true)
  }

  async function handleSaveRates(e) {
    e.preventDefault()
    const tech = parseFloat(editTech)
    const stf  = parseFloat(editStaff)
    if (isNaN(tech) || tech < 0 || tech > 100) { setEditError('Technician default must be between 0 and 100.'); return }
    if (isNaN(stf)  || stf  < 0 || stf  > 100) { setEditError('Staff default must be between 0 and 100.');      return }
    for (const [u, v] of Object.entries(techOverrides)) {
      if (v.trim() !== '') { const p = parseFloat(v); if (isNaN(p) || p < 0 || p > 100) { setEditError(`Invalid rate for technician "${u}".`); return } }
    }
    for (const [u, v] of Object.entries(staffOverrides)) {
      if (v.trim() !== '') { const p = parseFloat(v); if (isNaN(p) || p < 0 || p > 100) { setEditError(`Invalid rate for staff "${u}".`); return } }
    }
    setEditSaving(true); setEditError('')
    try {
      await saveCommissionRate(tech / 100, stf / 100)
      const updated = await getCommissionRates()
      setRateHistory(updated)

      await Promise.all([
        ...techs.map(t => {
          const v      = techOverrides[t.username]?.trim() ?? ''
          const newPct = v === '' ? null : parseFloat(v) / 100
          if (newPct === t.commission_pct) return Promise.resolve()
          return callTechManage({ action: 'set-commission', username: t.username, commission_pct: newPct })
        }),
        ...staff.map(s => {
          const v      = staffOverrides[s.username]?.trim() ?? ''
          const newPct = v === '' ? null : parseFloat(v) / 100
          if (newPct === s.commission_pct) return Promise.resolve()
          return callStaffManage({ action: 'set-commission', username: s.username, commission_pct: newPct })
        }),
      ])

      setTechs(prev => prev.map(t => {
        const v = techOverrides[t.username]?.trim() ?? ''
        return { ...t, commission_pct: v === '' ? null : parseFloat(v) / 100 }
      }))
      setStaff(prev => prev.map(s => {
        const v = staffOverrides[s.username]?.trim() ?? ''
        return { ...s, commission_pct: v === '' ? null : parseFloat(v) / 100 }
      }))

      setEditOpen(false)
    } catch {
      setEditError('Failed to save rates. Please try again.')
    } finally {
      setEditSaving(false)
    }
  }

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
          <button onClick={openEditModal} className="btn-secondary mb-0.5">
            <Pencil className="w-3.5 h-3.5" />
            Edit Rates
          </button>
        </div>
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
              {techs.length === 0 ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Wrench className="w-3.5 h-3.5 text-accent-400 shrink-0" />
                    <span className="text-brand-200 text-sm font-body truncate">Technician</span>
                  </div>
                  <span className="font-mono text-sm text-white shrink-0">{PESO(techTotal)}</span>
                </div>
              ) : techs.map(t => (
                <div key={t.username} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Wrench className="w-3.5 h-3.5 text-accent-400 shrink-0" />
                    <span className="text-brand-200 text-sm font-body truncate">{t.name || t.username}</span>
                  </div>
                  <span className="font-mono text-sm text-white shrink-0">{PESO(techAmounts[t.username] ?? 0)}</span>
                </div>
              ))}
              {staff.map(s => (
                <div key={s.username} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-brand-200 text-sm font-body truncate">{s.name || s.username}</span>
                  </div>
                  <span className="font-mono text-sm text-white shrink-0">{PESO(staffAmounts[s.username] ?? 0)}</span>
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
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Current Rate</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Amount Owed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">

              {/* Technician rows — one per individual account, or a single fallback row */}
              {techs.length === 0 ? (
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
                    {fmtPct(currentRate.technician_pct)} <span className="text-gray-400">of labor fee</span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-sm font-bold text-gray-900">{PESO(techTotal)}</td>
                </tr>
              ) : techs.map(t => (
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
                  <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-500">{filteredTickets.length}</td>
                  <td className="px-4 py-3.5 text-right text-xs font-sans text-gray-500">
                    {fmtPct(t.commission_pct ?? currentRate.technician_pct)}{t.commission_pct == null && <span className="text-gray-400 ml-0.5">(default)</span>} <span className="text-gray-400">of labor fee</span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-sm font-bold text-gray-900">{PESO(techAmounts[t.username] ?? 0)}</td>
                </tr>
              ))}

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
                    {fmtPct(s.commission_pct ?? currentRate.staff_pct)}{s.commission_pct == null && <span className="text-gray-400 ml-0.5">(default)</span>} <span className="text-gray-400">of net labor fee</span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-sm font-bold text-gray-900">{PESO(staffAmounts[s.username] ?? 0)}</td>
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

      {/* ── Edit Rates modal ── */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="card w-full max-w-md animate-slide-up flex flex-col max-h-[85vh]">

            {/* Header */}
            <div className="flex items-start justify-between gap-3 p-6 pb-4 shrink-0">
              <div>
                <h2 className="font-sans font-bold text-gray-900 text-base">Edit Commission Rates</h2>
                <p className="text-xs font-body text-gray-500 mt-0.5">
                  Applies to new tickets only. Past repairs are unaffected.
                </p>
              </div>
              <button onClick={() => setEditOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRates} className="flex flex-col flex-1 min-h-0">
              <div className="overflow-y-auto flex-1 px-6 space-y-5">

                {/* Role defaults */}
                <div className="space-y-3">
                  <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-widest">Role Defaults</p>
                  <div className="space-y-1.5">
                    <label className="text-xs font-sans font-semibold text-gray-600">
                      Technician — % of labor fee
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" max="100" step="0.1" value={editTech}
                        onChange={e => { setEditTech(e.target.value); setEditError('') }}
                        className="input-field flex-1" autoFocus />
                      <span className="text-sm text-gray-500 font-sans shrink-0">%</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-sans font-semibold text-gray-600">
                      Staff — % of net labor fee
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" max="100" step="0.1" value={editStaff}
                        onChange={e => { setEditStaff(e.target.value); setEditError('') }}
                        className="input-field flex-1" />
                      <span className="text-sm text-gray-500 font-sans shrink-0">%</span>
                    </div>
                  </div>
                </div>

                {/* Per-account overrides — only shown when there are accounts */}
                {(techs.length > 0 || staff.length > 0) && (
                  <div className="space-y-3">
                    <div>
                      <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-widest">Individual Overrides</p>
                      <p className="text-xs font-body text-gray-400 mt-0.5">Leave blank to use the role default above.</p>
                    </div>

                    {techs.length > 0 && (
                      <div className="rounded-xl border border-gray-100 overflow-hidden">
                        <div className="px-3 py-2 bg-accent-50/60 border-b border-gray-100 flex items-center gap-1.5">
                          <Wrench className="w-3 h-3 text-accent-500 shrink-0" />
                          <span className="text-xs font-sans font-semibold text-accent-700">Technicians</span>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {techs.map(t => (
                            <div key={t.username} className="flex items-center gap-3 px-3 py-2.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-sans font-semibold text-gray-800 truncate">{t.name || t.username}</p>
                                {t.name && <p className="text-xs font-mono text-gray-400 truncate">{t.username}</p>}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <input
                                  type="number" min="0" max="100" step="0.1"
                                  value={techOverrides[t.username] ?? ''}
                                  onChange={e => { setTechOverrides(p => ({ ...p, [t.username]: e.target.value })); setEditError('') }}
                                  className="input-field w-20 text-right py-1.5 text-sm"
                                  placeholder="Default"
                                />
                                <span className="text-xs text-gray-400 shrink-0">%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {staff.length > 0 && (
                      <div className="rounded-xl border border-gray-100 overflow-hidden">
                        <div className="px-3 py-2 bg-emerald-50/60 border-b border-gray-100 flex items-center gap-1.5">
                          <Shield className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span className="text-xs font-sans font-semibold text-emerald-700">Staff</span>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {staff.map(s => (
                            <div key={s.username} className="flex items-center gap-3 px-3 py-2.5">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-sans font-semibold text-gray-800 truncate">{s.name || s.username}</p>
                                {s.name && <p className="text-xs font-mono text-gray-400 truncate">{s.username}</p>}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <input
                                  type="number" min="0" max="100" step="0.1"
                                  value={staffOverrides[s.username] ?? ''}
                                  onChange={e => { setStaffOverrides(p => ({ ...p, [s.username]: e.target.value })); setEditError('') }}
                                  className="input-field w-20 text-right py-1.5 text-sm"
                                  placeholder="Default"
                                />
                                <span className="text-xs text-gray-400 shrink-0">%</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {editError && <p className="text-xs text-red-500 font-sans">{editError}</p>}

              </div>

              {/* Footer */}
              <div className="flex gap-3 p-6 pt-4 border-t border-gray-100 shrink-0">
                <button type="button" onClick={() => setEditOpen(false)} className="btn-secondary flex-1 justify-center">
                  Cancel
                </button>
                <button type="submit" disabled={editSaving} className="btn-primary flex-1 justify-center disabled:opacity-50 disabled:pointer-events-none">
                  {editSaving
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : 'Save Rates'
                  }
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

    </div>
  )
}
