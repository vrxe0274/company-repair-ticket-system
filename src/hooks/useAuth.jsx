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
 *   - "Remember me" or running as an installed PWA → persistent record with a
 *     30-day sliding expiry; every app load renews it (silent refresh).
 *   - Expired persistent session → cleared + this device's push subscription
 *     removed, then the user lands on /login via ProtectedRoute.
 */

import { createContext, useContext, useState, useEffect } from 'react'
import {
  getSession,
  saveSession,
  renewSession,
  clearSession,
  consumeSessionExpiredFlag,
} from '../lib/session'
import { unsubscribeFromPush } from '../lib/push'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getSession()
    if (session) {
      setAuthenticated(true)
      renewSession() // slide the 30-day expiry forward on every load
    } else if (consumeSessionExpiredFlag()) {
      // Persistent session lapsed — deactivate this device's push subscription
      // (the closest equivalent to server-side "invalidate on session expiry").
      unsubscribeFromPush()
    }
    setLoading(false)
  }, [])

  /**
   * loginWithRole — verifies the role's password server-side via the
   * verify-login Edge Function. Passwords never leave the server; the browser
   * bundle contains no credentials.
   *
   * @param {string} password
   * @param {'Admin'|'Staff'|'Technician'} role
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
    return true
  }

  /**
   * Explicit logout: invalidate the session everywhere and remove this
   * device's push subscription so it stops receiving global pushes.
   */
  function logout() {
    unsubscribeFromPush() // fire-and-forget; fails softly
    clearSession()
    setAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ authenticated, loading, loginWithRole, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
