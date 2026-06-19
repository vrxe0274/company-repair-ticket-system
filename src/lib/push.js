/**
 * @file push.js
 * @description Client-side Web Push utilities.
 *
 * Subscribe flow (must run from a user gesture on iOS):
 *   subscribeToPush(role)
 *     → Notification.requestPermission()
 *     → registration.pushManager.subscribe() with the VAPID public key
 *     → upsert row in push_subscriptions (keyed by endpoint)
 *
 * Sending goes through the `send-push` Supabase Edge Function, which holds
 * the VAPID private key and broadcasts to ALL active subscriptions
 * regardless of role ("global push"). Role-scoped in-app notifications
 * (lib/notifications.js) are intentionally untouched and separate.
 *
 * Everything here fails softly (logs only) so push problems never block
 * the underlying action — same convention as createNotification().
 */

import { supabase } from './supabase'
import { softFail } from './errors'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

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
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        endpoint:     subscription.endpoint,
        p256dh:       keys.p256dh,
        auth:         keys.auth,
        role:         role || null,
        user_agent:   navigator.userAgent.slice(0, 500),
        active:       true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )
    if (error) {
      softFail('subscribeToPush', error)
      return { ok: false, reason: 'store-failed' }
    }
    return { ok: true }
  } catch (err) {
    softFail('subscribeToPush', err)
    return { ok: false, reason: 'exception' }
  }
}

/**
 * Remove this device's subscription — called on explicit logout and when a
 * persistent session is found expired. Deletes the DB row first, then
 * unsubscribes from the push service.
 */
export async function unsubscribeFromPush() {
  if (!isPushSupported()) return
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return
    await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
    await subscription.unsubscribe()
  } catch (err) {
    softFail('unsubscribeFromPush', err)
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
