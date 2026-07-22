import { useState, useEffect } from 'react'
import {
  format, parseISO, startOfMonth, endOfMonth,
  subMonths, addMonths, eachDayOfInterval,
  getDay, isFuture, isToday as dateFnsIsToday,
} from 'date-fns'
import { Clock, LogIn, LogOut, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useRole } from '../../hooks/useRole.jsx'
import { getShiftHours, isOutsideShift, DEFAULT_SHIFT } from '../../lib/shift'

// Sessions are not capped — durations reflect real elapsed time (matches
// AttendancePage.jsx). This only scales the little progress bar visually.
const BAR_REF_MINUTES = 9 * 60

function sessionMins(loggedInAt, loggedOutAt) {
  if (!loggedOutAt) return null
  const ms = new Date(loggedOutAt) - new Date(loggedInAt)
  return Math.max(Math.floor(ms / 60000), 0)
}

function fmtDuration(mins) {
  if (mins === null) return null
  return `${Math.floor(mins / 60)}h ${(mins % 60).toString().padStart(2, '0')}m`
}

// ── Calendar heatmap ──────────────────────────────────────────────────────────

function MonthCalendar({ monthDate, presentDays, offShiftDays, presentColor, ringColor }) {
  const start = startOfMonth(monthDate)
  const end   = endOfMonth(monthDate)
  const days  = eachDayOfInterval({ start, end })

  // Monday-first offset
  const startDow  = getDay(start) // 0=Sun
  const offset    = startDow === 0 ? 6 : startDow - 1
  const blanks    = Array(offset).fill(null)

  return (
    <div>
      {/* Day-of-week labels */}
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-sans font-semibold text-gray-400 leading-none py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day tiles */}
      <div className="grid grid-cols-7 gap-1">
        {blanks.map((_, i) => <div key={`b${i}`} />)}
        {days.map(date => {
          const key     = format(date, 'yyyy-MM-dd')
          const present = presentDays.has(key)
          const future  = isFuture(date) && !dateFnsIsToday(date)
          const today   = dateFnsIsToday(date)

          return (
            <div
              key={key}
              title={present ? `Present · ${format(date, 'MMMM d')}` : format(date, 'MMMM d')}
              className={[
                'relative aspect-square rounded-md flex items-center justify-center leading-none',
                'text-[11px] font-mono transition-colors',
                present
                  ? `${presentColor} font-semibold`
                  : future
                    ? 'text-gray-200'
                    : 'bg-gray-100 text-gray-400',
                today ? `ring-2 ${ringColor} ring-offset-1` : '',
              ].join(' ')}
            >
              {date.getDate()}
              {present && offShiftDays.has(key) && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" title="At least one login outside shift hours" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MyAttendancePage() {
  const { staffUsername, staffName, isTechnician } = useRole()

  const [monthDate, setMonthDate] = useState(startOfMonth(new Date()))
  const [logs,      setLogs]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [shift,     setShift]     = useState(DEFAULT_SHIFT)

  useEffect(() => { getShiftHours().then(setShift) }, [])

  useEffect(() => {
    if (!staffUsername) return
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('username', staffUsername)
        .gte('logged_in_at', startOfMonth(monthDate).toISOString())
        .lte('logged_in_at', endOfMonth(monthDate).toISOString())
        .order('logged_in_at', { ascending: false })
      setLogs(data ?? [])
      setLoading(false)
    }
    load()
  }, [staffUsername, monthDate])

  const isCurrentMonth = format(monthDate, 'yyyy-MM') === format(new Date(), 'yyyy-MM')

  const presentDays = new Set(logs.map(l => format(parseISO(l.logged_in_at), 'yyyy-MM-dd')))
  const daysPresent = presentDays.size

  // Days with at least one off-shift login
  const dayShiftMap = logs.reduce((acc, l) => {
    const day = format(parseISO(l.logged_in_at), 'yyyy-MM-dd')
    if (isOutsideShift(l.logged_in_at, shift)) acc[day] = true
    return acc
  }, {})
  const offShiftDays = new Set(Object.entries(dayShiftMap).filter(([, v]) => v).map(([d]) => d))
  const totalMins   = logs.reduce((sum, l) => sum + (sessionMins(l.logged_in_at, l.logged_out_at) ?? 0), 0)
  const totalHours  = (totalMins / 60).toFixed(1)

  // Role-specific palette for the calendar and accents
  const palette = isTechnician
    ? { present: 'bg-accent-100 text-accent-700', ring: 'ring-accent-400', bar: 'bg-accent-400', text: 'text-accent-700' }
    : { present: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-400', bar: 'bg-emerald-400', text: 'text-emerald-700' }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header — kept as-is per brief */}
      <div className="-mx-5 -mt-5 lg:-mx-7 lg:-mt-7 bg-white border-b border-gray-200 mb-1">
        <div className="h-0.5 bg-gradient-to-r from-brand-500 to-accent-500" />
        <div className="px-5 lg:px-7 py-5">
          <h1 className="font-display text-4xl sm:text-5xl tracking-widest text-gray-900 leading-none">
            MY ATTENDANCE
          </h1>
          <p className="text-sm font-body text-gray-400 mt-2">
            {staffName ?? staffUsername}
          </p>
        </div>
      </div>

      {/* Month navigator */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setMonthDate(d => subMonths(d, 1))}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-sans font-semibold text-gray-800 w-36 text-center">
          {format(monthDate, 'MMMM yyyy')}
        </span>
        <button
          onClick={() => setMonthDate(d => addMonths(d, 1))}
          disabled={isCurrentMonth}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-25 disabled:pointer-events-none"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Body — calendar + stats/table side by side on desktop */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-5 items-start">

          {/* ── Left: calendar heatmap ── */}
          <div className="card p-5 shrink-0 w-full lg:w-56">
            <MonthCalendar
              monthDate={monthDate}
              presentDays={presentDays}
              offShiftDays={offShiftDays}
              presentColor={palette.present}
              ringColor={palette.ring}
            />

            {/* Legend */}
            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-x-3 gap-y-1.5 justify-center">
              <div className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded-sm ${palette.present.split(' ')[0]}`} />
                <span className="text-[10px] font-sans font-semibold text-gray-500">Present</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-gray-100" />
                <span className="text-[10px] font-sans font-semibold text-gray-500">Absent</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="relative w-3 h-3 rounded-sm bg-amber-100">
                  <span className="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-amber-400" />
                </div>
                <span className="text-[10px] font-sans font-semibold text-gray-500">Off-shift</span>
              </div>
            </div>
          </div>

          {/* ── Right: stats + session table ── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Stats bar */}
            <div className="card p-0 overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-gray-100">
                <div className="px-5 py-4 text-center">
                  <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-widest">Days Present</p>
                  <p className={`font-mono font-bold text-3xl mt-1 ${palette.text}`}>{daysPresent}</p>
                </div>
                <div className="px-5 py-4 text-center">
                  <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-widest">Hours Worked</p>
                  <p className="font-mono font-bold text-3xl mt-1 text-gray-900">{totalHours}</p>
                </div>
                <div className="px-5 py-4 text-center">
                  <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-widest">Sessions</p>
                  <p className="font-mono font-bold text-3xl mt-1 text-gray-900">{logs.length}</p>
                </div>
              </div>
            </div>

            {/* Session table */}
            {logs.length === 0 ? (
              <div className="card flex flex-col items-center justify-center py-14 gap-3 text-gray-300">
                <Clock className="w-10 h-10" />
                <p className="font-sans font-semibold text-sm text-gray-500">
                  No sessions in {format(monthDate, 'MMMM yyyy')}
                </p>
              </div>
            ) : (
              <div className="card overflow-hidden p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-5 py-3 font-sans font-semibold text-xs text-gray-400 uppercase tracking-wide">Date</th>
                      <th className="text-left px-5 py-3 font-sans font-semibold text-xs text-gray-400 uppercase tracking-wide">
                        <span className="inline-flex items-center gap-1"><LogIn className="w-3 h-3" /> In</span>
                      </th>
                      <th className="text-left px-5 py-3 font-sans font-semibold text-xs text-gray-400 uppercase tracking-wide hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1"><LogOut className="w-3 h-3" /> Out</span>
                      </th>
                      <th className="text-left px-5 py-3 font-sans font-semibold text-xs text-gray-400 uppercase tracking-wide">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {logs.map(log => {
                      const mins    = sessionMins(log.logged_in_at, log.logged_out_at)
                      const dur     = fmtDuration(mins)
                      const pct     = mins !== null ? Math.min((mins / BAR_REF_MINUTES) * 100, 100) : 0
                      const isToday = format(parseISO(log.logged_in_at), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')

                      return (
                        <tr key={log.id} className="hover:bg-gray-50/70 transition-colors">
                          <td className="px-5 py-3.5">
                            <p className="font-sans font-semibold text-gray-900 text-xs leading-tight">
                              {format(parseISO(log.logged_in_at), 'EEE')}
                            </p>
                            <p className="font-body text-gray-400 text-xs leading-tight">
                              {format(parseISO(log.logged_in_at), 'MMM d')}
                            </p>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="font-mono text-xs text-gray-700 tabular-nums">
                              {format(parseISO(log.logged_in_at), 'hh:mm a')}
                            </span>
                            {isOutsideShift(log.logged_in_at, shift) && (
                              <span className="inline-flex items-center gap-0.5 ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[9px] font-sans font-bold text-amber-600 leading-none align-middle">
                                <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                                Off-shift
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 hidden sm:table-cell">
                            {log.logged_out_at ? (
                              <span className="font-mono text-xs text-gray-700 tabular-nums">
                                {format(parseISO(log.logged_out_at), 'hh:mm a')}
                                {log.logout_reason === 'session_expired' && (
                                  <span className="ml-1.5 text-[9px] font-sans text-amber-500 font-semibold">(expired)</span>
                                )}
                              </span>
                            ) : isToday ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-sans font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                Active
                              </span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            {dur ? (
                              <div className="flex flex-col gap-1.5">
                                <span className="font-mono text-xs tabular-nums font-semibold text-gray-700">
                                  {dur}
                                </span>
                                <div className="h-1 w-16 bg-gray-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${palette.bar}`}
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            ) : isToday ? (
                              <span className="text-xs font-sans text-gray-400 italic">ongoing</span>
                            ) : (
                              <span className="text-xs font-sans text-gray-300 italic">unclosed</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
