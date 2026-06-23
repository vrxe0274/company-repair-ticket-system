import { useState, useEffect, useMemo } from 'react'
import {
  format, startOfMonth, endOfMonth, subMonths, addMonths, isSameMonth,
} from 'date-fns'
import {
  BarChart2, ArrowUpRight, ArrowDownRight,
  ChevronLeft, ChevronRight,
} from 'lucide-react'
import { useRole }  from '../../hooks/useRole.jsx'
import { supabase } from '../../lib/supabase'

// ── Formatter ──────────────────────────────────────────────────────────────────

const php = (n) =>
  `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

// ── Sub-components ─────────────────────────────────────────────────────────────


function RevenueDelta({ current, previous }) {
  if (previous === 0 && current === 0) return null
  if (previous === 0) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold font-sans">
        <ArrowUpRight className="w-3.5 h-3.5" />First month
      </span>
    )
  }
  const diff = ((current - previous) / previous) * 100
  const isUp = diff >= 0
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-semibold font-sans border ${
      isUp
        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
        : 'bg-red-50 border-red-200 text-red-600'
    }`}>
      {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
      {Math.abs(diff).toFixed(1)}%
    </span>
  )
}

function SmallDelta({ current, previous }) {
  if (previous === 0) return null
  const diff = ((current - previous) / previous) * 100
  const isUp = diff >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold font-sans ${isUp ? 'text-emerald-600' : 'text-red-500'}`}>
      {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(diff).toFixed(0)}%
    </span>
  )
}

function TrendBar({ label, value, maxValue, highlight }) {
  const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, value > 0 ? 6 : 0) : 0
  return (
    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
      {value > 0 && (
        <span className="text-[9px] sm:text-[10px] font-mono text-gray-400 leading-none truncate w-full text-center">
          {php(value)}
        </span>
      )}
      {value === 0 && <span className="text-[9px] opacity-0 leading-none">0</span>}
      <div className="w-full flex items-end justify-center" style={{ height: '88px' }}>
        <div
          className={`w-full max-w-[36px] rounded-t-sm transition-all duration-700 ${
            highlight
              ? 'bg-gradient-to-t from-brand-600 to-brand-400 shadow-sm shadow-brand-200'
              : 'bg-brand-100'
          }`}
          style={{ height: `${pct}%` }}
        />
      </div>
      <span className={`text-[9px] sm:text-[10px] font-sans leading-none truncate w-full text-center ${
        highlight ? 'text-brand-600 font-bold' : 'text-gray-400'
      }`}>
        {label}
      </span>
    </div>
  )
}


// ── Page ───────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const { isAdmin } = useRole()

  const [tickets,  setTickets]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  const [selectedMonth, setSelectedMonth] = useState(new Date())

  const canGoForward = !isSameMonth(selectedMonth, new Date())

  useEffect(() => {
    async function load() {
      setLoading(true); setError('')
      try {
        const { data, error: qErr } = await supabase
          .from('tickets')
          .select('id, created_at, status, paid_at, final_price, discount_amount')
          .order('created_at', { ascending: false })
        if (qErr) throw qErr
        setTickets(data ?? [])
      } catch {
        setError('Failed to load analytics data. Check your connection and try again.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Derived analytics ────────────────────────────────────────────────────────

  const analytics = useMemo(() => {
    if (!tickets.length) return null

    const selStart  = startOfMonth(selectedMonth)
    const selEnd    = endOfMonth(selectedMonth)
    const prevMonth = subMonths(selectedMonth, 1)
    const prevStart = startOfMonth(prevMonth)
    const prevEnd   = endOfMonth(prevMonth)

    const inRange = (t, s, e) => { const d = new Date(t.created_at); return d >= s && d <= e }
    const paidIn  = (t, s, e) => {
      if (t.status !== 'Paid' || !t.paid_at) return false
      const d = new Date(t.paid_at); return d >= s && d <= e
    }

    const selTickets = tickets.filter(t => inRange(t, selStart, selEnd))
    const selPaid    = tickets.filter(t => paidIn(t, selStart, selEnd))
    const selRevenue = selPaid.reduce((s, t) => s + Number(t.final_price || 0), 0)

    const prevPaid    = tickets.filter(t => paidIn(t, prevStart, prevEnd))
    const prevRevenue = prevPaid.reduce((s, t) => s + Number(t.final_price || 0), 0)
    const prevTickets = tickets.filter(t => inRange(t, prevStart, prevEnd))

    const selClosed    = selTickets.filter(t => t.status === 'Paid' || t.status === 'Denied')
    const selCompleted = selTickets.filter(t => t.status === 'Paid')
    const completionRate = selClosed.length > 0 ? (selCompleted.length / selClosed.length) * 100 : 0

    const allPaid      = tickets.filter(t => t.status === 'Paid' && t.final_price)
    const allRevenue   = allPaid.reduce((s, t) => s + Number(t.final_price || 0), 0)
    const allDiscounts = tickets.reduce((s, t) => s + Number(t.discount_amount || 0), 0)
    const avgValue     = allPaid.length > 0 ? allRevenue / allPaid.length : 0

    // 6-month trend (always anchored to today, not selected month)
    const now = new Date()
    const trendMonths = Array.from({ length: 6 }, (_, i) => {
      const d     = subMonths(now, 5 - i)
      const start = startOfMonth(d)
      const end   = endOfMonth(d)
      const paid  = tickets.filter(t => paidIn(t, start, end))
      const rev   = paid.reduce((s, t) => s + Number(t.final_price || 0), 0)
      return { label: format(d, 'MMM'), month: d, revenue: rev }
    })
    const maxTrendRevenue = Math.max(...trendMonths.map(m => m.revenue), 1)

    return {
      selRevenue, selTicketCount: selTickets.length, selPaidCount: selPaid.length,
      prevRevenue, prevTicketCount: prevTickets.length,
      completionRate,
      allRevenue, allDiscounts, allPaidCount: allPaid.length, avgValue,
      trendMonths, maxTrendRevenue,
    }
  }, [tickets, selectedMonth])

  // ── Guard ─────────────────────────────────────────────────────────────────────

  if (!isAdmin) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center text-gray-400 font-body text-sm">
        Admin access required.
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="-mx-5 -mt-5 lg:-mx-7 lg:-mt-7 bg-white border-b border-gray-200 mb-1">
        <div className="h-0.5 bg-gradient-to-r from-brand-500 to-accent-500" />
        <div className="px-5 lg:px-7 py-5">
          <h1 className="font-display text-4xl sm:text-5xl tracking-widest text-gray-900 leading-none">ANALYTICS</h1>
          <p className="text-sm font-body text-gray-400 mt-2">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <span className="w-6 h-6 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <div className="card p-6 text-center">
          <p className="text-sm font-body text-red-500">{error}</p>
        </div>
      )}

      {/* ── Empty ── */}
      {!loading && !error && tickets.length === 0 && (
        <div className="card p-10 text-center">
          <BarChart2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-base font-body text-gray-500">No ticket data to analyze yet.</p>
        </div>
      )}

      {/* ── Content ── */}
      {!loading && !error && analytics && (
        <>

          {/* ═══════════════════════════════════════════════════════
              REVENUE HERO — period selector lives inside this card.
              The period context is established here, not in the header,
              so the user understands what the numbers below refer to.
          ══════════════════════════════════════════════════════════ */}
          <div className="card overflow-hidden">
            <div className="p-5 sm:p-7">

              {/* Month navigation */}
              <div className="flex items-center justify-between mb-6">
                <p className="section-title mb-0">Period</p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-sans font-bold text-sm text-gray-800 w-32 text-center tabular-nums">
                    {format(selectedMonth, 'MMMM yyyy')}
                  </span>
                  <button
                    onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
                    disabled={!canGoForward}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all disabled:opacity-30 disabled:pointer-events-none"
                    aria-label="Next month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Revenue number — the page's thesis */}
              <div className="mb-1">
                <p className="font-display text-5xl sm:text-6xl tracking-wide text-gray-900 leading-none">
                  {php(analytics.selRevenue)}
                </p>
              </div>
              <div className="flex items-center gap-3 mb-6">
                <RevenueDelta current={analytics.selRevenue} previous={analytics.prevRevenue} />
                {analytics.prevRevenue > 0 && (
                  <span className="text-xs font-body text-gray-400">
                    vs {format(subMonths(selectedMonth, 1), 'MMMM yyyy')}
                  </span>
                )}
                <span className="text-xs font-body text-gray-400">Revenue</span>
              </div>

              {/* Supporting stats for this period — compact, secondary to the revenue number */}
              <div className="flex flex-wrap gap-x-6 gap-y-3 pb-6 border-b border-gray-100">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display text-2xl tracking-wide text-blue-600 leading-none">
                      {analytics.selTicketCount}
                    </span>
                    <SmallDelta current={analytics.selTicketCount} previous={analytics.prevTicketCount} />
                  </div>
                  <p className="text-xs font-body text-gray-400 mt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block shrink-0" />new tickets
                  </p>
                </div>
                <div className="w-px bg-gray-100 self-stretch hidden sm:block" />
                <div>
                  <span className="font-display text-2xl tracking-wide text-emerald-600 leading-none">
                    {analytics.selPaidCount}
                  </span>
                  <p className="text-xs font-body text-gray-400 mt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block shrink-0" />paid this period
                  </p>
                </div>
                <div className="w-px bg-gray-100 self-stretch hidden sm:block" />
                <div>
                  <span className="font-display text-2xl tracking-wide text-purple-600 leading-none">
                    {analytics.completionRate.toFixed(0)}%
                  </span>
                  <p className="text-xs font-body text-gray-400 mt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block shrink-0" />completion rate
                  </p>
                </div>
              </div>

              {/* 6-month trend — inside the hero so it reads as context for the revenue number */}
              <div className="pt-5">
                <p className="section-title mb-4">6-month revenue trend</p>
                <div className="flex items-end gap-1.5 sm:gap-2">
                  {analytics.trendMonths.map(m => (
                    <TrendBar
                      key={m.label}
                      label={m.label}
                      value={m.revenue}
                      maxValue={analytics.maxTrendRevenue}
                      highlight={format(m.month, 'yyyy-MM') === format(selectedMonth, 'yyyy-MM')}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════
              ALL-TIME RIBBON — subordinate to the hero, reads as a
              single horizontal band rather than competing cards.
          ══════════════════════════════════════════════════════════ */}
          <div className="card px-5 sm:px-7 py-4">
            <p className="section-title mb-3">All time</p>
            <div className="flex flex-wrap gap-x-8 gap-y-4">
              <div>
                <p className="font-display text-2xl sm:text-3xl tracking-wide text-emerald-600 leading-none">
                  {php(analytics.allRevenue)}
                </p>
                <p className="text-xs font-body text-gray-400 mt-0.5">Total revenue</p>
              </div>
              <div className="w-px bg-gray-100 self-stretch hidden sm:block" />
              <div>
                <p className="font-display text-2xl sm:text-3xl tracking-wide text-blue-600 leading-none">
                  {analytics.allPaidCount}
                </p>
                <p className="text-xs font-body text-gray-400 mt-0.5">Paid tickets</p>
              </div>
              <div className="w-px bg-gray-100 self-stretch hidden sm:block" />
              <div>
                <p className="font-display text-2xl sm:text-3xl tracking-wide text-purple-600 leading-none">
                  {php(analytics.avgValue)}
                </p>
                <p className="text-xs font-body text-gray-400 mt-0.5">Avg. ticket value</p>
              </div>
              <div className="w-px bg-gray-100 self-stretch hidden sm:block" />
              <div>
                <p className="font-display text-2xl sm:text-3xl tracking-wide text-amber-500 leading-none">
                  {php(analytics.allDiscounts)}
                </p>
                <p className="text-xs font-body text-gray-400 mt-0.5">Discounts given</p>
              </div>
            </div>
          </div>


        </>
      )}
    </div>
  )
}
