import { tasks } from '@trigger.dev/sdk'
import { json } from '@/lib/api/respond'
import { requestFreshBundle } from '@/lib/bundleRequests'
import type { updateTask } from '@/trigger/updateTask'

/**
 * POST /api/briefings/update — on-demand "Update" briefing (feat-038): the
 * Gem's Update prompt — an Immediate Tactical Read + a fresh Strategic
 * Alignment revised against the previous briefing.
 *
 * Records a pending `bundle_requests` row (the uploader's "fresh bundle
 * required" flag), then triggers exactly one `update-task` run carrying the
 * request id so the task waits for the fresh bundle before running.
 * On-demand only, like /api/briefings/run.
 *
 * Auth decision: intentionally unauthenticated for the same reasons as
 * /api/briefings/run — local trading machine only, no input accepted, worst
 * case is an extra advisory run.
 */

// Node runtime: the trigger.dev SDK talks to the API server-side.
export const runtime = 'nodejs'

export async function POST(): Promise<Response> {
  try {
    const bundleRequestId = await requestFreshBundle('update')
    const handle = await tasks.trigger<typeof updateTask>('update-task', {
      triggerReason: 'manual',
      bundleRequestId,
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
    console.error('Failed to trigger update-task:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to trigger update-task'
    return json({ success: false, error: message }, 500)
  }
}
