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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_ATTEMPTS = 5
const WINDOW_MS    = 15 * 60 * 1000
const LOCKOUT_MS   = 15 * 60 * 1000
const KV_TTL_MS    = LOCKOUT_MS + WINDOW_MS

interface AttemptRecord {
  attempts:    number
  windowStart: number
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

function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

async function deriveKey(password: string, username: string): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'],
  )
  const salt = enc.encode(`vrxe-staff-${username}-pw-v1`)
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial, 256,
  )
  return btoa(String.fromCharCode(...new Uint8Array(bits)))
}

// deno-lint-ignore no-explicit-any
let kv: any = null
try { kv = await Deno.openKv() } catch { /* local runtime without KV support */ }

Deno.serve(async (req) => {
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

  // ── Verify against staff_accounts table ───────────────────────────────────

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: account } = await supabase
    .from('staff_accounts')
    .select('password_hash, name')
    .eq('username', normalizedUsername)
    .maybeSingle()

  let ok = false

  if (account?.password_hash) {
    const inputHash = await deriveKey(password, normalizedUsername)
    ok = timingSafeEqual(inputHash, account.password_hash)
  }

  // ── Update attempt record ─────────────────────────────────────────────────

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

  return json(200, { ok, name: ok ? (account?.name ?? null) : undefined })
})
