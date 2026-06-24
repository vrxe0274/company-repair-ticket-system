/**
 * admin-delete — Supabase Edge Function
 *
 * The only path through which tickets can be deleted. The `tickets` table no
 * longer grants DELETE to the public `anon` role (see sql/lock-deletes-setup.sql),
 * so the browser can NOT delete rows directly with the anon key anymore. All
 * destructive operations route here and run with the service-role key.
 *
 * Gate: the caller must send the destructive-action password, which is checked
 * against the ADMIN_DELETE_PASSWORD secret SERVER-SIDE. Unlike the old
 * VITE_ADMIN_PASSWORD, this value is never shipped to the browser bundle.
 *
 * Actions:
 *   { action: 'flush',         password }       → delete every ticket + all repair photos
 *   { action: 'delete-ticket', password, id }   → delete one ticket (+ its photos)
 *
 * Required secrets (supabase secrets set KEY=value):
 *   ADMIN_DELETE_PASSWORD — the destructive-action password (kept off the client)
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
 *
 * Deploy:  supabase functions deploy admin-delete --no-verify-jwt
 * (--no-verify-jwt because the app uses shared-password client auth, not
 *  Supabase Auth — consistent with send-push and the project's auth model.)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/auth.ts'

const BUCKET   = 'repair-photos'
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/** Remove a list of storage object paths, ignoring failures (best-effort cleanup). */
async function removePhotos(
  supabase: ReturnType<typeof createClient>,
  paths: string[],
) {
  if (!paths.length) return
  await supabase.storage.from(BUCKET).remove(paths)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  const adminPassword = Deno.env.get('ADMIN_DELETE_PASSWORD')
  if (!adminPassword) {
    return json(500, { ok: false, error: 'ADMIN_DELETE_PASSWORD not configured (supabase secrets set ...)' })
  }

  let body: { action?: string; password?: string; id?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' })
  }

  // Server-side password check. Returns 200 with ok:false so the client can
  // show the message without parsing a FunctionsHttpError.
  if (!body.password || body.password !== adminPassword) {
    return json(200, { ok: false, error: 'Incorrect password.' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  if (body.action === 'delete-ticket') {
    if (!body.id) return json(400, { ok: false, error: 'id is required' })

    // Clean up this ticket's photos first (best-effort), then delete the row.
    const { data: row } = await supabase
      .from('tickets').select('repair_photos').eq('id', body.id).single()
    const photos: string[] = row?.repair_photos ?? []
    await removePhotos(supabase, photos.map((u) => u.split(`/${BUCKET}/`).pop() ?? u))

    const { error } = await supabase.from('tickets').delete().eq('id', body.id)
    if (error) return json(500, { ok: false, error: error.message })
    return json(200, { ok: true, deleted: 1 })
  }

  if (body.action === 'flush') {
    // Remove every object in the photos bucket, then every ticket row.
    const { data: files } = await supabase.storage.from(BUCKET).list()
    await removePhotos(supabase, (files ?? []).map((f) => f.name))

    const { error } = await supabase.from('tickets').delete().neq('id', NIL_UUID)
    if (error) return json(500, { ok: false, error: error.message })
    return json(200, { ok: true, flushed: true })
  }

  return json(400, { ok: false, error: 'Unknown action' })
})
