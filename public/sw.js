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
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        for (const client of windows) {
          if ('focus' in client) {
            client.navigate(url)
            return client.focus()
          }
        }
        return self.clients.openWindow(url)
      }),
  )
})
