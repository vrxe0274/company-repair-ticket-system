/**
 * @file sw.js
 * @description Custom service worker (vite-plugin-pwa `injectManifest` strategy).
 *
 * Replaces the previous auto-generated Workbox SW so we can handle Web Push:
 *   1. Precaching + SPA navigation fallback (same behavior as generateSW)
 *   2. NetworkFirst runtime caching for Supabase API GETs (same as before)
 *   3. `push` event    — shows a system notification (lock screen / shade / tray)
 *   4. `notificationclick` — focuses the app and deep-links to payload.url
 *
 * Auth note: tokens/session live in localStorage, which a SW update never
 * touches — only caches are managed here, so persistent login survives
 * SW updates and reinstalls.
 */

import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { clientsClaim } from 'workbox-core'

// autoUpdate behavior: activate new SW immediately and take over open tabs
self.skipWaiting()
clientsClaim()

// ── Precache (injected at build time by vite-plugin-pwa) ─────────────────────
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

// SPA fallback — all navigations serve the precached index.html
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// ── Runtime caching: Supabase API (GET only, NetworkFirst) ───────────────────
registerRoute(
  /^https:\/\/.*\.supabase\.co\/.*/i,
  new NetworkFirst({
    cacheName: 'supabase-api',
    plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 5 })],
  })
)

// ── Web Push ─────────────────────────────────────────────────────────────────

const DEFAULT_ICON  = '/icons/icon-192x192.png'
const DEFAULT_BADGE = '/icons/icon-192x192.png'

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'VRXE Tickets'
  const options = {
    body:  data.body || '',
    icon:  data.icon  || DEFAULT_ICON,
    badge: data.badge || DEFAULT_BADGE,
    data:  { url: data.url || '/' },
    // Collapse repeated pushes for the same ticket/url into one notification
    tag:   data.tag || data.url || 'vrxe-global',
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clientList) {
      if ('focus' in client) {
        await client.focus()
        // Navigate the focused tab to the deep link (best effort)
        if (url && 'navigate' in client) {
          try { await client.navigate(url) } catch { /* cross-origin or unsupported */ }
        }
        return
      }
    }
    await self.clients.openWindow(url)
  })())
})
