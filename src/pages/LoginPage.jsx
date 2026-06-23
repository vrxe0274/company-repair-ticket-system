/**
 * @file LoginPage.jsx
 * @description Staff login page — two-step flow:
 *
 *   Step 1: Pick a role (Admin / Staff / Technician).
 *   Step 2: Enter the password for that role.
 *
 * There is no username — the password alone determines access per role.
 *
 * Auth flow:
 *   1. User selects a role, then enters the role's password.
 *   2. loginWithRole() verifies the password server-side (verify-login).
 *   3. On success, setRole() persists the role to the session via RoleProvider.
 *   4. navigate('/') → ProtectedRoute lets them through.
 */

import { useState } from 'react'
import { useNavigate, Link, Navigate } from 'react-router-dom'
import { Lock, Eye, EyeOff, ShieldCheck, Wrench, Shield, ArrowLeft, User } from 'lucide-react'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRole, ROLES } from '../hooks/useRole.jsx'
import { isStandalone } from '../lib/session'
import Logo from '../components/ui/Logo.jsx'

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Per-role visual config for the RoleButton component.
 * Dark-panel variants — borders glow with brand/accent on hover.
 */
const ROLE_BUTTON_STYLES = {
  brand: {
    border: 'border-brand-200 hover:border-brand-500 active:border-brand-600',
    bg:     'hover:bg-brand-50',
    icon:   'bg-brand-100 text-brand-700',
    text:   'text-brand-700',
    desc:   'text-gray-600',
  },
  accent: {
    border: 'border-accent-200 hover:border-accent-500 active:border-accent-600',
    bg:     'hover:bg-accent-50',
    icon:   'bg-accent-100 text-accent-700',
    text:   'text-accent-700',
    desc:   'text-gray-600',
  },
  staff: {
    border: 'border-emerald-200 hover:border-emerald-500 active:border-emerald-600',
    bg:     'hover:bg-emerald-50',
    icon:   'bg-emerald-100 text-emerald-700',
    text:   'text-emerald-700',
    desc:   'text-gray-600',
  },
}

/** Role display config used by both steps. */
const ROLE_CONFIG = {
  [ROLES.ADMIN]: {
    icon:        ShieldCheck,
    color:       'brand',
    description: 'Manage accounts & terms, plus everything staff can do',
  },
  [ROLES.STAFF]: {
    icon:        Shield,
    color:       'staff',
    description: 'Approve / deny tickets, manage queue, mark as paid',
  },
  [ROLES.TECHNICIAN]: {
    icon:        Wrench,
    color:       'accent',
    description: 'Update repair progress, add notes and photos',
  },
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/**
 * RoleButton — a large role-selector button shown on step 1 of the login form.
 *
 * @param {React.ElementType} icon        - Lucide icon component.
 * @param {string}            label       - Role display name.
 * @param {string}            description - Short capability description.
 * @param {'brand'|'accent'}  color       - Colour family key.
 * @param {Function}          onClick     - Called when the button is pressed.
 */
function RoleButton({ icon: Icon, label, description, color, onClick }) {
  const s = ROLE_BUTTON_STYLES[color]

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border-2
                  transition-all duration-200 ${s.border} ${s.bg}`}
    >
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${s.icon}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className={`font-sans font-bold text-base tracking-wide ${s.text}`}>{label}</p>
        <p className={`text-sm font-body mt-0.5 ${s.desc}`}>{description}</p>
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
  const { loginWithRole, loginAsStaff, authenticated } = useAuth()
  const { setRole }                                    = useRole()
  const navigate                                       = useNavigate()

  const [selectedRole, setSelectedRole] = useState(null) // null = step 1 (role selection)
  const [username,     setUsername]     = useState('')
  const [password,     setPassword]     = useState('')
  const [showPw,       setShowPw]       = useState(false)
  const [error,        setError]        = useState('')
  const [loading,      setLoading]      = useState(false)

  // Installed PWA → always stay signed in; browser → user-controlled toggle.
  const standalone = isStandalone()
  const [rememberMe, setRememberMe] = useState(true)

  // Guard: already authenticated — redirect without rendering the form.
  if (authenticated) {
    return <Navigate to="/" replace />
  }

  /** Step 1 → Step 2: pick a role, then ask for its password (+ username for Staff). */
  function selectRole(role) {
    setSelectedRole(role)
    setUsername('')
    setPassword('')
    setError('')
  }

  /** Step 2 → Step 1: go back and pick a different role. */
  function changeRole() {
    setSelectedRole(null)
    setUsername('')
    setPassword('')
    setError('')
  }

  /** Attempt login for the selected role. Credentials are verified server-side. */
  async function handleLogin(e) {
    e?.preventDefault()

    const isStaffRole = selectedRole === ROLES.STAFF

    if (isStaffRole && !username.trim()) {
      setError('Please enter your username.')
      return
    }
    if (!password) {
      setError('Please enter your password.')
      return
    }

    setLoading(true)
    setError('')

    try {
      let ok
      if (isStaffRole) {
        ok = await loginAsStaff(username, password, { rememberMe: standalone || rememberMe })
      } else {
        ok = await loginWithRole(password, selectedRole, { rememberMe: standalone || rememberMe })
      }

      if (ok) {
        setRole(selectedRole)
        navigate('/', { replace: true })
      } else {
        setError(
          isStaffRole
            ? 'Incorrect username or password.'
            : `Incorrect password for ${selectedRole}.`
        )
        setPassword('')
      }
    } catch (err) {
      setError(err.message || 'Connection error. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const roleCfg  = selectedRole ? ROLE_CONFIG[selectedRole] : null
  const RoleIcon = roleCfg?.icon

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

          {/* Container enclosing the login components */}
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">

          {!selectedRole ? (
            /* ── Step 1: role selection ── */
            <>
              <div className="mb-8">
                <h1 className="font-display text-4xl tracking-widest text-gray-900 mb-1">SIGN IN</h1>
                <p className="text-gray-500 font-body text-base">
                  Select your role to continue
                </p>
              </div>

              <div className="space-y-3">
                {Object.values(ROLES).map(role => (
                  <RoleButton
                    key={role}
                    icon={ROLE_CONFIG[role].icon}
                    label={role}
                    description={ROLE_CONFIG[role].description}
                    color={ROLE_CONFIG[role].color}
                    onClick={() => selectRole(role)}
                  />
                ))}
              </div>
            </>
          ) : (
            /* ── Step 2: password for the selected role ── */
            <>
              <button
                type="button"
                onClick={changeRole}
                className="inline-flex items-center gap-1.5 text-sm font-body text-gray-500 hover:text-gray-800 transition-colors mb-6"
              >
                <ArrowLeft className="w-4 h-4" /> Change role
              </button>

              <div className="flex items-center gap-3 mb-8">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${ROLE_BUTTON_STYLES[roleCfg.color].icon}`}>
                  <RoleIcon className="w-6 h-6" />
                </div>
                <div>
                  <h1 className={`font-sans font-bold text-xl tracking-wide ${ROLE_BUTTON_STYLES[roleCfg.color].text}`}>
                    {selectedRole}
                  </h1>
                  <p className="text-sm font-body text-gray-500">Enter your password to sign in</p>
                </div>
              </div>

              <form onSubmit={handleLogin}>
                {/* Username field — Staff accounts only */}
                {selectedRole === ROLES.STAFF && (
                  <div className="mb-4">
                    <label className="label">Username</label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={username}
                        onChange={e => { setUsername(e.target.value); setError('') }}
                        className="input-field pl-10"
                        placeholder="Enter your username"
                        autoFocus
                        autoComplete="username"
                        spellCheck={false}
                      />
                    </div>
                  </div>
                )}

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
                      autoFocus={selectedRole !== ROLES.STAFF}
                      autoComplete="current-password"
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

                <button
                  type="submit"
                  disabled={loading || !password || (selectedRole === ROLES.STAFF && !username.trim())}
                  className="btn-primary w-full justify-center py-3 text-sm disabled:opacity-50 disabled:pointer-events-none"
                >
                  {loading
                    ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <>Sign in as {selectedRole}</>
                  }
                </button>
              </form>
            </>
          )}

          <div className="mt-8 pt-6 border-t border-gray-100 text-center">
            <Link
              to="/submit"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors font-body"
            >
              ← Back to ticket submission
            </Link>
          </div>

          </div>
          {/* End container */}

        </div>
      </div>
    </div>
  )
}
