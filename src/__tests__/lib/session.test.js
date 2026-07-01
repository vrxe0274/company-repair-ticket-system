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
  it('is null — sessions no longer expire', () => {
    expect(SESSION_TTL_MS).toBeNull()
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

  it('persistent session has a null expiresAt (never expires)', () => {
    saveSession('Admin', { persistent: true })
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY))
    expect(stored.expiresAt).toBeNull()
  })

  it('non-persistent session also has a null expiresAt (never expires)', () => {
    saveSession('Admin', { persistent: false })
    const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY))
    expect(stored.expiresAt).toBeNull()
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

  it('never expires — a persistent session stays valid no matter how much time passes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.now())
    saveSession('Admin', { persistent: true })
    vi.setSystemTime(Date.now() + 365 * 24 * 60 * 60 * 1000) // +1 year
    expect(getSession()?.role).toBe('Admin')
    expect(localStorage.getItem(SESSION_EXPIRED_FLAG)).toBeNull()
  })

  it('ignores a stale numeric expiresAt written before sessions stopped expiring', () => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      v: 1, role: 'Admin', persistent: true, expiresAt: Date.now() - 1000,
    }))
    expect(getSession()?.role).toBe('Admin')
    expect(localStorage.getItem(SESSION_KEY)).not.toBeNull()
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
  it('is a no-op — expiresAt stays null', () => {
    saveSession('Admin', { persistent: true })
    const snapshot = localStorage.getItem(SESSION_KEY)
    renewSession()
    expect(localStorage.getItem(SESSION_KEY)).toBe(snapshot)
  })

  it('does nothing when there is no persistent session', () => {
    saveSession('Admin', { persistent: false })
    const snapshot = sessionStorage.getItem(SESSION_KEY)
    renewSession()
    expect(sessionStorage.getItem(SESSION_KEY)).toBe(snapshot)
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
