import { Briefing } from '@/knowledge/schema/briefing.schema'
import { assessStaleness, type StalenessAssessment } from '@/lib/engine/staleness'

/**
 * Dashboard data loading (feat-019): the latest `briefings` row, the latest
 * `eval_results` row, and the latest bundle's `received_at` (for staleness via
 * assessStaleness). Side effects are injected (`DashboardDeps`) so the loader
 * is unit-testable offline; `realDashboardDeps()` in ./deps.ts wires the
 * service-role Supabase client.
 */

/** The `briefings` columns the dashboard consumes. */
export interface DashboardBriefingRow {
  id: string
  created_at: string
  trigger_reason: string | null
  model_id: string | null
  /** Full Briefing payload as persisted; re-validated against the Zod schema. */
  raw_model_json: unknown
}

/** The `eval_results` columns the dashboard consumes. */
export interface DashboardEvalRow {
  id: string
  created_at: string
  model_id: string | null
  near_entry: boolean | null
  status: string
  direction: string | null
  trigger: string | null
  stop: number | null
  targets: number[] | null
  reason: string | null
  current_price: number | null
}

export interface DashboardDeps {
  /** Latest `briefings` row by `created_at`, or null when none exist. */
  fetchLatestBriefing(): Promise<DashboardBriefingRow | null>
  /** Latest `eval_results` row by `created_at`, or null when none exist. */
  fetchLatestEvalResult(): Promise<DashboardEvalRow | null>
  /** Latest `raw_bundles.received_at`, or null when no bundle was ever ingested. */
  fetchLatestBundleReceivedAt(): Promise<string | null>
}

export interface DashboardBriefing {
  id: string
  createdAt: string
  triggerReason: string
  modelId: string | null
  payload: Briefing
}

export interface DashboardData {
  briefing: DashboardBriefing | null
  /**
   * Set when a briefings row exists but its payload failed Briefing schema
   * validation — surfaced instead of rendering a half-parsed briefing.
   */
  briefingError: string | null
  evalResult: DashboardEvalRow | null
  staleness: StalenessAssessment
}

export async function loadDashboardData(
  deps: DashboardDeps,
  opts: { now?: Date } = {},
): Promise<DashboardData> {
  const [briefingRow, evalRow, receivedAt] = await Promise.all([
    deps.fetchLatestBriefing(),
    deps.fetchLatestEvalResult(),
    deps.fetchLatestBundleReceivedAt(),
  ])

  const staleness = assessStaleness({ receivedAt, now: opts.now })

  let briefing: DashboardBriefing | null = null
  let briefingError: string | null = null
  if (briefingRow) {
    const parsed = Briefing.safeParse(briefingRow.raw_model_json)
    if (parsed.success) {
      briefing = {
        id: briefingRow.id,
        createdAt: briefingRow.created_at,
        triggerReason: briefingRow.trigger_reason ?? parsed.data.meta.triggerReason,
        modelId: briefingRow.model_id,
        payload: parsed.data,
      }
    } else {
      briefingError =
        `Latest briefing row ${briefingRow.id} failed Briefing schema validation ` +
        `and cannot be rendered. Run a new briefing.`
    }
  }

  return { briefing, briefingError, evalResult: evalRow, staleness }
}
