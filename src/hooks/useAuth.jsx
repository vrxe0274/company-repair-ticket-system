/**
 * @file useAuth.jsx
 * @description Authentication context.
 *
 * Auth model: password verification is done SERVER-SIDE via the verify-login
 * Edge Function. There is one shared password per role, stored as Supabase
 * secrets and never shipped to the browser bundle. There are no user accounts
 * or Supabase Auth tokens.
 *
 * Persistence (Feature: stay signed in for PWA):
 *   - Session record lives in lib/session.js (localStorage when persistent,
 *     sessionStorage otherwise).
 *   - Sessions never auto-expire — the only way out is an explicit logout().
 *
 * Attendance logging:
 *   - Every successful login inserts a row into attendance_logs and saves the
 *     row ID into the session record.
 *   - Manual logout updates that row with logged_out_at + logout_reason='manual'.
 */

import { createContext, useContext, useState, useEffect, useRef } from 'react'
import {
  getSession,
  saveSession,
  renewSession,
  clearSession,
  saveAttendanceLogId,
  clearAttendanceLogId,
} from '../lib/session'
import { unsubscribeFromPush } from '../lib/push'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

/** Fire-and-forget: insert an attendance log row and save its ID to the session. */
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
 * keepId. Runs on every load so orphan "Active" rows left by a tab that was
 * killed in the background (no beforeunload, session still valid) get swept
 * instead of stacking up as duplicate Active entries.
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

/** Fire-and-forget: mark an open attendance row as closed. */
function closeAttendanceLog(id, reason, loggedOutAt = new Date()) {
  if (!id) return
  supabase
    .from('attendance_logs')
    .update({ logged_out_at: new Date(loggedOutAt).toISOString(), logout_reason: reason })
    .eq('id', id)
    .then(() => {})
}

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const didInit = useRef(false)

  useEffect(() => {
    // Guards against React.StrictMode's dev-only double-invoke of mount
    // effects. Without this, a single page load would run recordLogin()
    // (and its Supabase insert) twice, creating a duplicate attendance row.
    if (didInit.current) return
    didInit.current = true

    const session = getSession()
    if (session) {
      setAuthenticated(true)
      renewSession()
      // If the session has no open attendance log (e.g. browser was closed and
      // reopened — the beforeunload handler cleared it), start a fresh one.
      if (!session.attendanceLogId) {
        recordLogin({ username: session.username ?? null, role: session.role, name: session.name ?? null })
      } else {
        // Reopen with a live log: sweep any OTHER open rows for this identity
        // (orphans from tabs killed in the background) so only this one stays
        // Active, then re-sync its username/name to the session.
        sweepOrphanOpenLogs({
          username: session.username ?? null,
          role: session.role,
          keepId: session.attendanceLogId,
        })
        if (session.username || session.name) {
          renameOpenAttendanceLog(session.attendanceLogId, session.username ?? null, session.name ?? null)
        }
      }
    }

    setLoading(false)
  }, [])

  // Close the attendance log the moment the browser tab/window closes.
  // Must use raw fetch with keepalive:true — the supabase-js client cancels
  // in-flight requests on unload, but keepalive bypasses that restriction.
  // Also clears attendanceLogId from the session so the next page load
  // (browser reopen with a persistent session) creates a fresh log.
  useEffect(() => {
    if (!authenticated) return
    function onBeforeUnload() {
      const session = getSession()
      const id = session?.attendanceLogId
      if (!id) return
      fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/attendance_logs?id=eq.${id}`,
        {
          method: 'PATCH',
          keepalive: true,
          headers: {
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            logged_out_at: new Date().toISOString(),
            logout_reason: 'browser_closed',
          }),
        }
      )
      clearAttendanceLogId()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [authenticated])

  /**
   * loginWithRole — verifies the role's shared password server-side via the
   * verify-login Edge Function. Used by Admin and Technician roles.
   * Passwords never leave the server; the browser bundle contains no credentials.
   *
   * @param {string} password
   * @param {'Admin'|'Technician'} role
   * @param {{rememberMe?: boolean}} opts
   * @returns {Promise<boolean>} true on success, false on wrong password.
   * @throws {Error} if the Edge Function is unreachable or misconfigured.
   */
  async function loginWithRole(password, role, { rememberMe = false } = {}) {
    const { data, error } = await supabase.functions.invoke('verify-login', {
      body: { role, password },
    })

    if (error) throw new Error('Connection error. Check your network and try again.')
    if (data?.rateLimited) {
      const mins = Math.ceil(data.retryAfter / 60)
      throw new Error(`Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`)
    }
    if (!data?.ok) return false

    saveSession(role, { persistent: rememberMe })
    setAuthenticated(true)
    recordLogin({ role })
    return true
  }

  /**
   * loginAsStaff — verifies an individual Staff account's username + password
   * via the staff-login Edge Function. Each staff member has their own account
   * (created by Admin). The username is stored in the session so it can be
   * displayed in the UI.
   *
   * @param {string} username
   * @param {string} password
   * @param {{rememberMe?: boolean}} opts
   * @returns {Promise<boolean>} true on success, false on wrong credentials.
   * @throws {Error} if the Edge Function is unreachable.
   */
  async function loginAsStaff(username, password, { rememberMe = false } = {}) {
    const { data, error } = await supabase.functions.invoke('staff-login', {
      body: { username: username.trim(), password },
    })

    if (error) throw new Error('Connection error. Check your network and try again.')
    if (data?.rateLimited) {
      const mins = Math.ceil(data.retryAfter / 60)
      throw new Error(`Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`)
    }
    if (!data?.ok) return false

    const resolvedName = data.name ?? null
    saveSession('Staff', { persistent: rememberMe, username: username.trim(), name: resolvedName, mustChangePassword: data.mustChangePassword ?? false })
    setAuthenticated(true)
    recordLogin({ username: username.trim(), role: 'Staff', name: resolvedName })
    return { name: resolvedName }
  }

  /**
   * loginAsTechnician — verifies an individual Technician account's username +
   * password via the tech-login Edge Function. Mirrors loginAsStaff exactly
   * but targets the technician_accounts table via a separate edge function.
   *
   * @param {string} username
   * @param {string} password
   * @param {{rememberMe?: boolean}} opts
   * @returns {Promise<boolean>} true on success, false on wrong credentials.
   * @throws {Error} if the Edge Function is unreachable.
   */
  async function loginAsTechnician(username, password, { rememberMe = false } = {}) {
    const { data, error } = await supabase.functions.invoke('tech-login', {
      body: { username: username.trim(), password },
    })

    if (error) throw new Error('Connection error. Check your network and try again.')
    if (data?.rateLimited) {
      const mins = Math.ceil(data.retryAfter / 60)
      throw new Error(`Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`)
    }
    if (!data?.ok) return false

    const resolvedName = data.name ?? null
    saveSession('Technician', { persistent: rememberMe, username: username.trim(), name: resolvedName, mustChangePassword: data.mustChangePassword ?? false })
    setAuthenticated(true)
    recordLogin({ username: username.trim(), role: 'Technician', name: resolvedName })
    return { name: resolvedName }
  }

  /**
   * Explicit logout: close the open attendance log, invalidate the session
   * everywhere, and remove this device's push subscription.
   */
  function logout() {
    const session = getSession()
    closeAttendanceLog(session?.attendanceLogId, 'manual')
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
