import { tasks } from '@trigger.dev/sdk'
import { z } from 'zod'
import { json } from '@/lib/api/respond'
import { requestFreshBundle } from '@/lib/bundleRequests'
import type { jobPlanTask } from '@/trigger/jobPlanTask'

/**
 * POST /api/job-plans/run — on-demand Job plan (feat-129, mirrors
 * /api/briefings/run).
 *
 * Records a pending `bundle_requests` row with reason `job-plan` (the "fresh
 * bundle required" flag the local uploader polls for), then triggers exactly
 * one `job-plan-task` run carrying that request id: the task waits for the
 * uploader to fulfil the request and BINDS to the fulfilling bundle by id
 * (trigger/freshBundle.ts `awaitBoundBundle`), so a plan always runs on a
 * bundle captured at button-press time. On-demand only — no schedule
 * (docs/job-planning-task-plan.md, operator decision 6).
 *
 * Body: optional JSON `{ triggerReason?: string }` (default "manual"); any
 * other key is rejected — the bundle request id is minted here, never
 * accepted from the caller.
 *
 * Auth decision: intentionally unauthenticated, the same posture as
 * /api/briefings/run. The app runs only on the operator's local trading
 * machine (Vercel deployment descoped, feat-021); the worst case is an extra
 * advisory plan run that reads bundles and writes one `job_plans` row. No
 * cross-process data write happens here (that is /api/ingest, bearer-authed).
 */

// Node runtime: the trigger.dev SDK talks to the API server-side.
export const runtime = 'nodejs'

const DEFAULT_TRIGGER_REASON = 'manual'
const MAX_REASON_LENGTH = 64

const RunBody = z
  .object({
    triggerReason: z.string().trim().min(1).max(MAX_REASON_LENGTH).default(DEFAULT_TRIGGER_REASON),
  })
  .strict()

type RunBody = z.infer<typeof RunBody>

/** An absent / empty body is the dashboard button; a present one must parse and validate. */
async function readBody(request: Request): Promise<{ body: RunBody } | { response: Response }> {
  const text = await request.text()
  if (text.trim().length === 0) return { body: RunBody.parse({}) }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { response: json({ success: false, error: 'Request body must be JSON' }, 400) }
  }
  const parsed = RunBody.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors as Record<string, string[]>
    return {
      response: json({ success: false, error: 'Invalid request body', fieldErrors }, 400),
    }
  }
  return { body: parsed.data }
}

export async function POST(request: Request): Promise<Response> {
  const read = await readBody(request)
  if ('response' in read) return read.response

  try {
    const bundleRequestId = await requestFreshBundle('job-plan')
    const handle = await tasks.trigger<typeof jobPlanTask>('job-plan-task', {
      triggerReason: read.body.triggerReason,
      bundleRequestId,
    })
    // publicAccessToken is scoped to reading this one run; the dashboard uses
    // it to subscribe via Realtime, refresh on success and surface an abort.
    return json(
      {
        success: true,
        data: { runId: handle.id, publicAccessToken: handle.publicAccessToken },
      },
      202,
    )
  } catch (error) {
    console.error('Failed to trigger job-plan-task:', error)
    const message = error instanceof Error ? error.message : 'Failed to trigger job-plan-task'
    return json({ success: false, error: message }, 500)
  }
}
