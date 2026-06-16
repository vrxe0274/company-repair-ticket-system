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
  Shield, Wrench, Bell, ClipboardList,
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
  { to: 'tasks',         label: 'Tasks',         icon: ClipboardList, id: 'tasks' },
  { to: 'tickets',       label: 'All Tickets',   icon: Ticket },
  { to: 'notifications', label: 'Notifications', icon: Bell, id: 'notifications' },
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
  const { role, clearRole, isAdmin, getAllowedTransitions } = useRole()
  const { unseenCount }          = useNotifications()
  const [taskCount, setTaskCount] = useState(0)
  const location                 = useLocation()
  const navigate                 = useNavigate()

  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Fetch task count separately with a unique channel name to avoid
  // conflicting with the 'tickets-live' channel used by child pages.
  useEffect(() => {
    if (!role) { setTaskCount(0); return }

    async function fetchCount() {
      const { data } = await supabase.from('tickets').select('status')
      if (data) setTaskCount(data.filter(t => getAllowedTransitions(t.status).length > 0).length)
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

  // role can be null during the brief window between mount and sessionStorage read.
  const RoleIcon  = role === 'Admin' ? Shield : Wrench
  const roleColor = role === 'Admin' ? 'text-brand-400'              : 'text-accent-400'
  const roleBg    = role === 'Admin' ? 'bg-brand-900/30 border-brand-700/40' : 'bg-accent-900/30 border-accent-700/40'

  // ── Sidebar content (extracted so it can be shared by both desktop and mobile) ──

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-dark-900">

      {/* Logo + subtitle */}
      <div className="px-5 pt-6 pb-4 border-b border-dark-700">
        <Logo size="md" />
        <span className="block text-xs font-mono text-gray-500 mt-2 tracking-[0.2em] uppercase">
          Staff Dashboard
        </span>
      </div>

      {/* Role badge */}
      {role && (
        <div className="px-4 py-3 border-b border-dark-700">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${roleBg}`}>
            <RoleIcon className={`w-3.5 h-3.5 shrink-0 ${roleColor}`} />
            <span className={`text-xs font-sans font-semibold ${roleColor}`}>{role}</span>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ to, label, icon: Icon, exact, id }) => (
          <Link
            key={to}
            to={to}
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans font-semibold tracking-wide transition-all duration-150
              ${isActive(to, exact)
                ? 'bg-brand-600/20 text-brand-300 border border-brand-600/30'
                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
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
    <div className="min-h-screen bg-gray-50 flex">

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

        <main className="flex-1 flex flex-col p-5 lg:p-7 bg-gray-50 min-h-0">
          {/* Push-notification enable banner (renders nothing once granted/snoozed) */}
          <PushPermissionPrompt />
          {/* Child routes (DashboardHome, TicketListPage, etc.) render here */}
          <Outlet />
        </main>
      </div>
    </div>
  )
}