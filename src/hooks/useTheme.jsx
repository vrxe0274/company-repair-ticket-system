/**
 * @file useTheme.jsx
 * @description Light / dark theme context for the staff dashboard.
 *
 * Light is the default. The choice is stored per-device in localStorage
 * ('vrxe_theme') and applied by toggling the `dark` class on <html>, which
 * Tailwind's `darkMode: 'class'` strategy keys off (see tailwind.config.js
 * and the `.dark .dash-bg` overrides in index.css).
 *
 * To avoid a flash of light before React mounts, index.html sets the class
 * synchronously from localStorage in a tiny inline script; this provider then
 * keeps it in sync after mount.
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const THEME_KEY = 'vrxe_theme'

const ThemeContext = createContext(null)

/** Read the saved theme; default to 'light'. */
function getInitialTheme() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/** Add/remove the `dark` class on <html>. */
function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    applyTheme(theme)
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* storage may be unavailable */ }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
