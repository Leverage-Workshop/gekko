import { z } from 'zod'
import { getServiceClient } from '@/lib/supabase/server'

/**
 * POST/DELETE /api/push/subscribe — Web Push opt-in storage (feat-027).
 *
 * POST upserts the browser's PushSubscription (endpoint is the natural key,
 * so re-subscribing refreshes the encryption keys instead of duplicating the
 * row); DELETE removes it on opt-out. push_subscriptions is RLS-locked with
 * no policies, so all access goes through this route's service-role client.
 *
 * Auth decision: intentionally unauthenticated, same rationale as
 * /api/briefings/run and /api/config (local trading-machine app; see
 * progress.md feat-020).
 */

// Node runtime: uses the service-role Supabase client.
export const runtime = 'nodejs'

// PushSubscription.toJSON() also carries expirationTime — unknown keys are
// stripped by Zod, we persist only what web-push needs.
const SubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

const UnsubscribeSchema = z.object({
  endpoint: z.url(),
})

type ApiResponse = {
  success: boolean
  error?: string
  /** Per-field validation messages (Zod). */
  fieldErrors?: Record<string, string[]>
}

function json(body: ApiResponse, status: number): Response {
  return Response.json(body, { status })
}

async function readJson(req: Request): Promise<unknown | undefined> {
  try {
    return await req.json()
  } catch {
    return undefined
  }
}

export async function POST(req: Request): Promise<Response> {
  const payload = await readJson(req)
  if (payload === undefined) {
    return json({ success: false, error: 'Expected a JSON body' }, 400)
  }

  const parsed = SubscriptionSchema.safeParse(payload)
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error)
    return json({ success: false, error: 'Validation failed', fieldErrors }, 400)
  }

  try {
    const { endpoint, keys } = parsed.data
    const { error } = await getServiceClient()
      .from('push_subscriptions')
      .upsert(
        { endpoint, p256dh: keys.p256dh, auth: keys.auth },
        { onConflict: 'endpoint' },
      )
    if (error) {
      throw new Error(error.message)
    }
    return json({ success: true }, 200)
  } catch (error) {
    console.error('Failed to store push subscription:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to store push subscription'
    return json({ success: false, error: message }, 500)
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const payload = await readJson(req)
  if (payload === undefined) {
    return json({ success: false, error: 'Expected a JSON body' }, 400)
  }

  const parsed = UnsubscribeSchema.safeParse(payload)
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error)
    return json({ success: false, error: 'Validation failed', fieldErrors }, 400)
  }

  try {
    const { error } = await getServiceClient()
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', parsed.data.endpoint)
    if (error) {
      throw new Error(error.message)
    }
    return json({ success: true }, 200)
  } catch (error) {
    console.error('Failed to delete push subscription:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to delete push subscription'
    return json({ success: false, error: message }, 500)
  }
}
