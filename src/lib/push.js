/**
 * @file push.js
 * @description Client-side Web Push utilities.
 *
 * Subscribe flow (must run from a user gesture on iOS):
 *   subscribeToPush(role)
 *     → Notification.requestPermission()
 *     → registration.pushManager.subscribe() with the VAPID public key
 *     → upsert row in push_subscriptions via manage-push Edge Function
 *
 * Sending goes through the `send-push` Supabase Edge Function, which holds
 * the VAPID private key and broadcasts to ALL active subscriptions
 * regardless of role ("global push"). Role-scoped in-app notifications
 * (lib/notifications.js) are intentionally untouched and separate.
 *
 * DB writes (subscribe/unsubscribe) go through the manage-push Edge Function
 * so the anon client never writes to push_subscriptions directly.
 * See sql/push-lockdown.sql.
 *
 * Everything here fails softly (logs only) so push problems never block
 * the underlying action.
 */

import { supabase } from './supabase'
import { softFail } from './errors'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

/**
 * Per-device flag set when the user explicitly turns push off (Settings
 * toggle) — checked by PushPermissionPrompt so it doesn't silently
 * resubscribe a device on the next app load just because permission is
 * still 'granted' (permission and subscription are independent: revoking
 * the subscription doesn't revoke the browser permission).
 */
const OPT_OUT_KEY = 'vrxe_push_opt_out'

export function isPushOptedOut() {
  return localStorage.getItem(OPT_OUT_KEY) === '1'
}

export function setPushOptedOut() {
  localStorage.setItem(OPT_OUT_KEY, '1')
}

export function clearPushOptedOut() {
  localStorage.removeItem(OPT_OUT_KEY)
}

/** Feature-detect Web Push (false on iOS Safari unless installed to Home Screen). */
export function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** Current permission: 'granted' | 'denied' | 'default' | 'unsupported'. */
export function getPushPermission() {
  return isPushSupported() ? Notification.permission : 'unsupported'
}

/** True if this device already holds an active push subscription. */
export async function isPushSubscribed() {
  if (!isPushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    return !!subscription
  } catch {
    return false
  }
}

/** True on iOS devices — used to hint "install to Home Screen" when push is unavailable. */
export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports as Mac with touch
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Convert a base64url VAPID key to the Uint8Array pushManager.subscribe expects. */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i)
  return output
}

/**
 * Request permission (if needed) and register this device for global pushes.
 * Idempotent — safe to call on every login / app load when already granted:
 * the upsert just refreshes role, user_agent and last_seen_at.
 *
 * @param {'Admin'|'Technician'|null} role - Role active at subscribe time (informational).
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function subscribeToPush(role = null) {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' }
  if (!VAPID_PUBLIC_KEY) {
    console.warn('VITE_VAPID_PUBLIC_KEY not set — push disabled.')
    return { ok: false, reason: 'no-vapid-key' }
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, reason: permission }

    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    const { keys } = subscription.toJSON()
    const { data, error } = await supabase.functions.invoke('manage-push', {
      body: {
        action:    'subscribe',
        endpoint:  subscription.endpoint,
        p256dh:    keys.p256dh,
        auth:      keys.auth,
        role:      role || null,
        userAgent: navigator.userAgent.slice(0, 500),
      },
    })
    if (error || !data?.ok) {
      softFail('subscribeToPush', error ?? new Error(data?.error ?? 'unknown'))
      return { ok: false, reason: 'store-failed' }
    }
    return { ok: true }
  } catch (err) {
    softFail('subscribeToPush', err)
    return { ok: false, reason: 'exception' }
  }
}

/**
 * Remove this device's subscription — called on explicit logout, when a
 * persistent session is found expired, and from the Settings toggle.
 * Deletes the DB row first; only unsubscribes locally once that succeeds,
 * so a failed server call leaves the local subscription (and UI state)
 * intact instead of silently orphaning the DB row.
 * @returns {Promise<{ok: boolean}>}
 */
export async function unsubscribeFromPush() {
  if (!isPushSupported()) return { ok: true }
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return { ok: true }
    const { error } = await supabase.functions.invoke('manage-push', {
      body: { action: 'unsubscribe', endpoint: subscription.endpoint },
    })
    if (error) {
      softFail('unsubscribeFromPush', error)
      return { ok: false }
    }
    await subscription.unsubscribe()
    return { ok: true }
  } catch (err) {
    softFail('unsubscribeFromPush', err)
    return { ok: false }
  }
}

/**
 * Broadcast a push notification to every subscribed device (all roles).
 * Fails softly — a push failure must never block the triggering action.
 *
 * @param {Object} args
 * @param {string} args.title - Notification title (required)
 * @param {string} args.body  - Notification body (required)
 * @param {string} [args.url] - Optional deep link ('/tickets/<id>' or https URL)
 * @returns {Promise<{ok: boolean, sent?: number, failed?: number}>}
 */
export async function sendGlobalPush({ title, body, url = null }) {
  try {
    const { data, error } = await supabase.functions.invoke('send-push', {
      body: { title, body, url },
    })
    if (error) {
      softFail('sendGlobalPush', error)
      return { ok: false }
    }
    return { ok: true, ...data }
  } catch (err) {
    softFail('sendGlobalPush', err)
    return { ok: false }
  }
}
