/*
 * Gekko service worker (feat-027) — Web Push only.
 *
 * Deliberately minimal plain JS: no caching, no fetch interception. Tab-open
 * notifications (feat-026) fire straight from the page via Supabase Realtime;
 * this worker exists solely so alerts arrive when the tab is fully closed.
 *
 * Payload contract (lib/push/sendPush.ts buildPushPayload):
 *   { type, title, body, tag, timestamp, url }
 */

self.addEventListener('install', () => {
  // Take over immediately so the first push after opt-in is handled.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // Non-JSON payload — show a generic alert rather than dropping it.
  }
  const title = typeof data.title === 'string' ? data.title : 'Gekko alert'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body : '',
      tag: typeof data.tag === 'string' ? data.tag : 'gekko-alert',
      icon: '/favicon.ico',
      data: { url: typeof data.url === 'string' ? data.url : '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of windows) {
        if ('focus' in client) {
          try {
            // navigate() can reject (e.g. uncontrolled clients on some
            // browsers) — fall back to opening a fresh window.
            await client.navigate(url)
            return await client.focus()
          } catch {
            break
          }
        }
      }
      return self.clients.openWindow(url)
    })(),
  )
})

self.addEventListener('pushsubscriptionchange', (event) => {
  // The browser rotated / expired the push subscription. Re-subscribe with
  // the old subscription's options (applicationServerKey included) and store
  // the replacement server-side so alerts keep flowing. If re-subscribing
  // isn't possible (permission revoked, no old options), fail quietly — the
  // page's Enable Push flow recovers on the next visit.
  event.waitUntil(
    (async () => {
      try {
        const options = event.oldSubscription && event.oldSubscription.options
        if (!options || !options.applicationServerKey) return
        const subscription = await self.registration.pushManager.subscribe(options)
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(subscription.toJSON()),
        })
      } catch {
        // Fail quietly by design.
      }
    })(),
  )
})
