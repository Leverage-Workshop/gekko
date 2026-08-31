import type { JobPlanRow } from '@/lib/job-plan/dashboard/schema'
import { runJobPlan } from '@/lib/job-plan/runJobPlan'
import { VISION_ON, cannedGenerate, fakeJobPlanDeps, partialGenerate } from './jobPlanDeps'
import { REQUEST_ID, RUN_ID, inSession } from './jobPlanFiles'
import { fixture, mutate } from './jobStudy'

/**
 * Persisted `job_plans` rows for the surface tests (feat-129): the REAL
 * pipeline (runJobPlan over the real job-study pair + rolling profiles, fake
 * deps, canned vision reads) produces the insert, and this wraps it in the
 * row shape the dashboard loader reads. No hand-built plans — the card renders
 * what the task actually writes.
 */

export type RowVariant =
  | 'ready-vision-on'
  | 'ready-vision-off'
  | 'ready-vision-partial'
  | 'insufficient'

export const ROW_ID = '33333333-3333-4333-8333-333333333333'
export const CREATED_AT = '2026-08-24T14:31:00.000Z'

/** The daily chart clock ~70 minutes behind the bundle: parses but trips R13's 5-minute skew even past the one-bar allowance. */
function skewedDaily(): string {
  return mutate(inSession(fixture('daily.json')), (doc) => {
    doc.meta.exportedAt = '2026-08-24T08:21:00'
    doc.meta.lastBarTime = '2026-08-24T08:20:00'
  })
}

const cache = new Map<RowVariant, Promise<JobPlanRow>>()

async function build(variant: RowVariant): Promise<JobPlanRow> {
  const fake = fakeJobPlanDeps(
    variant === 'ready-vision-on'
      ? { config: VISION_ON, generate: cannedGenerate }
      : variant === 'ready-vision-partial'
        ? { config: VISION_ON, generate: partialGenerate }
        : variant === 'insufficient'
          ? { texts: { jobStudyDaily: skewedDaily() } }
          : {}
  )
  await runJobPlan(fake.deps, {
    runId: RUN_ID,
    triggerReason: 'manual',
    bundleRequestId: REQUEST_ID,
  })
  const insert = fake.state.inserted[0]
  return {
    id: ROW_ID,
    created_at: CREATED_AT,
    bundle_id: insert.bundle_id,
    trading_day: insert.trading_day,
    trigger_reason: insert.trigger_reason,
    status: insert.status,
    planner_revision: insert.planner_revision,
    input_fingerprint: insert.input_fingerprint,
    run_id: insert.run_id,
    plan: insert.plan,
    warnings: [...insert.warnings],
    profile_nodes: insert.profile_nodes,
  }
}

/** Memoized per variant — the pipeline is deterministic and the vision-on run renders both profiles. */
export function persistedJobPlanRow(variant: RowVariant): Promise<JobPlanRow> {
  const cached = cache.get(variant)
  if (cached) return cached
  const built = build(variant)
  cache.set(variant, built)
  return built
}
