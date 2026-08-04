import { useState, useEffect, useMemo, useRef } from 'react'
import { format } from 'date-fns'
import {
  TrendingUp, Calendar, Wrench, Shield, ChevronDown, Check, AlertTriangle,
  FileSpreadsheet,
} from 'lucide-react'
import { supabase }            from '../../lib/supabase'
import { useRole }             from '../../hooks/useRole.jsx'
import { laborFee, payeeJobs, commissionDate } from '../../lib/commission'
import { exportCommissionMonth } from '../../lib/commissionExport'
import {
  inPeriod, payMonthOf, payoutByCutoff, cutoffName, cutoffRangeLabel,
} from '../../lib/cutoff'
import {
  groupWorkDays, regularPayFromGrouped, regularPayDaysFor, combinePay,
  hourlyRate, minuteRate, personKey, getDailyRates, resolveDailyRate,
} from '../../lib/salary'
import { getShiftHours, DEFAULT_SHIFT } from '../../lib/shift'

const PESO = n => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const PCT  = p => p == null ? '—' : `${(p * 100).toLocaleString('en-PH', { maximumFractionDigits: 2 })}%`

const TICKET_COLUMNS = [
  'id', 'ticket_id', 'created_at', 'paid_at', 'status', 'commission_not_applicable',
  'client_name', 'unit_brand', 'unit_model',
  'labor_items', 'technician_usernames', 'assigned_staff', 'tech_commission_pct', 'staff_commission_pct',
].join(', ')

const PAGE_SIZE = 1000

/** Every ticket, paged past PostgREST's 1000-row cap (mirrors CommissionPage). */
async function fetchAllTickets() {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('tickets')
      .select(TICKET_COLUMNS)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error('Could not load tickets.')
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

/** This employee's own attendance history, paged. */
async function fetchMyAttendance(username) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('attendance_logs')
      .select('username, role, name, logged_in_at, logged_out_at')
      .eq('username', username)
      .order('logged_in_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error('Could not load attendance.')
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

export default function EarningsPage() {
  const { isTechnician, staffUsername, staffName } = useRole()
  const role = isTechnician ? 'Technician' : 'Staff'

  const [tickets,         setTickets]         = useState([])
  const [attendanceLogs,  setAttendanceLogs]  = useState([])
  const [rates,           setRates]           = useState({})
  const [shift,           setShift]           = useState(DEFAULT_SHIFT)
  const [loading,         setLoading]         = useState(true)
  const [loadError,       setLoadError]       = useState(null)
  const [attendanceFailed, setAttendanceFailed] = useState(false)
  const [reloadKey,       setReloadKey]       = useState(0)
  // Payroll is run per pay period, so this opens on the current one — same
  // default as the Commission page, and the same bucketing (commissionDate /
  // cutoff.js), so the figure shown here is the one Admin will actually pay.
  const [selectedMonth, setSelectedMonth] = useState(() => payMonthOf(new Date()))
  const [filterOpen,    setFilterOpen]    = useState(false)
  const [exporting,     setExporting]     = useState(false)
  const [exportMsg,     setExportMsg]     = useState(null)
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
    if (!staffUsername) return
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const [ticketRows, attendanceResult, rateData, shiftData] = await Promise.all([
          fetchAllTickets(),
          fetchMyAttendance(staffUsername).then(rows => ({ ok: true, rows }), () => ({ ok: false, rows: [] })),
          getDailyRates(),
          getShiftHours(),
        ])
        setTickets(ticketRows)
        setAttendanceLogs(attendanceResult.rows)
        setAttendanceFailed(!attendanceResult.ok)
        setRates(rateData ?? {})
        setShift(shiftData ?? DEFAULT_SHIFT)
      } catch (err) {
        setLoadError(err?.message || 'Could not load your earnings.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [staffUsername, reloadKey])

  // ── Pay-period selector ── bucketed by PAY month (see cutoff.js), not
  // calendar month — a job paid or a day worked on the 31st belongs to the
  // next month's 1st cutoff, matching what the Commission page shows Admin.
  const monthOptions = useMemo(() => {
    const seen = new Set([payMonthOf(new Date())])
    const add = d => { const m = payMonthOf(d); if (m) seen.add(m) }
    tickets.forEach(t => add(commissionDate(t)))
    attendanceLogs.forEach(l => add(new Date(l.logged_in_at)))
    return [...seen].sort().reverse()
  }, [tickets, attendanceLogs])

  const monthLabel = selectedMonth === 'all'
    ? 'All Time'
    : format(new Date(selectedMonth + '-01'), 'MMMM yyyy')

  const showCutoff = selectedMonth !== 'all'

  // ── Commission branch ──
  const relevantTickets = useMemo(
    () => tickets.filter(t => t.status === 'Paid' && !t.commission_not_applicable && laborFee(t) > 0),
    [tickets],
  )
  const filteredTickets = useMemo(() => {
    if (selectedMonth === 'all') return relevantTickets
    return relevantTickets.filter(t => inPeriod(commissionDate(t), selectedMonth))
  }, [relevantTickets, selectedMonth])

  const myJobs = useMemo(
    () => payeeJobs(filteredTickets, role, staffUsername),
    [filteredTickets, role, staffUsername],
  )
  const totalCommission = useMemo(
    () => myJobs.reduce((sum, j) => sum + (j.commission ?? 0), 0),
    [myJobs],
  )
  const pendingCount = useMemo(
    () => myJobs.filter(j => j.commission == null).length,
    [myJobs],
  )

  /** Paid jobs nobody's been assigned to yet — visible to everyone, not just "my jobs". */
  const unassignedTickets = useMemo(
    () => filteredTickets.filter(t =>
      (t.technician_usernames ?? []).length === 0 && (t.assigned_staff ?? []).length === 0,
    ),
    [filteredTickets],
  )

  // ── Regular-salary branch ── never reads a ticket; only attendance. The two
  // branches only meet in combinePay(), same as CommissionPage.
  const filteredLogs = useMemo(() => {
    if (selectedMonth === 'all') return attendanceLogs
    return attendanceLogs.filter(l => inPeriod(new Date(l.logged_in_at), selectedMonth))
  }, [attendanceLogs, selectedMonth])

  const account = useMemo(() => ({ username: staffUsername, name: staffName, role }), [staffUsername, staffName, role])
  const dailyRate = useMemo(() => resolveDailyRate(account, rates), [account, rates])
  const key = personKey(account)

  const workDays = useMemo(() => groupWorkDays(filteredLogs), [filteredLogs])
  const regularStats = useMemo(
    () => regularPayFromGrouped(workDays, () => dailyRate, shift),
    [workDays, dailyRate, shift],
  )
  const regular = regularStats[key]

  const dayRows = useMemo(
    () => regularPayDaysFor(workDays.get(key), dailyRate, shift),
    [workDays, key, dailyRate, shift],
  )

  const pay = combinePay(totalCommission, regular?.amount ?? 0)
  const unclosedDays = regular?.unpaidDays ?? 0
  const totalProvisional = pendingCount > 0 || unclosedDays > 0 || attendanceFailed

  /**
   * What's owed on each of the period's two paydays. Partitioned from the very
   * rows the totals above are built from, so the two halves always add back up
   * to Total Pay — same rule as CommissionPage's payee popup.
   */
  const cutoffSplit = useMemo(() => {
    if (!showCutoff) return null
    return payoutByCutoff(selectedMonth, myJobs, r => commissionDate(r.ticket), dayRows, d => d.firstIn)
  }, [showCutoff, myJobs, dayRows, selectedMonth])

  async function handleExport() {
    setExporting(true)
    setExportMsg(null)
    try {
      const monthKey  = selectedMonth === 'all' ? payMonthOf(new Date()) : selectedMonth
      const [y, m]    = monthKey.split('-').map(Number)
      const monthDate = new Date(y, m - 1, 1)
      const payeePayload = isTechnician
        ? { techs: [{ username: staffUsername, name: staffName }], staff: [] }
        : { techs: [], staff: [{ username: staffUsername, name: staffName }] }
      const res = await exportCommissionMonth({
        tickets, logs: attendanceLogs, ...payeePayload, rates, shift,
        monthDate, cutoff: 'all', fileLabel: staffUsername,
      })
      setExportMsg(res.jobs === 0 && res.days === 0
        ? { type: 'empty', text: `${format(monthDate, 'MMMM yyyy')} has no commission or attendance data — an empty sheet was downloaded.` }
        : { type: 'ok', text: `Exported ${res.jobs} job${res.jobs === 1 ? '' : 's'} · ${res.days} day${res.days === 1 ? '' : 's'}.` })
    } catch {
      setExportMsg({ type: 'err', text: 'Export failed. Please try again.' })
    } finally {
      setExporting(false)
    }
  }

  const RoleIcon = isTechnician ? Wrench : Shield

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="card p-12 flex flex-col items-center gap-3 text-center animate-fade-in">
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-red-500" />
        </div>
        <div>
          <p className="text-sm font-sans font-semibold text-gray-700">Could not load earnings</p>
          <p className="text-xs font-body text-gray-400 mt-1 max-w-sm">{loadError}</p>
        </div>
        <button onClick={() => setReloadKey(k => k + 1)} className="btn-primary text-sm">Try again</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in">

      {/* Title row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-brand-500" />
          <h1 className="text-xl font-display font-bold text-gray-900">Earnings</h1>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || attendanceFailed}
          className="btn-primary text-sm"
          title={attendanceFailed ? 'Attendance could not be loaded — retry before exporting.' : undefined}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>{exporting ? 'Exporting…' : 'Export My Pay'}</span>
        </button>
      </div>

      {exportMsg && (
        <p className={`text-xs font-sans font-semibold -mt-3 ${
          exportMsg.type === 'err' ? 'text-red-600' : exportMsg.type === 'empty' ? 'text-amber-600' : 'text-emerald-600'
        }`}>
          {exportMsg.text}
        </p>
      )}

      {attendanceFailed && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs font-body text-amber-800">
            <span className="font-sans font-semibold">Attendance could not be loaded.</span>{' '}
            Regular Pay is unknown below, not ₱0.00.{' '}
            <button onClick={() => setReloadKey(k => k + 1)} className="font-sans font-semibold underline underline-offset-2">
              Retry
            </button>
          </p>
        </div>
      )}

      {/* ── Earnings banner ── */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white overflow-hidden">
        <div className="flex flex-col sm:flex-row">

          {/* Left — total */}
          <div className="flex-1 px-7 py-8">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-1.5">
                <RoleIcon className="w-3 h-3 text-brand-300" />
                <p className="text-brand-300 text-xs font-sans font-semibold uppercase tracking-wider">
                  {role} Pay
                </p>
              </div>

              <div className="relative shrink-0" ref={filterRef}>
                <button onClick={() => setFilterOpen(o => !o)} aria-expanded={filterOpen} className="btn-secondary text-sm">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{monthLabel}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${filterOpen ? 'rotate-180' : ''}`} />
                </button>

                {filterOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-48 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 animate-fade-in">
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

            <p className="text-6xl font-display font-bold leading-none tracking-tight text-white">
              {PESO(pay.totalPay)}
            </p>
            <div className="flex items-center gap-3 mt-3">
              <span className="text-brand-100 text-sm font-mono">{PESO(pay.commissionPay)}</span>
              <span className="text-brand-400 text-xs">commission</span>
              <span className="text-brand-400">+</span>
              <span className="text-brand-100 text-sm font-mono">{PESO(pay.regularPay)}</span>
              <span className="text-brand-400 text-xs">regular</span>
            </div>
            <p className="text-brand-300 text-sm font-body mt-3">
              {myJobs.length} job{myJobs.length !== 1 ? 's' : ''}
              {pendingCount > 0 && (
                <span className="text-amber-300"> · {pendingCount} not yet inputted</span>
              )}
              {unclosedDays > 0 && (
                <span className="text-amber-300"> · {unclosedDays} day{unclosedDays !== 1 ? 's' : ''} not clocked out</span>
              )}
            </p>
            {totalProvisional && (
              <p className="text-amber-300 text-xs font-sans font-semibold mt-1.5">
                Provisional — this total is missing figures that haven't been inputted yet.
              </p>
            )}
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px bg-white/10 my-6" />
          <div className="block sm:hidden h-px bg-white/10 mx-7" />

          {/* Right — daily rate facts */}
          <div className="sm:w-64 px-7 py-8 flex flex-col justify-center gap-3">
            <p className="text-brand-300 text-xs font-sans font-semibold uppercase tracking-wider">Daily Rate</p>
            <div>
              <p className="font-mono text-2xl font-bold text-white">{PESO(dailyRate)}</p>
              <p className="text-brand-300 text-xs font-body mt-1">
                {PESO(hourlyRate(dailyRate, shift))}/hr · {PESO(minuteRate(dailyRate, shift))}/min
              </p>
            </div>
            {dailyRate === 0 && (
              <p className="text-brand-200 text-xs font-body leading-relaxed">
                No daily rate on file — you're paid on commission only.
              </p>
            )}
          </div>

        </div>
      </div>

      {/* ── Payout per cutoff ── */}
      {cutoffSplit && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <p className="text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Payout Per Cutoff</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
            {cutoffSplit.map(c => {
              const style = CUTOFF_STYLE[c.half]
              return (
                <div key={c.key} className={`px-5 py-4 ${style.band}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`text-xs font-sans font-semibold uppercase tracking-wider ${style.text}`}>
                      {cutoffName(c.half)}
                    </p>
                    <p className="text-[11px] font-body text-gray-400">{cutoffRangeLabel(c.key)}</p>
                  </div>
                  <p className="font-mono text-xl font-bold text-gray-900 mt-1">{PESO(c.totalPay)}</p>
                  {(c.pending > 0 || c.unclosed > 0) && (
                    <p className="text-[11px] font-sans font-semibold text-amber-600 mt-1">
                      {[
                        c.pending  > 0 && `${c.pending} commission${c.pending !== 1 ? 's' : ''} pending`,
                        c.unclosed > 0 && `${c.unclosed} day${c.unclosed !== 1 ? 's' : ''} unclosed`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Job breakdown ── */}
      {myJobs.length === 0 ? (
        <div className="card p-12 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-gray-300" />
          </div>
          <div>
            <p className="text-sm font-sans font-semibold text-gray-500">No jobs yet</p>
            <p className="text-xs font-body text-gray-400 mt-1">
              {selectedMonth === 'all'
                ? "Jobs appear here once you're assigned to a paid repair."
                : 'No commissionable jobs in this period.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <p className="text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Job Breakdown</p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2.5 text-left text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Ticket</th>
                <th className="px-4 py-2.5 text-left text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Client / Unit</th>
                <th className="px-4 py-2.5 text-left text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Date Paid</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Labor Fee</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Rate</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Your Cut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {myJobs.map(({ ticket: t, fee, pct, commission }) => (
                <tr key={t.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-xs font-semibold text-gray-500 truncate">
                    {t.ticket_id}
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-xs font-sans font-semibold text-gray-800 truncate">{t.client_name}</p>
                    <p className="text-xs font-body text-gray-400 truncate mt-0.5">{t.unit_brand} {t.unit_model}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs font-body text-gray-500">
                    {commissionDate(t) ? format(commissionDate(t), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-700">{PESO(fee)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-500">{PCT(pct)}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-xs font-bold text-gray-900">
                    {commission == null
                      ? <span className="font-sans font-semibold text-gray-400 italic">Not yet inputted</span>
                      : PESO(commission)
                    }
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td colSpan={5} className="px-4 py-3.5 text-xs font-sans font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Total Commission
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-sm font-bold bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent">
                  {PESO(totalCommission)}
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
      )}

      {/* ── Regular pay breakdown ── */}
      {dayRows.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
            <p className="text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Regular Pay Breakdown</p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2.5 text-left  text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Date</th>
                <th className="px-4 py-2.5 text-left  text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">In / Out</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Late</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Undertime</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Daily Pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {dayRows.map(({ firstIn, lastOut, pay: dayPay }) => (
                <tr key={firstIn.getTime()} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <p className="text-xs font-sans font-semibold text-gray-800">{format(firstIn, 'MMM d, yyyy')}</p>
                    <p className="text-xs font-body text-gray-400 mt-0.5">{format(firstIn, 'EEEE')}</p>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs text-gray-600 whitespace-nowrap">
                    {format(firstIn, 'hh:mm a')} → {lastOut ? format(lastOut, 'hh:mm a') : <span className="font-sans italic text-gray-300">unclosed</span>}
                  </td>
                  <td className="px-4 py-3.5 text-right"><DeductionCell minutes={dayPay?.lateMinutes} amount={dayPay?.lateDeduction} /></td>
                  <td className="px-4 py-3.5 text-right"><DeductionCell minutes={dayPay?.undertimeMinutes} amount={dayPay?.undertimeDeduction} /></td>
                  <td className="px-4 py-3.5 text-right">
                    {dayPay ? (
                      <span className="font-mono text-xs font-bold text-gray-900">{PESO(dayPay.dailyPay)}</span>
                    ) : (
                      <span className="text-xs font-sans font-semibold text-amber-600 whitespace-nowrap">Not clocked out</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td colSpan={4} className="px-4 py-3.5 text-xs font-sans font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Total Regular Pay
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-sm font-bold bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent">
                  {PESO(regular?.amount ?? 0)}
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
      )}

      {/* ── Paid jobs with no commission given yet — visible to everyone, no "mine" filter ── */}
      {unassignedTickets.length > 0 && (
        <div className="card overflow-hidden border-amber-200">
          <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/60 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <p className="text-xs font-sans font-semibold text-amber-700 uppercase tracking-wide">
              Commission Not Yet Assigned
            </p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2.5 text-left text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Ticket</th>
                <th className="px-4 py-2.5 text-left text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Client / Unit</th>
                <th className="px-4 py-2.5 text-left text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Date Paid</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Labor Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {unassignedTickets.map(t => (
                <tr key={t.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-xs font-semibold text-gray-500 truncate">
                    {t.ticket_id}
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-xs font-sans font-semibold text-gray-800 truncate">{t.client_name}</p>
                    <p className="text-xs font-body text-gray-400 truncate mt-0.5">{t.unit_brand} {t.unit_model}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs font-body text-gray-500">
                    {commissionDate(t) ? format(commissionDate(t), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-700">{PESO(laborFee(t))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  )
}

/** Same colour language as CommissionPage's payee popup — 1st = brand, 2nd = accent. */
const CUTOFF_STYLE = {
  1: { band: 'bg-brand-50',  text: 'text-brand-700' },
  2: { band: 'bg-accent-50', text: 'text-accent-600' },
}

/** Minutes lost and what they cost — a dash when nothing was docked. */
function DeductionCell({ minutes, amount }) {
  if (minutes == null) return <span className="text-gray-300">—</span>
  if (minutes === 0)   return <span className="font-mono text-xs text-gray-300">0</span>
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="font-mono text-xs font-semibold text-amber-700">−{PESO(amount)}</span>
      <span className="text-[11px] font-body text-gray-400">{minutes} min</span>
    </div>
  )
}
