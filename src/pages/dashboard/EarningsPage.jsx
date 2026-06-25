import { useState, useEffect, useMemo } from 'react'
import { format } from 'date-fns'
import { TrendingUp, Calendar, Wrench, Shield } from 'lucide-react'
import { supabase }            from '../../lib/supabase'
import { useRole }             from '../../hooks/useRole.jsx'
import { laborFee, technicianCommission, staffCommission } from '../../lib/commission'

const PESO = n => `₱${Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const COLUMNS = [
  'id', 'ticket_id', 'created_at', 'paid_at', 'status',
  'client_name', 'unit_brand', 'unit_model',
  'labor_items',
].join(', ')

export default function EarningsPage() {
  const { isTechnician } = useRole()

  const [tickets,       setTickets]       = useState([])
  const [loading,       setLoading]       = useState(true)
  const [selectedMonth, setSelectedMonth] = useState('all')

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

  const totalCommission   = filteredTickets.reduce((sum, t) => sum + myCommission(t), 0)
  const paidCommission    = filteredTickets.filter(t => t.status === 'Paid').reduce((sum, t) => sum + myCommission(t), 0)
  const pendingCommission = totalCommission - paidCommission

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
    <div className="flex flex-col gap-5 animate-fade-in">

      {/* Title row + month picker */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-brand-500" />
          <h1 className="text-xl font-display font-bold text-gray-900">Earnings</h1>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
          <select
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="input-field text-sm py-1.5"
          >
            <option value="all">All Time</option>
            {monthOptions.map(m => (
              <option key={m} value={m}>
                {format(new Date(m + '-01'), 'MMMM yyyy')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Earnings statement ── */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-7 text-white">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">

          {/* Total */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <RoleIcon className="w-3.5 h-3.5 text-brand-300" />
              <p className="text-brand-200 text-xs font-sans font-semibold uppercase tracking-widest">
                {isTechnician ? 'Technician' : 'Staff'} Commission · {monthLabel}
              </p>
            </div>
            <p className="text-5xl font-display font-bold leading-none tracking-tight">
              {PESO(totalCommission)}
            </p>
            <p className="text-brand-300 text-sm font-body mt-2">
              {isTechnician ? '20% of labor fee' : '5% of net labor fee'}
              {' · '}
              {filteredTickets.length} job{filteredTickets.length !== 1 ? 's' : ''}
            </p>
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
                const isPaid     = t.status === 'Paid'
                return (
                  <tr key={t.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-500 truncate">
                      {t.ticket_id}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-sans font-semibold text-gray-800 text-xs truncate">{t.client_name}</p>
                      <p className="font-body text-gray-400 text-xs truncate">{t.unit_brand} {t.unit_model}</p>
                    </td>
                    <td className="px-4 py-3 text-xs font-body text-gray-400">
                      {format(new Date(t.created_at), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-gray-500">{PESO(fee)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono text-xs font-bold ${isPaid ? 'text-emerald-600' : 'text-brand-600'}`}>
                        {PESO(commission)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td colSpan={4} className="px-4 py-3 text-xs font-sans font-semibold text-gray-400 uppercase tracking-wide">
                  Total
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm font-bold text-brand-700">
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
