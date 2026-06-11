/**
 * @file useAuth.jsx
 * @description Authentication context.
 *
 * Auth model (unchanged): client-side password check against VITE_* env vars —
 * there are no user accounts or Supabase Auth tokens.
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
   * loginWithRole — checks password against the env var for the given role.
   * Admin      → VITE_DASHBOARD_PASSWORD
   * Technician → VITE_TECH_PASSWORD
   *
   * @param {string} password
   * @param {'Admin'|'Technician'} role
   * @param {{rememberMe?: boolean}} opts - rememberMe persists the session for
   *   30 days (sliding). Always treated as true when installed as a PWA.
   */
  function loginWithRole(password, role, { rememberMe = false } = {}) {
    const adminPw = import.meta.env.VITE_DASHBOARD_PASSWORD
    const techPw  = import.meta.env.VITE_TECH_PASSWORD

    const expected = role === 'Admin' ? adminPw : techPw

    if (!expected) {
      console.warn(`Password env var not set for role: ${role}`)
      return false
    }

    if (password === expected) {
      saveSession(role, { persistent: rememberMe })
      setAuthenticated(true)
      return true
    }
    return false
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
