import { tasks } from '@trigger.dev/sdk'
import { z } from 'zod'
import { json } from '@/lib/api/respond'
import { requestFreshBundle } from '@/lib/bundleRequests'
import type { evalTask } from '@/trigger/evalTask'

/**
 * POST /api/eval/run — on-demand entry check (feat-025).
 *
 * Records a pending `bundle_requests` row (the uploader's "fresh bundle
 * required" flag), then triggers exactly one `eval-task` run carrying the
 * request id so the eval waits for a bundle captured at button-press time.
 * No cron / schedules — evals run only when the user presses one of the
 * buttons in the entry-eval column: "Eval" (no body — entry check against
 * the active levels) or "Long" / "Short" (`{"direction": "long" | "short"}`
 * — a hold-or-exit read on the operator's open position at the current
 * price, forwarded to the task as `payload.direction`).
 *
 * Auth decision: intentionally unauthenticated, same rationale as
 * /api/briefings/run — the app runs only on the user's local trading machine
 * (Vercel deployment descoped, feat-021), the route accepts no
 * free-form input, and the worst case is an extra advisory triage run.
 */

// Node runtime: the trigger.dev SDK talks to the API server-side.
export const runtime = 'nodejs'

/** Optional JSON body; a missing/empty body means the standard entry check. */
const EvalRunBody = z.object({
  direction: z.enum(['long', 'short']).optional(),
})

export async function POST(request: Request): Promise<Response> {
  // A body-less POST (the "Eval" button) fails .json() — treat as empty.
  const raw = await request.json().catch(() => undefined)
  const parsed = EvalRunBody.safeParse(raw ?? {})
  if (!parsed.success) {
    return json(
      { success: false, error: 'direction must be "long" or "short"' },
      400,
    )
  }
  const { direction } = parsed.data

  try {
    const bundleRequestId = await requestFreshBundle('eval')
    const handle = await tasks.trigger<typeof evalTask>('eval-task', {
      bundleRequestId,
      ...(direction ? { direction } : {}),
    })
    // publicAccessToken is scoped to reading this one run; the dashboard uses
    // it to subscribe via Realtime and auto-refresh when the run finishes.
    return json(
      {
        success: true,
        data: { runId: handle.id, publicAccessToken: handle.publicAccessToken },
      },
      202,
    )
  } catch (error) {
    console.error('Failed to trigger eval-task:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to trigger eval-task'
    return json({ success: false, error: message }, 500)
  }
}
