import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Lock, Eye, EyeOff, ShieldCheck, Wrench, Shield } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole, ROLES } from '../hooks/useRole.jsx'
import Logo from '../components/ui/Logo.jsx'

export default function LoginPage() {
  const { loginWithRole, authenticated } = useAuth()
  const { setRole }                      = useRole()
  const navigate                         = useNavigate()

  const [password, setPassword] = useState('')
  const [show,     setShow]     = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  if (authenticated) {
    navigate('/', { replace: true })
    return null
  }

  function handleRoleLogin(selectedRole) {
    if (!password) { setError('Please enter your password.'); return }
    setLoading(true)
    setError('')
    setTimeout(() => {
      const ok = loginWithRole(password, selectedRole)
      if (ok) {
        setRole(selectedRole)
        navigate('/', { replace: true })
      } else {
        setError(`Incorrect password for ${selectedRole}.`)
        setPassword('')
      }
      setLoading(false)
    }, 400)
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Left dark brand panel ── */}
      <div className="hidden lg:flex flex-col justify-between w-96 relative overflow-hidden bg-dark-900 p-10 shrink-0">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 -left-20 w-72 h-72 rounded-full opacity-30"
            style={{ background: 'radial-gradient(circle, #7317e8, transparent 70%)' }} />
          <div className="absolute bottom-1/4 -right-20 w-72 h-72 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #d4007f, transparent 70%)' }} />
        </div>
        <div className="relative z-10"><Logo size="lg" /></div>
        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-700/50 bg-brand-900/30">
            <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
            <span className="text-xs font-mono text-brand-300 tracking-wider">STAFF PORTAL</span>
          </div>
          <p className="text-white text-xl font-sans font-bold leading-snug">
            Manage repair tickets and track your workflow.
          </p>
          <p className="text-gray-500 text-sm font-body">For authorized VRXE staff only.</p>
        </div>
        <p className="relative z-10 text-gray-600 text-xs font-mono">© {new Date().getFullYear()} VRXE</p>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm animate-slide-up">

          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex justify-center">
            <div className="bg-dark-900 rounded-2xl p-4 inline-block">
              <Logo size="md" />
            </div>
          </div>

          <div className="mb-8">
            <h1 className="font-display text-4xl tracking-widest text-gray-900 mb-1">SIGN IN</h1>
            <p className="text-gray-400 font-body text-sm">
              Enter your password, then click your role to log in
            </p>
          </div>

          {/* Password field */}
          <div className="mb-6">
            <label className="label">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                className="input-field pl-10 pr-10"
                placeholder="Enter your password"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleRoleLogin(ROLES.ADMIN)}
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && (
              <p className="text-xs text-red-500 mt-1.5 font-body flex items-center gap-1">
                <span className="w-1 h-1 bg-red-500 rounded-full" />
                {error}
              </p>
            )}
          </div>

          {/* Role login buttons */}
          <p className="text-xs font-sans font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Sign in as
          </p>
          <div className="space-y-3">
            <RoleButton
              icon={Shield}
              label="Admin"
              description="Approve / deny tickets, manage queue, mark as paid"
              color="brand"
              loading={loading}
              onClick={() => handleRoleLogin(ROLES.ADMIN)}
            />
            <RoleButton
              icon={Wrench}
              label="Technician"
              description="Update repair progress, add notes and photos"
              color="accent"
              loading={loading}
              onClick={() => handleRoleLogin(ROLES.TECHNICIAN)}
            />
          </div>

          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <Link to="/submit" className="text-xs text-gray-400 hover:text-gray-600 transition-colors font-body">
              ← Back to ticket submission
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function RoleButton({ icon: Icon, label, description, color, loading, onClick }) {
  const styles = {
    brand: {
      border: 'border-brand-200 hover:border-brand-500 active:border-brand-600',
      bg:     'hover:bg-brand-50',
      icon:   'bg-brand-100 text-brand-700',
      text:   'text-brand-700',
    },
    accent: {
      border: 'border-accent-200 hover:border-accent-500 active:border-accent-600',
      bg:     'hover:bg-accent-50',
      icon:   'bg-accent-100 text-accent-700',
      text:   'text-accent-700',
    },
  }
  const s = styles[color]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed ${s.border} ${s.bg}`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${s.icon}`}>
        {loading
          ? <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          : <Icon className="w-6 h-6" />
        }
      </div>
      <div>
        <p className={`font-sans font-bold text-base tracking-wide ${s.text}`}>{label}</p>
        <p className="text-sm font-body text-gray-500 mt-0.5">{description}</p>
      </div>
    </button>
  )
}
