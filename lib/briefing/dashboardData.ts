import { Briefing, EvalCheck, TacticalRead } from '@/knowledge/schema/briefing.schema'
import { z } from 'zod'
import { parseExecBars, type ExecBar } from '@/lib/engine/parseExecBars'
import { assessStaleness, type StalenessAssessment } from '@/lib/engine/staleness'

/**
 * Dashboard data loading (feat-019): the latest `briefings` row, the latest
 * `eval_results` row, the latest bundle's `received_at` (for staleness via
 * assessStaleness), and the latest bundle's execution bars (for the terrain
 * chart). Side effects are injected (`DashboardDeps`) so the loader is
 * unit-testable offline; `realDashboardDeps()` in ./deps.ts wires the
 * service-role Supabase client.
 */

/** The `briefings` columns the dashboard consumes. */
export interface DashboardBriefingRow {
  id: string
  created_at: string
  trigger_reason: string | null
  model_id: string | null
  /** 'morning' | 'update' (feat-038); null on pre-migration rows. */
  kind: string | null
  /** Update rows only: the Immediate Tactical Read jsonb (feat-038). */
  tactical_read: unknown
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
  /** EvalCheck[] jsonb; null on pre-migration rows. Parse via {@link parseEvalChecks}. */
  checks: unknown
  next_signal: string | null
  caution: string | null
  current_price: number | null
  /**
   * string[] jsonb of eval-task runtime warnings (enforcement coercions,
   * staleness, degraded inputs); null on pre-migration rows or clean runs.
   * Parse via {@link parseEvalWarnings}.
   */
  warnings: unknown
  /**
   * The `entry_levels` row the verdict is about, embedded via
   * `evaluated_level_id`; null when the eval matched no level (NO_ENTRY_NEAR)
   * or the level was deleted.
   */
  evaluated_level: {
    label: string | null
    price: number | null
    direction: string | null
  } | null
}

/**
 * Validate the `eval_results.checks` jsonb into EvalCheck[]. Returns null when
 * absent or malformed — the strip falls back to the `reason` prose, never breaks.
 */
export function parseEvalChecks(checks: unknown): EvalCheck[] | null {
  if (checks == null) return null
  const parsed = z.array(EvalCheck).min(1).safeParse(checks)
  return parsed.success ? parsed.data : null
}

/**
 * Validate the `eval_results.warnings` jsonb into string[]. Returns null when
 * absent or malformed — the strip simply omits the enforcement callout.
 */
export function parseEvalWarnings(warnings: unknown): string[] | null {
  if (warnings == null) return null
  const parsed = z.array(z.string()).min(1).safeParse(warnings)
  return parsed.success ? parsed.data : null
}

export interface DashboardDeps {
  /** Latest `briefings` row by `created_at`, or null when none exist. */
  fetchLatestBriefing(): Promise<DashboardBriefingRow | null>
  /** Latest `eval_results` row by `created_at`, or null when none exist. */
  fetchLatestEvalResult(): Promise<DashboardEvalRow | null>
  /** Latest `raw_bundles.received_at`, or null when no bundle was ever ingested. */
  fetchLatestBundleReceivedAt(): Promise<string | null>
  /** Latest bundle's execution_bars.csv content, or null when none exists. */
  fetchLatestExecCsv(): Promise<string | null>
}

export interface DashboardBriefing {
  id: string
  createdAt: string
  triggerReason: string
  modelId: string | null
  /** Anything other than 'update' (including pre-migration null) reads as 'morning'. */
  kind: 'morning' | 'update'
  /** Non-null only for update rows whose tactical_read parses; degrades to null. */
  tacticalRead: TacticalRead | null
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
  /**
   * True when the latest eval row exists but predates the current briefing
   * row: it was checked against the previous briefing's entry levels
   * (each briefing/update replaces the active set), so it is withheld from
   * `evalResult` and the strip prompts for a fresh eval instead.
   */
  evalSuperseded: boolean
  staleness: StalenessAssessment
  /**
   * Parsed execution bars from the latest bundle, or null when the CSV is
   * missing, unreadable, or malformed — the chart degrades, never the page.
   */
  execBars: ExecBar[] | null
}

export async function loadDashboardData(
  deps: DashboardDeps,
  opts: { now?: Date } = {},
): Promise<DashboardData> {
  const [briefingRow, evalRow, receivedAt, execCsv] = await Promise.all([
    deps.fetchLatestBriefing(),
    deps.fetchLatestEvalResult(),
    deps.fetchLatestBundleReceivedAt(),
    // The chart is progressive enhancement: a storage failure must not take
    // down the briefing view.
    deps.fetchLatestExecCsv().catch(() => null),
  ])

  const staleness = assessStaleness({ receivedAt, now: opts.now })

  let execBars: ExecBar[] | null = null
  if (execCsv) {
    try {
      execBars = parseExecBars(execCsv)
    } catch {
      execBars = null
    }
  }

  // An eval only ever checks the ACTIVE entry levels, and each new briefing
  // (morning or update) replaces the active set — so an eval created before
  // the current briefing row is about the previous briefing's levels and
  // must not render beside this one. Withheld only when both timestamps
  // parse and the eval is strictly older (degrade to showing, never hide a
  // fresh eval on malformed data). The cutoff is the raw row's created_at so
  // it applies even when the briefing payload fails schema validation below.
  let evalResult = evalRow
  let evalSuperseded = false
  if (briefingRow && evalRow) {
    const briefingAt = new Date(briefingRow.created_at).getTime()
    const evalAt = new Date(evalRow.created_at).getTime()
    if (!Number.isNaN(briefingAt) && !Number.isNaN(evalAt) && evalAt < briefingAt) {
      evalResult = null
      evalSuperseded = true
    }
  }

  let briefing: DashboardBriefing | null = null
  let briefingError: string | null = null
  if (briefingRow) {
    const parsed = Briefing.safeParse(briefingRow.raw_model_json)
    if (parsed.success) {
      // The tactical read degrades to null on any parse failure — it is an
      // update-only garnish and must never block the briefing render.
      const tacticalRead = TacticalRead.safeParse(briefingRow.tactical_read)
      briefing = {
        id: briefingRow.id,
        createdAt: briefingRow.created_at,
        triggerReason: briefingRow.trigger_reason ?? parsed.data.meta.triggerReason,
        modelId: briefingRow.model_id,
        kind: briefingRow.kind === 'update' ? 'update' : 'morning',
        tacticalRead: tacticalRead.success ? tacticalRead.data : null,
        payload: parsed.data,
      }
    } else {
      briefingError =
        `Latest briefing row ${briefingRow.id} failed Briefing schema validation ` +
        `and cannot be rendered. Run a new briefing.`
    }
  }

  return { briefing, briefingError, evalResult, evalSuperseded, staleness, execBars }
}
