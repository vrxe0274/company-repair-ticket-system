import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { format, startOfMonth, subMonths } from 'date-fns'
import {
  Banknote, Calendar, Wrench, Shield, ChevronDown, Check, Users, AlertTriangle,
  X, ListTree, ChevronRight, Coins, Clock, FileSpreadsheet,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  laborFee, technicianCommission, staffCommission, payeeJobs, commissionDate,
} from '../../lib/commission'
import { exportCommissionMonth } from '../../lib/commissionExport'
import {
  groupWorkDays, regularPayFromGrouped, regularPayDaysFor, combinePay,
  hourlyRate, minuteRate, personKey, rateKey,
  getDailyRates, saveDailyRates, resolveDailyRate, fetchAllAttendance,
} from '../../lib/salary'
import { getShiftHours, shiftHoursCap, fmtShiftHour, DEFAULT_SHIFT } from '../../lib/shift'

const PESO = n => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const PCT  = p => p == null ? '—' : `${(p * 100).toLocaleString('en-PH', { maximumFractionDigits: 2 })}%`

const COLUMNS = [
  'id', 'ticket_id', 'created_at', 'paid_at', 'status', 'commission_not_applicable', 'labor_items',
  'client_name', 'unit_brand', 'unit_model',
  'technician_usernames', 'assigned_staff', 'tech_commission_pct', 'staff_commission_pct',
].join(', ')

const PAGE_SIZE = 1000

/**
 * Every ticket, paged. PostgREST caps an unranged read at 1000 rows and drops
 * the rest server-side with no error, so past that many repairs the oldest paid
 * jobs would silently stop counting toward anybody's commission.
 */
async function fetchAllTickets() {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('tickets')
      .select(COLUMNS)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error('Could not load tickets.')
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

/**
 * How far back attendance is read on first load. The page reports one month at
 * a time, so pulling the company's whole history on every visit is transfer and
 * re-grouping work that is then filtered away. Anything older is fetched on
 * demand — see `loadFullHistory`.
 */
const ATTENDANCE_WINDOW_MONTHS = 12
const attendanceWindowStart = () =>
  startOfMonth(subMonths(new Date(), ATTENDANCE_WINDOW_MONTHS - 1))

/**
 * Sum a payee's commission across the tickets actually assigned to them.
 * Multiple technicians/staff can be assigned to one repair; each earns the
 * full percentage independently (not split), so a job counts fully for
 * every assigned person. `pending` counts tickets assigned to them where
 * Admin hasn't input the relevant percentage yet — those contribute 0 to
 * `amount`, not silently.
 */
function payeeStats(tickets, role, username) {
  const rows = payeeJobs(tickets, role, username)
  let amount = 0, pending = 0
  for (const r of rows) {
    if (r.commission == null) pending++
    else amount += r.commission
  }
  return { amount, pending, jobs: rows.length }
}

/**
 * Everyone credited on one ticket, with each person's own rate and cut.
 * Drives the all-jobs popup, where the question is "who got what on this
 * repair" rather than "what does this person total".
 */
function ticketPayees(ticket, techs, staff) {
  const fee = laborFee(ticket)
  const nameOf = (list, username) => list.find(a => a.username === username)?.name || username
  return [
    ...(ticket.technician_usernames ?? []).map(u => ({
      key: `tech:${u}`, username: u, name: nameOf(techs, u), role: 'Technician',
      pct: ticket.tech_commission_pct,
      commission: technicianCommission(fee, ticket.tech_commission_pct),
    })),
    ...(ticket.assigned_staff ?? []).map(u => ({
      key: `staff:${u}`, username: u, name: nameOf(staff, u), role: 'Staff',
      pct: ticket.staff_commission_pct,
      commission: staffCommission(fee, ticket.tech_commission_pct, ticket.staff_commission_pct),
    })),
  ]
}

export default function CommissionPage() {
  const [tickets,       setTickets]       = useState([])
  const [staff,         setStaff]         = useState([])
  const [techs,         setTechs]         = useState([])
  const [attendance,    setAttendance]    = useState([])
  const [rates,         setRates]         = useState({})
  const [shift,         setShift]         = useState(DEFAULT_SHIFT)
  const [loading,       setLoading]       = useState(true)
  // Payroll is run per month, so the page opens on the current one rather than
  // All Time — the all-time figure is a lookback, not the working view.
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'))
  const [filterOpen,    setFilterOpen]    = useState(false)
  const [payeeModal,    setPayeeModal]    = useState(null)   // { username, name, role } | null
  const [allJobsOpen,   setAllJobsOpen]   = useState(false)
  const [ratesOpen,     setRatesOpen]     = useState(false)
  const [exportOpen,    setExportOpen]    = useState(false)
  const [accountsIncomplete, setAccountsIncomplete] = useState(false)
  // Attendance is the sole input to Regular Pay. A failed read must never
  // render as ₱0.00 — that is a real figure the Admin would pay out.
  const [attendanceFailed, setAttendanceFailed] = useState(false)
  const [loadError,   setLoadError]   = useState(null)
  const [reloadKey,   setReloadKey]   = useState(0)
  const [loadingHistory, setLoadingHistory] = useState(false)
  // Whether attendance has been pulled from before the initial window. A ref,
  // not state: a retry must keep reading the full history the Admin already
  // asked for, without the reload effect re-firing on the flag itself.
  const historyFull = useRef(false)
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
      setLoadError(null)
      try {
        // Attendance is the one read allowed to fail on its own: the commission
        // branch is still fully reportable without it. Every other read either
        // succeeds or fails the page — a rates read that silently answered {}
        // would hand back the first-run seed as if it were configuration.
        const [tickets, staffRes, techRes, attendanceResult, rateData, shiftData] =
          await Promise.all([
            fetchAllTickets(),
            supabase.functions.invoke('staff-manage', { body: { action: 'list-names' } }),
            supabase.functions.invoke('tech-manage',  { body: { action: 'list-names' } }),
            fetchAllAttendance(historyFull.current ? {} : { since: attendanceWindowStart() })
              .then(rows => ({ ok: true, rows }), () => ({ ok: false, rows: [] })),
            getDailyRates(),
            getShiftHours(),
          ])
        setTickets(tickets)
        // An account list that failed to load must not look like "nobody works
        // here" — the Daily Rates editor writes the map it was shown, so an
        // empty list would wipe those people's rates on the next save.
        setStaff(staffRes.data?.staff ?? [])
        setTechs(techRes.data?.staff ?? [])
        setAccountsIncomplete(!staffRes.data?.staff || !techRes.data?.staff)
        setAttendance(attendanceResult.rows)
        setAttendanceFailed(!attendanceResult.ok)
        setRates(rateData ?? {})
        setShift(shiftData ?? DEFAULT_SHIFT)
      } catch (err) {
        setLoadError(err?.message || 'Could not load payroll data.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [reloadKey])

  /**
   * Pull attendance from before the initial window. Called when the Admin asks
   * for a figure that could depend on it — All Time, or an export — so the
   * bounded first load never becomes a silently short answer.
   */
  const loadFullHistory = useCallback(async () => {
    if (historyFull.current || loadingHistory) return
    setLoadingHistory(true)
    try {
      const rows = await fetchAllAttendance()
      historyFull.current = true
      setAttendance(rows)
      setAttendanceFailed(false)
    } catch {
      setAttendanceFailed(true)
    } finally {
      setLoadingHistory(false)
    }
  }, [loadingHistory])

  // Months come from both pay branches — a month with attendance but no paid
  // tickets still has salary to report, and vice versa. The current month is
  // always listed even when it has neither yet, since it's the default
  // selection and would otherwise be missing from its own filter.
  const monthOptions = useMemo(() => {
    const seen = new Set([format(new Date(), 'yyyy-MM')])
    const add = d => { if (d && !isNaN(d)) seen.add(format(d, 'yyyy-MM')) }
    tickets.forEach(t => add(commissionDate(t)))
    attendance.forEach(l => add(new Date(l.logged_in_at)))
    return [...seen].sort().reverse()
  }, [tickets, attendance])

  const relevantTickets = useMemo(
    () => tickets.filter(t => t.status === 'Paid' && !t.commission_not_applicable && laborFee(t) > 0),
    [tickets],
  )

  // Bucketed by when the repair was PAID, not when it was booked — a job
  // created in June and paid in July is owed in the July run. See commission.js.
  const filteredTickets = useMemo(() => {
    if (selectedMonth === 'all') return relevantTickets
    return relevantTickets.filter(t => {
      const d = commissionDate(t)
      return d != null && format(d, 'yyyy-MM') === selectedMonth
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

  // ── Regular-salary branch ──
  // Computed entirely from attendance and the daily rates; it never reads a
  // ticket. The two branches only meet in `payFor` below (combinePay).
  const filteredLogs = useMemo(() => {
    if (selectedMonth === 'all') return attendance
    return attendance.filter(l => {
      const d = new Date(l.logged_in_at)
      return !isNaN(d) && format(d, 'yyyy-MM') === selectedMonth
    })
  }, [attendance, selectedMonth])

  /**
   * Accounts indexed the same way attendance is. The daily rate is resolved
   * from the ACCOUNT wherever one exists, never from the attendance row's own
   * name/role snapshot — the popup and the table row behind it would otherwise
   * be able to resolve two different rates for one employee after a rename.
   */
  const accountByKey = useMemo(() => new Map(
    [...techs.map(t => ({ ...t, role: 'Technician' })), ...staff.map(s => ({ ...s, role: 'Staff' }))]
      .map(a => [personKey(a), a]),
  ), [techs, staff])

  const rateFor = useMemo(
    () => person => resolveDailyRate(accountByKey.get(personKey(person)) ?? person, rates),
    [accountByKey, rates],
  )

  // Grouped ONCE and shared with the payee popup — going through the raw logs
  // per employee would re-walk the whole period's attendance for each of them.
  const workDays = useMemo(() => groupWorkDays(filteredLogs), [filteredLogs])

  const regularStats = useMemo(
    () => regularPayFromGrouped(workDays, rateFor, shift),
    [workDays, rateFor, shift],
  )

  /** The three reported figures for one payee. */
  const payFor = (payee, commissionAmount) =>
    combinePay(commissionAmount, regularStats[personKey(payee)]?.amount ?? 0)

  const payeeCount     = techs.length + staff.length
  const totalPending   = Object.values(techStats).reduce((a, s) => a + s.pending, 0)
                        + Object.values(staffStats).reduce((a, s) => a + s.pending, 0)
  const totalCommission = Object.values(techStats).reduce((a, s) => a + s.amount, 0)
                        + Object.values(staffStats).reduce((a, s) => a + s.amount, 0)
  // Only rates for actual accounts count toward the total — a stale rate left
  // behind for a deleted account must not inflate payroll.
  const totalRegular   = [...techs, ...staff].reduce(
    (a, p) => a + (regularStats[personKey(p)]?.amount ?? 0), 0,
  )
  const totalUnclosed  = [...techs, ...staff].reduce(
    (a, p) => a + (regularStats[personKey(p)]?.unpaidDays ?? 0), 0,
  )
  const grandTotal     = combinePay(totalCommission, totalRegular)
  // The bottom line is short by every commission still awaiting a percentage
  // and every day still open — say so rather than presenting it as settled.
  const totalProvisional = totalPending > 0 || totalUnclosed > 0 || attendanceFailed

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
          <p className="text-sm font-sans font-semibold text-gray-700">Could not load payroll</p>
          <p className="text-xs font-body text-gray-400 mt-1 max-w-sm">{loadError}</p>
        </div>
        <button onClick={() => setReloadKey(k => k + 1)} className="btn-primary text-sm">Try again</button>
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
            <h1 className="font-display text-4xl sm:text-5xl tracking-widest text-gray-900 leading-none">COMMISSION</h1>
            <p className="text-sm font-body text-gray-400 mt-2">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setRatesOpen(true)} className="btn-secondary text-sm">
              <Coins className="w-3.5 h-3.5" />
              <span>Daily Rates</span>
            </button>
            <button onClick={() => setAllJobsOpen(true)} className="btn-secondary text-sm">
              <ListTree className="w-3.5 h-3.5" />
              <span>All Jobs</span>
            </button>
            {/* An export must never be short a month of attendance the page
                simply hadn't fetched yet — pull the rest before opening. */}
            <button
              onClick={() => { loadFullHistory(); setExportOpen(true) }}
              className="btn-secondary text-sm"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>

      {attendanceFailed && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs font-body text-amber-800">
            <span className="font-sans font-semibold">Attendance could not be loaded.</span>{' '}
            Regular Pay is unknown for everyone below, not ₱0.00 — Total Pay shows commission only,
            and exporting now would write those blanks into the payroll sheet.{' '}
            <button
              onClick={() => setReloadKey(k => k + 1)}
              className="font-sans font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          </p>
        </div>
      )}

      {/* ── Summary banner ──
          No overflow-hidden: the month filter's dropdown is absolutely
          positioned inside this card and was being clipped by it. Nothing in
          here bleeds past the rounded corners, so there's nothing to clip. */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white">
        <div className="flex flex-col sm:flex-row">

          {/* Left — grand total */}
          <div className="flex-1 px-5 sm:px-7 py-6 sm:py-8">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-1.5">
                <Users className="w-3 h-3 text-brand-300" />
                <p className="text-brand-300 text-xs font-sans font-semibold uppercase tracking-wider">
                  Total Pay
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
                  <div className="absolute right-0 top-full mt-1.5 w-48 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1 animate-fade-in">
                    {['all', ...monthOptions].map(m => {
                      const label  = m === 'all' ? 'All Time' : format(new Date(m + '-01'), 'MMMM yyyy')
                      const active = selectedMonth === m
                      return (
                        <button
                          key={m}
                          onClick={() => {
                            // All Time is the one view that can reach past the
                            // window the initial load fetched.
                            if (m === 'all') loadFullHistory()
                            setSelectedMonth(m)
                            setFilterOpen(false)
                          }}
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
              {PESO(grandTotal.totalPay)}
            </p>
            <p className="text-brand-300 text-sm font-body mt-3">
              {filteredTickets.length} job{filteredTickets.length !== 1 ? 's' : ''} · {payeeCount} payee{payeeCount !== 1 ? 's' : ''}
              {totalPending > 0 && (
                <span className="text-amber-300"> · {totalPending} commission{totalPending !== 1 ? 's' : ''} not yet inputted</span>
              )}
              {totalUnclosed > 0 && (
                <span className="text-amber-300"> · {totalUnclosed} day{totalUnclosed !== 1 ? 's' : ''} not clocked out</span>
              )}
              {loadingHistory && <span> · loading earlier months…</span>}
            </p>
            {totalProvisional && (
              <p className="text-amber-300 text-xs font-sans font-semibold mt-1.5">
                Provisional — this total is missing figures that haven't been inputted yet.
              </p>
            )}
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px bg-white/10 my-6" />
          <div className="block sm:hidden h-px bg-white/10 mx-5" />

          {/* Right — per-payee breakdown */}
          <div className="sm:w-64 px-5 sm:px-7 py-6 sm:py-8 flex flex-col justify-center gap-4">
            <p className="text-brand-300 text-xs font-sans font-semibold uppercase tracking-wider">Breakdown · Total Pay</p>
            <div className="space-y-2.5">
              {techs.map(t => (
                <div key={t.username} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Wrench className="w-3.5 h-3.5 text-accent-400 shrink-0" />
                    <span className="text-brand-200 text-sm font-body truncate">{t.name || t.username}</span>
                  </div>
                  <span className="font-mono text-sm text-white shrink-0">
                    {PESO(payFor(t, techStats[t.username]?.amount ?? 0).totalPay)}
                  </span>
                </div>
              ))}
              {staff.map(s => (
                <div key={s.username} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-brand-200 text-sm font-body truncate">{s.name || s.username}</span>
                  </div>
                  <span className="font-mono text-sm text-white shrink-0">
                    {PESO(payFor(s, staffStats[s.username]?.amount ?? 0).totalPay)}
                  </span>
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
            <p className="text-sm font-sans font-semibold text-gray-500">No commission data</p>
            <p className="text-xs font-body text-gray-400 mt-1">
              Create staff/technician accounts, then assign them to a repair's commission after it's paid.
            </p>
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between gap-3">
            <p className="text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Payees</p>
            <p className="text-xs font-body text-gray-400">Tap a row for that person's jobs</p>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[780px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2.5 text-left  text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Name</th>
                <th className="px-4 py-2.5 text-left  text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Role</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Jobs</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Commission Pay</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Regular Pay</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Total Pay</th>
                <th className="px-2 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">

              {/* Technician rows — one per individual account */}
              {techs.map(t => (
                <PayeeRow
                  key={t.username}
                  payee={{ username: t.username, name: t.name, role: 'Technician' }}
                  stats={techStats[t.username] ?? { amount: 0, pending: 0, jobs: 0 }}
                  pay={payFor(t, techStats[t.username]?.amount ?? 0)}
                  regular={regularStats[personKey(t)]}
                  attendanceFailed={attendanceFailed}
                  onOpen={setPayeeModal}
                />
              ))}

              {/* Staff rows */}
              {staff.map(s => (
                <PayeeRow
                  key={s.username}
                  payee={{ username: s.username, name: s.name, role: 'Staff' }}
                  stats={staffStats[s.username] ?? { amount: 0, pending: 0, jobs: 0 }}
                  pay={payFor(s, staffStats[s.username]?.amount ?? 0)}
                  regular={regularStats[personKey(s)]}
                  attendanceFailed={attendanceFailed}
                  onOpen={setPayeeModal}
                />
              ))}

            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                {/* Only Total Pay is totalled — the per-branch columns stay
                    per-employee figures, with no column subtotal. */}
                <td colSpan={5} className="px-4 py-3.5 text-xs font-sans font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Total Pay{totalProvisional && ' (provisional)'}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <span className="font-mono text-sm font-bold bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent">
                    {PESO(grandTotal.totalPay)}
                  </span>
                  {totalProvisional && (
                    <span className="block text-[11px] font-sans font-semibold text-amber-600 mt-0.5">
                      missing inputs
                    </span>
                  )}
                </td>
                <td className="px-2 py-3.5" />
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
      )}

      {/* ── Popups ── */}
      {payeeModal && (
        <PayeeJobsModal
          payee={payeeModal}
          tickets={filteredTickets}
          // The same grouping and the same rate the table row was computed
          // from, so the day rows always sum to the footer's Regular Pay.
          workDays={workDays.get(personKey(payeeModal))}
          monthLabel={monthLabel}
          regular={regularStats[personKey(payeeModal)]}
          dailyRate={rateFor(payeeModal)}
          shift={shift}
          onClose={() => setPayeeModal(null)}
        />
      )}
      {exportOpen && (
        <ExportMonthModal
          defaultMonth={selectedMonth === 'all' ? format(new Date(), 'yyyy-MM') : selectedMonth}
          monthOptions={monthOptions}
          data={{ tickets, logs: attendance, techs, staff, rates, shift }}
          attendanceFailed={attendanceFailed}
          loadingHistory={loadingHistory}
          onClose={() => setExportOpen(false)}
        />
      )}
      {ratesOpen && (
        <DailyRatesModal
          techs={techs}
          staff={staff}
          rates={rates}
          shift={shift}
          accountsIncomplete={accountsIncomplete}
          onSave={setRates}
          onClose={() => setRatesOpen(false)}
        />
      )}
      {allJobsOpen && (
        <AllJobsModal
          tickets={filteredTickets}
          techs={techs}
          staff={staff}
          monthLabel={monthLabel}
          onClose={() => setAllJobsOpen(false)}
        />
      )}

    </div>
  )
}

// ── Payee table row ───────────────────────────────────────────────────────────

const ROLE_STYLE = {
  Technician: { Icon: Wrench, avatar: 'bg-accent-50',  icon: 'text-accent-500',  badge: 'bg-accent-50 text-accent-600' },
  Staff:      { Icon: Shield, avatar: 'bg-emerald-50', icon: 'text-emerald-600', badge: 'bg-emerald-50 text-emerald-700' },
}

/**
 * One payee row — click/Enter opens their job breakdown popup.
 * Commission Pay and Regular Pay are reported side by side and summed into
 * Total Pay; the two are never blended into a single figure.
 */
function PayeeRow({ payee, stats, pay, regular, attendanceFailed, onOpen }) {
  const { Icon, avatar, icon, badge } = ROLE_STYLE[payee.role]
  // Total Pay is only as complete as the two branches feeding it. A confident
  // bold figure next to an amber "Not yet inputted" Commission Pay cell reads
  // as settled money when it is really just short.
  const missing = [
    stats.pending > 0 && `${stats.pending} commission${stats.pending !== 1 ? 's' : ''} pending`,
    regular?.unpaidDays > 0 && `${regular.unpaidDays} day${regular.unpaidDays !== 1 ? 's' : ''} unclosed`,
    attendanceFailed && 'regular pay unavailable',
  ].filter(Boolean)

  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={() => onOpen(payee)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(payee) } }}
      aria-label={`View ${payee.name || payee.username}'s commission jobs`}
      className="hover:bg-gray-50/70 transition-colors cursor-pointer focus:outline-none focus:bg-gray-50"
    >
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-full ${avatar} flex items-center justify-center shrink-0`}>
            <Icon className={`w-3.5 h-3.5 ${icon}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-sans font-semibold text-gray-800 truncate">{payee.name || payee.username}</p>
            {payee.name && <p className="text-xs font-mono text-gray-400 truncate mt-0.5">{payee.username}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-sans font-semibold ${badge}`}>
          {payee.role}
        </span>
      </td>
      <td className="px-4 py-3.5 text-right font-mono text-xs text-gray-500">{stats.jobs}</td>

      {/* Commission Pay */}
      <td className="px-4 py-3.5 text-right">
        {stats.jobs === 0 ? (
          <span className="font-mono text-sm text-gray-300">{PESO(0)}</span>
        ) : stats.amount === 0 && stats.pending > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-sans font-semibold text-amber-600">
            <AlertTriangle className="w-3 h-3" /> Not yet inputted
          </span>
        ) : (
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-sm text-gray-800">{PESO(pay.commissionPay)}</span>
            {stats.pending > 0 && (
              <span className="text-[11px] font-sans font-semibold text-amber-600">{stats.pending} pending</span>
            )}
          </div>
        )}
      </td>

      {/* Regular Pay */}
      <td className="px-4 py-3.5 text-right">
        {attendanceFailed ? (
          <span className="inline-flex items-center gap-1 text-xs font-sans font-semibold text-amber-600">
            <AlertTriangle className="w-3 h-3" /> Unavailable
          </span>
        ) : regular && regular.days === 0 && regular.unpaidDays > 0 ? (
          // Every day they worked is still open — the figure is unknown, not
          // ₱0.00, and must not read as a settled amount.
          <span className="inline-flex items-center gap-1 text-xs font-sans font-semibold text-amber-600">
            <AlertTriangle className="w-3 h-3" /> {regular.unpaidDays} unclosed
          </span>
        ) : !regular || regular.days === 0 ? (
          <span className="font-mono text-sm text-gray-300">{PESO(0)}</span>
        ) : (
          <div className="flex flex-col items-end gap-0.5">
            <span className="font-mono text-sm text-gray-800">{PESO(pay.regularPay)}</span>
            <span className="text-[11px] font-body text-gray-400">
              {regular.days} day{regular.days !== 1 ? 's' : ''}
              {regular.unpaidDays > 0 && (
                <span className="text-amber-600 font-sans font-semibold"> · {regular.unpaidDays} unclosed</span>
              )}
            </span>
          </div>
        )}
      </td>

      {/* Total Pay */}
      <td className="px-4 py-3.5 text-right">
        <span className="font-mono text-sm font-bold text-gray-900">{PESO(pay.totalPay)}</span>
        {missing.length > 0 && (
          <span
            className="block text-[11px] font-sans font-semibold text-amber-600 mt-0.5"
            title={`Provisional — ${missing.join(' · ')}`}
          >
            {missing.join(' · ')}
          </span>
        )}
      </td>

      <td className="px-2 py-3.5 text-right">
        <ChevronRight className="w-4 h-4 text-gray-300 inline" />
      </td>
    </tr>
  )
}

// ── Popups ────────────────────────────────────────────────────────────────────

/**
 * Shared popup chrome — backdrop, card, header, Escape-to-close.
 * Backdrop click closes too; clicks inside the card are stopped so selecting
 * text in the table doesn't dismiss it.
 */
function ModalShell({ icon, iconClass, title, subtitle, onClose, children, footer }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-3xl p-0 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-xl ${iconClass} flex items-center justify-center shrink-0`}>
              {icon}
            </div>
            <div className="min-w-0">
              <p className="font-sans font-bold text-gray-900 text-sm leading-none truncate">{title}</p>
              <p className="text-xs font-body text-gray-400 mt-1 truncate">{subtitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-auto grow">{children}</div>

        {footer && (
          <div className="border-t border-gray-100 bg-gray-50 px-5 py-3.5 shrink-0">{footer}</div>
        )}
      </div>
    </div>
  )
}

/** Empty-state block used inside both popups. */
function ModalEmpty({ text }) {
  return (
    <div className="p-12 flex flex-col items-center gap-3 text-center">
      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
        <Banknote className="w-5 h-5 text-gray-300" />
      </div>
      <p className="text-xs font-body text-gray-400">{text}</p>
    </div>
  )
}

/** One labelled peso figure in a popup footer. */
function PayFigure({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-sans font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className="font-mono text-sm text-gray-700">{PESO(value)}</p>
    </div>
  )
}

/** Ticket identity block shared by both popups. */
function TicketCell({ ticket }) {
  return (
    <>
      <p className="font-mono text-xs font-semibold text-gray-500 truncate">{ticket.ticket_id}</p>
      <p className="text-xs font-sans font-semibold text-gray-800 truncate mt-0.5">{ticket.client_name}</p>
      <p className="text-xs font-body text-gray-400 truncate">{ticket.unit_brand} {ticket.unit_model}</p>
    </>
  )
}

/**
 * Label for a cut that can't be computed yet. A Staff row can show its own
 * rate and still owe nothing computable — staff's cut is net-of-technician,
 * so a missing technician percentage blocks it too. Say which one is missing
 * rather than rendering ₱0.00.
 */
function pendingLabel(role, pct) {
  return role === 'Staff' && pct != null ? 'Awaiting tech %' : 'Not yet inputted'
}

/** Underline tab bar used inside a popup. */
function ModalTabs({ tabs, active, onChange }) {
  return (
    <div className="flex border-b border-gray-100 bg-white sticky top-0 z-20" role="tablist">
      {tabs.map(t => {
        const isActive = t.id === active
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-sans font-semibold border-b-2 -mb-px transition-colors
              ${isActive
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-gray-400 hover:text-gray-600'}`}
          >
            <t.icon className="w-3.5 h-3.5 shrink-0" />
            <span>{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * One employee's pay, split across the two branches as two tabs: the per-job
 * commission breakdown, and the day-by-day regular-salary computation. The
 * footer carries both totals plus Total Pay on either tab, so switching tabs
 * changes the working shown, never the money reported.
 */
function PayeeJobsModal({ payee, tickets, workDays, monthLabel, regular, dailyRate, shift, onClose }) {
  const [tab, setTab] = useState('commission')

  const rows    = useMemo(() => payeeJobs(tickets, payee.role, payee.username), [tickets, payee])
  const total   = rows.reduce((s, r) => s + (r.commission ?? 0), 0)
  const pending = rows.filter(r => r.commission == null).length
  const pay     = combinePay(total, regular?.amount ?? 0)
  const { Icon, badge } = ROLE_STYLE[payee.role]

  const dayRows = useMemo(
    () => regularPayDaysFor(workDays, dailyRate, shift),
    [workDays, dailyRate, shift],
  )

  const subtitle = tab === 'commission'
    ? `${payee.role} · ${monthLabel} · ${rows.length} job${rows.length !== 1 ? 's' : ''}${pending > 0 ? ` · ${pending} pending` : ''}`
    : `${payee.role} · ${monthLabel} · ${PESO(dailyRate)}/day over ${shiftHoursCap(shift)} hours`

  return (
    <ModalShell
      icon={<Icon className="w-4 h-4" />}
      iconClass={badge}
      title={payee.name || payee.username}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-5">
            <PayFigure label="Commission Pay" value={pay.commissionPay} />
            <span className="text-gray-300 font-sans">+</span>
            <PayFigure label="Regular Pay" value={pay.regularPay} />
          </div>
          <div className="text-right">
            <p className="text-[11px] font-sans font-semibold text-gray-400 uppercase tracking-wider">Total Pay</p>
            <p className="font-mono text-sm font-bold bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent">
              {PESO(pay.totalPay)}
            </p>
          </div>
        </div>
      }
    >
      <ModalTabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'commission', label: 'Commission', icon: Banknote },
          { id: 'regular',    label: 'Regular Pay', icon: Clock },
        ]}
      />

      {tab === 'commission' ? (
        rows.length === 0 ? (
          <ModalEmpty text={`No commissionable jobs assigned to this ${payee.role.toLowerCase()} in ${monthLabel.toLowerCase()}.`} />
        ) : (
          <table className="w-full text-sm min-w-[520px]">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2.5 text-left  text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Ticket</th>
                {/* The date the month filter buckets on — see commission.js. */}
                <th className="px-4 py-2.5 text-left  text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Date Paid</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Labor Fee</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Rate</th>
                <th className="px-4 py-2.5 text-right text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">Cut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ ticket, fee, pct, commission }) => (
                <tr key={ticket.id} className="hover:bg-gray-50/70 transition-colors">
                  <td className="px-4 py-3 max-w-[220px]"><TicketCell ticket={ticket} /></td>
                  <td className="px-4 py-3 text-xs font-body text-gray-500 whitespace-nowrap">
                    {commissionDate(ticket) ? format(commissionDate(ticket), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-gray-700">{PESO(fee)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-gray-500">{PCT(pct)}</td>
                  <td className="px-4 py-3 text-right">
                    {commission == null ? (
                      <span className="text-xs font-sans font-semibold text-amber-600 whitespace-nowrap">
                        {pendingLabel(payee.role, pct)}
                      </span>
                    ) : (
                      <span className="font-mono text-xs font-bold text-gray-900">{PESO(commission)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : (
        <RegularPayTab
          rows={dayRows}
          dailyRate={dailyRate}
          shift={shift}
          regular={regular}
          monthLabel={monthLabel}
        />
      )}
    </ModalShell>
  )
}

/**
 * Day-by-day working behind an employee's regular pay: what they were docked
 * for arriving late and for leaving early, and what's left of the daily rate.
 */
function RegularPayTab({ rows, dailyRate, shift, regular, monthLabel }) {
  const perMinute = minuteRate(dailyRate, shift)

  if (rows.length === 0) {
    return <ModalEmpty text={`No attendance recorded for this employee in ${monthLabel.toLowerCase()}.`} />
  }

  return (
    <>
      {/* How the rate breaks down — the constants every row below is derived from. */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center gap-x-5 gap-y-1.5 flex-wrap">
        <RateFact label="Daily rate" value={PESO(dailyRate)} />
        <RateFact label="Per hour"   value={`${PESO(hourlyRate(dailyRate, shift))} × ${shiftHoursCap(shift)}h`} />
        <RateFact label="Per minute" value={PESO(perMinute)} />
        <RateFact label="Shift"      value={`${fmtShiftHour(shift.start)} – ${fmtShiftHour(shift.end)}`} />
        {regular?.unpaidDays > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-sans font-semibold text-amber-600">
            <AlertTriangle className="w-3 h-3" /> {regular.unpaidDays} unclosed day{regular.unpaidDays !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <table className="w-full text-sm min-w-[620px]">
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
          {rows.map(({ firstIn, lastOut, pay }) => (
            <tr key={firstIn.getTime()} className="hover:bg-gray-50/70 transition-colors">
              <td className="px-4 py-3 whitespace-nowrap">
                <p className="text-xs font-sans font-semibold text-gray-800">{format(firstIn, 'MMM d, yyyy')}</p>
                <p className="text-xs font-body text-gray-400 mt-0.5">{format(firstIn, 'EEEE')}</p>
              </td>
              <td className="px-4 py-3 font-mono text-xs text-gray-600 whitespace-nowrap">
                {format(firstIn, 'hh:mm a')} → {lastOut ? format(lastOut, 'hh:mm a') : <span className="font-sans italic text-gray-300">unclosed</span>}
              </td>
              <td className="px-4 py-3 text-right"><DeductionCell minutes={pay?.lateMinutes} amount={pay?.lateDeduction} /></td>
              <td className="px-4 py-3 text-right"><DeductionCell minutes={pay?.undertimeMinutes} amount={pay?.undertimeDeduction} /></td>
              <td className="px-4 py-3 text-right">
                {pay ? (
                  <span className="font-mono text-xs font-bold text-gray-900">{PESO(pay.dailyPay)}</span>
                ) : (
                  <span className="text-xs font-sans font-semibold text-amber-600 whitespace-nowrap">Not clocked out</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

/** One "label value" fact in the rate strip. */
function RateFact({ label, value }) {
  return (
    <span className="text-xs font-body text-gray-400">
      {label} <span className="font-mono text-gray-600">{value}</span>
    </span>
  )
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

/** Every commissionable job in the period, broken down per employee credited on it. */
function AllJobsModal({ tickets, techs, staff, monthLabel, onClose }) {
  const jobs = useMemo(
    () => tickets.map(t => ({ ticket: t, fee: laborFee(t), payees: ticketPayees(t, techs, staff) })),
    [tickets, techs, staff],
  )
  const total = jobs.reduce(
    (s, j) => s + j.payees.reduce((ps, p) => ps + (p.commission ?? 0), 0),
    0,
  )

  return (
    <ModalShell
      icon={<ListTree className="w-4 h-4" />}
      iconClass="bg-brand-50 text-brand-600"
      title="All Jobs"
      subtitle={`${monthLabel} · ${jobs.length} job${jobs.length !== 1 ? 's' : ''} · commission cut per employee`}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wider">Total Commission</span>
          <span className="font-mono text-sm font-bold bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent">
            {PESO(total)}
          </span>
        </div>
      }
    >
      {jobs.length === 0 ? (
        <ModalEmpty text={`No paid, commissionable jobs in ${monthLabel.toLowerCase()}.`} />
      ) : (
        <div className="divide-y divide-gray-100">
          {jobs.map(({ ticket, fee, payees }) => (
            <div key={ticket.id} className="px-4 py-3.5">

              {/* Job header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><TicketCell ticket={ticket} /></div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-xs font-bold text-gray-900">{PESO(fee)}</p>
                  <p className="text-xs font-body text-gray-400 mt-0.5">
                    {commissionDate(ticket) ? `Paid ${format(commissionDate(ticket), 'MMM d, yyyy')}` : '—'}
                  </p>
                </div>
              </div>

              {/* Per-employee cut */}
              {payees.length === 0 ? (
                <p className="mt-2.5 inline-flex items-center gap-1 text-xs font-sans font-semibold text-amber-600">
                  <AlertTriangle className="w-3 h-3" /> Nobody assigned yet
                </p>
              ) : (
                <div className="mt-2.5 space-y-1.5">
                  {payees.map(p => {
                    const { Icon, icon } = ROLE_STYLE[p.role]
                    return (
                      <div key={p.key} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Icon className={`w-3.5 h-3.5 shrink-0 ${icon}`} />
                          <span className="text-xs font-sans font-semibold text-gray-700 truncate">{p.name}</span>
                          <span className="font-mono text-[11px] text-gray-400 shrink-0">{PCT(p.pct)}</span>
                        </div>
                        {p.commission == null ? (
                          <span className="text-xs font-sans font-semibold text-amber-600 shrink-0 whitespace-nowrap">
                            {pendingLabel(p.role, p.pct)}
                          </span>
                        ) : (
                          <span className="font-mono text-xs font-bold text-gray-900 shrink-0">{PESO(p.commission)}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  )
}

/**
 * Month picker shown before the payroll export runs. Nothing downloads until
 * a month is confirmed — an export named for the wrong period is worse than
 * no export, so the choice is never inferred from the page's current filter
 * without showing it first.
 */
function ExportMonthModal({
  defaultMonth, monthOptions, data, attendanceFailed, loadingHistory, onClose,
}) {
  const [month,     setMonth]     = useState(defaultMonth)
  const [exporting, setExporting] = useState(false)
  const [msg,       setMsg]       = useState(null)

  const maxMonth = format(new Date(), 'yyyy-MM')
  // Clearing the input leaves '', which would build an Invalid Date and make
  // every format() below throw mid-render. Parse defensively and let the rest
  // of the modal render in a "no month chosen" state instead.
  const monthDate = useMemo(() => {
    const [y, m] = (month ?? '').split('-').map(Number)
    if (!y || !m || m < 1 || m > 12) return null
    const d = new Date(y, m - 1, 1)
    return isNaN(d) ? null : d
  }, [month])

  async function handleExport() {
    if (!monthDate) return
    setExporting(true)
    setMsg(null)
    try {
      const res = await exportCommissionMonth({ ...data, monthDate })
      setMsg(res.jobs === 0 && res.days === 0
        ? { type: 'empty', text: 'That month has no commission or attendance data — an empty sheet was downloaded.' }
        : { type: 'ok', text: `Exported ${res.employees} employee${res.employees === 1 ? '' : 's'} · ${res.jobs} job${res.jobs === 1 ? '' : 's'} · ${res.days} day${res.days === 1 ? '' : 's'}.` })
    } catch {
      setMsg({ type: 'err', text: 'Export failed. Please try again.' })
    } finally {
      setExporting(false)
    }
  }

  const msgClass = msg?.type === 'err' ? 'text-red-600'
    : msg?.type === 'empty' ? 'text-amber-600'
    : 'text-emerald-600'

  return (
    <ModalShell
      icon={<FileSpreadsheet className="w-4 h-4" />}
      iconClass="bg-brand-50 text-brand-600"
      title="Export Payroll"
      subtitle="Monthly commission + regular pay as Excel"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className={`text-xs font-sans font-semibold ${msg ? msgClass : 'text-transparent'}`}>
            {msg?.text ?? '.'}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary text-sm" disabled={exporting}>Close</button>
            <button
              onClick={handleExport}
              className="btn-primary text-sm"
              disabled={exporting || !monthDate || attendanceFailed || loadingHistory}
            >
              {exporting ? 'Exporting…' : loadingHistory ? 'Loading…' : 'Export'}
            </button>
          </div>
        </div>
      }
    >
      <div className="p-5 space-y-4">
        {attendanceFailed && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs font-body text-amber-800">
              Attendance could not be loaded, so every Regular Pay figure would export as ₱0.00.
              Reload the page and try again before running payroll.
            </p>
          </div>
        )}
        <div>
          <label htmlFor="commission-export-month" className="label">Month to export</label>
          <input
            id="commission-export-month"
            type="month"
            value={month}
            max={maxMonth}
            onChange={e => { setMonth(e.target.value); setMsg(null) }}
            className="input-field"
          />
          <p className="text-xs font-body text-gray-400 mt-2">
            {!monthDate
              ? 'Pick a month to export.'
              : monthOptions.includes(month)
                ? `${format(monthDate, 'MMMM yyyy')} — data recorded.`
                : `${format(monthDate, 'MMMM yyyy')} — no tickets or attendance recorded in this month.`}
          </p>
        </div>

        <div className="rounded-xl bg-gray-50 border border-gray-100 p-4">
          <p className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide mb-2">
            The workbook contains
          </p>
          <ul className="space-y-1.5 text-xs font-body text-gray-500">
            <li><span className="font-sans font-semibold text-gray-700">Payroll</span> — Commission Pay, Regular Pay and Total Pay per employee</li>
            <li><span className="font-sans font-semibold text-gray-700">Commission</span> — every paid job, its rate and the cut earned</li>
            <li><span className="font-sans font-semibold text-gray-700">Regular Pay</span> — every working day, its late/undertime deductions and daily pay</li>
          </ul>
        </div>
      </div>
    </ModalShell>
  )
}

/**
 * Admin editor for each employee's daily rate — the only input the regular-pay
 * branch takes. Rates live in app_settings.daily_rates keyed by rateKey()
 * (role + lowercased username); 0 is a real setting ("commission only"), not a
 * blank.
 *
 * The role prefix matters here: staff_accounts and technician_accounts enforce
 * username uniqueness separately, so a Staff "kurt" and a Technician "kurt" can
 * both exist. Keying the draft by username alone bound their two rows to one
 * input and saved one shared rate for two different people.
 */
function DailyRatesModal({ techs, staff, rates, shift, accountsIncomplete, onSave, onClose }) {
  const people = useMemo(() => [
    ...techs.map(t => ({ ...t, role: 'Technician' })),
    ...staff.map(s => ({ ...s, role: 'Staff' })),
  ], [techs, staff])

  const [draft,  setDraft]  = useState(() => Object.fromEntries(
    people.map(p => [rateKey(p), String(resolveDailyRate(p, rates))]),
  ))
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const payHours = shiftHoursCap(shift)

  async function handleSave() {
    const parsed = {}
    for (const [key, value] of Object.entries(draft)) {
      const n = Number(value)
      if (String(value).trim() === '' || isNaN(n) || n < 0) {
        setError('Daily rates must be zero or a positive number.')
        return
      }
      parsed[key] = Number(n.toFixed(2))
    }
    // Merge over the stored map instead of replacing it. The editor only lists
    // the accounts this page managed to load, so writing `parsed` alone would
    // delete the rate of anyone missing from that list — including every staff
    // member if the staff-manage call happened to fail.
    const merged = { ...rates, ...parsed }
    setSaving(true)
    setError(null)
    try {
      await saveDailyRates(merged)
      onSave(merged)
      onClose()
    } catch {
      setError('Could not save the rates. Please try again.')
      setSaving(false)
    }
  }

  return (
    <ModalShell
      icon={<Coins className="w-4 h-4" />}
      iconClass="bg-brand-50 text-brand-600"
      title="Daily Rates"
      subtitle={`Paid over ${payHours} hours a day · lunch already deducted`}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs font-body text-gray-400">
            {error
              ? <span className="text-red-600 font-sans font-semibold">{error}</span>
              : 'A rate of ₱0.00 means the employee is paid on commission only.'}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary text-sm" disabled={saving}>Cancel</button>
            <button onClick={handleSave} className="btn-primary text-sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save Rates'}
            </button>
          </div>
        </div>
      }
    >
      {accountsIncomplete && (
        <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/60 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-xs font-body text-amber-700">
            Some accounts could not be loaded, so this list may be incomplete.
            Saving only changes the rates shown here — the rest are left as they are.
          </p>
        </div>
      )}
      {people.length === 0 ? (
        <ModalEmpty text="No staff or technician accounts to set a rate for yet." />
      ) : (
        <div className="divide-y divide-gray-100">
          {people.map(p => {
            const key = rateKey(p)
            const { Icon, avatar, icon } = ROLE_STYLE[p.role]
            const value = draft[key] ?? '0'
            const perHour = (Number(value) || 0) / payHours
            return (
              <div key={key} className="px-4 py-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full ${avatar} flex items-center justify-center shrink-0`}>
                  <Icon className={`w-4 h-4 ${icon}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-sans font-semibold text-gray-800 truncate">{p.name || p.username}</p>
                  <p className="text-xs font-mono text-gray-400 truncate mt-0.5">{p.username} · {p.role}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-sm text-gray-400">₱</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={value}
                      onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
                      aria-label={`Daily rate for ${p.name || p.username}`}
                      className="input-field w-28 text-right font-mono text-sm"
                    />
                  </div>
                  <p className="text-[11px] font-body text-gray-400 mt-1">{PESO(perHour)}/hr</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </ModalShell>
  )
}
