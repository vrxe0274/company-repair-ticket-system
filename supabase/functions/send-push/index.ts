/**
 * send-push — Supabase Edge Function
 *
 * Broadcasts a Web Push notification to EVERY active subscription in the
 * push_subscriptions table, regardless of role ("global push").
 *
 * Invoked from the client via supabase.functions.invoke('send-push', {
 *   body: { title, body, url? }
 * })
 *
 * Required secrets (supabase secrets set KEY=value):
 *   VAPID_PUBLIC_KEY   — base64url VAPID public key (same as VITE_VAPID_PUBLIC_KEY)
 *   VAPID_PRIVATE_KEY  — base64url VAPID private key (NEVER ship to the client)
 *   VAPID_SUBJECT      — mailto: or https: contact, e.g. mailto:admin@vrxe.com
 *
 * SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
 *
 * Deploy:  supabase functions deploy send-push --no-verify-jwt
 * (--no-verify-jwt because the app uses shared-password client auth,
 *  not Supabase Auth — consistent with the public RLS posture.)
 */

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/auth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const vapidPublicKey  = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject    = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com'

  if (!vapidPublicKey || !vapidPrivateKey) {
    return json(500, { error: 'VAPID keys not configured (supabase secrets set ...)' })
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  let body: { title?: string; body?: string; url?: string | null }
  try {
    body = await req.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  const title   = (body.title ?? '').toString().trim().slice(0, 120)
  const message = (body.body  ?? '').toString().trim().slice(0, 500)
  const url     = body.url ? body.url.toString().trim().slice(0, 500) : null

  if (!title || !message) {
    return json(400, { error: 'title and body are required' })
  }
  if (url && !url.startsWith('/') && !url.startsWith('https://')) {
    return json(400, { error: 'url must be a relative path or https URL' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('active', true)

  if (error) return json(500, { error: error.message })
  if (!subs || subs.length === 0) return json(200, { sent: 0, failed: 0, pruned: 0 })

  const payload = JSON.stringify({
    title,
    body: message,
    url:   url ?? '/',
    icon:  '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
  })

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: 60 * 60 * 24 },
      ),
    ),
  )

  // 404/410 = subscription gone on the push service — prune those rows
  const deadIds: string[] = []
  let sent = 0
  let failed = 0
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      sent++
    } else {
      failed++
      const statusCode = (r.reason as { statusCode?: number })?.statusCode
      if (statusCode === 404 || statusCode === 410) deadIds.push(subs[i].id)
    }
  })

  if (deadIds.length) {
    await supabase.from('push_subscriptions').delete().in('id', deadIds)
  }

  return json(200, { sent, failed, pruned: deadIds.length })
})
