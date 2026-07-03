/**
 * @file session.js
 * @description Persistent-session storage shared by useAuth and useRole.
 *
 * Login is a per-role / per-account password check done SERVER-SIDE (see
 * useAuth.jsx + the *-login Edge Functions). On success the server also creates
 * a row in the `sessions` table and hands back an opaque random TOKEN. That
 * token — not the client JSON — is what proves the session server-side, so a
 * hand-edited localStorage record can no longer mint access to token-gated
 * server actions (session-validate rejects an unknown/forged token).
 *
 * The client record is a single JSON blob:
 *
 *   {
 *     v: 2,
 *     role: 'Admin'|'Staff'|'Technician',
 *     persistent: bool,
 *     token: string,            // server session token (absent on legacy v1)
 *     expiresAt: ISO string,    // client mirror of the server sliding expiry
 *     username?, name?, mustChangePassword?,
 *     attendanceLogId?,         // current open attendance row (server-managed)
 *   }
 *
 * Storage rules (Feature: persistent login / stay signed in):
 *   - persistent === true  → localStorage. Used when "Remember me" is checked,
 *     and ALWAYS when running as an installed PWA (display-mode: standalone),
 *     so the app stays signed in across closes/reopens. Survives service-worker
 *     updates (SW only manages caches, never web storage).
 *   - persistent === false → sessionStorage (dies with the tab).
 *
 * Expiry (Feature: 30-day sliding expiry for persistent sessions):
 *   - A persistent session carries expiresAt = now + 30 days; a non-persistent
 *     one gets a shorter window. The value is set by the server on login and
 *     renewed by session-validate on every app load (sliding). getSession()
 *     enforces it locally: a record past expiresAt is dropped and treated as
 *     logged-out. Legacy v1 records (no expiresAt) never expire locally — they
 *     are honoured until the user logs in again and gets a v2/token record.
 */

const SESSION_KEY = 'vrxe_session'

/** Valid role strings (kept local to avoid a circular import with useRole). */
const VALID_ROLES = new Set(['Admin', 'Staff', 'Technician'])

/** Pre-rewrite keys — migrated then removed on first load. */
const LEGACY_AUTH_KEY = 'vrxe_auth'
const LEGACY_ROLE_KEY = 'vrxe_role'

/** Sliding-expiry windows. Mirrors the server (createSession in _shared/auth.ts). */
export const PERSISTENT_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
export const TAB_TTL_MS        = 12 * 60 * 60 * 1000       // 12 hours

/** True when running as an installed PWA (home screen / standalone window). */
export function isStandalone() {
  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
    window.navigator.standalone === true // iOS Safari legacy flag
  )
}

/** A record is expired when it carries an expiresAt in the past. */
function isExpired(s) {
  if (!s?.expiresAt) return false // legacy v1 / tokenless — no local expiry
  const t = Date.parse(s.expiresAt)
  return Number.isFinite(t) && Date.now() > t
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
 * Read the current session. A record whose expiresAt has passed is dropped and
 * getSession returns null (treated as logged out). Otherwise the record is
 * returned as-is until explicitly cleared (logout) or dropped by the browser
 * (sessionStorage on tab close).
 * @returns {{role: string, persistent: boolean, token?: string} | null}
 */
export function getSession() {
  // Persistent record first (survives restarts), then tab-scoped record.
  const persistentRaw = localStorage.getItem(SESSION_KEY)
  if (persistentRaw) {
    const s = parse(persistentRaw)
    if (s && !isExpired(s)) return s
    localStorage.removeItem(SESSION_KEY)
  }

  const tabRaw = sessionStorage.getItem(SESSION_KEY)
  if (tabRaw) {
    const s = parse(tabRaw)
    if (s && !isExpired(s)) return s
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
 * @param {{persistent?: boolean, token?: string|null, expiresAt?: string|null,
 *          username?: string|null, name?: string|null, mustChangePassword?: boolean,
 *          attendanceLogId?: string|null}} opts
 *   persistent is forced on in standalone PWA.
 *   token / expiresAt / attendanceLogId come from the login Edge Function; they
 *   are omitted when the server session backend isn't reachable (tokenless
 *   fallback — the client still works, just without server-side revocation).
 */
export function saveSession(role, {
  persistent = false, token = null, expiresAt = null,
  username = null, name = null, mustChangePassword = false, attendanceLogId = null,
} = {}) {
  const isPersistent = persistent || isStandalone()
  const session = {
    v: 2,
    role,
    persistent: isPersistent,
  }
  if (token)             session.token              = token
  if (expiresAt)         session.expiresAt          = expiresAt
  if (username)          session.username           = username
  if (name)              session.name               = name
  if (mustChangePassword) session.mustChangePassword = true
  if (attendanceLogId)   session.attendanceLogId    = attendanceLogId
  clearSession() // never leave a stale copy in the other storage
  const store = isPersistent ? localStorage : sessionStorage
  store.setItem(SESSION_KEY, JSON.stringify(session))
  return session
}

/**
 * Patch specific fields on the stored session in place.
 * Used by updateSessionName/updateSessionRole/renewSession/etc. to change a
 * field without rewriting the whole record.
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

/** Update only the role on the existing record (keeps persistence mode, username, name). */
export function updateSessionRole(role) {
  patchSession({ role })
}

/**
 * Apply the fields session-validate returns on app load: the renewed sliding
 * expiry and (when the server rotated the attendance row) a fresh
 * attendanceLogId. Also refreshes identity in case it changed server-side.
 */
export function renewSession({ expiresAt, attendanceLogId, role, name, username } = {}) {
  const patch = {}
  if (expiresAt)                 patch.expiresAt       = expiresAt
  if (attendanceLogId)           patch.attendanceLogId = attendanceLogId
  if (role && VALID_ROLES.has(role)) patch.role        = role
  if (name !== undefined)        patch.name            = name
  if (username !== undefined)    patch.username        = username
  if (Object.keys(patch).length) patchSession(patch)
}

/** Remove the session from both storages (explicit logout / replace). */
export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(SESSION_KEY)
  sessionStorage.removeItem(LEGACY_AUTH_KEY)
  sessionStorage.removeItem(LEGACY_ROLE_KEY)
}

/**
 * Patch the attendance log ID into the active session record. Used for legacy
 * (tokenless) sessions where the client still opens its own attendance row;
 * token sessions get this from the server via saveSession/renewSession.
 */
export function saveAttendanceLogId(id) {
  patchSession({ attendanceLogId: id })
}
