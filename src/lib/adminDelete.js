/**
 * @file adminDelete.js
 * @description Client wrappers for the `admin-delete` Edge Function.
 *
 * Deletes can no longer go through the anon Supabase client (the public DELETE
 * RLS policy was removed — see sql/lock-deletes-setup.sql). Every destructive
 * op routes through the Edge Function, which validates the ADMIN LOGIN password
 * server-side (same check as verify-login) and runs with the service-role key.
 *
 * The function returns 200 with { ok: false, error } for expected failures
 * (e.g. wrong password) so we can surface a message without parsing a
 * FunctionsHttpError.
 */

import { supabase } from './supabase'

async function invokeAdminDelete(body) {
  const { data, error } = await supabase.functions.invoke('admin-delete', { body })
  // Transport / non-2xx errors from the Functions client.
  if (error) throw new Error(error.message || 'Request failed. Is the Edge Function deployed?')
  // Application-level failure (wrong password, missing config, etc.).
  if (!data?.ok) throw new Error(data?.error || 'Operation failed.')
  return data
}

/** Delete EVERY ticket and all repair photos. Requires the admin password. */
export function adminFlushDatabase(password) {
  return invokeAdminDelete({ action: 'flush', password })
}

/** Delete a single ticket (and its photos). Requires the admin password. */
export function adminDeleteTicket(id, password) {
  return invokeAdminDelete({ action: 'delete-ticket', id, password })
}
