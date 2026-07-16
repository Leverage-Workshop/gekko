import { tasks } from '@trigger.dev/sdk'
import { json } from '@/lib/api/respond'
import type { updateTask } from '@/trigger/updateTask'

/**
 * POST /api/briefings/update — on-demand "Update" briefing (feat-038): the
 * Gem's Update prompt — an Immediate Tactical Read + a fresh Strategic
 * Alignment revised against the previous briefing.
 *
 * Triggers exactly one `update-task` run with `{ triggerReason: "manual" }`
 * via the type-safe `tasks.trigger` (requires TRIGGER_SECRET_KEY at runtime).
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
    const handle = await tasks.trigger<typeof updateTask>('update-task', {
      triggerReason: 'manual',
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
