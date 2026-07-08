'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  ALERT_INSERT_EVENT,
  GEKKO_ALERTS_TOPIC,
  buildAlertContent,
  parseAlertEvent,
} from '@/lib/notifications/events'
import { urlBase64ToUint8Array } from '@/lib/push/vapid'
import { getBrowserClient } from '@/lib/supabase/browser'

/**
 * Alerts opt-in + status strip (feat-026/feat-027), mounted in the root
 * layout so the Realtime subscription survives navigation between the
 * dashboard and /settings.
 *
 * feat-026 (tab open/backgrounded): explicit opt-in button requests
 * Notification permission (never an auto-prompt); once granted, a Supabase
 * Realtime subscription on the private gekko:alerts broadcast topic fires a
 * page-context Notification for every new briefing / eval result. The DB
 * trigger sends only {type,status,id,created_at}, so no briefing content
 * crosses the anon channel. Degrades gracefully: missing env, a blocked
 * permission, or an unapplied migration just shows a status label — never a
 * crash.
 *
 * feat-027 (tab fully closed): a second opt-in registers public/sw.js,
 * subscribes via pushManager with the VAPID public key, and stores the
 * subscription through POST /api/push/subscribe; Disable unsubscribes and
 * DELETEs it. Requires NEXT_PUBLIC_VAPID_PUBLIC_KEY (shows "push not
 * configured" otherwise).
 *
 * DESIGN.md: flat surface-card strip, hairline borders, zero radius, no
 * shadows, uppercase 1.5px-tracked labels; status colors use the semantic
 * tokens (success/warning), never m-red (reserved for significant callouts).
 */

type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied'
type RealtimeState = 'unconfigured' | 'connecting' | 'live' | 'error' | 'closed'
type PushState = 'unsupported' | 'unconfigured' | 'off' | 'pending' | 'on' | 'error'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

const subscribeNoop = () => () => {}

/** False during SSR + hydration render, true after — avoids markup mismatch. */
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  )
}

function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

function showAlertNotification(payload: unknown): void {
  const event = parseAlertEvent(payload)
  if (!event) return
  const content = buildAlertContent(event)
  try {
    new Notification(content.title, { body: content.body, tag: content.tag })
  } catch {
    // Some platforms (e.g. Android Chrome) only allow SW-shown notifications;
    // the push path (feat-027) covers those. Never crash the page over it.
  }
}

export function AlertsCenter() {
  const hydrated = useIsHydrated()

  // Browser-derived initial values via lazy initializers (render-safe: the
  // component renders null until hydration, so SSR/client divergence in
  // these values never reaches the DOM).
  const [permission, setPermission] = useState<PermissionState>(() => {
    if (typeof window === 'undefined') return 'default'
    return 'Notification' in window ? Notification.permission : 'unsupported'
  })
  const [realtime, setRealtime] = useState<RealtimeState>('connecting')
  const [push, setPush] = useState<PushState>(() => {
    if (typeof window === 'undefined') return 'off'
    if (!pushSupported()) return 'unsupported'
    if (!VAPID_PUBLIC_KEY) return 'unconfigured'
    return 'off'
  })

  // Reflect a push opt-in from a previous visit (async browser probe; state
  // is only set inside the promise callbacks).
  useEffect(() => {
    if (typeof window === 'undefined' || !pushSupported() || !VAPID_PUBLIC_KEY) return
    let active = true
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => {
        if (active && subscription) setPush('on')
      })
      .catch(() => {
        // Probe failure just means "not subscribed yet".
      })
    return () => {
      active = false
    }
  }, [])

  // Realtime subscription lifecycle — runs while permission is granted.
  useEffect(() => {
    if (permission !== 'granted') return
    const client = getBrowserClient()
    if (!client) return // rendered as "unconfigured" below — nothing to subscribe
    let cancelled = false
    const channel = client.channel(GEKKO_ALERTS_TOPIC, { config: { private: true } })
    channel.on('broadcast', { event: ALERT_INSERT_EVENT }, (message) => {
      showAlertNotification(message.payload)
    })
    // Private topics authorize against the client's JWT (the anon key here);
    // make sure it is attached before joining.
    client.realtime
      .setAuth()
      .catch(() => {})
      .then(() => {
        if (cancelled) return
        // status is the REALTIME_SUBSCRIBE_STATES string enum; widen to
        // string so the literal comparisons typecheck.
        channel.subscribe((status: string) => {
          if (cancelled) return
          if (status === 'SUBSCRIBED') setRealtime('live')
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtime('error')
          else if (status === 'CLOSED') setRealtime('closed')
        })
      })
    return () => {
      cancelled = true
      void client.removeChannel(channel)
    }
  }, [permission])

  async function enableAlerts() {
    if (!('Notification' in window)) return
    setPermission(await Notification.requestPermission())
  }

  async function enablePush() {
    if (!VAPID_PUBLIC_KEY || !pushSupported()) return
    setPush('pending')
    try {
      const granted = await Notification.requestPermission()
      setPermission(granted)
      if (granted !== 'granted') {
        setPush('off')
        return
      }
      await navigator.serviceWorker.register('/sw.js')
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setPush('on')
    } catch {
      setPush('error')
    }
  }

  async function disablePush() {
    setPush('pending')
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe()
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        })
      }
      setPush('off')
    } catch {
      setPush('error')
    }
  }

  if (!hydrated || permission === 'unsupported') return null

  // "No Supabase env" is a static build condition, derived at render time
  // (getBrowserClient caches, so this is a cheap idempotent lookup).
  const realtimeDisplay: RealtimeState =
    getBrowserClient() === null ? 'unconfigured' : realtime

  const realtimeLabel: Record<RealtimeState, string> = {
    live: 'Live',
    connecting: 'Connecting…',
    error: 'Realtime error',
    unconfigured: 'No Supabase env',
    closed: 'Off',
  }

  const smallButton =
    'rounded-none border border-hairline px-3 py-1.5 text-xs font-bold uppercase tracking-[1.5px] transition-colors hover:border-ink'

  return (
    <div className="fixed bottom-0 right-0 z-30 border-l border-t border-hairline bg-surface-card">
      <div className="flex items-center gap-4 px-4 py-2.5">
        <span className="text-xs font-bold uppercase tracking-[1.5px] text-muted">
          Alerts
        </span>

        {permission === 'denied' && (
          <span className="text-xs font-light uppercase tracking-[1.5px] text-warning">
            Blocked in browser
          </span>
        )}

        {permission === 'default' && (
          <button onClick={enableAlerts} className={`${smallButton} text-ink`}>
            Enable Alerts
          </button>
        )}

        {permission === 'granted' && (
          <>
            <span
              className={`text-xs font-light uppercase tracking-[1.5px] ${
                realtimeDisplay === 'live'
                  ? 'text-success'
                  : realtimeDisplay === 'error' || realtimeDisplay === 'unconfigured'
                    ? 'text-warning'
                    : 'text-muted'
              }`}
            >
              {realtimeLabel[realtimeDisplay]}
            </span>

            {push === 'off' && (
              <button onClick={enablePush} className={`${smallButton} text-ink`}>
                Enable Push
              </button>
            )}
            {push === 'pending' && (
              <span className="text-xs font-light uppercase tracking-[1.5px] text-muted">
                Push…
              </span>
            )}
            {push === 'on' && (
              <button
                onClick={disablePush}
                className={`${smallButton} text-success`}
                title="Push active — alerts arrive even with the tab closed. Click to disable."
              >
                Push On
              </button>
            )}
            {push === 'error' && (
              <button
                onClick={enablePush}
                className={`${smallButton} text-warning`}
                title="Push subscription failed — click to retry."
              >
                Push Failed
              </button>
            )}
            {push === 'unconfigured' && (
              <span
                className="text-xs font-light uppercase tracking-[1.5px] text-muted"
                title="Set NEXT_PUBLIC_VAPID_PUBLIC_KEY (npx web-push generate-vapid-keys) to enable tab-closed push."
              >
                Push not configured
              </span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
