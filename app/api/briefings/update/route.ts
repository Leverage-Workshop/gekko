import { tasks } from '@trigger.dev/sdk'
import { z } from 'zod'
import { json } from '@/lib/api/respond'
import { requestFreshBundle } from '@/lib/bundleRequests'
import { OperatorDirective } from '@/lib/update/directive'
import type { updateTask } from '@/trigger/updateTask'

/**
 * POST /api/briefings/update — on-demand "Update" briefing (feat-038): the
 * Gem's Update prompt — an Immediate Tactical Read + a fresh Strategic
 * Alignment revised against the previous briefing.
 *
 * Two modes:
 * - Plain update (no body): records a pending `bundle_requests` row (the
 *   uploader's "fresh bundle required" flag), then triggers exactly one
 *   `update-task` run carrying the request id so the task waits for the fresh
 *   bundle before running. On-demand only, like /api/briefings/run.
 * - Operator directive (feat-061, body `{ directive: { objective, text } }`):
 *   the operator steered one objective from its card. Skips the fresh-bundle
 *   handshake — the operator is reacting to the briefing on screen, so the
 *   revision runs immediately on the latest stored bundle
 *   (`awaitFreshBundle(undefined)` no-ops as "not-requested").
 *
 * Auth decision: intentionally unauthenticated for the same reasons as
 * /api/briefings/run — local trading machine only. Since feat-061 the route
 * DOES accept input: a Zod-validated ≤280-char single-line directive whose
 * only sinks are the update prompt's user message and the
 * `briefings.operator_directive` audit column. Worst case remains a
 * self-inflicted steered advisory run on the operator's own machine.
 */

const UpdateRunBody = z.object({
  directive: OperatorDirective.optional(),
})

// Node runtime: the trigger.dev SDK talks to the API server-side.
export const runtime = 'nodejs'

export async function POST(request: Request): Promise<Response> {
  // A body-less POST (the Update button) and malformed JSON both read as an
  // empty body → plain update; only a present-but-invalid directive is a 400.
  const raw: unknown = await request.json().catch(() => undefined)
  const parsed = UpdateRunBody.safeParse(raw ?? {})
  if (!parsed.success) {
    return json(
      { success: false, error: `Invalid directive: ${parsed.error.issues[0]?.message ?? 'malformed body'}` },
      400,
    )
  }
  const directive = parsed.data.directive

  try {
    const handle = await tasks.trigger<typeof updateTask>(
      'update-task',
      directive
        ? { triggerReason: 'operator-directive', directive }
        : { triggerReason: 'manual', bundleRequestId: await requestFreshBundle('update') },
    )
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
    console.error('Failed to trigger update-task:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to trigger update-task'
    return json({ success: false, error: message }, 500)
  }
}
