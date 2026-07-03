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
 * Attendance logging:
 *   - Token sessions: login opens an attendance_logs row server-side
 *     (createSession); validate rotates it; logout ('revoke') closes it with
 *     logout_reason='manual'. The DB trigger (attendance_single_active migration)
 *     guarantees at most one open row per account, and close_stale_attendance()
 *     closes abandoned rows as 'session_expired'.
 *   - Legacy tokenless (v1) / backend-not-yet-deployed: the client opens/closes
 *     the row itself (recordLogin/closeAttendanceLog) and sweeps orphan open rows
 *     for the same identity on load so duplicate "Active" rows never stack up.
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

/** Legacy (tokenless) only: insert an attendance row and save its ID. */
async function recordLogin({ username = null, role, name = null }) {
  // Close any row left open for this same identity — a prior session that
  // never fired beforeunload (crash, mobile background, killed tab) would
  // otherwise stay "Active" forever while this new login opens another row,
  // stacking up duplicate Active entries for the same person.
  await sweepOrphanOpenLogs({ username, role })

  const { data } = await supabase
    .from('attendance_logs')
    .insert({ username, role, name })
    .select('id')
    .single()
  if (data?.id) saveAttendanceLogId(data.id)
}

/**
 * Fire-and-forget: close every open attendance row for this identity EXCEPT
 * keepId. Runs on load so orphan "Active" rows left by a tab that was killed in
 * the background (no beforeunload, session still valid) get swept instead of
 * stacking up as duplicate Active entries. Belt-and-suspenders on top of the
 * DB single-active trigger.
 */
async function sweepOrphanOpenLogs({ username = null, role, keepId }) {
  let q = supabase
    .from('attendance_logs')
    .update({ logged_out_at: new Date().toISOString(), logout_reason: 'superseded' })
    .is('logged_out_at', null)
    .eq('role', role)
  q = username ? q.eq('username', username) : q.is('username', null)
  if (keepId) q = q.neq('id', keepId)
  await q
}

/** Fire-and-forget: sync the currently-open attendance row's username/name to the session. */
function renameOpenAttendanceLog(id, username, name = null) {
  if (!id) return
  const patch = { username }
  if (name !== null) patch.name = name
  supabase
    .from('attendance_logs')
    .update(patch)
    .eq('id', id)
    .then(() => {})
}

/** Legacy (tokenless) only: close an open attendance row at "now" (manual logout). */
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
  const didInit = useRef(false)

  // Initial load: trust the local record for UX (synchronous), then confirm
  // with the server in the background so revoked/expired tokens get kicked.
  useEffect(() => {
    // Guards against React.StrictMode's dev-only double-invoke of mount
    // effects. Without this, a single page load would run recordLogin()
    // (and its Supabase insert) twice, creating a duplicate attendance row.
    if (didInit.current) return
    didInit.current = true

    const session = getSession()
    if (!session) { setLoading(false); return }

    setAuthenticated(true)
    setLoading(false)

    if (session.token) {
      // Server session: confirm with the backend (catches revoke / expiry) and
      // apply the renewed sliding expiry + any rotated attendance row.
      validateServerSession(session.token).then(data => {
        if (!data) return // network error — leave the local session in place
        if (data.valid === false) {
          unsubscribeFromPush()
          clearSession()
          setAuthenticated(false)
          return
        }
        renewSession({
          expiresAt: data.expiresAt,
          attendanceLogId: data.attendanceLogId,
          role: data.role,
          name: data.name,
          username: data.username,
        })
      })
    } else if (!session.attendanceLogId) {
      // Legacy/tokenless with no open row yet → open one (sweeps orphans first).
      recordLogin({ username: session.username ?? null, role: session.role, name: session.name ?? null })
    } else {
      // Legacy/tokenless reopen with a live row → sweep any OTHER open rows for
      // this identity (orphans from tabs killed in the background) so only this
      // one stays Active, then re-sync its username/name to the session.
      sweepOrphanOpenLogs({
        username: session.username ?? null,
        role: session.role,
        keepId: session.attendanceLogId,
      })
      if (session.username || session.name) {
        renameOpenAttendanceLog(session.attendanceLogId, session.username ?? null, session.name ?? null)
      }
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

  /** Called after a successful username change so the currently-open attendance
   *  row (and thus the admin Attendance panel) reflects the new username right
   *  away, instead of waiting for the next login. */
  function renameAttendanceLog(username) {
    const session = getSession()
    renameOpenAttendanceLog(session?.attendanceLogId, username)
  }

  return (
    <AuthContext.Provider value={{ authenticated, loading, loginWithRole, loginAsStaff, loginAsTechnician, logout, renameAttendanceLog }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
