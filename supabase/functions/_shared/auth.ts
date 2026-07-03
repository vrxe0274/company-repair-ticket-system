/**
 * _shared/auth.ts — shared utilities for all Edge Functions
 *
 * Centralises: CORS headers, JSON response helper, timing-safe comparison,
 * PBKDF2 key derivation, client-IP extraction, and KV rate-limit helpers.
 *
 * Import in each function:
 *   import { corsHeaders, json, timingSafeEqual, ... } from '../_shared/auth.ts'
 */

// ── CORS ──────────────────────────────────────────────────────────────────────

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Response helper ───────────────────────────────────────────────────────────

export function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ── Crypto ────────────────────────────────────────────────────────────────────

export const enc = new TextEncoder()

/**
 * Constant-time string comparison.
 * Always iterates max(len) bytes so length difference is not a timing oracle.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const ab  = enc.encode(a)
  const bb  = enc.encode(b)
  const len = Math.max(ab.length, bb.length)
  let diff  = ab.length ^ bb.length
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

/**
 * PBKDF2-SHA256 derivation with a role-scoped salt.
 * Salt format: vrxe-<role>-pw-v1
 * Used by: verify-login, change-password, staff-manage (admin verify)
 */
export async function deriveRoleKey(password: string, role: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(`vrxe-${role}-pw-v1`), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial, 256,
  )
  return btoa(String.fromCharCode(...new Uint8Array(bits)))
}

/**
 * PBKDF2-SHA256 derivation with a per-username salt.
 * Salt format: vrxe-staff-<username>-pw-v1
 * Used by: staff-login, staff-manage (account creation)
 */
export async function deriveStaffKey(password: string, username: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(`vrxe-staff-${username}-pw-v1`), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial, 256,
  )
  return btoa(String.fromCharCode(...new Uint8Array(bits)))
}

/**
 * PBKDF2-SHA256 derivation with a per-username salt for technician accounts.
 * Salt format: vrxe-tech-<username>-pw-v1
 * Used by: tech-login, tech-manage (account creation)
 */
export async function deriveTechKey(password: string, username: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(`vrxe-tech-${username}-pw-v1`), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial, 256,
  )
  return btoa(String.fromCharCode(...new Uint8Array(bits)))
}

// ── Temp password generation ──────────────────────────────────────────────────

const TEMP_PASSWORD_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

/** Generates a 12-character random temp password using a visually unambiguous charset. */
export function generateTempPassword(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => TEMP_PASSWORD_CHARS[b % TEMP_PASSWORD_CHARS.length]).join('')
}

// ── Server-side sessions ────────────────────────────────────────────────────────
//
// Login functions call createSession() on success to mint a revocable, expiring
// session (see sql/sessions-setup.sql). session-validate / session-revoke read
// it back by token. The client only ever holds the opaque token.

export const SESSION_PERSISTENT_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
export const SESSION_TAB_TTL_MS        = 12 * 60 * 60 * 1000       // 12 hours

/** 256-bit URL-safe random token. */
export function generateSessionToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function ttlFor(persistent: boolean): number {
  return persistent ? SESSION_PERSISTENT_TTL_MS : SESSION_TAB_TTL_MS
}

interface SessionIdentity {
  role: string
  username?: string | null
  name?: string | null
  persistent?: boolean
}

/**
 * Create a session on successful login: open a fresh attendance row, enforce
 * single-session-per-account (individual accounts only), and store the token.
 * Returns what the client needs to persist. Best-effort attendance — a failure
 * to insert the log never blocks issuing the session.
 */
// deno-lint-ignore no-explicit-any
export async function createSession(supabase: any, id: SessionIdentity): Promise<{
  token: string; expiresAt: string; attendanceLogId: string | null
}> {
  const role       = id.role
  const username   = id.username ?? null
  const name       = id.name ?? null
  const persistent = id.persistent ?? false

  // Single-session per individual account: revoke prior sessions + close their
  // still-open attendance rows so an old device (phone) stops showing "Active"
  // when the account logs in on a new device (desktop). Shared roles (no
  // username, e.g. Admin) are left alone so concurrent shared logins still work.
  if (username) {
    const { data: prior } = await supabase
      .from('sessions')
      .select('token, attendance_log_id')
      .eq('username', username)
    if (prior?.length) {
      const openIds = prior.map((p: any) => p.attendance_log_id).filter(Boolean)
      if (openIds.length) {
        await supabase
          .from('attendance_logs')
          .update({ logged_out_at: new Date().toISOString(), logout_reason: 'session_expired' })
          .in('id', openIds)
          .is('logged_out_at', null)
      }
      await supabase.from('sessions').delete().eq('username', username)
    }
  }

  // Open the attendance row for this login.
  let attendanceLogId: string | null = null
  const { data: log } = await supabase
    .from('attendance_logs')
    .insert({ username, role, name })
    .select('id')
    .single()
  attendanceLogId = log?.id ?? null

  const token     = generateSessionToken()
  const expiresAt = new Date(Date.now() + ttlFor(persistent)).toISOString()

  await supabase.from('sessions').insert({
    token, role, username, name, persistent,
    attendance_log_id: attendanceLogId,
    expires_at: expiresAt,
  })

  return { token, expiresAt, attendanceLogId }
}

/**
 * Validate a token on app load. Renews the sliding expiry, and rotates the
 * attendance row when the current one is missing or already closed (so a
 * persistent PWA that stays "logged in" for days still logs one row per day
 * once close_stale_attendance() has closed yesterday's).
 */
// deno-lint-ignore no-explicit-any
export async function validateSession(supabase: any, token: string): Promise<
  | { valid: false }
  | { valid: true; role: string; username: string | null; name: string | null; expiresAt: string; attendanceLogId: string | null }
> {
  if (!token) return { valid: false }

  const { data: s } = await supabase
    .from('sessions')
    .select('token, role, username, name, persistent, attendance_log_id, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!s) return { valid: false }

  // Expired → close its still-open attendance row and drop the session.
  if (Date.parse(s.expires_at) < Date.now()) {
    if (s.attendance_log_id) {
      await supabase
        .from('attendance_logs')
        .update({ logged_out_at: new Date().toISOString(), logout_reason: 'session_expired' })
        .eq('id', s.attendance_log_id)
        .is('logged_out_at', null)
    }
    await supabase.from('sessions').delete().eq('token', token)
    return { valid: false }
  }

  // Rotate attendance if the current row is gone or already closed.
  let attendanceLogId: string | null = s.attendance_log_id ?? null
  let needsNewRow = !attendanceLogId
  if (attendanceLogId) {
    const { data: row } = await supabase
      .from('attendance_logs')
      .select('logged_out_at')
      .eq('id', attendanceLogId)
      .maybeSingle()
    if (!row || row.logged_out_at) needsNewRow = true
  }
  if (needsNewRow) {
    const { data: fresh } = await supabase
      .from('attendance_logs')
      .insert({ username: s.username, role: s.role, name: s.name })
      .select('id')
      .single()
    attendanceLogId = fresh?.id ?? null
  }

  // Slide the expiry forward and record activity.
  const expiresAt = new Date(Date.now() + ttlFor(s.persistent)).toISOString()
  await supabase
    .from('sessions')
    .update({ expires_at: expiresAt, last_seen_at: new Date().toISOString(), attendance_log_id: attendanceLogId })
    .eq('token', token)

  return { valid: true, role: s.role, username: s.username ?? null, name: s.name ?? null, expiresAt, attendanceLogId }
}

/** Revoke a session (explicit logout): close its open attendance row + delete it. */
// deno-lint-ignore no-explicit-any
export async function revokeSession(supabase: any, token: string): Promise<{ ok: true }> {
  if (!token) return { ok: true }
  const { data: s } = await supabase
    .from('sessions')
    .select('attendance_log_id')
    .eq('token', token)
    .maybeSingle()
  if (s?.attendance_log_id) {
    await supabase
      .from('attendance_logs')
      .update({ logged_out_at: new Date().toISOString(), logout_reason: 'manual' })
      .eq('id', s.attendance_log_id)
      .is('logged_out_at', null)
  }
  await supabase.from('sessions').delete().eq('token', token)
  return { ok: true }
}

// ── Client IP ─────────────────────────────────────────────────────────────────

export function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

// ── KV rate limiting ──────────────────────────────────────────────────────────

export interface AttemptRecord {
  attempts:    number
  windowStart: number
  lockedUntil?: number
}

export const MAX_ATTEMPTS = 5
export const WINDOW_MS    = 15 * 60 * 1000
export const LOCKOUT_MS   = 15 * 60 * 1000
export const KV_TTL_MS    = LOCKOUT_MS + WINDOW_MS

/**
 * Read the rate-limit record for a given KV key.
 * Returns { limited: true, retryAfter } if currently locked out,
 * otherwise { limited: false, record } with a (possibly reset) record.
 */
// deno-lint-ignore no-explicit-any
export async function checkRateLimit(kv: any, kvKey: string[], now: number): Promise<
  | { limited: true;  retryAfter: number; record: AttemptRecord }
  | { limited: false; record: AttemptRecord }
> {
  if (!kv) return { limited: false, record: { attempts: 0, windowStart: now } }

  const entry = await kv.get(kvKey)
  let record: AttemptRecord = (entry.value as AttemptRecord) ?? { attempts: 0, windowStart: now }

  if (record.lockedUntil && now < record.lockedUntil) {
    const retryAfter = Math.ceil((record.lockedUntil - now) / 1000)
    return { limited: true, retryAfter, record }
  }

  if (now - record.windowStart > WINDOW_MS) {
    record = { attempts: 0, windowStart: now }
  }

  return { limited: false, record }
}

/**
 * Persist the updated attempt record after a login attempt.
 * Clears the record on success; increments and potentially locks on failure.
 */
// deno-lint-ignore no-explicit-any
export async function updateRateLimit(kv: any, kvKey: string[], record: AttemptRecord, success: boolean, now: number): Promise<void> {
  if (!kv) return

  if (success) {
    await kv.delete(kvKey)
    return
  }

  record.attempts++
  if (record.attempts >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS
  }
  await kv.set(kvKey, record, { expireIn: KV_TTL_MS })
}
