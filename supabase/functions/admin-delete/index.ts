/**
 * admin-delete — Supabase Edge Function
 *
 * The only path through which tickets can be deleted. The `tickets` table no
 * longer grants DELETE to the public `anon` role (see sql/lock-deletes-setup.sql),
 * so the browser can NOT delete rows directly with the anon key anymore. All
 * destructive operations route here and run with the service-role key.
 *
 * Gate: the caller must send the ADMIN LOGIN password, which is checked
 * SERVER-SIDE the same way verify-login checks it (role_passwords hash first,
 * then the ADMIN_PASSWORD env secret). There is no separate delete password —
 * the admin uses the one password they already know. Neither value is ever
 * shipped to the browser bundle.
 *
 * Actions:
 *   { action: 'flush',         password }       → delete every ticket + all repair photos
 *   { action: 'delete-ticket', password, id }   → delete one ticket (+ its photos)
 *
 * Required secrets (supabase secrets set KEY=value):
 *   ADMIN_PASSWORD — the admin login password (shared with verify-login)
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
 *
 * Deploy:  supabase functions deploy admin-delete --no-verify-jwt
 * (--no-verify-jwt because the app uses shared-password client auth, not
 *  Supabase Auth — consistent with send-push and the project's auth model.)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json, timingSafeEqual, deriveRoleKey } from '../_shared/auth.ts'

const BUCKET   = 'repair-photos'
const NIL_UUID = '00000000-0000-0000-0000-000000000000'

/** Remove storage object paths in chunks, ignoring failures (best-effort cleanup).
 *  Chunked so a large flush (many tickets) can't exceed the remove() array limit. */
async function removePhotos(
  supabase: ReturnType<typeof createClient>,
  paths: string[],
) {
  const CHUNK = 100
  for (let i = 0; i < paths.length; i += CHUNK) {
    await supabase.storage.from(BUCKET).remove(paths.slice(i, i + CHUNK))
  }
}

/** Convert a public storage URL to its object path within BUCKET. */
function toStoragePath(url: string): string {
  return url.split(`/${BUCKET}/`).pop() ?? url
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

  let body: { action?: string; password?: string; id?: string }
  try {
    body = await req.json()
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Server-side Admin-password check, identical to verify-login's Admin path:
  // prefer the PBKDF2 hash in role_passwords (set via change-password), and fall
  // back to the ADMIN_PASSWORD env secret if no DB row exists yet. Returns 200
  // with ok:false so the client can show the message without parsing a
  // FunctionsHttpError.
  if (!body.password) {
    return json(200, { ok: false, error: 'Incorrect password.' })
  }

  const { data: pwRow } = await supabase
    .from('role_passwords')
    .select('password_hash')
    .eq('role', 'Admin')
    .maybeSingle()

  let passwordOk = false
  if (pwRow?.password_hash) {
    const inputHash = await deriveRoleKey(body.password, 'Admin')
    passwordOk = timingSafeEqual(inputHash, pwRow.password_hash)
  } else {
    const adminPassword = Deno.env.get('ADMIN_PASSWORD')
    if (!adminPassword) {
      return json(500, { ok: false, error: 'ADMIN_PASSWORD not configured (supabase secrets set ...)' })
    }
    passwordOk = timingSafeEqual(body.password, adminPassword)
  }

  if (!passwordOk) {
    return json(200, { ok: false, error: 'Incorrect password.' })
  }

  if (body.action === 'delete-ticket') {
    if (!body.id) return json(400, { ok: false, error: 'id is required' })

    // Clean up this ticket's photos AND its payment-proof screenshot first
    // (best-effort), then delete the row.
    const { data: row } = await supabase
      .from('tickets').select('repair_photos, payment_proof_url').eq('id', body.id).single()
    const paths: string[] = ((row?.repair_photos ?? []) as string[]).map(toStoragePath)
    if (row?.payment_proof_url) paths.push(toStoragePath(row.payment_proof_url as string))
    await removePhotos(supabase, paths)

    const { error } = await supabase.from('tickets').delete().eq('id', body.id)
    if (error) return json(500, { ok: false, error: error.message })
    return json(200, { ok: true, deleted: 1 })
  }

  if (body.action === 'flush') {
    // Derive every stored object path from the ticket rows themselves, then
    // delete the objects. Listing the bucket root only returns the per-ticket
    // FOLDER entries (photos live under `${ticket_id}/...`) and storage.remove()
    // does NOT recurse into folders — so paths must come from the rows to
    // actually clear the images (repair photos + payment-proof screenshots).
    const { data: rows } = await supabase
      .from('tickets').select('repair_photos, payment_proof_url')

    const paths: string[] = []
    for (const r of rows ?? []) {
      for (const u of ((r.repair_photos ?? []) as string[])) paths.push(toStoragePath(u))
      if (r.payment_proof_url) paths.push(toStoragePath(r.payment_proof_url as string))
    }
    await removePhotos(supabase, paths)

    const { error } = await supabase.from('tickets').delete().neq('id', NIL_UUID)
    if (error) return json(500, { ok: false, error: error.message })
    return json(200, { ok: true, flushed: true })
  }

  return json(400, { ok: false, error: 'Unknown action' })
})
