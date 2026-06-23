/**
 * change-password — Supabase Edge Function
 *
 * Allows Admin and Technician to change their role's shared password at runtime.
 * Verifies the current password (checking the role_passwords DB table first,
 * then falling back to the env secret for first-time changes), then derives a
 * PBKDF2 key and upserts the result into role_passwords.
 *
 * No external crypto dependencies — uses the Web Crypto API built into Deno.
 *
 * Required secrets (auto-injected or set via CLI):
 *   ADMIN_PASSWORD / TECH_PASSWORD  — fallback for first-time change (no DB row yet)
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase
 *
 * Deploy:
 *   supabase functions deploy change-password --no-verify-jwt
 *
 * Request:  POST { role: 'Admin' | 'Technician', currentPassword: string, newPassword: string }
 * Response: { ok: boolean, error?: string }
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const enc = new TextEncoder()

/**
 * Derive a PBKDF2 key from a password + role-specific salt.
 * Returns a base64 string suitable for storage and constant-time comparison.
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

/** Constant-time string comparison (same length only). */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

const ALLOWED_ROLES = new Set(['Admin', 'Technician'])
const MIN_LENGTH    = 8

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  const envPasswords: Record<string, string | undefined> = {
    Admin:      Deno.env.get('ADMIN_PASSWORD'),
    Technician: Deno.env.get('TECH_PASSWORD'),
  }

  let body: { role?: string; currentPassword?: string; newPassword?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' })
  }

  const { role, currentPassword, newPassword } = body

  if (!role || !ALLOWED_ROLES.has(role)) {
    return json(200, { ok: false, error: 'Invalid role.' })
  }
  if (!currentPassword) {
    return json(200, { ok: false, error: 'Current password is required.' })
  }
  if (!newPassword || newPassword.length < MIN_LENGTH) {
    return json(200, { ok: false, error: `New password must be at least ${MIN_LENGTH} characters.` })
  }
  if (currentPassword === newPassword) {
    return json(200, { ok: false, error: 'New password must differ from current password.' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── Verify current password ────────────────────────────────────────────────
  // DB hash (PBKDF2) takes precedence; env secret is the fallback for first change.

  const { data: row } = await supabase
    .from('role_passwords')
    .select('password_hash')
    .eq('role', role)
    .maybeSingle()

  let currentOk = false

  if (row?.password_hash) {
    const inputHash = await deriveKey(currentPassword, role)
    currentOk = timingSafeEqual(inputHash, row.password_hash)
  } else {
    const expected = envPasswords[role]
    if (expected) {
      currentOk = timingSafeEqual(currentPassword, expected)
    }
  }

  if (!currentOk) {
    return json(200, { ok: false, error: 'Current password is incorrect.' })
  }

  // ── Derive and store new password hash ────────────────────────────────────

  const newHash = await deriveKey(newPassword, role)

  const { error: upsertError } = await supabase
    .from('role_passwords')
    .upsert({ role, password_hash: newHash, updated_at: new Date().toISOString() })

  if (upsertError) {
    return json(500, { ok: false, error: 'Failed to save new password.' })
  }

  return json(200, { ok: true })
})
