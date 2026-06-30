import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  saveSession,
  getSession,
  clearSession,
  renewSession,
  updateSessionRole,
  consumeSessionExpiredFlag,
  SESSION_TTL_MS,
  SESSION_EXPIRED_FLAG,
} from '../../lib/session'

const SESSION_KEY = 'vrxe_session'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── SESSION_TTL_MS ───────────────────────────────────────────────────────────

describe('SESSION_TTL_MS', () => {
  it('equals 9 hours in milliseconds', () => {
    expect(SESSION_TTL_MS).toBe(9 * 60 * 60 * 1000)
  })
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

  it('stores schema version v: 1', () => {
    saveSession('Admin', { persistent: false })
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY))
    expect(stored.v).toBe(1)
  })

  it('persistent session has expiresAt ~9 hours from now', () => {
    const before = Date.now()
    saveSession('Admin', { persistent: true })
    const after = Date.now()
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY))
    expect(stored.expiresAt).toBeGreaterThanOrEqual(before + SESSION_TTL_MS)
    expect(stored.expiresAt).toBeLessThanOrEqual(after + SESSION_TTL_MS)
  })

  it('non-persistent session also has a 9-hour expiresAt (fixed TTL regardless of persistence)', () => {
    const before = Date.now()
    saveSession('Admin', { persistent: false })
    const after = Date.now()
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY))
    expect(stored.expiresAt).toBeGreaterThanOrEqual(before + SESSION_TTL_MS)
    expect(stored.expiresAt).toBeLessThanOrEqual(after + SESSION_TTL_MS)
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
      v: 1, role: 'Technician', persistent: false, expiresAt: null,
    }))
    saveSession('Admin', { persistent: true })
    expect(getSession().role).toBe('Admin')
  })

  it('returns null and sets the expired flag when persistent session has lapsed', () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.now())
    saveSession('Admin', { persistent: true })
    vi.setSystemTime(Date.now() + SESSION_TTL_MS + 1000)
    expect(getSession()).toBeNull()
    expect(localStorage.getItem(SESSION_EXPIRED_FLAG)).toBe('1')
  })

  it('removes the expired session from localStorage', () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.now())
    saveSession('Admin', { persistent: true })
    vi.setSystemTime(Date.now() + SESSION_TTL_MS + 1000)
    getSession()
    expect(localStorage.getItem(SESSION_KEY)).toBeNull()
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

// ─── renewSession ─────────────────────────────────────────────────────────────

describe('renewSession', () => {
  it('does not slide expiresAt — fixed TTL from login, renewSession is a no-op', () => {
    vi.useFakeTimers()
    const start = 1_000_000_000_000
    vi.setSystemTime(start)
    saveSession('Admin', { persistent: true })
    const originalExpiry = JSON.parse(localStorage.getItem(SESSION_KEY)).expiresAt

    vi.setSystemTime(start + 86_400_000) // advance 1 day
    renewSession()
    const renewed = JSON.parse(localStorage.getItem(SESSION_KEY)).expiresAt

    expect(renewed).toBe(originalExpiry)
  })

  it('does nothing when there is no persistent session', () => {
    saveSession('Admin', { persistent: false })
    const snapshot = sessionStorage.getItem(SESSION_KEY)
    renewSession()
    expect(sessionStorage.getItem(SESSION_KEY)).toBe(snapshot)
  })

  it('does nothing when the persistent session has already expired', () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.now())
    saveSession('Admin', { persistent: true })
    vi.setSystemTime(Date.now() + SESSION_TTL_MS + 1000)
    renewSession() // should be a no-op on expired record
    // expired record still present (renewSession does NOT clear it; getSession does)
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY))
    // expiresAt should not have been extended past the expired time
    expect(stored.expiresAt).toBeLessThan(Date.now())
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

// ─── consumeSessionExpiredFlag ────────────────────────────────────────────────

describe('consumeSessionExpiredFlag', () => {
  it('returns false when the flag has not been set', () => {
    expect(consumeSessionExpiredFlag()).toBe(false)
  })

  it('returns true when the flag is present', () => {
    localStorage.setItem(SESSION_EXPIRED_FLAG, '1')
    expect(consumeSessionExpiredFlag()).toBe(true)
  })

  it('removes the flag after reading it', () => {
    localStorage.setItem(SESSION_EXPIRED_FLAG, '1')
    consumeSessionExpiredFlag()
    expect(localStorage.getItem(SESSION_EXPIRED_FLAG)).toBeNull()
  })

  it('returns false on the second call (flag already consumed)', () => {
    localStorage.setItem(SESSION_EXPIRED_FLAG, '1')
    consumeSessionExpiredFlag()
    expect(consumeSessionExpiredFlag()).toBe(false)
  })
})
