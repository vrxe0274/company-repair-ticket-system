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
 */

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

const kv = await Deno.openKv()

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

  // ── Brute-force check ────────────────────────────────────────────────────────

  const ip    = getClientIp(req)
  const kvKey = ['login_attempts', ip]
  const now   = Date.now()

  const entry  = await kv.get<AttemptRecord>(kvKey)
  let   record = entry.value ?? { attempts: 0, windowStart: now }

  if (record.lockedUntil && now < record.lockedUntil) {
    const retryAfter = Math.ceil((record.lockedUntil - now) / 1000)
    return json(200, { ok: false, rateLimited: true, retryAfter })
  }

  // Reset counter when the window has rolled over
  if (now - record.windowStart > WINDOW_MS) {
    record = { attempts: 0, windowStart: now }
  }

  // ── Password verification ────────────────────────────────────────────────────

  const expected = passwords[role]!
  const encoder  = new TextEncoder()

  // Constant-time comparison to prevent timing attacks
  let ok = false
  if (password.length === expected.length) {
    const a = encoder.encode(password)
    const b = encoder.encode(expected)
    let diff = 0
    for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
    ok = diff === 0
  }

  // ── Update attempt record ────────────────────────────────────────────────────

  if (ok) {
    await kv.delete(kvKey)
  } else {
    record.attempts++
    if (record.attempts >= MAX_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUT_MS
    }
    await kv.set(kvKey, record, { expireIn: KV_TTL_MS })
  }

  return json(200, { ok })
})
