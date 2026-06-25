/**
 * @file DashboardLayout.jsx
 * @description Root layout shell for the staff dashboard.
 *
 * Renders a fixed-width sidebar (collapsible to a slide-out drawer on mobile)
 * and a main content area where nested routes render via <Outlet />.
 *
 * Responsibilities:
 *   - Navigation (Overview, All Tickets, Notifications)
 *   - Role badge display
 *   - "Flush Database" admin action (password-protected)
 *   - Sign-out
 *   - Mobile sidebar backdrop + toggle
 *
 * // REVIEW: The sidebar nav items inline the same Tailwind utility strings
 * // that are also defined as .sidebar-nav-active / .sidebar-nav-inactive in
 * // index.css. Consider using those classes instead to create a single source
 * // of truth (see index.css REVIEW notes).
 */

import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Ticket, LogOut, Menu, ExternalLink,
  Shield, ShieldCheck, Wrench, Bell, ClipboardList, Settings, Users, UserCircle, X, BarChart2, TrendingUp, Banknote,
} from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications.jsx'
import { useAuth }          from '../../hooks/useAuth.jsx'
import { useRole }          from '../../hooks/useRole.jsx'
import { supabase }         from '../../lib/supabase'
import Logo                 from '../../components/ui/Logo.jsx'
import PushPermissionPrompt from '../../components/ui/PushPermissionPrompt.jsx'

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Sidebar navigation items.
 * `exact: true` means the item is only active when the pathname matches exactly
 * (used for Overview at '/' to avoid matching all routes).
 * `id: 'notifications'` is used to conditionally render the unread badge.
 */
const NAV = [
  { to: '/',             label: 'Overview',      icon: LayoutDashboard, exact: true },
  { to: 'tickets',       label: 'All Tickets',   icon: Ticket },
  { to: 'tasks',         label: 'Tasks',         icon: ClipboardList,  id: 'tasks' },
  { to: 'analytics',     label: 'Analytics',     icon: BarChart2,      adminOnly: true },
  { to: 'payroll',       label: 'Payroll',       icon: Banknote,       adminOnly: true },
  { to: 'accounts',      label: 'Accounts',      icon: Users,          adminOnly: true },
  { to: 'earnings',      label: 'Earnings',      icon: TrendingUp,     staffOrTech: true },
  { to: 'notifications', label: 'Notifications', icon: Bell,           id: 'notifications' },
  { to: 'settings',      label: 'Settings',      icon: Settings },
]

/**
 * Cap on the notification badge number before showing "99+".
 * Avoids the badge becoming too wide for the sidebar nav item.
 */
const NOTIFICATION_BADGE_MAX = 99

// ── Page component ─────────────────────────────────────────────────────────────

/** DashboardLayout — the persistent shell rendered for all dashboard routes. */
export default function DashboardLayout() {
  const { logout }               = useAuth()
  const { role, clearRole, getAllowedTransitions, isAdmin, isStaff, isTechnician, staffUsername, staffName, setStaffName } = useRole()
  const { unseenCount }          = useNotifications()
  const [taskCount, setTaskCount] = useState(0)
  const location                 = useLocation()
  const navigate                 = useNavigate()

  const [sidebarOpen, setSidebarOpen] = useState(false)

  // First-login name setup — shown when a Staff account has no display name yet.
  const needsName = isStaff && staffUsername && !staffName
  const [nameInput,  setNameInput]  = useState('')
  const [nameError,  setNameError]  = useState('')
  const [nameSaving, setNameSaving] = useState(false)

  async function handleSetName(e) {
    e?.preventDefault()
    const trimmed = nameInput.trim()
    if (!trimmed)        { setNameError('Please enter your name.'); return }
    if (trimmed.length > 80) { setNameError('Name must be 80 characters or fewer.'); return }
    setNameSaving(true); setNameError('')
    try {
      const { data, error } = await supabase.functions.invoke('staff-manage', {
        body: { action: 'set-name', username: staffUsername, name: trimmed },
      })
      if (error || !data?.ok) throw new Error(data?.error || 'Failed to save name.')
      setStaffName(trimmed)
    } catch (err) {
      setNameError(err.message)
    } finally {
      setNameSaving(false)
    }
  }

  // Fetch task count separately with a unique channel name to avoid
  // conflicting with the 'tickets-live' channel used by child pages.
  useEffect(() => {
    if (!role) { setTaskCount(0); return }

    async function fetchCount() {
      const { data } = await supabase.from('tickets').select('status, diagnosis_notes, quotation_amount')
      if (data) setTaskCount(data.filter(t => getAllowedTransitions(t).length > 0).length)
    }
    fetchCount()

    const channel = supabase
      .channel('sidebar-task-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, fetchCount)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [role, getAllowedTransitions])

  /**
   * Clear auth and role state, then redirect to login.
   * logout() clears the shared session record AND removes this device's
   * push subscription; clearRole() resets the in-memory role.
   */
  function handleLogout() {
    clearRole()
    logout()
    navigate('/login', { replace: true })
  }

  /**
   * Determine if a nav item should render as active.
   * `exact` mode checks for strict pathname equality (prevents '/' from
   * matching every route that starts with '/').
   *
   * @param {string}  path  - The nav item's `to` value.
   * @param {boolean} exact - Whether to use exact matching.
   * @returns {boolean}
   */
  const isActive = (path, exact) =>
    exact
      ? location.pathname === path
      : location.pathname.startsWith('/' + path)

  // ── Derived role display values ──────────────────────────────────────────

  // role can be null during the brief window between mount and session read.
  // Admin & Staff share the brand palette (queue side); Technician uses accent.
  const RoleIcon  = role === 'Admin' ? ShieldCheck : role === 'Staff' ? Shield : Wrench
  const roleColor = role === 'Admin' ? 'text-brand-400' : role === 'Staff' ? 'text-emerald-400' : 'text-accent-400'
  const roleBg    = role === 'Admin'
    ? 'bg-brand-900/30 border-brand-700/40'
    : role === 'Staff'
      ? 'bg-emerald-900/30 border-emerald-700/40'
      : 'bg-accent-900/30 border-accent-700/40'

  // ── Sidebar content (extracted so it can be shared by both desktop and mobile) ──

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-dark-900">

      {/* Logo + subtitle */}
      <div className="px-5 pt-6 pb-4 border-b border-dark-700/80 relative">
        {/* Thin brand gradient rule below logo — visual continuity with brand colors */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-brand-600/50 via-accent-600/30 to-transparent" />
        <Logo size="md" />
        <span className="block text-xs font-mono text-gray-500 mt-2 tracking-[0.2em] uppercase">
          Staff Dashboard
        </span>
      </div>

      {/* Role badge + name/username */}
      {role && (
        <div className="px-4 py-3 border-b border-dark-700">
          <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${roleBg}`}>
            <RoleIcon className={`w-4 h-4 shrink-0 ${roleColor}`} />
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-sans font-bold tracking-wide leading-none ${roleColor}`}>{role}</p>
              {staffName && (
                <p className="text-[12px] font-sans font-semibold text-gray-200 truncate mt-1 leading-none">{staffName}</p>
              )}
              {staffUsername && !staffName && (
                <p className="text-[11px] font-mono text-gray-400 truncate mt-1 leading-none">{staffUsername}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV.filter(item => {
          if (item.adminOnly) return isAdmin
          if (item.staffOrTech) return isStaff || isTechnician
          return true
        }).map(({ to, label, icon: Icon, exact, id }) => (
          <Link
            key={to}
            to={to}
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans font-semibold tracking-wide transition-all duration-200
              ${isActive(to, exact)
                ? 'bg-gradient-to-r from-brand-600/25 to-brand-600/5 text-brand-200 border border-brand-500/30 shadow-sm'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200 border border-transparent'
              }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {/* Notification badge — only on the Notifications nav item */}
            {id === 'notifications' && unseenCount > 0 && (
              <span className="ml-auto min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-accent-500 text-white text-xs font-mono font-bold leading-none">
                {unseenCount > NOTIFICATION_BADGE_MAX ? `${NOTIFICATION_BADGE_MAX}+` : unseenCount}
              </span>
            )}
            {/* Tasks badge — pending tasks for the current role */}
            {id === 'tasks' && taskCount > 0 && (
              <span className="ml-auto min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-brand-600 text-white text-xs font-mono font-bold leading-none">
                {taskCount > NOTIFICATION_BADGE_MAX ? `${NOTIFICATION_BADGE_MAX}+` : taskCount}
              </span>
            )}
          </Link>
        ))}

        {/* External link to the public submission form */}
        <div className="pt-2 mt-1 border-t border-dark-700">
          <a                        
            href="/submit"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans font-semibold tracking-wide text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-all"
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            Public Form
          </a>
        </div>
      </nav>

      {/* Sign out */}
      <div className="p-3 border-t border-dark-700">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-sans font-semibold tracking-wide text-gray-500 hover:bg-white/5 hover:text-gray-300 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  )

  // ── Layout render ────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-900 flex">

      {/* Mobile backdrop — closes sidebar when tapped */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — fixed on mobile (slide-in drawer), static on desktop */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 flex flex-col
        transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <SidebarContent />
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar with hamburger and logo */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-dark-900 border-b border-dark-700">
          <button
            onClick={() => setSidebarOpen(true)}
            className="relative p-1.5 text-gray-400 hover:text-white"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Logo size="xs" />
        </header>

        <main className="flex-1 flex flex-col p-5 lg:p-7 dash-bg min-h-0">
          {/* Push-notification enable banner (renders nothing once granted/snoozed) */}
          <PushPermissionPrompt />
          {/* Child routes (DashboardHome, TicketListPage, etc.) render here */}
          <Outlet />
        </main>
      </div>

      {/* ── First-login: set display name ── */}
      {needsName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="card w-full max-w-sm p-6 space-y-5 animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                <UserCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="font-sans font-bold text-gray-900 text-base">Welcome, {staffUsername}!</h2>
                <p className="text-xs font-body text-gray-500 mt-0.5">Set a display name before you continue.</p>
              </div>
            </div>

            <form onSubmit={handleSetName} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-wide">
                  Your Name
                </label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={e => { setNameInput(e.target.value); setNameError('') }}
                  className="input-field"
                  placeholder="e.g. Juan dela Cruz"
                  autoFocus
                  autoComplete="name"
                  maxLength={80}
                />
                <p className="text-xs font-body text-gray-400">
                  This is how you'll appear across the dashboard.
                </p>
                {nameError && (
                  <p className="text-xs text-red-500 font-sans">{nameError}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={nameSaving || !nameInput.trim()}
                className="btn-primary w-full justify-center disabled:opacity-50 disabled:pointer-events-none"
              >
                {nameSaving
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : 'Save & Continue'
                }
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}