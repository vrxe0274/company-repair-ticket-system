/**
 * session-manage — Supabase Edge Function
 *
 * Read/side-effect operations on a server session, keyed by its opaque token.
 * Split from the *-login functions because these run without a password.
 *
 * Deploy:
 *   supabase functions deploy session-manage --no-verify-jwt
 *
 * Request:  POST { action: 'validate' | 'revoke', token: string }
 * Response:
 *   validate → { ok: true, valid: boolean, role?, username?, name?, expiresAt?, attendanceLogId? }
 *   revoke   → { ok: true }
 *
 * validate (called on every app load):
 *   - unknown / expired token → { valid: false } (client logs out)
 *   - valid → slides the 30-day/12-hour expiry forward, rotates the attendance
 *     row when the previous one was closed (per-day logging for persistent PWAs),
 *     and returns fresh identity + expiry.
 *
 * revoke (called on explicit logout):
 *   - closes the session's open attendance row (logout_reason='manual') and
 *     deletes the session so the token can never be reused.
 *
 * The sessions table is service_role-only (see sql/sessions-setup.sql); this
 * function holds the service key and is the sole gateway to it.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json, validateSession, revokeSession } from '../_shared/auth.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

Deno.serve(async (req) => {
  try {
    return await handleRequest(req)
  } catch (err) {
    console.error('session-manage unhandled error:', err)
    return json(500, { ok: false, error: err instanceof Error ? err.message : 'Unexpected server error.' })
  }
})

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  let body: { action?: string; token?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' })
  }

  const { action, token } = body
  if (!token || typeof token !== 'string') {
    return json(400, { ok: false, error: 'Missing token' })
  }

  if (action === 'validate') {
    const result = await validateSession(supabase, token)
    return json(200, { ok: true, ...result })
  }

  if (action === 'revoke') {
    const result = await revokeSession(supabase, token)
    return json(200, result)
  }

  return json(400, { ok: false, error: 'Invalid action' })
}
