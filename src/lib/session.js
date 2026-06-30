/**
 * @file session.js
 * @description Persistent-session storage shared by useAuth and useRole.
 *
 * The app has no Supabase Auth users/tokens — login is a per-role password
 * check (see useAuth.jsx). "Session" here is a single JSON record:
 *
 *   { v: 1, role: 'Admin'|'Staff'|'Technician', persistent: bool, expiresAt: number|null }
 *
 * Storage rules (Feature: persistent login / stay signed in):
 *   - persistent === true  → localStorage, 30-day sliding expiry.
 *     Used when "Remember me" is checked, and ALWAYS when running as an
 *     installed PWA (display-mode: standalone), so the app stays signed in
 *     across closes/reopens. Survives service-worker updates (SW only
 *     manages caches, never web storage).
 *   - persistent === false → sessionStorage, no expiry (dies with the tab).
 *     This is the pre-existing behavior for plain browser sessions.
 *
 * renewSession() implements the "silent refresh": every app load while the
 * record is still valid slides expiresAt forward another 30 days. If the
 * record has expired, getSession() clears it and flags the expiry so push
 * subscriptions can be cleaned up (see useAuth.jsx).
 */

const SESSION_KEY = 'vrxe_session'

/** Valid role strings (kept local to avoid a circular import with useRole). */
const VALID_ROLES = new Set(['Admin', 'Staff', 'Technician'])

/** Pre-rewrite keys — migrated then removed on first load. */
const LEGACY_AUTH_KEY = 'vrxe_auth'
const LEGACY_ROLE_KEY = 'vrxe_role'

/** Set when a persistent session lapses, so the next load can clean up
 *  the device's push subscription (no server-side session to hook into). */
export const SESSION_EXPIRED_FLAG = 'vrxe_session_expired'

/** Stores the attendance log ID that needs to be closed after a session expires. */
export const ATTENDANCE_CLOSE_KEY = 'vrxe_attendance_close'

/** Session length: 9 hours from login. Fixed — does not slide on activity. */
export const SESSION_TTL_MS = 9 * 60 * 60 * 1000

/** True when running as an installed PWA (home screen / standalone window). */
export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    window.navigator.standalone === true // iOS Safari legacy flag
  )
}

function parse(raw) {
  try {
    const s = JSON.parse(raw)
    return s && VALID_ROLES.has(s.role) ? s : null
  } catch {
    return null
  }
}

/**
 * Read the current session, honoring expiry.
 * @returns {{role: string, persistent: boolean, expiresAt: number|null} | null}
 */
export function getSession() {
  // Persistent record first (survives restarts), then tab-scoped record.
  const persistentRaw = localStorage.getItem(SESSION_KEY)
  if (persistentRaw) {
    const s = parse(persistentRaw)
    if (s) {
      if (s.expiresAt && Date.now() > s.expiresAt) {
        // Expired — stash the open attendance log ID so the next load can close
        // it, then flag for push cleanup.
        if (s.attendanceLogId) {
          try { localStorage.setItem(ATTENDANCE_CLOSE_KEY, JSON.stringify({ id: s.attendanceLogId, expiresAt: s.expiresAt })) } catch {}
        }
        localStorage.removeItem(SESSION_KEY)
        localStorage.setItem(SESSION_EXPIRED_FLAG, '1')
        return null
      }
      return s
    }
    localStorage.removeItem(SESSION_KEY)
  }

  const tabRaw = sessionStorage.getItem(SESSION_KEY)
  if (tabRaw) {
    const s = parse(tabRaw)
    if (s) {
      if (s.expiresAt && Date.now() > s.expiresAt) {
        if (s.attendanceLogId) {
          try { localStorage.setItem(ATTENDANCE_CLOSE_KEY, JSON.stringify({ id: s.attendanceLogId, expiresAt: s.expiresAt })) } catch {}
        }
        sessionStorage.removeItem(SESSION_KEY)
        localStorage.setItem(SESSION_EXPIRED_FLAG, '1')
        return null
      }
      return s
    }
    sessionStorage.removeItem(SESSION_KEY)
  }

  return migrateLegacySession()
}

/** Convert old vrxe_auth/vrxe_role sessionStorage keys into a session record. */
function migrateLegacySession() {
  const auth = sessionStorage.getItem(LEGACY_AUTH_KEY)
  const role = sessionStorage.getItem(LEGACY_ROLE_KEY)
  sessionStorage.removeItem(LEGACY_AUTH_KEY)
  sessionStorage.removeItem(LEGACY_ROLE_KEY)
  if (auth === 'true' && VALID_ROLES.has(role)) {
    return saveSession(role, { persistent: isStandalone() })
  }
  return null
}

/**
 * Create/replace the session record after a successful login.
 * @param {'Admin'|'Staff'|'Technician'} role
 * @param {{persistent?: boolean, username?: string|null}} opts
 *   persistent is forced on in standalone PWA.
 *   username is set for individual Staff accounts (null for shared-password roles).
 */
export function saveSession(role, { persistent = false, username = null, name = null, mustChangePassword = false } = {}) {
  const isPersistent = persistent || isStandalone()
  const session = {
    v: 1,
    role,
    persistent: isPersistent,
    expiresAt: Date.now() + SESSION_TTL_MS, // always set — sessions expire after 9 h regardless of persistence
  }
  if (username)          session.username          = username
  if (name)              session.name              = name
  if (mustChangePassword) session.mustChangePassword = true
  clearSession() // never leave a stale copy in the other storage
  const store = isPersistent ? localStorage : sessionStorage
  store.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

/**
 * Patch specific fields on the stored session without touching expiresAt.
 * Used by updateSessionName and updateSessionRole to avoid silently resetting
 * the 30-day sliding expiry that saveSession() would recompute.
 */
function patchSession(patch) {
  const persistRaw = localStorage.getItem(SESSION_KEY)
  if (persistRaw) {
    const s = parse(persistRaw)
    if (s) { localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, ...patch })); return }
  }
  const tabRaw = sessionStorage.getItem(SESSION_KEY)
  if (tabRaw) {
    const s = parse(tabRaw)
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, ...patch }))
  }
}

/** Update only the display name on the existing record (keeps all other fields). */
export function updateSessionName(name) {
  patchSession({ name })
}

/** Update only the username on the existing record (keeps all other fields). */
export function updateSessionUsername(username) {
  patchSession({ username })
}

/** Clear the mustChangePassword flag once the employee has set a new password. */
export function clearMustChangePassword() {
  patchSession({ mustChangePassword: false })
}

/**
 * Previously slid the session expiry forward on every load.
 * Now a no-op — sessions have a fixed 9-hour TTL from login and do not extend.
 * Kept so existing callers in useAuth.jsx don't need to change.
 */
export function renewSession() {}

/** Update only the role on the existing record (keeps persistence mode, username, name, and expiresAt). */
export function updateSessionRole(role) {
  patchSession({ role })
}

/** Remove the session from both storages (explicit logout / replace). */
export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(LEGACY_AUTH_KEY)
  sessionStorage.removeItem(LEGACY_ROLE_KEY)
}

/** Read-and-clear the "session expired" flag (used for push cleanup). */
export function consumeSessionExpiredFlag() {
  const flagged = localStorage.getItem(SESSION_EXPIRED_FLAG) === '1'
  if (flagged) localStorage.removeItem(SESSION_EXPIRED_FLAG)
  return flagged
}

/**
 * Patch the attendance log ID into the active session record so logout can
 * reference it later.  Must be called after saveSession().
 */
export function saveAttendanceLogId(id) {
  patchSession({ attendanceLogId: id })
}

/** Remove the attendance log ID from the session (called on browser close so
 *  the next load knows to start a fresh log). */
export function clearAttendanceLogId() {
  patchSession({ attendanceLogId: null })
}
