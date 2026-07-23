import { tasks } from '@trigger.dev/sdk'
import { json } from '@/lib/api/respond'
import { requestFreshBundle } from '@/lib/bundleRequests'
import type { analyzeTask } from '@/trigger/analyzeTask'

/**
 * POST /api/briefings/run — on-demand full briefing (feat-020).
 *
 * Records a pending `bundle_requests` row (the "fresh bundle required" flag
 * the local uploader polls for), then triggers exactly one `analyze-task` run
 * carrying that request id: the task waits for the uploader to fulfil the
 * request before analyzing, so briefings always run on a bundle captured at
 * button-press time. No cron / schedules — briefings run only when the user
 * presses the button (docs/agent-architecture-plan.md: on-demand only).
 *
 * Auth decision: intentionally unauthenticated. The app runs only on the
 * user's local trading machine (Vercel deployment descoped, feat-021), the
 * route accepts no input, and the worst case is an extra advisory briefing
 * run. /api/ingest is bearer-authed because a separate process (the local
 * uploader) POSTs data into it; no such cross-process data write happens here.
 */

// Node runtime: the trigger.dev SDK talks to the API server-side.
export const runtime = 'nodejs'

export async function POST(): Promise<Response> {
  try {
    const bundleRequestId = await requestFreshBundle('analyze')
    const handle = await tasks.trigger<typeof analyzeTask>('analyze-task', {
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
    console.error('Failed to trigger analyze-task:', error)
    const message =
      error instanceof Error ? error.message : 'Failed to trigger analyze-task'
    return json({ success: false, error: message }, 500)
  }
}
