/**
 * manage-push — Supabase Edge Function
 *
 * Handles push subscription registration and removal for staff devices.
 * Uses the service-role key for all DB writes so the anon client no longer
 * needs direct INSERT/UPDATE/DELETE access on push_subscriptions.
 * See sql/push-lockdown.sql.
 *
 * Actions:
 *   { action: 'subscribe',   endpoint, p256dh, auth, role?, userAgent? }
 *   { action: 'unsubscribe', endpoint }
 *
 * Deploy:  supabase functions deploy manage-push --no-verify-jwt
 * (--no-verify-jwt matches the project's shared-password auth model.)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/auth.ts'

const VALID_ROLES = new Set(['Admin', 'Technician'])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  let body: {
    action?:    string
    endpoint?:  string
    p256dh?:    string
    auth?:      string
    role?:      string
    userAgent?: string
  }
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' })
  }

  const { action, endpoint } = body

  // Push service endpoints are always HTTPS
  if (!endpoint || typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    return json(400, { ok: false, error: 'A valid https endpoint is required' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── Subscribe ───────────────────────────────────────────────────────────────

  if (action === 'subscribe') {
    const { p256dh, auth: authKey, role, userAgent } = body

    if (!p256dh || typeof p256dh !== 'string') {
      return json(400, { ok: false, error: 'p256dh is required' })
    }
    if (!authKey || typeof authKey !== 'string') {
      return json(400, { ok: false, error: 'auth is required' })
    }

    // Clamp role to the values the DB constraint accepts; null is fine (nullable col)
    const safeRole = role && VALID_ROLES.has(role) ? role : null

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        endpoint,
        p256dh,
        auth:         authKey,
        role:         safeRole,
        user_agent:   (typeof userAgent === 'string' ? userAgent : '').slice(0, 500),
        active:       true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )

    if (error) {
      console.error('manage-push subscribe error:', error.message)
      return json(500, { ok: false, error: 'Store failed' })
    }
    return json(200, { ok: true })
  }

  // ── Unsubscribe ─────────────────────────────────────────────────────────────

  if (action === 'unsubscribe') {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)

    if (error) {
      console.error('manage-push unsubscribe error:', error.message)
      return json(500, { ok: false, error: 'Delete failed' })
    }
    return json(200, { ok: true })
  }

  return json(400, { ok: false, error: 'Unknown action. Use subscribe or unsubscribe.' })
})
