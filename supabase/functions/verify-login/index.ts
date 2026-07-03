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
import {
  corsHeaders, json, timingSafeEqual, getClientIp,
  deriveRoleKey, checkRateLimit, updateRateLimit, createSession,
} from '../_shared/auth.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// KV is available on Supabase Deploy but not in all local runtimes.
// Brute-force protection is silently skipped when KV isn't available.
// deno-lint-ignore no-explicit-any
let kv: any = null
try { kv = await Deno.openKv() } catch { /* local runtime without KV support */ }

Deno.serve(async (req) => {
  try {
    return await handleRequest(req)
  } catch (err) {
    // An uncaught throw here would otherwise bubble up as the edge runtime's
    // default 500 — emitted as text/plain WITHOUT our CORS headers, so the
    // browser blocks it and supabase-js reports only a generic
    // FunctionsFetchError. Routing it through json() keeps CORS and surfaces
    // the real reason to the caller.
    console.error('verify-login unhandled error:', err)
    return json(500, { ok: false, error: err instanceof Error ? err.message : 'Unexpected server error.' })
  }
})

async function handleRequest(req: Request): Promise<Response> {
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

  let body: { role?: string; password?: string; persistent?: boolean }
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' })
  }

  const { role, password, persistent } = body

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

  const rateCheck = await checkRateLimit(kv, kvKey, now)
  if (rateCheck.limited) {
    return json(200, { ok: false, rateLimited: true, retryAfter: rateCheck.retryAfter })
  }
  const { record } = rateCheck

  // ── Password verification ────────────────────────────────────────────────────
  // Check role_passwords table first (set via change-password function).
  // Fall back to env secret (plain-text constant-time compare) if no DB row yet.

  const { data: dbRow } = await supabase
    .from('role_passwords')
    .select('password_hash')
    .eq('role', role)
    .maybeSingle()

  let ok = false

  if (dbRow?.password_hash) {
    const inputHash = await deriveRoleKey(password, role)
    ok = timingSafeEqual(inputHash, dbRow.password_hash)
  } else {
    ok = timingSafeEqual(password, passwords[role]!)
  }

  // ── Update attempt record ────────────────────────────────────────────────────

  await updateRateLimit(kv, kvKey, record, ok, now)

  if (!ok) return json(200, { ok: false })

  // Mint a server session (token + attendance row) on success.
  const session = await createSession(supabase, { role, persistent: persistent ?? false })
  return json(200, { ok: true, ...session })
}
