import { tasks } from '@trigger.dev/sdk'
import { json } from '@/lib/api/respond'
import type { evalTask } from '@/trigger/evalTask'

/**
 * POST /api/eval/run — on-demand entry check (feat-025).
 *
 * Triggers exactly one `eval-task` run via the type-safe `tasks.trigger`
 * (requires TRIGGER_SECRET_KEY at runtime). No cron / schedules — evals run
 * only when the user presses the "Check Entry at Current Price" button.
 *
 * Auth decision: intentionally unauthenticated, same rationale as
 * /api/briefings/run — the app runs only on the user's local trading machine
 * (Vercel deployment descoped, feat-021), the route accepts no input, and the
 * worst case is an extra advisory triage run.
 */

// Node runtime: the trigger.dev SDK talks to the API server-side.
export const runtime = 'nodejs'

export async function POST(): Promise<Response> {
  try {
    const handle = await tasks.trigger<typeof evalTask>('eval-task', {})
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
