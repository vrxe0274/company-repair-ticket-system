import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
    'Copy env.example to .env and fill in your Supabase credentials.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Recover the real error message from a failed functions.invoke().
 *
 * On any non-2xx response supabase-js returns a FunctionsHttpError and sets
 * `data` to null, so the function's JSON body ({ ok, error }) never reaches
 * the caller — the body lives on `error.context` (the raw Response). Reading
 * it surfaces the server's message (e.g. a 500 DB failure) instead of a
 * generic "network" error. Falls back to `fallback` for a true network/edge
 * failure where there is no JSON body.
 */
export async function fnErrorMessage(error, fallback = 'Connection error. Check your network and try again.') {
  try {
    const body = await error?.context?.json()
    if (body?.error) return body.error
  } catch { /* no JSON body → genuine network / edge failure */ }
  return fallback
}
