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
