import { JobPlanSchema, type PlanStatus } from '@/knowledge/schema/job-plan.schema'
import type { z } from 'zod'
import {
  JobContextViewSchema,
  parseJobPlanWarnings,
  parsePersistedProfileNodes,
  type JobContextView,
  type JobPlanRow,
  type PersistedProfileNodes,
} from './schema'

/**
 * Job plan dashboard data (feat-129): the latest `job_plans` row, validated
 * at the boundary and reduced to what the plan card renders MECHANICALLY —
 * no prose generation, no model. Side effects are injected
 * (`JobPlanDashboardDeps`) so the loader is unit-testable offline;
 * `realJobPlanDashboardDeps()` in ./deps.ts wires the service-role client.
 *
 * A row whose plan fails `JobPlanSchema` is surfaced as an error rather than
 * half-rendered (the briefing loader's rule). A malformed `profile_nodes`
 * degrades to null WITH a loud error line — the overlay is a grading aid,
 * the plan still renders.
 */

/** The warning prefix the vision read stamps when a profile has no consensus (R14). */
export const PROFILE_NODES_UNAVAILABLE_PREFIX = 'profile_nodes_unavailable'

const PROFILE_NODES_MALFORMED =
  'profile_nodes on this row did not parse as a persisted vision read — the profile overlay cannot be drawn; the plan below is unaffected'

type JobPlanShape = z.infer<typeof JobPlanSchema>

/** The validated plan with the context slice the card renders typed. */
export type JobPlanView = Omit<JobPlanShape, 'context'> & { readonly context: JobContextView }

export interface JobPlanDashboardDeps {
  /** Latest `job_plans` row by `created_at`, or null when none exist. */
  fetchLatestJobPlan(): Promise<JobPlanRow | null>
}

export interface JobPlanCardData {
  readonly id: string
  readonly createdAt: string
  readonly runId: string
  readonly bundleId: string
  readonly tradingDay: string
  readonly triggerReason: string
  readonly plannerRevision: string
  readonly inputFingerprint: string
  readonly status: PlanStatus
  readonly plan: JobPlanView
  readonly warnings: readonly string[]
  /** The `profile_nodes_unavailable…` warnings, pulled out so the card can shout them. */
  readonly visionWarnings: readonly string[]
  /** True when the read was OFF or produced nothing persistable (no `profile_nodes`). */
  readonly visionOff: boolean
  readonly profileNodes: PersistedProfileNodes | null
  /** Set when `profile_nodes` was present but malformed. */
  readonly profileNodesError: string | null
}

export interface JobPlanDashboardData {
  readonly jobPlan: JobPlanCardData | null
  /** Set when a row exists but cannot be rendered — shown instead of a half-parsed card. */
  readonly error: string | null
}

function validatePlan(row: JobPlanRow): { plan: JobPlanView } | { error: string } {
  if (row.plan == null) {
    return {
      error: `Latest job_plans row ${row.id} (${row.status}) carries no plan and cannot be rendered.`,
    }
  }
  const parsed = JobPlanSchema.safeParse(row.plan)
  if (!parsed.success) {
    return {
      error:
        `Latest job_plans row ${row.id} failed JobPlan schema validation and cannot be rendered. ` +
        `Run a new Job plan.`,
    }
  }
  const context = JobContextViewSchema.safeParse(parsed.data.context)
  if (!context.success) {
    return {
      error:
        `Latest job_plans row ${row.id} carries a context the card cannot read ` +
        `(planner revision ${row.planner_revision}). Run a new Job plan.`,
    }
  }
  return { plan: { ...parsed.data, context: context.data } }
}

function profileNodesOf(value: unknown): {
  nodes: PersistedProfileNodes | null
  error: string | null
} {
  if (value == null) return { nodes: null, error: null }
  const nodes = parsePersistedProfileNodes(value)
  return nodes === null ? { nodes: null, error: PROFILE_NODES_MALFORMED } : { nodes, error: null }
}

export function toCardData(row: JobPlanRow): JobPlanDashboardData {
  const validated = validatePlan(row)
  if ('error' in validated) return { jobPlan: null, error: validated.error }
  const warnings = parseJobPlanWarnings(row.warnings)
  const profile = profileNodesOf(row.profile_nodes)
  return {
    error: null,
    jobPlan: {
      id: row.id,
      createdAt: row.created_at,
      runId: row.run_id,
      bundleId: row.bundle_id,
      tradingDay: row.trading_day,
      triggerReason: row.trigger_reason,
      plannerRevision: row.planner_revision,
      inputFingerprint: row.input_fingerprint,
      status: row.status,
      plan: validated.plan,
      warnings,
      visionWarnings: warnings.filter((w) => w.startsWith(PROFILE_NODES_UNAVAILABLE_PREFIX)),
      visionOff: row.profile_nodes == null,
      profileNodes: profile.nodes,
      profileNodesError: profile.error,
    },
  }
}

export async function loadJobPlanDashboard(
  deps: JobPlanDashboardDeps
): Promise<JobPlanDashboardData> {
  const row = await deps.fetchLatestJobPlan()
  if (row === null) return { jobPlan: null, error: null }
  return toCardData(row)
}
