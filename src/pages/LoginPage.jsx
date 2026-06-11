/**
 * @file LoginPage.jsx
 * @description Staff login page. Presents a password field and two role
 * buttons (Admin / Technician). On success, stores the role in context and
 * redirects to the dashboard root.
 *
 * Auth flow:
 *   1. User enters password and clicks a role button.
 *   2. loginWithRole() compares against the matching VITE_*_PASSWORD env var.
 *   3. On success, setRole() persists the role to sessionStorage via RoleProvider.
 *   4. navigate('/') → ProtectedRoute lets them through.
 */

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Lock, Eye, EyeOff, ShieldCheck, Wrench, Shield } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole, ROLES } from '../hooks/useRole.jsx'
import { isStandalone } from '../lib/session'
import Logo from '../components/ui/Logo.jsx'

// ── Constants ──────────────────────────────────────────────────────────────────

/** Delay (ms) added before processing login to mask timing attacks. */
const LOGIN_DELAY_MS = 400

/**
 * Per-role visual config for the RoleButton component.
 * Keyed by the role's colour family to keep the ternary logic out of JSX.
 */
const ROLE_BUTTON_STYLES = {
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

// ── Sub-components ─────────────────────────────────────────────────────────────

/**
 * RoleButton — a large role-selector button shown on the login form.
 *
 * @param {React.ElementType} icon       - Lucide icon component.
 * @param {string}            label      - Role display name.
 * @param {string}            description - Short capability description.
 * @param {'brand'|'accent'}  color      - Colour family key.
 * @param {boolean}           loading    - Disables and shows spinner when true.
 * @param {Function}          onClick    - Called when the button is pressed.
 */
function RoleButton({ icon: Icon, label, description, color, loading, onClick }) {
  const s = ROLE_BUTTON_STYLES[color]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border-2
                  transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed
                  ${s.border} ${s.bg}`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${s.icon}`}>
        {loading
          ? <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          : <Icon className="w-6 h-6" />
        }
      </div>
      <div>
        <p className={`font-sans font-bold text-base tracking-wide ${s.text}`}>{label}</p>
        <p className="text-sm font-body text-gray-600 mt-0.5">{description}</p>
      </div>
    </button>
  )
}

// ── Page component ─────────────────────────────────────────────────────────────

/**
 * LoginPage — the staff authentication gate.
 * Redirects immediately to '/' if the session is already authenticated.
 */
export default function LoginPage() {
  const { loginWithRole, authenticated } = useAuth()
  const { setRole }                      = useRole()
  const navigate                         = useNavigate()

  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  // Installed PWA → always stay signed in; browser → user-controlled toggle.
  const standalone = isStandalone()
  const [rememberMe, setRememberMe] = useState(true)

  // Guard: already authenticated — redirect without rendering the form.
  if (authenticated) {
    navigate('/', { replace: true })
    return null
  }

  /**
   * Attempt login for the given role. The artificial delay prevents
   * response-timing attacks from revealing whether the password was close.
   *
   * @param {string} selectedRole - One of ROLES.ADMIN | ROLES.TECHNICIAN
   */
  function handleRoleLogin(selectedRole) {
    if (!password) {
      setError('Please enter your password.')
      return
    }
    setLoading(true)
    setError('')

    setTimeout(() => {
      const ok = loginWithRole(password, selectedRole, { rememberMe: standalone || rememberMe })
      if (ok) {
        setRole(selectedRole)
        navigate('/', { replace: true })
      } else {
        setError(`Incorrect password for ${selectedRole}.`)
        setPassword('')
      }
      setLoading(false)
    }, LOGIN_DELAY_MS)
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Left decorative panel (desktop only) ── */}
      <div className="hidden lg:flex flex-col justify-between w-96 relative overflow-hidden bg-dark-900 p-10 shrink-0">
        {/* Ambient radial gradients — purely decorative */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute top-1/4 -left-20 w-72 h-72 rounded-full opacity-30"
            style={{ background: 'radial-gradient(circle, #7317e8, transparent 70%)' }}
          />
          <div
            className="absolute bottom-1/4 -right-20 w-72 h-72 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #d4007f, transparent 70%)' }}
          />
        </div>

        <div className="relative z-10">
          <Logo size="lg" />
        </div>

        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-brand-700/50 bg-brand-900/30">
            <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
            <span className="text-xs font-mono text-brand-300 tracking-wider">STAFF PORTAL</span>
          </div>
          <p className="text-white text-xl font-sans font-bold leading-snug">
            Manage repair tickets and track your workflow.
          </p>
          <p className="text-gray-400 text-base font-body">For authorized VRXE staff only.</p>
        </div>

        <p className="relative z-10 text-gray-600 text-xs font-mono">
          © {new Date().getFullYear()} VRXE
        </p>
      </div>

      {/* ── Right login panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-sm animate-slide-up">

          {/* Mobile logo (hidden on desktop where the left panel shows it) */}
          <div className="lg:hidden mb-8 flex justify-center">
            <div className="bg-dark-900 rounded-2xl p-4 inline-block">
              <Logo size="md" />
            </div>
          </div>

          <div className="mb-8">
            <h1 className="font-display text-4xl tracking-widest text-gray-900 mb-1">SIGN IN</h1>
            <p className="text-gray-500 font-body text-base">
              Enter your password, then click your role to log in
            </p>
          </div>

          {/* Password field */}
          <div className="mb-6">
            <label className="label">Password</label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                className="input-field pl-10 pr-10"
                placeholder="Enter your password"
                autoFocus
                // Allow Enter to trigger Admin login (the most common role)
                onKeyDown={e => e.key === 'Enter' && handleRoleLogin(ROLES.ADMIN)}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-500 mt-1.5 font-body flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
                {error}
              </p>
            )}
          </div>

          {/* Remember me — hidden in installed PWA where persistence is always on */}
          {standalone ? (
            <p className="text-xs font-body text-gray-400 mb-6">
              Installed app — you&apos;ll stay signed in on this device.
            </p>
          ) : (
            <label className="flex items-center gap-2.5 mb-6 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={e => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm font-body text-gray-600">
                Remember me on this device (30 days)
              </span>
            </label>
          )}

          {/* Role login buttons */}
          <p className="text-xs font-sans font-semibold text-gray-500 uppercase tracking-widest mb-3">
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
            <Link
              to="/submit"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors font-body"
            >
              ← Back to ticket submission
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}