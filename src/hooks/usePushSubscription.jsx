/**
 * @file usePushSubscription.jsx
 * @description Shared push-subscription state/actions used by both the
 * dashboard-wide enable banner (PushPermissionPrompt) and the explicit
 * Settings toggle, so the two share one source of truth instead of drifting
 * out of sync (e.g. one silently resubscribing a device the other just
 * unsubscribed).
 */

import { useState, useEffect, useCallback } from 'react'
import {
  isPushSupported, getPushPermission, isPushSubscribed,
  subscribeToPush, unsubscribeFromPush,
  isPushOptedOut, setPushOptedOut, clearPushOptedOut,
} from '../lib/push'

/**
 * @param {string|null} role
 * @param {{autoRefresh?: boolean}} [opts] - autoRefresh keeps a granted
 *   subscription's DB row fresh on mount (skipped if the user explicitly
 *   opted out via `enable`/`disable` elsewhere). Only PushPermissionPrompt
 *   needs this; the Settings toggle just reflects/changes state.
 */
export function usePushSubscription(role, { autoRefresh = false } = {}) {
  const [supported]  = useState(isPushSupported)
  const [permission, setPermission] = useState(getPushPermission)
  const [subscribed, setSubscribed] = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!supported) { setLoading(false); return }
    isPushSubscribed().then(sub => {
      if (!cancelled) { setSubscribed(permission === 'granted' && sub); setLoading(false) }
    })
    return () => { cancelled = true }
  }, [supported, permission])

  useEffect(() => {
    if (!autoRefresh) return
    if (role && permission === 'granted' && !isPushOptedOut()) {
      subscribeToPush(role)
    }
  }, [autoRefresh, role, permission])

  const enable = useCallback(async () => {
    setError(false)
    setLoading(true)
    const result = await subscribeToPush(role)
    if (result.ok) { clearPushOptedOut(); setSubscribed(true) }
    else setError(true)
    setPermission(getPushPermission())
    setLoading(false)
    return result
  }, [role])

  const disable = useCallback(async () => {
    setError(false)
    setLoading(true)
    const result = await unsubscribeFromPush()
    if (result.ok) { setPushOptedOut(); setSubscribed(false) }
    else setError(true)
    setLoading(false)
    return result
  }, [])

  return { supported, permission, subscribed, loading, error, enable, disable }
}
