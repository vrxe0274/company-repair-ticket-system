/**
 * staff-login — Supabase Edge Function
 *
 * Server-side verification for individual Staff accounts (username + password).
 * Unlike verify-login (which uses one shared password per role), this function
 * checks credentials against the staff_accounts table.
 *
 * Deploy:
 *   supabase functions deploy staff-login --no-verify-jwt
 *
 * Request:  POST { username: string, password: string }
 * Response: { ok: boolean } | { ok: false, rateLimited: true, retryAfter: number }
 *
 * Brute-force protection (Deno KV, keyed by IP + username):
 *   5 failed attempts within 15 minutes → 15-minute lockout.
 *   Successful login clears the counter immediately.
 *
 * Password derivation: PBKDF2-SHA256, 100k iterations.
 * Salt: vrxe-staff-<username>-pw-v1 (unique per account; matches staff-manage).
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  corsHeaders, json, timingSafeEqual, getClientIp,
  deriveStaffKey, checkRateLimit, updateRateLimit,
} from '../_shared/auth.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

// deno-lint-ignore no-explicit-any
let kv: any = null
try { kv = await Deno.openKv() } catch { /* local runtime without KV support */ }

Deno.serve(async (req) => {
  try {
    return await handleRequest(req)
  } catch (err) {
    // An uncaught throw here would otherwise surface as the edge runtime's
    // default 500 — emitted WITHOUT our CORS headers, so the browser blocks it
    // and supabase-js reports only a generic "Connection error". Routing it back
    // through json() keeps CORS and surfaces the real reason to the caller.
    console.error('staff-login unhandled error:', err)
    return json(500, { ok: false, error: err instanceof Error ? err.message : 'Unexpected server error.' })
  }
})

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  let body: { username?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' })
  }

  const { username, password } = body

  if (!username || typeof username !== 'string' || !password) {
    return json(200, { ok: false })
  }

  const normalizedUsername = username.trim()

  // ── Brute-force check (keyed by IP + username) ────────────────────────────

  const ip    = getClientIp(req)
  const kvKey = ['staff_login', ip, normalizedUsername]
  const now   = Date.now()

  const rateCheck = await checkRateLimit(kv, kvKey, now)
  if (rateCheck.limited) {
    return json(200, { ok: false, rateLimited: true, retryAfter: rateCheck.retryAfter })
  }
  const { record } = rateCheck

  // ── Verify against staff_accounts table ───────────────────────────────────

  const { data: account } = await supabase
    .from('staff_accounts')
    .select('password_hash, name, password_reset_required')
    .eq('username', normalizedUsername)
    .maybeSingle()

  let ok = false

  if (account?.password_hash) {
    const inputHash = await deriveStaffKey(password, normalizedUsername)
    ok = timingSafeEqual(inputHash, account.password_hash)
  }

  // ── Update attempt record ─────────────────────────────────────────────────

  await updateRateLimit(kv, kvKey, record, ok, now)

  return json(200, {
    ok,
    name:              ok ? (account?.name ?? null)                     : undefined,
    mustChangePassword: ok ? (account?.password_reset_required ?? false) : undefined,
  })
}
