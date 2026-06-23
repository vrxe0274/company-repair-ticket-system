/**
 * staff-manage — Supabase Edge Function
 *
 * Admin-only staff account management: list, create, and delete individual
 * Staff accounts stored in the staff_accounts table.
 *
 * Deploy:
 *   supabase functions deploy staff-manage --no-verify-jwt
 *
 * Actions:
 *   list   — Returns all accounts (id, username, created_at, created_by).
 *             No password required; data is non-sensitive.
 *   create — Creates a new staff account. Requires adminPassword.
 *   delete — Deletes a staff account by username. Requires adminPassword.
 *
 * Request:  POST { action, adminPassword?, username?, password? }
 * Response: { ok: boolean, accounts?: [...], error?: string }
 *
 * Admin password verification mirrors verify-login:
 *   1. PBKDF2 hash in role_passwords table (if Admin has changed their password)
 *   2. ADMIN_PASSWORD env secret (plain-text constant-time compare)
 *
 * Password derivation for staff accounts: PBKDF2-SHA256, 100k iterations.
 * Salt: vrxe-staff-<username>-pw-v1 (must match staff-login).
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MIN_PASSWORD_LENGTH = 8
const USERNAME_RE         = /^[a-zA-Z0-9_]{3,30}$/

const enc = new TextEncoder()

function json(status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

/** PBKDF2 derivation with role salt — used to verify the Admin's own password. */
async function deriveRoleKey(password: string, role: string): Promise<string> {
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

/** PBKDF2 derivation with per-username salt — used for staff account passwords. */
async function deriveStaffKey(password: string, username: string): Promise<string> {
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
async function verifyAdminPassword(supabase: any, adminPassword: string): Promise<boolean> {
  const adminSecret = Deno.env.get('ADMIN_PASSWORD')
  if (!adminSecret) return false

  // Check DB hash first (set via change-password function)
  const { data: row } = await supabase
    .from('role_passwords')
    .select('password_hash')
    .eq('role', 'Admin')
    .maybeSingle()

  if (row?.password_hash) {
    const inputHash = await deriveRoleKey(adminPassword, 'Admin')
    return timingSafeEqual(inputHash, row.password_hash)
  }

  // Fall back to env secret (constant-time compare)
  return timingSafeEqual(adminPassword, adminSecret)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  let body: {
    action?: string
    adminPassword?: string
    username?: string
    password?: string
  }
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' })
  }

  const { action, adminPassword, username, password } = body

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── List ─────────────────────────────────────────────────────────────────────
  // Returns usernames + metadata only (no hashes). No password gate — the data
  // is non-sensitive and the page is already guarded client-side by isAdmin.

  if (action === 'list') {
    const { data, error } = await supabase
      .from('staff_accounts')
      .select('id, username, name, created_at, created_by')
      .order('created_at', { ascending: false })

    if (error) return json(500, { ok: false, error: 'Failed to fetch accounts.' })
    return json(200, { ok: true, accounts: data ?? [] })
  }

  // ── Set name ──────────────────────────────────────────────────────────────────
  // Called on first login; no password required since the staff member just
  // authenticated via staff-login. Worst-case abuse: someone overwrites a
  // display name — not a security issue for this system.

  if (action === 'set-name') {
    const { username: targetUsername, name: displayName } = body as { username?: string; name?: string }
    if (!targetUsername) return json(200, { ok: false, error: 'Username is required.' })
    if (!displayName || displayName.trim().length < 1) {
      return json(200, { ok: false, error: 'Name is required.' })
    }
    if (displayName.trim().length > 80) {
      return json(200, { ok: false, error: 'Name must be 80 characters or fewer.' })
    }

    const { error } = await supabase
      .from('staff_accounts')
      .update({ name: displayName.trim() })
      .eq('username', targetUsername.trim())

    if (error) return json(500, { ok: false, error: 'Failed to save name.' })
    return json(200, { ok: true })
  }

  // ── Create / Delete — require admin password ──────────────────────────────────

  if (action !== 'create' && action !== 'delete') {
    return json(400, { ok: false, error: 'Invalid action.' })
  }

  if (!adminPassword) {
    return json(200, { ok: false, error: 'Admin password is required.' })
  }

  const adminOk = await verifyAdminPassword(supabase, adminPassword)
  if (!adminOk) {
    return json(200, { ok: false, error: 'Incorrect admin password.' })
  }

  // ── Create ────────────────────────────────────────────────────────────────────

  if (action === 'create') {
    if (!username || !USERNAME_RE.test(username)) {
      return json(200, {
        ok: false,
        error: 'Username must be 3–30 characters (lowercase letters, digits, underscores only).',
      })
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return json(200, { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` })
    }

    const normalizedUsername = username.trim()
    const passwordHash       = await deriveStaffKey(password, normalizedUsername)

    const { error } = await supabase.from('staff_accounts').insert({
      username:      normalizedUsername,
      password_hash: passwordHash,
      created_by:    'admin',
    })

    if (error) {
      if (error.code === '23505') {
        return json(200, { ok: false, error: 'That username is already taken.' })
      }
      return json(500, { ok: false, error: 'Failed to create account.' })
    }

    return json(200, { ok: true })
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  if (action === 'delete') {
    if (!username) {
      return json(200, { ok: false, error: 'Username is required.' })
    }

    const { error } = await supabase
      .from('staff_accounts')
      .delete()
      .eq('username', username.trim())

    if (error) return json(500, { ok: false, error: 'Failed to delete account.' })
    return json(200, { ok: true })
  }
})
