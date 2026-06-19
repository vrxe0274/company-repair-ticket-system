import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ThemeProvider, useTheme } from '../../hooks/useTheme.jsx'

function wrapper({ children }) {
  return <ThemeProvider>{children}</ThemeProvider>
}

describe('useTheme', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('defaults to light theme when localStorage is empty', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.isDark).toBe(false)
    expect(result.current.theme).toBe('light')
  })

  it('reads dark theme from localStorage on mount', () => {
    localStorage.setItem('vrxe_theme', 'dark')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.isDark).toBe(true)
    expect(result.current.theme).toBe('dark')
  })

  it('reads light theme from localStorage on mount', () => {
    localStorage.setItem('vrxe_theme', 'light')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.isDark).toBe(false)
  })

  it('toggleTheme switches light → dark', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.isDark).toBe(false)
    act(() => { result.current.toggleTheme() })
    expect(result.current.isDark).toBe(true)
  })

  it('toggleTheme switches dark → light', () => {
    localStorage.setItem('vrxe_theme', 'dark')
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => { result.current.toggleTheme() })
    expect(result.current.isDark).toBe(false)
  })

  it('adds "dark" class to <html> when dark mode is on', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => { result.current.toggleTheme() })
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes "dark" class from <html> when switching back to light', () => {
    localStorage.setItem('vrxe_theme', 'dark')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    act(() => { result.current.toggleTheme() })
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('persists the chosen theme to localStorage', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => { result.current.toggleTheme() })
    expect(localStorage.getItem('vrxe_theme')).toBe('dark')
    act(() => { result.current.toggleTheme() })
    expect(localStorage.getItem('vrxe_theme')).toBe('light')
  })

  it('setTheme directly sets a theme value', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => { result.current.setTheme('dark') })
    expect(result.current.isDark).toBe(true)
    act(() => { result.current.setTheme('light') })
    expect(result.current.isDark).toBe(false)
  })
})
