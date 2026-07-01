import { useState, useEffect } from 'react'
import {
  format, parseISO, differenceInMinutes, startOfDay, endOfDay,
  startOfMonth, endOfMonth, subMonths, addMonths,
  eachDayOfInterval, getDay, isFuture, isToday as dateFnsIsToday,
} from 'date-fns'
import { Clock, Shield, Wrench, CalendarDays, Users, LogIn, LogOut, AlertTriangle, Pencil, Check, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getShiftHours, saveShiftHours, isOutsideShift, fmtShiftHour, DEFAULT_SHIFT } from '../../lib/shift'

const MAX_MINUTES = 9 * 60
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function sessionDurationMins(loggedInAt, loggedOutAt, now) {
  const end = loggedOutAt ? parseISO(loggedOutAt) : now
  return Math.min(Math.max(differenceInMinutes(end, parseISO(loggedInAt)), 0), MAX_MINUTES)
}

function formatDuration(mins) {
  return `${Math.floor(mins / 60)}h ${(mins % 60).toString().padStart(2, '0')}m`
}

function DurationBar({ mins, color }) {
  const pct = Math.min((mins / MAX_MINUTES) * 100, 100)
  return (
    <div className="flex flex-col gap-1.5 min-w-[80px]">
      <span className={`font-mono text-xs tabular-nums font-semibold ${color}`}>
        {formatDuration(mins)}
        {mins >= MAX_MINUTES && (
          <span className="ml-1 text-[9px] font-sans font-bold text-brand-500 tracking-wider">MAX</span>
        )}
      </span>
      <div className="h-1 rounded-full bg-gray-100 overflow-hidden w-20">
        <div
          className={`h-full rounded-full transition-all ${mins >= MAX_MINUTES ? 'bg-brand-400' : 'bg-current opacity-40'}`}
          style={{ width: `${pct}%`, color: mins >= MAX_MINUTES ? undefined : 'inherit' }}
        />
      </div>
    </div>
  )
}

function DurationCell({ log, now, isViewingToday, barColor }) {
  if (log.logged_out_at) {
    const mins = sessionDurationMins(log.logged_in_at, log.logged_out_at, now)
    return <DurationBar mins={mins} color={mins >= MAX_MINUTES ? 'text-brand-600' : 'text-gray-700'} />
  }
  if (isViewingToday) {
    const mins = sessionDurationMins(log.logged_in_at, null, now)
    return (
      <div className="flex flex-col gap-1.5 min-w-[80px]">
        <span className="font-mono text-xs tabular-nums font-semibold text-gray-700">
          {formatDuration(mins)}
          <span className="ml-1 text-[9px] font-sans font-bold text-emerald-500 tracking-wider">LIVE</span>
        </span>
        <div className="h-1 rounded-full bg-gray-100 overflow-hidden w-20">
          <div
            className="h-full rounded-full bg-emerald-400 animate-pulse"
            style={{ width: `${Math.min((mins / MAX_MINUTES) * 100, 100)}%` }}
          />
        </div>
      </div>
    )
  }
  return <span className="text-xs text-gray-300 font-body italic">unclosed</span>
}

function PersonCell({ name, username, initial, bg, text }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className={`w-8 h-8 rounded-full ${bg} flex items-center justify-center shrink-0`}>
        <span className={`text-xs font-sans font-bold uppercase ${text}`}>{initial}</span>
      </div>
      <div className="min-w-0">
        <p className="font-sans font-semibold text-gray-900 text-sm leading-tight truncate">
          {name ?? <span className="text-gray-400 font-normal italic">unnamed</span>}
        </p>
        {username && (
          <p className="font-mono text-[11px] text-gray-400 leading-tight truncate">{username}</p>
        )}
      </div>
    </div>
  )
}

const CAL_MAX_MINUTES = 9 * 60

function calSessionMins(loggedInAt, loggedOutAt) {
  if (!loggedOutAt) return null
  const ms = new Date(loggedOutAt) - new Date(loggedInAt)
  return Math.min(Math.max(Math.floor(ms / 60000), 0), CAL_MAX_MINUTES)
}

function calFmtDuration(mins) {
  if (mins === null) return null
  return `${Math.floor(mins / 60)}h ${(mins % 60).toString().padStart(2, '0')}m`
}

function MonthCalendar({ monthDate, presentDays, offShiftDays, presentColor, ringColor }) {
  const start  = startOfMonth(monthDate)
  const end    = endOfMonth(monthDate)
  const days   = eachDayOfInterval({ start, end })
  const offset = (d => d === 0 ? 6 : d - 1)(getDay(start))
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-sans font-semibold text-gray-400 leading-none py-0.5">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array(offset).fill(null).map((_, i) => <div key={`b${i}`} />)}
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
                'relative aspect-square rounded-md flex items-center justify-center text-[11px] font-mono transition-colors',
                present ? `${presentColor} font-semibold` : future ? 'text-gray-200' : 'bg-gray-100 text-gray-400',
                today ? `ring-2 ${ringColor} ring-offset-1` : '',
              ].join(' ')}
            >
              {date.getDate()}
              {present && offShiftDays.has(key) && (
                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-3 pt-2.5 border-t border-gray-100 flex flex-wrap items-center gap-x-3 gap-y-1.5 justify-center">
        <div className="flex items-center gap-1.5">
          <div className={`w-3 h-3 rounded-sm ${presentColor.split(' ')[0]}`} />
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
  )
}

function EmployeeCalendarModal({ target, shift, onClose }) {
  // target: { username, role, name } | null
  const [monthDate, setMonthDate] = useState(startOfMonth(new Date()))
  const [logs,      setLogs]      = useState([])
  const [loading,   setLoading]   = useState(false)

  useEffect(() => {
    if (!target) return
    setMonthDate(startOfMonth(new Date())) // reset to current month on new target
  }, [target?.username])

  useEffect(() => {
    if (!target) return
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('username', target.username.toLowerCase())
        .gte('logged_in_at', startOfMonth(monthDate).toISOString())
        .lte('logged_in_at', endOfMonth(monthDate).toISOString())
        .order('logged_in_at', { ascending: false })
      setLogs(data ?? [])
      setLoading(false)
    }
    load()
  }, [target, monthDate])

  if (!target) return null

  const isStaff  = target.role === 'Staff'
  const Icon     = isStaff ? Shield : Wrench
  const palette  = isStaff
    ? { icon: 'text-emerald-600 bg-emerald-50', present: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-400', bar: 'bg-emerald-400', stat: 'text-emerald-700' }
    : { icon: 'text-accent-600 bg-accent-50',   present: 'bg-accent-100 text-accent-700',   ring: 'ring-accent-400',   bar: 'bg-accent-400',   stat: 'text-accent-700' }

  const presentDays  = new Set(logs.map(l => format(parseISO(l.logged_in_at), 'yyyy-MM-dd')))
  const dayShiftMap  = logs.reduce((acc, l) => {
    const day = format(parseISO(l.logged_in_at), 'yyyy-MM-dd')
    if (acc[day] === undefined) acc[day] = true
    if (!isOutsideShift(l.logged_in_at, shift)) acc[day] = false
    return acc
  }, {})
  const offShiftDays = new Set(Object.entries(dayShiftMap).filter(([, v]) => v).map(([d]) => d))
  const daysPresent  = presentDays.size
  const totalMins    = logs.filter(l => l.logged_out_at).reduce((s, l) => s + (calSessionMins(l.logged_in_at, l.logged_out_at) ?? 0), 0)
  const totalHours   = (totalMins / 60).toFixed(1)
  const isThisMonth  = format(monthDate, 'yyyy-MM') === format(new Date(), 'yyyy-MM')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="card w-full max-w-2xl p-0 overflow-hidden flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${palette.icon} flex items-center justify-center shrink-0`}>
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <p className="font-sans font-bold text-gray-900 text-sm leading-none">
                {target.name ?? target.username}
              </p>
              <p className="text-xs font-mono text-gray-400 mt-0.5">{target.username}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Month navigator */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/60 shrink-0">
          <button
            onClick={() => setMonthDate(d => subMonths(d, 1))}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-white"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-gray-400" />
            <span className="font-sans font-semibold text-sm text-gray-700">{format(monthDate, 'MMMM yyyy')}</span>
          </div>
          <button
            onClick={() => setMonthDate(d => addMonths(d, 1))}
            disabled={isThisMonth}
            className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-white disabled:opacity-30 disabled:pointer-events-none"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <span className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-gray-100">

              {/* Left: calendar + stats */}
              <div className="shrink-0 sm:w-56 p-5 space-y-4">
                <MonthCalendar
                  monthDate={monthDate}
                  presentDays={presentDays}
                  offShiftDays={offShiftDays}
                  presentColor={palette.present}
                  ringColor={palette.ring}
                />
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-widest">Days Present</p>
                    <p className={`font-mono font-bold text-2xl mt-0.5 ${palette.stat}`}>{daysPresent}</p>
                  </div>
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-widest">Hours Worked</p>
                    <p className="font-mono font-bold text-2xl mt-0.5 text-gray-900">{totalHours}h</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-sans font-semibold text-gray-400 uppercase tracking-widest">Sessions</p>
                    <p className="font-mono font-bold text-2xl mt-0.5 text-gray-900">{logs.length}</p>
                  </div>
                </div>
              </div>

              {/* Right: session table */}
              <div className="flex-1 min-w-0">
                {logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-2">
                    <Clock className="w-8 h-8 text-gray-200" />
                    <p className="text-sm font-sans font-semibold text-gray-400">No sessions in {format(monthDate, 'MMMM yyyy')}</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white z-10 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-sans font-semibold text-xs text-gray-400 uppercase tracking-wide">Date</th>
                        <th className="text-left px-4 py-2.5 font-sans font-semibold text-xs text-gray-400 uppercase tracking-wide">
                          <span className="inline-flex items-center gap-1"><LogIn className="w-3 h-3" /> In</span>
                        </th>
                        <th className="text-left px-4 py-2.5 font-sans font-semibold text-xs text-gray-400 uppercase tracking-wide">
                          <span className="inline-flex items-center gap-1"><LogOut className="w-3 h-3" /> Out</span>
                        </th>
                        <th className="text-left px-4 py-2.5 font-sans font-semibold text-xs text-gray-400 uppercase tracking-wide">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {logs.map(log => {
                        const mins    = calSessionMins(log.logged_in_at, log.logged_out_at)
                        const capped  = mins !== null && mins >= CAL_MAX_MINUTES
                        const pct     = mins !== null ? Math.min((mins / CAL_MAX_MINUTES) * 100, 100) : 0
                        const isToday = format(parseISO(log.logged_in_at), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                        return (
                          <tr key={log.id} className="hover:bg-gray-50/70 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-sans font-semibold text-gray-900 text-xs leading-tight">{format(parseISO(log.logged_in_at), 'EEE')}</p>
                              <p className="font-body text-gray-400 text-xs leading-tight">{format(parseISO(log.logged_in_at), 'MMM d')}</p>
                            </td>
                            <td className="px-4 py-3">
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
                            <td className="px-4 py-3 font-mono tabular-nums text-xs">
                              {log.logged_out_at ? (
                                <span className="text-gray-700">
                                  {format(parseISO(log.logged_out_at), 'hh:mm a')}
                                  {log.logout_reason === 'session_expired' && (
                                    <span className="ml-1 text-[9px] font-sans text-amber-500 font-semibold">(expired)</span>
                                  )}
                                </span>
                              ) : isToday ? (
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-sans font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                                  Active
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {mins !== null ? (
                                <div className="flex flex-col gap-1.5">
                                  <span className={`font-mono text-xs tabular-nums font-semibold ${capped ? 'text-brand-600' : 'text-gray-700'}`}>
                                    {calFmtDuration(mins)}
                                    {capped && <span className="ml-1 text-[9px] font-sans font-bold text-brand-500 tracking-wider">MAX</span>}
                                  </span>
                                  <div className="h-1 w-14 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${capped ? 'bg-brand-400' : palette.bar}`} style={{ width: `${pct}%` }} />
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
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function personKey(l) {
  return (l.username ?? l.name ?? '').toLowerCase().trim()
}

function RoleSection({ label, icon, logs, now, isViewingToday, shift, onSelectPerson, emptyText, accentBar, headerBg, headerText, headerSubtext, avatarBg, avatarText }) {
  const uniquePeople = new Set(logs.map(personKey)).size

  // One row per person — most recent session only (logs arrive DESC from Supabase)
  const seen = new Set()
  const dedupedLogs = logs.filter(l => {
    const key = personKey(l)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return (
    <div className="card overflow-hidden p-0 relative">
      {/* Colored left accent strip */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${accentBar}`} />

      {/* Section header */}
      <div className={`pl-6 pr-5 py-4 border-b ${headerBg} flex items-center justify-between gap-4`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg ${avatarBg} flex items-center justify-center shrink-0`}>
            {icon}
          </div>
          <div>
            <p className={`text-sm font-sans font-bold ${headerText} leading-none`}>{label}</p>
            <p className={`text-xs font-body ${headerSubtext} mt-0.5`}>
              {uniquePeople} {uniquePeople === 1 ? 'person' : 'people'}
            </p>
          </div>
        </div>
      </div>

      {dedupedLogs.length === 0 ? (
        <div className="pl-6 flex items-center justify-center py-10 text-gray-400">
          <p className="text-sm font-body">{emptyText}</p>
        </div>
      ) : (
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="border-b border-gray-100 bg-white">
              <th className="w-[40%] text-left pl-6 pr-4 py-3 font-sans font-semibold text-xs text-gray-400 uppercase tracking-wide">Person</th>
              <th className="w-[22%] text-left px-4 py-3 font-sans font-semibold text-xs text-gray-400 uppercase tracking-wide">
                <span className="inline-flex items-center gap-1"><LogIn className="w-3 h-3" /> In</span>
              </th>
              <th className="w-[22%] text-left px-4 py-3 font-sans font-semibold text-xs text-gray-400 uppercase tracking-wide hidden md:table-cell">
                <span className="inline-flex items-center gap-1"><LogOut className="w-3 h-3" /> Out</span>
              </th>
              <th className="text-left px-4 py-3 font-sans font-semibold text-xs text-gray-400 uppercase tracking-wide">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {dedupedLogs.map(log => {
              const initial = (log.name ?? log.username ?? '?').charAt(0)
              return (
                <tr
                  key={log.id}
                  className="hover:bg-gray-50/70 transition-colors group cursor-pointer"
                  title="Click to view full attendance history"
                  onClick={() => onSelectPerson({ username: log.username, role: log.role, name: log.name })}
                >
                  <td className="pl-6 pr-4 py-3.5 max-w-0">
                    <PersonCell
                      name={log.name}
                      username={log.username}
                      initial={initial}
                      bg={avatarBg}
                      text={avatarText}
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-xs text-gray-700 tabular-nums">
                        {format(parseISO(log.logged_in_at), 'hh:mm a')}
                      </span>
                      {isOutsideShift(log.logged_in_at, shift) && (
                        <span className="inline-flex items-center gap-0.5 w-fit px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[9px] font-sans font-bold text-amber-600 leading-none">
                          <AlertTriangle className="w-2.5 h-2.5 shrink-0" />
                          Off-shift
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 hidden md:table-cell">
                    {log.logged_out_at ? (
                      <span className="font-mono text-xs text-gray-700 tabular-nums">
                        {format(parseISO(log.logged_out_at), 'hh:mm a')}
                        {log.logout_reason === 'session_expired' && (
                          <span className="ml-1.5 text-[9px] font-sans text-amber-500 font-semibold tracking-wide">(expired)</span>
                        )}
                      </span>
                    ) : isViewingToday ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-sans font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        Active
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <DurationCell log={log} now={now} isViewingToday={isViewingToday} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default function AttendancePage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [selectedDate, setSelectedDate] = useState(today)
  const [logs,         setLogs]         = useState([])
  const [loading,      setLoading]      = useState(true)
  const [now,          setNow]          = useState(new Date())

  // Shift hours
  const [shift,        setShift]        = useState(DEFAULT_SHIFT)
  const [editingShift, setEditingShift] = useState(false)
  const [draftStart,   setDraftStart]   = useState(DEFAULT_SHIFT.start)
  const [draftEnd,     setDraftEnd]     = useState(DEFAULT_SHIFT.end)
  const [shiftSaving,  setShiftSaving]  = useState(false)

  useEffect(() => {
    getShiftHours().then(s => { setShift(s); setDraftStart(s.start); setDraftEnd(s.end) })
  }, [])

  function openShiftEdit() { setDraftStart(shift.start); setDraftEnd(shift.end); setEditingShift(true) }
  function cancelShiftEdit() { setEditingShift(false) }

  async function handleSaveShift() {
    setShiftSaving(true)
    await saveShiftHours(draftStart, draftEnd)
    setShift({ start: draftStart, end: draftEnd })
    setEditingShift(false)
    setShiftSaving(false)
  }

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('attendance_logs')
        .select('*')
        .gte('logged_in_at', startOfDay(new Date(selectedDate)).toISOString())
        .lte('logged_in_at', endOfDay(new Date(selectedDate)).toISOString())
        .order('logged_in_at', { ascending: false })
      setLogs(data ?? [])
      setLoading(false)
    }
    load()
  }, [selectedDate])

  const [calendarTarget, setCalendarTarget] = useState(null)

  const isViewingToday = selectedDate === today
  const staffLogs      = logs.filter(l => l.role === 'Staff')
  const techLogs       = logs.filter(l => l.role === 'Technician')
  const uniqueStaff    = new Set(staffLogs.map(personKey)).size
  const uniqueTechs    = new Set(techLogs.map(personKey)).size
  const totalPresent   = uniqueStaff + uniqueTechs

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="-mx-5 -mt-5 lg:-mx-7 lg:-mt-7 bg-white border-b border-gray-200 mb-1">
        <div className="h-0.5 bg-gradient-to-r from-brand-500 to-accent-500" />
        <div className="px-5 lg:px-7 pt-5 pb-3">
          <h1 className="font-display text-4xl sm:text-5xl tracking-widest text-gray-900 leading-none">
            ATTENDANCE
          </h1>
          <p className="text-sm font-body text-gray-400 mt-2">
            {format(new Date(), 'EEEE, MMMM d, yyyy')}
          </p>
        </div>

        {/* Controls row */}
        <div className="px-5 lg:px-7 pb-4 space-y-2">
          {editingShift ? (
            <>
              {/* Shift editor: selects row */}
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <span className="text-xs font-sans font-semibold text-gray-500 shrink-0">Shift</span>
                <select
                  value={draftStart}
                  onChange={e => setDraftStart(Number(e.target.value))}
                  className="input-field py-1.5 text-xs flex-1"
                >
                  {HOURS.map(h => (
                    <option key={h} value={h} disabled={h >= draftEnd}>{fmtShiftHour(h)}</option>
                  ))}
                </select>
                <span className="text-xs text-gray-400 shrink-0">–</span>
                <select
                  value={draftEnd}
                  onChange={e => setDraftEnd(Number(e.target.value))}
                  className="input-field py-1.5 text-xs flex-1"
                >
                  {HOURS.map(h => (
                    <option key={h} value={h} disabled={h <= draftStart}>{fmtShiftHour(h)}</option>
                  ))}
                </select>
                <button
                  onClick={handleSaveShift}
                  disabled={shiftSaving}
                  className="p-2 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-50 shrink-0"
                  aria-label="Save shift hours"
                >
                  {shiftSaving
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin block" />
                    : <Check className="w-4 h-4" />
                  }
                </button>
                <button
                  onClick={cancelShiftEdit}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
                  aria-label="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Date picker — full row below shift editor */}
              <div className="flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                  type="date"
                  value={selectedDate}
                  max={today}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="input-field py-1.5 text-sm flex-1 sm:flex-none sm:w-40"
                />
              </div>
            </>
          ) : (
            /* Default state: shift button + date picker side by side */
            <div className="flex items-center gap-2">
              <button
                onClick={openShiftEdit}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-xs font-sans font-semibold text-gray-600 hover:bg-gray-50 hover:border-gray-300 transition-colors shrink-0"
              >
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <span className="hidden xs:inline">Shift: </span>{fmtShiftHour(shift.start)} – {fmtShiftHour(shift.end)}
                <Pencil className="w-3 h-3 text-gray-400" />
              </button>

              <div className="flex items-center gap-2 ml-auto">
                <CalendarDays className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                  type="date"
                  value={selectedDate}
                  max={today}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="input-field py-2 text-sm w-36 sm:w-40"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Summary strip */}
      {!loading && (
        <div className="grid grid-cols-3 sm:flex sm:items-center gap-2 sm:gap-3">
          <div className="col-span-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-brand-600 to-brand-800 text-white">
            <Users className="w-4 h-4 text-brand-300 shrink-0" />
            <div className="flex-1 sm:flex sm:items-center sm:gap-3">
              <span className="text-xs font-sans font-semibold text-brand-200 uppercase tracking-wide">Present</span>
              <span className="font-mono font-bold text-2xl sm:text-xl leading-none block sm:inline">{totalPresent}</span>
            </div>
          </div>

          <div className="h-8 w-px bg-gray-200 hidden sm:block" />

          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 px-3 py-2.5 sm:py-1.5 rounded-xl sm:rounded-lg bg-emerald-50 border border-emerald-200 items-center text-center sm:text-left">
            <Shield className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-[10px] sm:text-xs font-sans font-semibold text-emerald-600 uppercase tracking-wide">Staff</span>
            <span className="font-mono font-bold text-xl sm:text-base leading-none text-emerald-700">{uniqueStaff}</span>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 px-3 py-2.5 sm:py-1.5 rounded-xl sm:rounded-lg bg-accent-50 border border-accent-200 items-center text-center sm:text-left">
            <Wrench className="w-4 h-4 text-accent-500 shrink-0" />
            <span className="text-[10px] sm:text-xs font-sans font-semibold text-accent-600 uppercase tracking-wide">Techs</span>
            <span className="font-mono font-bold text-xl sm:text-base leading-none text-accent-700">{uniqueTechs}</span>
          </div>

          <p className="text-xs text-gray-400 font-body sm:ml-auto hidden sm:block">
            Duration capped at 9 hrs
          </p>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-300">
          <Clock className="w-12 h-12" />
          <p className="font-sans font-semibold text-base text-gray-500">No logins recorded</p>
          <p className="text-sm font-body text-gray-400">
            {isViewingToday
              ? 'Nobody has logged in today yet.'
              : `No login events on ${format(new Date(selectedDate), 'MMMM d, yyyy')}.`}
          </p>
        </div>
      ) : (
        <>
          <RoleSection
            label="Staff"
            icon={<Shield className="w-3.5 h-3.5 text-emerald-600" />}
            logs={staffLogs}
            now={now}
            isViewingToday={isViewingToday}
            shift={shift}
            onSelectPerson={setCalendarTarget}
            emptyText="No staff logins on this date"
            accentBar="bg-emerald-400"
            headerBg="bg-emerald-50/60 border-emerald-100"
            headerText="text-emerald-900"
            headerSubtext="text-emerald-600/70"
            avatarBg="bg-emerald-100"
            avatarText="text-emerald-700"
          />
          <RoleSection
            label="Technicians"
            icon={<Wrench className="w-3.5 h-3.5 text-accent-600" />}
            logs={techLogs}
            now={now}
            isViewingToday={isViewingToday}
            shift={shift}
            onSelectPerson={setCalendarTarget}
            emptyText="No technician logins on this date"
            accentBar="bg-accent-400"
            headerBg="bg-accent-50/60 border-accent-100"
            headerText="text-accent-900"
            headerSubtext="text-accent-600/70"
            avatarBg="bg-accent-100"
            avatarText="text-accent-700"
          />
        </>
      )}

      {/* Employee calendar modal */}
      {calendarTarget && (
        <EmployeeCalendarModal
          target={calendarTarget}
          shift={shift}
          onClose={() => setCalendarTarget(null)}
        />
      )}
    </div>
  )
}
