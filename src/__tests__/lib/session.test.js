import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  saveSession,
  getSession,
  clearSession,
  updateSessionRole,
  renewSession,
} from '../../lib/session'

const SESSION_KEY = 'vrxe_session'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── saveSession ─────────────────────────────────────────────────────────────

describe('saveSession', () => {
  it('writes a non-persistent session to sessionStorage only', () => {
    saveSession('Admin', { persistent: false })
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('writes a persistent session to localStorage only', () => {
    saveSession('Admin', { persistent: true })
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull()
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('stores the correct role', () => {
    saveSession('Technician', { persistent: false })
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY))
    expect(stored.role).toBe('Technician')
  })

  it('stores schema version v: 2', () => {
    saveSession('Admin', { persistent: false })
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY))
    expect(stored.v).toBe(2)
  })

  it('stores the server token and expiresAt when provided', () => {
    saveSession('Staff', { persistent: true, token: 'tok-123', expiresAt: '2999-01-01T00:00:00.000Z' })
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY))
    expect(stored.token).toBe('tok-123')
    expect(stored.expiresAt).toBe('2999-01-01T00:00:00.000Z')
  })

  it('omits token/expiresAt when not provided (tokenless fallback)', () => {
    saveSession('Admin', { persistent: true })
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY))
    expect(stored.token).toBeUndefined()
    expect(stored.expiresAt).toBeUndefined()
  })

  it('clears the other storage when switching persistence modes', () => {
    saveSession('Admin', { persistent: false })
    saveSession('Admin', { persistent: true })
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull()
  })

  it('returns the created session object', () => {
    const session = saveSession('Technician', { persistent: false })
    expect(session).toMatchObject({ role: 'Technician', persistent: false })
  })
})

// ─── getSession ───────────────────────────────────────────────────────────────

describe('getSession', () => {
  it('returns null when nothing is stored', () => {
    expect(getSession()).toBeNull()
  })

  it('reads a valid sessionStorage session', () => {
    saveSession('Technician', { persistent: false })
    const session = getSession()
    expect(session).not.toBeNull()
    expect(session.role).toBe('Technician')
  })

  it('reads a valid localStorage session', () => {
    saveSession('Admin', { persistent: true })
    const session = getSession()
    expect(session).not.toBeNull()
    expect(session.role).toBe('Admin')
  })

  it('prefers localStorage over sessionStorage', () => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      v: 1, role: 'Technician', persistent: false,
    }))
    saveSession('Admin', { persistent: true })
    expect(getSession().role).toBe('Admin')
  })

  it('legacy tokenless session (no expiresAt) never expires', () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.now())
    saveSession('Admin', { persistent: true }) // no expiresAt
    // Jump 100 days into the future.
    vi.setSystemTime(Date.now() + 100 * 24 * 60 * 60 * 1000)
    expect(getSession()).not.toBeNull()
    expect(getSession().role).toBe('Admin')
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull()
  })

  it('honours a session whose expiresAt is still in the future', () => {
    saveSession('Staff', { persistent: true, token: 't', expiresAt: new Date(Date.now() + 60_000).toISOString() })
    expect(getSession()?.role).toBe('Staff')
  })

  it('drops a session whose expiresAt has passed and returns null', () => {
    saveSession('Staff', { persistent: true, token: 't', expiresAt: new Date(Date.now() - 1000).toISOString() })
    expect(getSession()).toBeNull()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull() // record purged
  })

  it('returns null for a corrupt localStorage record', () => {
    localStorage.setItem(SESSION_KEY, 'not-json')
    expect(getSession()).toBeNull()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('returns null for a record with an invalid role', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ v: 1, role: 'SuperAdmin', persistent: true }))
    expect(getSession()).toBeNull()
  })
})

// ─── clearSession ─────────────────────────────────────────────────────────────

describe('clearSession', () => {
  it('removes session from both storages', () => {
    saveSession('Admin', { persistent: false })
    clearSession()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('getSession returns null after clearing', () => {
    saveSession('Admin', { persistent: true })
    clearSession()
    expect(getSession()).toBeNull()
  })

  it('is safe to call when nothing is stored', () => {
    expect(() => clearSession()).not.toThrow()
  })
})

// ─── updateSessionRole ────────────────────────────────────────────────────────

describe('updateSessionRole', () => {
  it('changes the stored role without altering persistence mode', () => {
    saveSession('Admin', { persistent: false })
    updateSessionRole('Technician')
    expect(getSession().role).toBe('Technician')
    expect(sessionStorage.getItem(SESSION_KEY)).not.toBeNull()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
  })

  it('is a no-op when no session exists', () => {
    expect(() => updateSessionRole('Admin')).not.toThrow()
    expect(getSession()).toBeNull()
  })
})

// ─── renewSession ─────────────────────────────────────────────────────────────

describe('renewSession', () => {
  it('slides expiresAt forward and rotates attendanceLogId', () => {
    saveSession('Staff', { persistent: true, token: 't', expiresAt: new Date(Date.now() + 1000).toISOString(), attendanceLogId: 'old' })
    const next = new Date(Date.now() + 5 * 60_000).toISOString()
    renewSession({ expiresAt: next, attendanceLogId: 'new' })
    const s = getSession()
    expect(s.expiresAt).toBe(next)
    expect(s.attendanceLogId).toBe('new')
  })

  it('keeps a session alive by extending an about-to-expire expiresAt', () => {
    saveSession('Staff', { persistent: true, token: 't', expiresAt: new Date(Date.now() + 1000).toISOString() })
    renewSession({ expiresAt: new Date(Date.now() + 60_000).toISOString() })
    expect(getSession()?.role).toBe('Staff')
  })

  it('is a no-op when no session exists', () => {
    expect(() => renewSession({ expiresAt: new Date().toISOString() })).not.toThrow()
    expect(getSession()).toBeNull()
  })
})
