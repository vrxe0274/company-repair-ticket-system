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
  // FunctionsHttpError: the function returned a non-2xx response. supabase-js
  // does not auto-read its body — the JSON ({ ok, error }) lives on
  // error.context (the raw Response) and is still readable here. This surfaces
  // the server's real message (e.g. a 500 DB failure) instead of a generic one.
  try {
    const body = await error?.context?.json()
    if (body?.error)   return body.error
    if (body?.message) return body.message
  } catch { /* not an HTTP error with a JSON body → fall through */ }

  // FunctionsFetchError: fetch itself rejected (offline, DNS, or a blocked CORS
  // response). error.context is the underlying TypeError, not a Response — this
  // is the only case that is a genuine connection problem.
  if (error?.name === 'FunctionsFetchError') {
    return 'Could not reach the server. Check your connection and try again.'
  }
  return fallback
}
