import type { Briefing, TacticalRead } from '@/knowledge/schema/briefing.schema'
import type { RiskReward } from '@/lib/engine/riskReward'

/**
 * Persistence step of the analyze-task AND update-task: one `briefings` row,
 * then refresh `entry_levels` (insert the new set, deactivate every prior set
 * — eval-task only ever evaluates `active=true` rows). Side effects are
 * injected. Update runs additionally stamp kind/parent/tactical_read
 * (feat-038); analyze runs omit them so the DB default `kind='morning'`
 * applies.
 */

/** Insert shape for `public.briefings`. */
export interface BriefingInsert {
  bundle_id: string
  trigger_reason: string
  model_id: string
  htf_trend: string
  rip_status: string
  terrain: Briefing['terrain']
  primary_obj: Briefing['primary']
  secondary_obj: Briefing['secondary']
  danger_zones: Briefing['dangerZones']
  overview: Briefing['overview']
  /**
   * The POST-enforcement briefing (validated + code-owned facts overwritten)
   * — NOT the model's raw output. The dashboard re-validates and renders
   * exactly this payload, so it must stay the enforced copy; the model's
   * pre-enforcement output is observable via LangSmith telemetry (feat-030)
   * when enabled.
   */
  raw_model_json: Briefing
  /** feat-038: 'update' rows only — omitted for analyze so the DB default applies. */
  kind?: 'update'
  parent_briefing_id?: string
  tactical_read?: TacticalRead
}

/** Insert shape for `public.entry_levels`. */
export interface EntryLevelInsert {
  briefing_id: string
  objective: 'primary' | 'secondary'
  label: string
  price: number
  direction: 'long' | 'short'
  stop: number
  targets: number[]
  active: true
}

export interface PersistDeps {
  insertBriefing(row: BriefingInsert): Promise<{ id: string }>
  /**
   * Set every currently-active `entry_levels` row to `active=false`, EXCEPT
   * rows belonging to `exceptBriefingId` (the set just inserted).
   */
  deactivateEntryLevels(exceptBriefingId: string): Promise<void>
  insertEntryLevels(rows: EntryLevelInsert[]): Promise<void>
}

export interface PersistInput {
  bundleId: string
  triggerReason: string
  /** The model id that actually served the request. */
  model: string
  /** Engine-validated briefing (rr already recomputed). */
  briefing: Briefing
  /** Engine R/R verdicts — the protective stop per objective. */
  riskReward: { primary: RiskReward; secondary: RiskReward }
  /** feat-038: present only for update-task runs. */
  update?: { kind: 'update'; parentBriefingId: string; tacticalRead: TacticalRead }
}

export function buildBriefingRow(
  input: Pick<PersistInput, 'bundleId' | 'triggerReason' | 'model' | 'briefing' | 'update'>,
): BriefingInsert {
  const { briefing } = input
  return {
    bundle_id: input.bundleId,
    trigger_reason: input.triggerReason,
    model_id: input.model,
    htf_trend: briefing.meta.htfTrend,
    rip_status: briefing.meta.ripStatus,
    terrain: briefing.terrain,
    primary_obj: briefing.primary,
    secondary_obj: briefing.secondary,
    danger_zones: briefing.dangerZones,
    overview: briefing.overview,
    raw_model_json: briefing,
    ...(input.update && {
      kind: input.update.kind,
      parent_briefing_id: input.update.parentBriefingId,
      tactical_read: input.update.tacticalRead,
    }),
  }
}

/**
 * One `entry_levels` row per objective entry rung, all sharing the
 * objective's engine-chosen protective stop and target ladder.
 */
export function buildEntryLevelRows(
  briefingId: string,
  briefing: Briefing,
  riskReward: PersistInput['riskReward'],
): EntryLevelInsert[] {
  const objectives = [
    { objective: 'primary' as const, spec: briefing.primary, rr: riskReward.primary },
    { objective: 'secondary' as const, spec: briefing.secondary, rr: riskReward.secondary },
  ]
  return objectives.flatMap(({ objective, spec, rr }) =>
    spec.entries.map((entry) => ({
      briefing_id: briefingId,
      objective,
      label: entry.label,
      price: entry.price,
      direction: spec.direction,
      stop: rr.stop,
      targets: spec.targets.map((target) => target.price),
      active: true as const,
    })),
  )
}

export interface PersistResult {
  briefingId: string
  entryLevelCount: number
}

/**
 * Write order matters: supabase-js has no client-side transactions, so the
 * sequence is insert briefing → insert the NEW active levels → deactivate
 * everything else. This eliminates the zero-active window a
 * deactivate-then-insert order would open (a concurrent eval-task run in that
 * window would persist a spurious NO_ENTRY_NEAR). Failure modes: fail before
 * the level insert → the old set stays active (safe); fail after it → both
 * sets are briefly active until the retry / next briefing deactivates the old
 * one (safer than zero active).
 */
export async function persistBriefing(
  deps: PersistDeps,
  input: PersistInput,
): Promise<PersistResult> {
  const { id: briefingId } = await deps.insertBriefing(buildBriefingRow(input))
  const rows = buildEntryLevelRows(briefingId, input.briefing, input.riskReward)
  await deps.insertEntryLevels(rows)
  await deps.deactivateEntryLevels(briefingId)
  return { briefingId, entryLevelCount: rows.length }
}
