import { supabase } from './supabase'

/**
 * Change the shared password for the given role.
 * Only 'Admin' and 'Technician' are accepted by the Edge Function.
 * Throws with a user-facing message on failure.
 */
export async function changePassword(role, currentPassword, newPassword) {
  const { data, error } = await supabase.functions.invoke('change-password', {
    body: { role, currentPassword, newPassword },
  })
  if (error) throw new Error(error.message || 'Request failed. Is the Edge Function deployed?')
  if (!data?.ok) throw new Error(data?.error || 'Failed to change password.')
  return data
}
