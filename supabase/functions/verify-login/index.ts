/**
 * verify-login — Supabase Edge Function
 *
 * Server-side password verification for staff login. There is one shared
 * password per role; the passwords live here as Supabase secrets and are never
 * shipped to the browser bundle. The user picks a role on the login screen and
 * enters that role's password.
 *
 * Required secrets (set once via CLI, then redeploy):
 *   supabase secrets set ADMIN_PASSWORD=<admin password>
 *   supabase secrets set STAFF_PASSWORD=<staff password>
 *   supabase secrets set TECH_PASSWORD=<technician password>
 *
 * Deploy:
 *   supabase functions deploy verify-login --no-verify-jwt
 *
 * Request:  POST { role: 'Admin' | 'Staff' | 'Technician', password: string }
 * Response: { ok: boolean } | { ok: false, rateLimited: true, retryAfter: number }
 *
 * Wrong password and config errors both return HTTP 200 with ok:false so the
 * client never needs to parse a FunctionsHttpError (same pattern as admin-delete).
 *
 * Brute-force protection (Deno KV, keyed by client IP):
 *   - 5 failed attempts within 15 minutes → 15-minute lockout.
 *   - Successful login clears the counter immediately.
 *
 * Password priority:
 *   1. PBKDF2 hash in role_passwords table (set via change-password function)
 *   2. Plain-text env secret (ADMIN_PASSWORD / STAFF_PASSWORD / TECH_PASSWORD)
 *
 * No external crypto dependencies — uses only the Web Crypto API built into Deno.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_ATTEMPTS  = 5
const WINDOW_MS     = 15 * 60 * 1000  // sliding window length
const LOCKOUT_MS    = 15 * 60 * 1000  // lockout duration after MAX_ATTEMPTS failures
const KV_TTL_MS     = LOCKOUT_MS + WINDOW_MS

interface AttemptRecord {
  attempts:     number
  windowStart:  number
  lockedUntil?: number
}

const enc = new TextEncoder()

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

/** Constant-time string comparison (same length only). */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

/**
 * Derive a PBKDF2 key from a password + role-specific salt.
 * Must match the derivation in the change-password function.
 */
async function deriveKey(password: string, role: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'],
  )
  const salt = enc.encode(`vrxe-${role}-pw-v1`)
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial, 256,
  )
  return btoa(String.fromCharCode(...new Uint8Array(bits)))
}

// KV is available on Supabase Deploy but not in all local runtimes.
// Brute-force protection is silently skipped when KV isn't available.
// deno-lint-ignore no-explicit-any
let kv: any = null
try { kv = await Deno.openKv() } catch { /* local runtime without KV support */ }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  const passwords: Record<string, string | undefined> = {
    Admin:      Deno.env.get('ADMIN_PASSWORD'),
    Staff:      Deno.env.get('STAFF_PASSWORD'),
    Technician: Deno.env.get('TECH_PASSWORD'),
  }

  if (!passwords.Admin || !passwords.Staff || !passwords.Technician) {
    return json(500, { ok: false, error: 'Login secrets not configured. Run: supabase secrets set ADMIN_PASSWORD=... STAFF_PASSWORD=... TECH_PASSWORD=...' })
  }

  let body: { role?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' })
  }

  const { role, password } = body

  if (role !== 'Admin' && role !== 'Staff' && role !== 'Technician') {
    return json(400, { ok: false, error: 'Invalid role' })
  }

  if (!password) {
    return json(200, { ok: false })
  }

  // ── Brute-force check (skipped when KV unavailable, e.g. local dev) ──────────

  const ip    = getClientIp(req)
  const kvKey = ['login_attempts', ip]
  const now   = Date.now()

  let record: AttemptRecord = { attempts: 0, windowStart: now }

  if (kv) {
    const entry = await kv.get(kvKey)
    record = (entry.value as AttemptRecord) ?? { attempts: 0, windowStart: now }

    if (record.lockedUntil && now < record.lockedUntil) {
      const retryAfter = Math.ceil((record.lockedUntil - now) / 1000)
      return json(200, { ok: false, rateLimited: true, retryAfter })
    }

    if (now - record.windowStart > WINDOW_MS) {
      record = { attempts: 0, windowStart: now }
    }
  }

  // ── Password verification ────────────────────────────────────────────────────
  // Check role_passwords table first (set via change-password function).
  // Fall back to env secret (plain-text constant-time compare) if no DB row yet.

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: dbRow } = await supabase
    .from('role_passwords')
    .select('password_hash')
    .eq('role', role)
    .maybeSingle()

  let ok = false

  if (dbRow?.password_hash) {
    const inputHash = await deriveKey(password, role)
    ok = timingSafeEqual(inputHash, dbRow.password_hash)
  } else {
    const expected = passwords[role]!
    // Constant-time comparison to prevent timing attacks
    if (password.length === expected.length) {
      const a = enc.encode(password)
      const b = enc.encode(expected)
      let diff = 0
      for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
      ok = diff === 0
    }
  }

  // ── Update attempt record ────────────────────────────────────────────────────

  if (kv) {
    if (ok) {
      await kv.delete(kvKey)
    } else {
      record.attempts++
      if (record.attempts >= MAX_ATTEMPTS) {
        record.lockedUntil = now + LOCKOUT_MS
      }
      await kv.set(kvKey, record, { expireIn: KV_TTL_MS })
    }
  }

  return json(200, { ok })
})
