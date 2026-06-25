/**
 * tech-manage — Supabase Edge Function
 *
 * Admin-only technician account management: list, create, and delete individual
 * technician accounts stored in the technician_accounts table.
 *
 * Deploy:
 *   supabase functions deploy tech-manage --no-verify-jwt
 *
 * Actions:
 *   list       — Returns all accounts (id, username, name, created_at, created_by).
 *                Requires adminPassword.
 *   create     — Creates a new technician account. Requires adminPassword.
 *   delete     — Deletes a technician account by username. Requires adminPassword.
 *   set-name   — Updates the display name for a technician account (no password needed).
 *   list-names — Returns only username + name pairs (no password needed).
 *
 * Request:  POST { action, adminPassword?, username?, password?, name? }
 * Response: { ok: boolean, accounts?: [...], staff?: [...], error?: string }
 *
 * Password derivation: PBKDF2-SHA256, 100k iterations.
 * Salt: vrxe-tech-<username>-pw-v1 (must match tech-login).
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  corsHeaders, json, timingSafeEqual,
  deriveRoleKey, deriveTechKey,
} from '../_shared/auth.ts'

const MIN_PASSWORD_LENGTH = 8
const USERNAME_RE         = /^[a-zA-Z0-9_]{3,30}$/

// deno-lint-ignore no-explicit-any
async function verifyAdminPassword(adminPassword: string, supabase: any): Promise<boolean> {
  const adminSecret = Deno.env.get('ADMIN_PASSWORD')
  if (!adminSecret) return false

  const { data: row } = await supabase
    .from('role_passwords')
    .select('password_hash')
    .eq('role', 'Admin')
    .maybeSingle()

  if (row?.password_hash) {
    const inputHash = await deriveRoleKey(adminPassword, 'Admin')
    return timingSafeEqual(inputHash, row.password_hash)
  }

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
    currentPassword?: string
    newPassword?: string
    newUsername?: string
    name?: string
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

  // ── Change own password (no admin involvement) ────────────────────────────────

  if (action === 'change-password') {
    const { currentPassword, newPassword } = body
    if (!username)         return json(200, { ok: false, error: 'Username is required.' })
    if (!currentPassword)  return json(200, { ok: false, error: 'Current password is required.' })
    if (!newPassword || newPassword.length < MIN_PASSWORD_LENGTH) {
      return json(200, { ok: false, error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` })
    }
    if (currentPassword === newPassword) {
      return json(200, { ok: false, error: 'New password must differ from current password.' })
    }

    const { data: row } = await supabase
      .from('technician_accounts')
      .select('password_hash')
      .eq('username', username.trim())
      .maybeSingle()

    if (!row) return json(200, { ok: false, error: 'Account not found.' })

    const currentHash = await deriveTechKey(currentPassword, username.trim())
    if (!timingSafeEqual(currentHash, row.password_hash)) {
      return json(200, { ok: false, error: 'Current password is incorrect.' })
    }

    const newHash = await deriveTechKey(newPassword, username.trim())
    const { error } = await supabase
      .from('technician_accounts')
      .update({ password_hash: newHash, password_reset_required: false })
      .eq('username', username.trim())

    if (error) return json(500, { ok: false, error: 'Failed to save new password.' })
    return json(200, { ok: true })
  }

  // ── Change own username ───────────────────────────────────────────────────────

  if (action === 'change-username') {
    const { currentPassword, newUsername } = body
    if (!username)        return json(200, { ok: false, error: 'Username is required.' })
    if (!currentPassword) return json(200, { ok: false, error: 'Password is required to change username.' })
    if (!newUsername || !USERNAME_RE.test(newUsername.trim())) {
      return json(200, { ok: false, error: 'New username: 3–30 characters, letters, digits, underscores only.' })
    }
    const normalizedNew = newUsername.trim().toLowerCase()
    if (normalizedNew === username.trim()) {
      return json(200, { ok: false, error: 'New username must differ from current username.' })
    }

    const { data: row } = await supabase
      .from('technician_accounts')
      .select('password_hash')
      .eq('username', username.trim())
      .maybeSingle()

    if (!row) return json(200, { ok: false, error: 'Account not found.' })

    const currentHash = await deriveTechKey(currentPassword, username.trim())
    if (!timingSafeEqual(currentHash, row.password_hash)) {
      return json(200, { ok: false, error: 'Incorrect password.' })
    }

    const newHash = await deriveTechKey(currentPassword, normalizedNew)

    const { error } = await supabase
      .from('technician_accounts')
      .update({ username: normalizedNew, password_hash: newHash })
      .eq('username', username.trim())

    if (error) {
      if (error.code === '23505') return json(200, { ok: false, error: 'That username is already taken.' })
      return json(500, { ok: false, error: 'Failed to update username.' })
    }
    return json(200, { ok: true })
  }

  // ── Set name ──────────────────────────────────────────────────────────────────

  if (action === 'set-name') {
    const targetUsername = body.username
    const displayName    = body.name
    if (!targetUsername) return json(200, { ok: false, error: 'Username is required.' })
    if (!displayName || displayName.trim().length < 1) {
      return json(200, { ok: false, error: 'Name is required.' })
    }
    if (displayName.trim().length > 80) {
      return json(200, { ok: false, error: 'Name must be 80 characters or fewer.' })
    }

    const { error } = await supabase
      .from('technician_accounts')
      .update({ name: displayName.trim() })
      .eq('username', targetUsername.trim())

    if (error) return json(500, { ok: false, error: 'Failed to save name.' })
    return json(200, { ok: true })
  }

  // ── List names (no password required) ────────────────────────────────────────

  if (action === 'list-names') {
    const { data, error } = await supabase
      .from('technician_accounts')
      .select('username, name')
      .order('name', { ascending: true })

    if (error) return json(500, { ok: false, error: 'Failed to fetch technician names.' })
    return json(200, { ok: true, staff: data ?? [] })
  }

  // ── All other actions require admin password ───────────────────────────────────

  if (!adminPassword) {
    return json(200, { ok: false, error: 'Admin password is required.' })
  }

  const adminOk = await verifyAdminPassword(adminPassword, supabase)
  if (!adminOk) {
    return json(200, { ok: false, error: 'Incorrect admin password.' })
  }

  // ── Reset password (admin-initiated) ─────────────────────────────────────────

  if (action === 'reset-password') {
    if (!username) return json(200, { ok: false, error: 'Username is required.' })

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const bytes = new Uint8Array(12)
    crypto.getRandomValues(bytes)
    const tempPassword = Array.from(bytes, b => chars[b % chars.length]).join('')

    const passwordHash = await deriveTechKey(tempPassword, username.trim())

    const { error } = await supabase
      .from('technician_accounts')
      .update({ password_hash: passwordHash, password_reset_required: true })
      .eq('username', username.trim())

    if (error) return json(500, { ok: false, error: 'Failed to reset password.' })
    return json(200, { ok: true, tempPassword })
  }

  // ── List ─────────────────────────────────────────────────────────────────────

  if (action === 'list') {
    const { data, error } = await supabase
      .from('technician_accounts')
      .select('id, username, name, created_at, created_by')
      .order('created_at', { ascending: false })

    if (error) return json(500, { ok: false, error: 'Failed to fetch accounts.' })
    return json(200, { ok: true, accounts: data ?? [] })
  }

  // ── Create ────────────────────────────────────────────────────────────────────

  if (action === 'create') {
    const normalizedUsername = (username ?? '').trim()
    if (!normalizedUsername || !USERNAME_RE.test(normalizedUsername)) {
      return json(200, {
        ok: false,
        error: 'Username must be 3–30 characters (letters, digits, underscores only).',
      })
    }
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return json(200, { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` })
    }

    const passwordHash = await deriveTechKey(password, normalizedUsername)

    const { error } = await supabase.from('technician_accounts').insert({
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
      .from('technician_accounts')
      .delete()
      .eq('username', username.trim())

    if (error) return json(500, { ok: false, error: 'Failed to delete account.' })
    return json(200, { ok: true })
  }

  return json(400, { ok: false, error: 'Invalid action.' })
})
