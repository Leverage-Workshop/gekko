'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
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
 * crash. If the channel drops (CHANNEL_ERROR / TIMED_OUT / CLOSED) it
 * resubscribes automatically with capped exponential backoff, showing
 * "Reconnecting…" while it waits.
 *
 * feat-027 (tab fully closed): a second opt-in registers public/sw.js,
 * subscribes via pushManager with the VAPID public key, and stores the
 * subscription through POST /api/push/subscribe; Disable unsubscribes and
 * DELETEs it. Requires NEXT_PUBLIC_VAPID_PUBLIC_KEY (shows "push not
 * configured" otherwise). A failed enable retries the enable; a failed
 * disable retries the disable (or just the server DELETE when the local
 * unsubscribe already succeeded).
 *
 * DESIGN.md: flat surface-card strip, hairline borders, zero radius, no
 * shadows, uppercase 1.5px-tracked labels; status colors use the semantic
 * tokens (success/warning), never m-red (reserved for significant callouts).
 */

type PermissionState = 'unsupported' | 'default' | 'granted' | 'denied'
type RealtimeState = 'unconfigured' | 'connecting' | 'live' | 'reconnecting'
type PushState = 'unsupported' | 'unconfigured' | 'off' | 'pending' | 'on' | 'error'

/** Which push operation failed, so "click to retry" retries that operation. */
type FailedPushOp =
  | { op: 'enable' }
  | { op: 'disable' }
  /** Local unsubscribe succeeded but the server DELETE did not. */
  | { op: 'server-delete'; endpoint: string }

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

const RECONNECT_BASE_MS = 1_000
const RECONNECT_CAP_MS = 30_000

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

async function deleteServerSubscription(endpoint: string): Promise<void> {
  const res = await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
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
  const [failedPushOp, setFailedPushOp] = useState<FailedPushOp | null>(null)

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
  // A small connect/retry state machine: any terminal status (CHANNEL_ERROR,
  // TIMED_OUT, CLOSED) tears the channel down and schedules a resubscribe
  // with capped exponential backoff; SUBSCRIBED resets the backoff.
  useEffect(() => {
    if (permission !== 'granted') return
    const client = getBrowserClient()
    if (!client) return // rendered as "unconfigured" below — nothing to subscribe
    let cancelled = false
    let channel: RealtimeChannel | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryDelayMs = RECONNECT_BASE_MS

    function scheduleReconnect() {
      if (cancelled || retryTimer !== null) return
      setRealtime('reconnecting')
      const delay = retryDelayMs
      retryDelayMs = Math.min(retryDelayMs * 2, RECONNECT_CAP_MS)
      retryTimer = setTimeout(() => {
        retryTimer = null
        connect()
      }, delay)
    }

    function connect() {
      if (cancelled) return
      if (channel) {
        // Never leak channels — drop the dead one before re-subscribing.
        void client!.removeChannel(channel)
        channel = null
      }
      const next = client!.channel(GEKKO_ALERTS_TOPIC, { config: { private: true } })
      channel = next
      next.on('broadcast', { event: ALERT_INSERT_EVENT }, (message) => {
        showAlertNotification(message.payload)
      })
      // Private topics authorize against the client's JWT (the anon key here);
      // make sure it is attached before joining.
      client!.realtime
        .setAuth()
        .catch(() => {})
        .then(() => {
          if (cancelled || channel !== next) return
          // status is the REALTIME_SUBSCRIBE_STATES string enum; widen to
          // string so the literal comparisons typecheck.
          next.subscribe((status: string) => {
            if (cancelled || channel !== next) return
            if (status === 'SUBSCRIBED') {
              retryDelayMs = RECONNECT_BASE_MS
              setRealtime('live')
            } else if (
              status === 'CHANNEL_ERROR' ||
              status === 'TIMED_OUT' ||
              status === 'CLOSED'
            ) {
              scheduleReconnect()
            }
          })
        })
    }

    // No sync setRealtime here: the initial state is already 'connecting',
    // and every later transition happens inside subscribe/timer callbacks.
    connect()

    return () => {
      cancelled = true
      if (retryTimer !== null) clearTimeout(retryTimer)
      if (channel) void client.removeChannel(channel)
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
      setFailedPushOp(null)
      setPush('on')
    } catch {
      setFailedPushOp({ op: 'enable' })
      setPush('error')
    }
  }

  async function disablePush() {
    setPush('pending')
    let unsubscribedEndpoint: string | null = null
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe()
        unsubscribedEndpoint = endpoint
        await deleteServerSubscription(endpoint)
      }
      setFailedPushOp(null)
      setPush('off')
    } catch {
      // If the local unsubscribe already went through, only the server DELETE
      // is left to retry — never re-subscribe a user who was opting out.
      setFailedPushOp(
        unsubscribedEndpoint !== null
          ? { op: 'server-delete', endpoint: unsubscribedEndpoint }
          : { op: 'disable' },
      )
      setPush('error')
    }
  }

  async function retryServerDelete(endpoint: string) {
    setPush('pending')
    try {
      await deleteServerSubscription(endpoint)
      setFailedPushOp(null)
      setPush('off')
    } catch {
      setPush('error')
    }
  }

  function retryFailedPushOp() {
    if (failedPushOp === null || failedPushOp.op === 'enable') {
      void enablePush()
    } else if (failedPushOp.op === 'disable') {
      void disablePush()
    } else {
      void retryServerDelete(failedPushOp.endpoint)
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
    reconnecting: 'Reconnecting…',
    unconfigured: 'No Supabase env',
  }

  const pushFailedDetail =
    failedPushOp?.op === 'disable' || failedPushOp?.op === 'server-delete'
      ? 'Push disable failed — click to retry disabling.'
      : 'Push subscription failed — click to retry.'

  const smallButton =
    'rounded-none border border-hairline px-3 py-1.5 text-xs font-bold uppercase tracking-[1.5px] transition-colors hover:border-ink'

  return (
    <div className="fixed bottom-0 right-0 z-30 border-l border-t border-hairline bg-surface-card">
      <div className="flex items-center gap-4 px-4 py-2.5">
        <span className="text-xs font-bold uppercase tracking-[1.5px] text-muted">
          Alerts
        </span>

        {permission === 'denied' && (
          <span
            role="status"
            className="text-xs font-light uppercase tracking-[1.5px] text-warning"
          >
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
              role="status"
              className={`text-xs font-light uppercase tracking-[1.5px] ${
                realtimeDisplay === 'live'
                  ? 'text-success'
                  : realtimeDisplay === 'reconnecting' || realtimeDisplay === 'unconfigured'
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
              <span
                role="status"
                className="text-xs font-light uppercase tracking-[1.5px] text-muted"
              >
                Push…
              </span>
            )}
            {push === 'on' && (
              <button
                onClick={disablePush}
                className={`${smallButton} text-success`}
                title="Push active — alerts arrive even with the tab closed. Click to disable."
                aria-label="Push active — alerts arrive even with the tab closed. Click to disable."
              >
                Push On
              </button>
            )}
            {push === 'error' && (
              <button
                onClick={retryFailedPushOp}
                className={`${smallButton} text-warning`}
                title={pushFailedDetail}
                aria-label={pushFailedDetail}
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
                <span className="sr-only">
                  {' '}
                  — set NEXT_PUBLIC_VAPID_PUBLIC_KEY (npx web-push generate-vapid-keys) to
                  enable tab-closed push.
                </span>
              </span>
            )}

            {/* Push state changes swap buttons in and out, which live regions
                don't announce — this hidden status line does. */}
            <span role="status" className="sr-only">
              {push === 'on' && 'Push notifications enabled.'}
              {push === 'off' && 'Push notifications disabled.'}
              {push === 'error' && pushFailedDetail}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
