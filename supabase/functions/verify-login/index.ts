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
 * Response: { ok: boolean }
 *
 * Wrong password and config errors both return HTTP 200 with ok:false so the
 * client never needs to parse a FunctionsHttpError (same pattern as admin-delete).
 */

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

  const ok = password === passwords[role]

  return json(200, { ok })
})
