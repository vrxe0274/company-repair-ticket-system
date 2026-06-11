/**
 * @file PushPermissionPrompt.jsx
 * @description Non-intrusive banner that enables global push notifications
 * after login. Rendered at the top of the dashboard content area.
 *
 * Behavior by permission state:
 *   'granted'     → no UI; silently re-subscribes on mount (idempotent upsert
 *                   refreshes role/last_seen_at and reactivates the row).
 *   'default'     → banner with an Enable button. requestPermission() runs
 *                   inside the click handler — required by iOS Safari, which
 *                   only allows the prompt from a user gesture.
 *   'denied'      → muted dismissible hint pointing at browser settings
 *                   (we cannot re-prompt programmatically once denied).
 *   'unsupported' → on iOS in the browser (not installed): hint that push
 *                   needs the app installed to the Home Screen (iOS 16.4+).
 *                   Elsewhere: render nothing.
 *
 * Dismissals are snoozed for 7 days via localStorage — the gentle re-prompt UI.
 */

import { useEffect, useState } from 'react'
import { Bell, BellOff, X, Share } from 'lucide-react'
import { useRole } from '../../hooks/useRole.jsx'
import {
  isPushSupported,
  getPushPermission,
  subscribeToPush,
  isIos,
} from '../../lib/push'
import { isStandalone } from '../../lib/session'

const SNOOZE_KEY = 'vrxe_push_prompt_snooze'
const SNOOZE_MS  = 7 * 24 * 60 * 60 * 1000 // re-prompt after 7 days

function isSnoozed() {
  const until = Number(localStorage.getItem(SNOOZE_KEY) || 0)
  return Date.now() < until
}

function snooze() {
  localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS))
}

export default function PushPermissionPrompt() {
  const { role } = useRole()
  const [permission, setPermission] = useState(getPushPermission())
  const [dismissed,  setDismissed]  = useState(isSnoozed())
  const [enabling,   setEnabling]   = useState(false)
  const [failed,     setFailed]     = useState(false)

  // Already granted (returning device) → keep the subscription row fresh.
  useEffect(() => {
    if (role && permission === 'granted') {
      subscribeToPush(role)
    }
  }, [role, permission])

  if (!role || dismissed || permission === 'granted') return null

  function handleDismiss() {
    snooze()
    setDismissed(true)
  }

  async function handleEnable() {
    setEnabling(true)
    setFailed(false)
    const result = await subscribeToPush(role)
    setPermission(getPushPermission())
    if (!result.ok && result.reason !== 'denied') setFailed(true)
    if (result.ok) setDismissed(true)
    setEnabling(false)
  }

  // ── iOS browser (not installed): push is impossible until installed ──────
  if (!isPushSupported()) {
    if (!(isIos() && !isStandalone())) return null
    return (
      <div className="flex items-start gap-3 px-4 py-3 mb-5 rounded-xl border border-gray-200 bg-white text-sm font-body text-gray-600">
        <Share className="w-4 h-4 mt-0.5 shrink-0 text-brand-600" />
        <p className="flex-1">
          To get push notifications on iPhone/iPad, add this app to your Home
          Screen (Share → <strong>Add to Home Screen</strong>), then enable
          notifications inside the installed app. Requires iOS 16.4+.
        </p>
        <button onClick={handleDismiss} aria-label="Dismiss" className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  // ── Permission previously denied: we can't re-prompt, only guide ─────────
  if (permission === 'denied') {
    return (
      <div className="flex items-start gap-3 px-4 py-3 mb-5 rounded-xl border border-gray-200 bg-white text-sm font-body text-gray-600">
        <BellOff className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" />
        <p className="flex-1">
          Notifications are blocked for this site. To receive global alerts,
          allow notifications in your browser settings for this app.
        </p>
        <button onClick={handleDismiss} aria-label="Dismiss" className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>
    )
  }

  // ── Default state: offer to enable ────────────────────────────────────────
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 mb-5 rounded-xl border border-brand-200 bg-brand-50">
      <Bell className="w-4 h-4 shrink-0 text-brand-600" />
      <p className="flex-1 min-w-[200px] text-sm font-body text-gray-700">
        Enable push notifications to get ticket alerts on this device — even
        when the app is closed.
        {failed && (
          <span className="block text-red-500 mt-0.5">
            Couldn&apos;t enable notifications. Please try again.
          </span>
        )}
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={handleEnable}
          disabled={enabling}
          className="px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-xs font-sans font-semibold tracking-wide transition-colors disabled:opacity-50"
        >
          {enabling ? 'Enabling…' : 'Enable'}
        </button>
        <button
          onClick={handleDismiss}
          className="px-3 py-1.5 rounded-lg text-xs font-sans font-semibold text-gray-500 hover:text-gray-700 hover:bg-white transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
