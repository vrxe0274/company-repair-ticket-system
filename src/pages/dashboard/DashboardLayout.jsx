import { useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Ticket, LogOut, Menu, ExternalLink, Trash2, X, Shield, Wrench } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useRole } from '../../hooks/useRole.jsx'
import { supabase } from '../../lib/supabase'
import Logo from '../../components/ui/Logo.jsx'

const NAV = [
  { to: '/dashboard',         label: 'Overview',    icon: LayoutDashboard, exact: true },
  { to: '/dashboard/tickets', label: 'All Tickets', icon: Ticket },
]

export default function DashboardLayout() {
  const { logout }         = useAuth()
  const { role, clearRole, isAdmin } = useRole()
  const location           = useLocation()
  const navigate           = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [showFlush,  setShowFlush]  = useState(false)
  const [flushInput, setFlushInput] = useState('')
  const [flushError, setFlushError] = useState('')
  const [flushing,   setFlushing]   = useState(false)
  const [flushDone,  setFlushDone]  = useState(false)

  function handleLogout() {
    clearRole()
    logout()
    navigate('/login', { replace: true })
  }

  const isActive = (path, exact) =>
    exact ? location.pathname === path : location.pathname.startsWith(path)

  async function handleFlush() {
    const adminPw = import.meta.env.VITE_ADMIN_PASSWORD
    if (!adminPw || flushInput !== adminPw) {
      setFlushError('Incorrect admin password.')
      return
    }
    setFlushing(true)
    try {
      const { data: storageList } = await supabase.storage.from('repair-photos').list()
      if (storageList?.length) {
        await supabase.storage.from('repair-photos').remove(storageList.map(f => f.name))
      }
      await supabase.from('tickets').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      setFlushDone(true)
      setShowFlush(false)
      setFlushInput('')
      setFlushError('')
      setTimeout(() => setFlushDone(false), 3000)
    } catch (err) {
      setFlushError('Failed: ' + err.message)
    } finally {
      setFlushing(false)
    }
  }

  const roleIcon  = role === 'Admin' ? Shield : Wrench
  const RoleIcon  = roleIcon
  const roleColor = role === 'Admin' ? 'text-brand-400' : 'text-accent-400'
  const roleBg    = role === 'Admin' ? 'bg-brand-900/30 border-brand-700/40' : 'bg-accent-900/30 border-accent-700/40'

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-dark-900">
      {/* Logo */}
      <div className="px-5 pt-6 pb-4 border-b border-dark-700">
        <Logo size="md" />
        <span className="block text-[10px] font-mono text-gray-500 mt-2 tracking-[0.2em] uppercase">Staff Dashboard</span>
      </div>

      {/* Role badge */}
      {role && (
        <div className="px-4 py-3 border-b border-dark-700">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${roleBg}`}>
            <RoleIcon className={`w-3.5 h-3.5 shrink-0 ${roleColor}`} />
            <span className={`text-xs font-sans font-semibold tracking-wider ${roleColor}`}>{role}</span>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ to, label, icon: Icon, exact }) => (
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
            {label}
          </Link>
        ))}

        <div className="pt-2 mt-1 border-t border-dark-700">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-sans font-semibold tracking-wide text-gray-400 hover:bg-white/5 hover:text-gray-200 transition-all"
          >
            <ExternalLink className="w-4 h-4 shrink-0" />
            Public Form
          </a>
        </div>
      </nav>

      {/* Flush DB — admin only */}
      {isAdmin && (
        <div className="p-3 border-t border-dark-700">
          {flushDone && (
            <div className="px-3 py-2 mb-2 rounded-lg bg-green-900/40 text-green-400 text-xs font-sans font-semibold">
              ✓ Database flushed
            </div>
          )}

          {!showFlush ? (
            <button
              onClick={() => setShowFlush(true)}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-sans font-semibold tracking-wide text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-all"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              Flush Database
            </button>
          ) : (
            <div className="bg-red-950/40 border border-red-900/50 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-sans font-semibold text-red-400 uppercase tracking-wider">Confirm Flush</span>
                <button onClick={() => { setShowFlush(false); setFlushInput(''); setFlushError('') }} className="text-gray-500 hover:text-gray-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <input
                type="password"
                value={flushInput}
                onChange={e => { setFlushInput(e.target.value); setFlushError('') }}
                className="w-full bg-dark-800 border border-dark-600 text-white text-xs rounded-lg px-3 py-2 placeholder-gray-600 focus:outline-none focus:border-red-700"
                placeholder="Admin password"
                autoFocus
              />
              {flushError && <p className="text-[10px] text-red-400">{flushError}</p>}
              <button
                onClick={handleFlush}
                disabled={flushing || !flushInput}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-xs font-sans font-semibold tracking-wide transition-colors disabled:opacity-50"
              >
                {flushing
                  ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Trash2 className="w-3 h-3" /> Delete All Tickets</>
                }
              </button>
            </div>
          )}
        </div>
      )}

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

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 flex flex-col
        transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <SidebarContent />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-dark-900 border-b border-dark-700">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 text-gray-400 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <Logo size="xs" />
        </header>

        <main className="flex-1 p-5 lg:p-7 bg-gray-50">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
