import webpush from 'web-push'
import { getServiceClient } from '@/lib/supabase/server'
import type {
  PushEnv,
  PushSubscriptionRow,
  SendPushDeps,
  WebPushSubscription,
} from './sendPush'

/**
 * Real side effects for lib/push/sendPush.ts: web-push (VAPID) + the
 * service-role Supabase client. SERVER ONLY (trigger.dev tasks) — loaded via
 * dynamic import from sendGekkoPush so web-push never enters a client bundle.
 */
export function realPushDeps(
  env: PushEnv,
  log: (message: string, extra?: Record<string, unknown>) => void,
): SendPushDeps {
  // Callers gate on isPushConfigured first; assert anyway to fail loud.
  const publicKey = env.VAPID_PUBLIC_KEY
  const privateKey = env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    throw new Error('VAPID keys not configured')
  }
  // Subject is the contact the push services may use; mailto: or https:.
  webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:gekko@localhost', publicKey, privateKey)

  const client = getServiceClient()

  return {
    async loadSubscriptions(): Promise<PushSubscriptionRow[]> {
      const { data, error } = await client
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
      if (error) {
        throw new Error(`Failed to load push subscriptions: ${error.message}`)
      }
      return (data ?? []) as PushSubscriptionRow[]
    },
    async sendNotification(subscription: WebPushSubscription, payload: string): Promise<void> {
      // Alerts are time-sensitive: don't queue them for more than an hour.
      await webpush.sendNotification(subscription, payload, { TTL: 3600 })
    },
    async deleteSubscription(endpoint: string): Promise<void> {
      const { error } = await client
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint)
      if (error) {
        throw new Error(`Failed to delete push subscription: ${error.message}`)
      }
    },
    log,
  }
}
