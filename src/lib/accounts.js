import { supabase, fnErrorMessage } from './supabase'

/**
 * Invoke an account-management edge function, throwing a friendly Error on a
 * transport failure or a { ok: false } response. Returns the data on success.
 */
async function callAccountFn(fn, body) {
  const { data, error } = await supabase.functions.invoke(fn, { body })
  if (error) throw new Error(await fnErrorMessage(error))
  if (!data?.ok) throw new Error(data?.error || 'Operation failed.')
  return data
}

export const callStaffManage = (body) => callAccountFn('staff-manage', body)
export const callTechManage  = (body) => callAccountFn('tech-manage', body)
