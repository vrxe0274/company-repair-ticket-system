/**
 * @file useAuth.jsx
 * @description Authentication context.
 *
 * Auth model: password verification is done SERVER-SIDE via the *-login Edge
 * Functions. There is one shared password per role (verify-login) plus
 * individual username accounts for Staff and Technician. On success the server
 * ALSO creates a row in the `sessions` table and returns an opaque TOKEN; the
 * client stores it in lib/session.js. The token — not the client JSON — is what
 * proves the session to token-gated server actions, so a hand-edited
 * localStorage record can no longer forge one.
 *
 * Persistence & expiry (Feature: stay signed in for PWA):
 *   - Session record lives in lib/session.js (localStorage when persistent,
 *     sessionStorage otherwise).
 *   - "Remember me" or running as an installed PWA → persistent session with a
 *     30-day sliding expiry; session-manage 'validate' renews it on every app
 *     load. Non-persistent sessions get a 12-hour window and die with the tab.
 *   - A token the server reports invalid/expired (validate → valid:false) →
 *     the client clears the session + this device's push subscription and lands
 *     on /login via ProtectedRoute. Network errors during validate are ignored
 *     (offline-friendly — the local expiry check still applies).
 *
 * Attendance logging (server-owned for token sessions):
 *   - Login opens an attendance_logs row server-side (createSession).
 *   - validate rotates it — once close_stale_attendance() has closed yesterday's
 *     open row, the next load opens a fresh one (per-day logging for persistent
 *     PWAs, which previously logged only their very first login).
 *   - logout ('revoke') closes the row with logout_reason='manual'; an abandoned
 *     device's row is closed as 'session_expired' by the nightly cleanup or when
 *     the same account logs in elsewhere (single-session).
 *   - Legacy tokenless (v1) sessions keep the old client-side attendance path.
 */

import { createContext, useContext, useState, useEffect, useRef } from 'react'
import {
  getSession,
  saveSession,
  clearSession,
  renewSession,
  saveAttendanceLogId,
  isStandalone,
} from '../lib/session'
import { unsubscribeFromPush } from '../lib/push'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

/** Legacy (tokenless v1) only: insert an attendance row and save its ID. */
async function recordLogin({ username = null, role, name = null }) {
  const { data } = await supabase
    .from('attendance_logs')
    .insert({ username, role, name })
    .select('id')
    .single()
  if (data?.id) saveAttendanceLogId(data.id)
}

/** Legacy (tokenless v1) only: close an open attendance row at "now". */
function closeAttendanceLog(id) {
  if (!id) return
  supabase
    .from('attendance_logs')
    .update({ logged_out_at: new Date().toISOString(), logout_reason: 'manual' })
    .eq('id', id)
    .then(() => {})
}

/** Ask the server to validate a token. Returns the response, or null on network error. */
async function validateServerSession(token) {
  try {
    const { data, error } = await supabase.functions.invoke('session-manage', {
      body: { action: 'validate', token },
    })
    if (error) return null // network/deploy issue — stay logged in (offline-friendly)
    return data ?? null
  } catch {
    return null
  }
}

/** Best-effort server revoke on logout (closes attendance + deletes the session row). */
function revokeServerSession(token) {
  if (!token) return
  supabase.functions.invoke('session-manage', { body: { action: 'revoke', token } }).catch(() => {})
}

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const validatedRef = useRef(false) // guard StrictMode double-invoke

  // Initial load: trust the local record for UX (synchronous), then confirm
  // with the server in the background so revoked/expired tokens get kicked.
  useEffect(() => {
    const session = getSession()
    if (!session) { setLoading(false); return }

    setAuthenticated(true)
    setLoading(false)

    if (validatedRef.current) return
    validatedRef.current = true

    if (session.token) {
      validateServerSession(session.token).then(data => {
        if (!data) return // network error — leave the local session in place
        if (data.valid === false) {
          unsubscribeFromPush()
          clearSession()
          setAuthenticated(false)
          return
        }
        // Valid: apply the renewed expiry + any rotated attendance row.
        renewSession({
          expiresAt: data.expiresAt,
          attendanceLogId: data.attendanceLogId,
          role: data.role,
          name: data.name,
          username: data.username,
        })
      })
    } else if (!session.attendanceLogId) {
      // Legacy tokenless session with no open row yet — open one client-side.
      recordLogin({ username: session.username ?? null, role: session.role, name: session.name ?? null })
    }
  }, [])

  // Cross-tab sync: a logout (or expiry) in another tab clears localStorage;
  // reflect it here instead of staying authenticated until reload.
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== null && e.key !== 'vrxe_session') return
      setAuthenticated(!!getSession())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /** Persist the session record from a successful login response. */
  function persistLogin(role, data, { rememberMe }) {
    saveSession(role, {
      persistent:         rememberMe,
      token:              data?.token ?? null,
      expiresAt:          data?.expiresAt ?? null,
      attendanceLogId:    data?.attendanceLogId ?? null,
      username:           data?.username ?? null,
      name:               data?.name ?? null,
      mustChangePassword: data?.mustChangePassword ?? false,
    })
    validatedRef.current = true // this record is already server-fresh
    setAuthenticated(true)
    // Tokenless fallback (server session backend not deployed): open the
    // attendance row client-side so attendance still records.
    if (!data?.token && !data?.attendanceLogId) {
      recordLogin({ username: data?.username ?? null, role, name: data?.name ?? null })
    }
  }

  /**
   * loginWithRole — verifies the role's shared password server-side via the
   * verify-login Edge Function. Used by the Admin role.
   * Passwords never leave the server; the browser bundle contains no credentials.
   *
   * @param {string} password
   * @param {'Admin'|'Staff'|'Technician'} role
   * @param {{rememberMe?: boolean}} opts
   * @returns {Promise<boolean>} true on success, false on wrong password.
   * @throws {Error} if the Edge Function is unreachable or misconfigured.
   */
  async function loginWithRole(password, role, { rememberMe = false } = {}) {
    const persistent = rememberMe || isStandalone()
    const { data, error } = await supabase.functions.invoke('verify-login', {
      body: { role, password, persistent },
    })

    if (error) throw new Error('Connection error. Check your network and try again.')
    if (data?.rateLimited) {
      const mins = Math.ceil(data.retryAfter / 60)
      throw new Error(`Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`)
    }
    if (!data?.ok) return false

    persistLogin(role, data, { rememberMe })
    return true
  }

  /**
   * loginAsStaff — verifies an individual Staff account's username + password
   * via the staff-login Edge Function. Each staff member has their own account
   * (created by Admin). The username is stored in the session so it can be
   * displayed in the UI.
   *
   * @returns {Promise<false | {name: string|null}>} false on wrong credentials.
   * @throws {Error} if the Edge Function is unreachable.
   */
  async function loginAsStaff(username, password, { rememberMe = false } = {}) {
    const persistent = rememberMe || isStandalone()
    const { data, error } = await supabase.functions.invoke('staff-login', {
      body: { username: username.trim(), password, persistent },
    })

    if (error) throw new Error('Connection error. Check your network and try again.')
    if (data?.rateLimited) {
      const mins = Math.ceil(data.retryAfter / 60)
      throw new Error(`Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`)
    }
    if (!data?.ok) return false

    const resolvedName = data.name ?? null
    persistLogin('Staff', { ...data, username: username.trim(), name: resolvedName }, { rememberMe })
    return { name: resolvedName }
  }

  /**
   * loginAsTechnician — verifies an individual Technician account's username +
   * password via the tech-login Edge Function. Mirrors loginAsStaff exactly but
   * targets the technician_accounts table via a separate edge function.
   *
   * @returns {Promise<false | {name: string|null}>} false on wrong credentials.
   * @throws {Error} if the Edge Function is unreachable.
   */
  async function loginAsTechnician(username, password, { rememberMe = false } = {}) {
    const persistent = rememberMe || isStandalone()
    const { data, error } = await supabase.functions.invoke('tech-login', {
      body: { username: username.trim(), password, persistent },
    })

    if (error) throw new Error('Connection error. Check your network and try again.')
    if (data?.rateLimited) {
      const mins = Math.ceil(data.retryAfter / 60)
      throw new Error(`Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`)
    }
    if (!data?.ok) return false

    const resolvedName = data.name ?? null
    persistLogin('Technician', { ...data, username: username.trim(), name: resolvedName }, { rememberMe })
    return { name: resolvedName }
  }

  /**
   * Explicit logout: revoke the server session (closes the attendance row and
   * deletes the token), remove this device's push subscription, and clear the
   * local record. Legacy tokenless sessions close their row client-side.
   */
  function logout() {
    const session = getSession()
    if (session?.token) {
      revokeServerSession(session.token)
    } else {
      closeAttendanceLog(session?.attendanceLogId)
    }
    unsubscribeFromPush()
    clearSession()
    setAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ authenticated, loading, loginWithRole, loginAsStaff, loginAsTechnician, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
