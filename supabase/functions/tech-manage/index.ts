/**
 * tech-manage — Supabase Edge Function
 *
 * Technician account management: list, create, and delete individual technician
 * accounts stored in the technician_accounts table.
 *
 * Deploy:
 *   supabase functions deploy tech-manage --no-verify-jwt
 *
 * Actions:
 *   list       — Returns all accounts (id, username, name, created_at, created_by).
 *   create     — Creates a new technician account.
 *   delete     — Deletes a technician account by username.
 *   set-name   — Updates the display name for a technician account.
 *   list-names — Returns only username + name pairs.
 *
 * NOTE: per-account commission_pct/set-commission has been removed. Commission
 * is now entered manually per repair (tickets.tech_commission_pct /
 * staff_commission_pct), set by Admin after the ticket is Paid.
 *
 * SECURITY: no server-side authorization on any action. Deployed --no-verify-jwt,
 * so all actions are callable by anyone with the (public) anon key. Admin-only in
 * the UI only — add real auth before treating create/delete/reset as protected.
 *
 * Request:  POST { action, username?, password?, name? }
 * Response: { ok: boolean, accounts?: [...], staff?: [...], error?: string }
 *
 * Password derivation: PBKDF2-SHA256, 100k iterations.
 * Salt: vrxe-tech-<username>-pw-v1 (must match tech-login).
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  corsHeaders, json, timingSafeEqual,
  deriveTechKey, generateTempPassword,
} from '../_shared/auth.ts'

const MIN_PASSWORD_LENGTH = 8
const USERNAME_RE         = /^[a-zA-Z0-9_]{3,30}$/

Deno.serve(async (req) => {
  try {
    return await handleRequest(req)
  } catch (err) {
    // An uncaught throw here would otherwise bubble up as the edge runtime's
    // default 500 — which is emitted WITHOUT our CORS headers, so the browser
    // blocks the response and supabase-js reports only a generic
    // FunctionsFetchError ("Connection error"). Routing it back through json()
    // keeps the CORS headers and surfaces the real reason to the caller.
    console.error('tech-manage unhandled error:', err)
    return json(500, { ok: false, error: err instanceof Error ? err.message : 'Unexpected server error.' })
  }
})

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  let body: {
    action?: string
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

  const { action, username, password } = body

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

  // ── List (no password required) ──────────────────────────────────────────────

  if (action === 'list') {
    const { data, error } = await supabase
      .from('technician_accounts')
      .select('id, username, name, created_at, created_by')
      .order('created_at', { ascending: false })

    if (error) return json(500, { ok: false, error: 'Failed to fetch accounts.' })
    return json(200, { ok: true, accounts: data ?? [] })
  }

  // ── Reset password (admin-initiated) ─────────────────────────────────────────

  if (action === 'reset-password') {
    if (!username) return json(200, { ok: false, error: 'Username is required.' })

    const tempPassword = generateTempPassword()

    const passwordHash = await deriveTechKey(tempPassword, username.trim())

    const { error } = await supabase
      .from('technician_accounts')
      .update({ password_hash: passwordHash, password_reset_required: true })
      .eq('username', username.trim())

    if (error) return json(500, { ok: false, error: 'Failed to reset password.' })
    return json(200, { ok: true, tempPassword })
  }

  // ── Create ────────────────────────────────────────────────────────────────────

  if (action === 'create') {
    const normalizedUsername = (username ?? '').trim().toLowerCase()
    if (!normalizedUsername || !USERNAME_RE.test(normalizedUsername)) {
      return json(200, {
        ok: false,
        error: 'Username must be 3–30 characters (letters, digits, underscores only).',
      })
    }

    // Generate a unique random temp password server-side (same charset as reset-password).
    // The client never supplies a password for new accounts — only the admin sees this
    // value once in the UI, then the employee must change it on first login.
    const tempPassword = generateTempPassword()

    const passwordHash = await deriveTechKey(tempPassword, normalizedUsername)

    const { error } = await supabase.from('technician_accounts').insert({
      username:                normalizedUsername,
      password_hash:           passwordHash,
      created_by:              'admin',
      password_reset_required: true,
    })

    if (error) {
      if (error.code === '23505') {
        return json(200, { ok: false, error: 'That username is already taken.' })
      }
      return json(500, { ok: false, error: 'Failed to create account.' })
    }

    return json(200, { ok: true, tempPassword })
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  if (action === 'delete') {
    if (!username) {
      return json(200, { ok: false, error: 'Username is required.' })
    }

    const { data: existing } = await supabase
      .from('technician_accounts')
      .select('username')
      .eq('username', username.trim())
      .maybeSingle()

    if (!existing) return json(200, { ok: false, error: 'Account not found.' })

    const { error } = await supabase
      .from('technician_accounts')
      .delete()
      .eq('username', username.trim())

    if (error) {
      if (error.code === '23503') {
        return json(200, { ok: false, error: 'Cannot delete account — it is still referenced by existing records.' })
      }
      return json(200, { ok: false, error: 'Failed to delete account.' })
    }

    // Account row is gone — also purge its attendance history so the Attendance
    // page no longer shows the deleted account. role filter avoids touching a
    // staff member that happens to share the same username (separate table).
    const { error: attError } = await supabase
      .from('attendance_logs')
      .delete()
      .eq('username', username.trim())
      .eq('role', 'Technician')

    if (attError) {
      console.error('tech attendance cleanup failed:', JSON.stringify(attError))
      // Account is already deleted — don't block the UI on best-effort cleanup.
    }
    return json(200, { ok: true })
  }

  return json(400, { ok: false, error: 'Invalid action.' })
}
