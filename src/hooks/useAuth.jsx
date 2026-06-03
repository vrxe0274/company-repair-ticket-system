import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext(null)

const SESSION_KEY = 'vrxe_auth'

export function AuthProvider({ children }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY)
    if (stored === 'true') setAuthenticated(true)
    setLoading(false)
  }, [])

  /**
   * loginWithRole — checks password against the env var for the given role.
   * Admin   → VITE_DASHBOARD_PASSWORD
   * Technician → VITE_TECH_PASSWORD
   */
  function loginWithRole(password, role) {
    const adminPw = import.meta.env.VITE_DASHBOARD_PASSWORD
    const techPw  = import.meta.env.VITE_TECH_PASSWORD

    const expected = role === 'Admin' ? adminPw : techPw

    if (!expected) {
      console.warn(`Password env var not set for role: ${role}`)
      return false
    }

    if (password === expected) {
      sessionStorage.setItem(SESSION_KEY, 'true')
      setAuthenticated(true)
      return true
    }
    return false
  }

  /** Legacy single-password login — kept for backwards compatibility */
  function login(password) {
    const dashboardPw = import.meta.env.VITE_DASHBOARD_PASSWORD
    if (!dashboardPw) { console.warn('VITE_DASHBOARD_PASSWORD not set'); return false }
    if (password === dashboardPw) {
      sessionStorage.setItem(SESSION_KEY, 'true')
      setAuthenticated(true)
      return true
    }
    return false
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY)
    setAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ authenticated, loading, login, loginWithRole, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
