/**
 * Log a non-fatal error from a fire-and-forget operation.
 * Single patch point if error monitoring (e.g. Sentry) is added later.
 *
 * @param {string}  context - Caller name, e.g. 'createNotification'
 * @param {unknown} error   - Caught error or Supabase error object
 */
export function softFail(context, error) {
  console.error(`[${context}]`, error?.message ?? error)
}
