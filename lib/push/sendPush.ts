import { buildAlertContent, type AlertEvent } from '@/lib/notifications/events'

/**
 * Web Push sending (feat-027). Pure orchestration with injected side effects
 * so everything is testable offline; the real web-push + Supabase wiring
 * lives in lib/push/deps.ts and is loaded lazily (dynamic import) so this
 * module stays importable anywhere.
 *
 * Invariants:
 * - Env-gated: without VAPID keys, sendGekkoPush is a silent no-op.
 * - Fire-and-forget: sendGekkoPush NEVER throws — a push failure must never
 *   fail the analyze/eval task that triggered it.
 * - Self-healing: subscriptions whose push service answers 404/410 (gone)
 *   are pruned from push_subscriptions.
 */

/** Row shape stored in public.push_subscriptions. */
export interface PushSubscriptionRow {
  endpoint: string
  p256dh: string
  auth: string
}

/** The wire shape web-push expects. */
export interface WebPushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface SendPushDeps {
  loadSubscriptions(): Promise<PushSubscriptionRow[]>
  /** Sends one push; must reject with a `statusCode`-bearing error on HTTP failure. */
  sendNotification(subscription: WebPushSubscription, payload: string): Promise<void>
  deleteSubscription(endpoint: string): Promise<void>
  log(message: string, extra?: Record<string, unknown>): void
}

/** Env shape (NodeJS.ProcessEnv-compatible; loose so tests can pass literals). */
export type PushEnv = Record<string, string | undefined>

/** Push is optional: it only runs when a VAPID keypair is configured. */
export function isPushConfigured(env: PushEnv = process.env): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
}

/**
 * JSON payload the service worker (public/sw.js) shows: type + headline
 * (title/body via the same copy as the tab-open notifications) + timestamp +
 * the URL to focus/open on click.
 */
export function buildPushPayload(event: AlertEvent, now: () => Date = () => new Date()): string {
  const content = buildAlertContent(event)
  return JSON.stringify({
    type: event.type,
    title: content.title,
    body: content.body,
    tag: content.tag,
    timestamp: event.createdAt ?? now().toISOString(),
    url: '/',
  })
}

/** 404/410 from the push service ⇒ the subscription no longer exists. */
function isGoneError(error: unknown): boolean {
  const statusCode = (error as { statusCode?: unknown } | null | undefined)?.statusCode
  return statusCode === 404 || statusCode === 410
}

export interface SendPushSummary {
  attempted: number
  sent: number
  pruned: number
  failed: number
}

/** Send one alert to every stored subscription, pruning gone endpoints. */
export async function sendPushToAll(
  deps: SendPushDeps,
  event: AlertEvent,
): Promise<SendPushSummary> {
  const subscriptions = await deps.loadSubscriptions()
  const payload = buildPushPayload(event)
  let sent = 0
  let pruned = 0
  let failed = 0

  for (const row of subscriptions) {
    try {
      await deps.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
      )
      sent += 1
    } catch (error) {
      if (isGoneError(error)) {
        pruned += 1
        deps.log('pruning gone push subscription', { endpoint: row.endpoint })
        try {
          await deps.deleteSubscription(row.endpoint)
        } catch (deleteError) {
          deps.log('failed to prune push subscription', {
            endpoint: row.endpoint,
            error: String(deleteError),
          })
        }
      } else {
        failed += 1
        deps.log('push send failed', { endpoint: row.endpoint, error: String(error) })
      }
    }
  }

  return { attempted: subscriptions.length, sent, pruned, failed }
}

export interface SendGekkoPushOptions {
  /** Env override for tests; defaults to process.env. */
  env?: PushEnv
  /** Deps override for tests; defaults to the real web-push + Supabase deps. */
  deps?: SendPushDeps
  /** Log sink (e.g. the trigger.dev logger); defaults to console.warn. */
  log?: (message: string, extra?: Record<string, unknown>) => void
}

/**
 * The task-facing entry point: fire-and-forget, env-gated, never throws.
 * Returns the send summary, or null when push is unconfigured or errored.
 */
export async function sendGekkoPush(
  event: AlertEvent,
  options: SendGekkoPushOptions = {},
): Promise<SendPushSummary | null> {
  const log =
    options.log ??
    ((message: string, extra?: Record<string, unknown>) =>
      console.warn(`[push] ${message}`, extra ?? ''))
  try {
    const env = options.env ?? process.env
    if (!isPushConfigured(env)) {
      // Not an error — push is an optional layer on top of feat-026.
      return null
    }
    const deps =
      options.deps ?? (await import('./deps')).realPushDeps(env, log)
    const summary = await sendPushToAll(deps, event)
    log('push send complete', { ...summary, type: event.type })
    return summary
  } catch (error) {
    log('push send skipped — unexpected error', { error: String(error) })
    return null
  }
}
