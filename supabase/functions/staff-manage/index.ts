/**
 * staff-manage — Supabase Edge Function
 *
 * Staff account management: list, create, and delete individual Staff accounts
 * stored in the staff_accounts table.
 *
 * Deploy:
 *   supabase functions deploy staff-manage --no-verify-jwt
 *
 * Actions:
 *   list        — Returns all accounts (id, username, name, created_at, created_by).
 *   list-names  — Returns all staff usernames and names.
 *   create      — Creates a new staff account.
 *   delete      — Deletes a staff account by username.
 *
 * NOTE: per-account commission_pct/set-commission has been removed. Commission
 * is now entered manually per repair (tickets.tech_commission_pct /
 * staff_commission_pct), set by Admin after the ticket is Paid.
 *
 * Request:  POST { action, username?, password? }
 * Response: { ok: boolean, accounts?: [...], error?: string }
 *
 * SECURITY: create/delete/reset-password have NO server-side authorization. This
 * function is deployed --no-verify-jwt, so they are callable by anyone with the
 * (public) anon key. The Accounts page is admin-only in the UI only — add real
 * auth (verify-jwt or a shared secret) before treating these as protected.
 *
 * Password derivation for staff accounts: PBKDF2-SHA256, 100k iterations.
 * Salt: vrxe-staff-<username>-pw-v1 (must match staff-login).
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  corsHeaders, json, timingSafeEqual,
  deriveStaffKey, generateTempPassword,
  checkRateLimit, updateRateLimit,
} from '../_shared/auth.ts'

const MIN_PASSWORD_LENGTH = 8
const USERNAME_RE         = /^[a-z0-9_]{3,30}$/

Deno.serve(async (req) => {
  try {
    return await handleRequest(req)
  } catch (err) {
    // An uncaught throw here would otherwise bubble up as the edge runtime's
    // default 500 — which is emitted WITHOUT our CORS headers, so the browser
    // blocks the response and supabase-js reports only a generic
    // FunctionsFetchError ("Connection error"). Routing it back through json()
    // keeps the CORS headers and surfaces the real reason to the caller.
    console.error('staff-manage unhandled error:', err)
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

  // deno-lint-ignore no-explicit-any
  let kv: any = null
  try { kv = await Deno.openKv() } catch { /* KV unavailable; rate limiting disabled */ }

  // ── Change own password (no admin involvement) ────────────────────────────────
  // The staff member verifies their own current password then sets a new one.
  // Also clears password_reset_required so a forced-reset flow is resolved.

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

    const kvKey = ['staff-manage', 'change-password', username.trim()]
    const now   = Date.now()
    const rl    = await checkRateLimit(kv, kvKey, now)
    if (rl.limited) {
      return json(200, { ok: false, error: `Too many attempts. Try again in ${rl.retryAfter}s.` })
    }

    const { data: row } = await supabase
      .from('staff_accounts')
      .select('password_hash')
      .eq('username', username.trim())
      .maybeSingle()

    if (!row) return json(200, { ok: false, error: 'Account not found.' })

    const currentHash = await deriveStaffKey(currentPassword, username.trim())
    const matched     = timingSafeEqual(currentHash, row.password_hash)
    await updateRateLimit(kv, kvKey, rl.record, matched, now)

    if (!matched) {
      return json(200, { ok: false, error: 'Current password is incorrect.' })
    }

    const newHash = await deriveStaffKey(newPassword, username.trim())
    const { error } = await supabase
      .from('staff_accounts')
      .update({ password_hash: newHash, password_reset_required: false })
      .eq('username', username.trim())

    if (error) return json(500, { ok: false, error: 'Failed to save new password.' })
    return json(200, { ok: true })
  }

  // ── Change own username ───────────────────────────────────────────────────────
  // Requires current password because the PBKDF2 salt embeds the username —
  // changing the username means the stored hash must be re-derived with the new salt.

  if (action === 'change-username') {
    const { currentPassword, newUsername } = body
    if (!username)        return json(200, { ok: false, error: 'Username is required.' })
    if (!currentPassword) return json(200, { ok: false, error: 'Password is required to change username.' })
    if (!newUsername || !USERNAME_RE.test(newUsername.trim().toLowerCase())) {
      return json(200, { ok: false, error: 'New username: 3–30 characters, lowercase letters, digits, underscores only.' })
    }
    const normalizedCurrent = username.trim().toLowerCase()
    const normalizedNew     = newUsername.trim().toLowerCase()
    if (normalizedNew === normalizedCurrent) {
      return json(200, { ok: false, error: 'New username must differ from current username.' })
    }

    const kvKey = ['staff-manage', 'change-username', normalizedCurrent]
    const now   = Date.now()
    const rl    = await checkRateLimit(kv, kvKey, now)
    if (rl.limited) {
      return json(200, { ok: false, error: `Too many attempts. Try again in ${rl.retryAfter}s.` })
    }

    const { data: row } = await supabase
      .from('staff_accounts')
      .select('password_hash')
      .eq('username', normalizedCurrent)
      .maybeSingle()

    if (!row) return json(200, { ok: false, error: 'Account not found.' })

    const currentHash = await deriveStaffKey(currentPassword, normalizedCurrent)
    const matched     = timingSafeEqual(currentHash, row.password_hash)
    await updateRateLimit(kv, kvKey, rl.record, matched, now)

    if (!matched) {
      return json(200, { ok: false, error: 'Incorrect password.' })
    }

    // Re-derive hash under the new username salt before saving.
    const newHash = await deriveStaffKey(currentPassword, normalizedNew)

    const { error } = await supabase
      .from('staff_accounts')
      .update({ username: normalizedNew, password_hash: newHash })
      .eq('username', normalizedCurrent)

    if (error) {
      if (error.code === '23505') return json(200, { ok: false, error: 'That username is already taken.' })
      return json(500, { ok: false, error: 'Failed to update username.' })
    }
    return json(200, { ok: true })
  }

  // ── Set name ──────────────────────────────────────────────────────────────────
  // Called on first login; no password required since the staff member just
  // authenticated via staff-login. Worst-case abuse: someone overwrites a
  // display name — not a security issue for this system.

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
      .from('staff_accounts')
      .update({ name: displayName.trim() })
      .eq('username', targetUsername.trim())

    if (error) return json(500, { ok: false, error: 'Failed to save name.' })
    return json(200, { ok: true })
  }

  // ── List names (no password required) ────────────────────────────────────────

  if (action === 'list-names') {
    const { data, error } = await supabase
      .from('staff_accounts')
      .select('username, name')
      .order('name', { ascending: true })

    if (error) return json(500, { ok: false, error: 'Failed to fetch staff names.' })
    return json(200, { ok: true, staff: data ?? [] })
  }

  // ── List (no password required) ───────────────────────────────────────────────

  if (action === 'list') {
    const { data, error } = await supabase
      .from('staff_accounts')
      .select('id, username, name, created_at, created_by')
      .order('created_at', { ascending: false })

    if (error) return json(500, { ok: false, error: 'Failed to fetch accounts.' })
    return json(200, { ok: true, accounts: data ?? [] })
  }

  // ── Reset password (admin-initiated) ─────────────────────────────────────────
  // Generates a server-side random temp password. Admin never chooses it — they
  // only see it once to hand to the employee verbally. Sets password_reset_required
  // so the employee is forced to change it on next login.

  if (action === 'reset-password') {
    if (!username) return json(200, { ok: false, error: 'Username is required.' })

    const { data: existing } = await supabase
      .from('staff_accounts')
      .select('username')
      .eq('username', username.trim())
      .maybeSingle()

    if (!existing) return json(200, { ok: false, error: 'Account not found.' })

    const tempPassword = generateTempPassword()

    const passwordHash = await deriveStaffKey(tempPassword, username.trim())

    const { error } = await supabase
      .from('staff_accounts')
      .update({ password_hash: passwordHash, password_reset_required: true })
      .eq('username', username.trim())

    if (error) {
      console.error('staff reset-password failed:', JSON.stringify(error))
      return json(500, { ok: false, error: `Failed to reset password: ${error.message ?? error.code ?? 'unknown'}` })
    }
    return json(200, { ok: true, tempPassword })
  }

  // ── Create ────────────────────────────────────────────────────────────────────

  if (action === 'create') {
    const normalizedUsername = (username ?? '').trim().toLowerCase()
    if (!normalizedUsername || !USERNAME_RE.test(normalizedUsername)) {
      return json(200, {
        ok: false,
        error: 'Username must be 3–30 characters (lowercase letters, digits, underscores only).',
      })
    }

    // Generate a unique random temp password server-side (same charset as reset-password).
    // The client never supplies a password for new accounts — only the admin sees this
    // value once in the UI, then the employee must change it on first login.
    const tempPassword = generateTempPassword()

    const passwordHash = await deriveStaffKey(tempPassword, normalizedUsername)

    const { error } = await supabase.from('staff_accounts').insert({
      username:                normalizedUsername,
      password_hash:           passwordHash,
      created_by:              'admin',
      password_reset_required: true,
    })

    if (error) {
      if (error.code === '23505') {
        return json(200, { ok: false, error: 'That username is already taken.' })
      }
      console.error('staff create insert failed:', JSON.stringify(error))
      return json(500, { ok: false, error: `Failed to create account: ${error.message ?? error.code ?? 'unknown'}` })
    }

    return json(200, { ok: true, tempPassword })
  }

  // ── Delete ────────────────────────────────────────────────────────────────────

  if (action === 'delete') {
    if (!username) {
      return json(200, { ok: false, error: 'Username is required.' })
    }

    const { data: existing } = await supabase
      .from('staff_accounts')
      .select('username')
      .eq('username', username.trim())
      .maybeSingle()

    if (!existing) return json(200, { ok: false, error: 'Account not found.' })

    const { error } = await supabase
      .from('staff_accounts')
      .delete()
      .eq('username', username.trim())

    if (error) {
      if (error.code === '23503') {
        return json(200, { ok: false, error: 'Cannot delete account — it is still referenced by existing records.' })
      }
      console.error('staff delete failed:', JSON.stringify(error))
      return json(200, { ok: false, error: `Failed to delete account: ${error.message ?? error.code ?? 'unknown'}` })
    }

    // Account row is gone — also purge its attendance history so the Attendance
    // page no longer shows the deleted account. role filter avoids touching a
    // technician that happens to share the same username (separate table).
    const { error: attError } = await supabase
      .from('attendance_logs')
      .delete()
      .eq('username', username.trim())
      .eq('role', 'Staff')

    if (attError) {
      console.error('staff attendance cleanup failed:', JSON.stringify(attError))
      // Account is already deleted — don't block the UI on best-effort cleanup.
    }
    return json(200, { ok: true })
  }

  return json(400, { ok: false, error: 'Invalid action.' })
}
