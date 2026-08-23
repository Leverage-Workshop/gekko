import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReasoningEffort } from '@/lib/llm/reasoning'
import { DEFAULT_SIGNIFICANT_MOVE_SIGMA } from '@/lib/engine/scaledGates'

/**
 * Shared config-row read used by the analyze pipeline (lib/analyze/deps.ts),
 * the /settings page, and /api/config.
 *
 * Checked-in migrations may not be applied to the live database yet — this
 * environment cannot run DDL, so the user applies them via the Supabase MCP
 * server or dashboard. Reads therefore degrade gracefully: select the full
 * column set first and, on Postgres 42703 (undefined column), retry with the
 * next-older column set and report the columns as missing so callers can
 * surface "apply the migration". Two migration tiers are covered:
 * high_conviction_flag (feat-031) and model_reasoning_effort (2026-07-25).
 */

/** The full `config` singleton row (post significant_move_sigma migration). */
export interface ConfigRow {
  model_id: string
  triage_model_id: string
  rr_min: number
  high_conviction_enabled: boolean
  high_conviction_model_id: string
  /** OpenRouter reasoning.effort per model slot; null = provider default. */
  model_effort: ReasoningEffort | null
  triage_model_effort: ReasoningEffort | null
  high_conviction_model_effort: ReasoningEffort | null
  /**
   * Per-bar volume of the Sierra execution-chart bars (feat-079) — exporter
   * metadata the operator controls in Sierra, injected into the analyze/update
   * prompts. The cached doctrine prefix never states the number.
   */
  execution_bar_volume: number
  /**
   * Minimum expected reversal traverse a level must offer to anchor an
   * objective entry (feat-086 entry-first contract), as a MULTIPLE of the
   * measured session sigma (feat-096 units change — the fixed 50 pts it
   * replaced was 0.18σ and filtered nothing). Resolved to points per run
   * against `facts.volatilityScale` and injected into the analyze/update
   * prompts in BOTH units; the doctrine prefix never states the number.
   */
  significant_move_sigma: number
  /**
   * Job planner profile vision read (feat-124, docs/job-planning-task-plan.md
   * "Model / effort"). `profile_vision_model_id` NULL = the read is OFF (feat-128
   * treats it as "profile nodes unavailable", R14); effort NULL = provider
   * default; samples is S in the P x S x T consensus (feat-123), 1..5.
   */
  profile_vision_model_id: string | null
  profile_vision_model_effort: ReasoningEffort | null
  profile_vision_samples: number
  updated_at: string
}

export interface ConfigReadResult {
  /** The config row (id=1), or null when unseeded. */
  row: ConfigRow | null
  /**
   * True when the live DB predates the high_conviction_flag migration —
   * the returned row is padded with {@link HIGH_CONVICTION_DEFAULTS}.
   */
  highConvictionColumnsMissing: boolean
  /**
   * True when the live DB predates the model_reasoning_effort migration —
   * the returned row's effort columns are padded with null (provider default).
   */
  effortColumnsMissing: boolean
  /**
   * True when the live DB predates the execution_bar_volume migration —
   * the returned row is padded with {@link DEFAULT_EXECUTION_BAR_VOLUME}.
   */
  barVolumeColumnMissing: boolean
  /**
   * True when the live DB predates the significant_move_sigma migration
   * (feat-096) — the returned row is padded with
   * {@link DEFAULT_SIGNIFICANT_MOVE_SIGMA}. Also true for a DB still carrying
   * the retired `significant_move_pts` column: the units differ, so a stale
   * point value is never read as a multiple.
   */
  significantMoveColumnMissing: boolean
  /**
   * True when the live DB predates the profile_vision_config migration
   * (feat-124) — the returned row is padded with {@link PROFILE_VISION_DEFAULTS}
   * (read OFF, provider-default effort, 3 samples).
   */
  profileVisionColumnsMissing: boolean
}

export const FULL_CONFIG_COLUMNS =
  'model_id, triage_model_id, rr_min, high_conviction_enabled, high_conviction_model_id, ' +
  'model_effort, triage_model_effort, high_conviction_model_effort, execution_bar_volume, ' +
  'significant_move_sigma, profile_vision_model_id, profile_vision_model_effort, ' +
  'profile_vision_samples, updated_at'

/** Pre-profile_vision_config column set (post significant_move_sigma). */
const PRE_PROFILE_VISION_CONFIG_COLUMNS =
  'model_id, triage_model_id, rr_min, high_conviction_enabled, high_conviction_model_id, ' +
  'model_effort, triage_model_effort, high_conviction_model_effort, execution_bar_volume, ' +
  'significant_move_sigma, updated_at'

/**
 * Pre-significant_move_sigma column set (post execution_bar_volume). Covers
 * BOTH pre-feat-086 databases and databases still on the retired
 * `significant_move_pts` column — neither can serve a sigma multiple.
 */
const PRE_SIGNIFICANT_MOVE_CONFIG_COLUMNS =
  'model_id, triage_model_id, rr_min, high_conviction_enabled, high_conviction_model_id, ' +
  'model_effort, triage_model_effort, high_conviction_model_effort, execution_bar_volume, ' +
  'updated_at'

/** Pre-execution_bar_volume column set (post model_reasoning_effort). */
const PRE_BAR_VOLUME_CONFIG_COLUMNS =
  'model_id, triage_model_id, rr_min, high_conviction_enabled, high_conviction_model_id, ' +
  'model_effort, triage_model_effort, high_conviction_model_effort, updated_at'

/** Pre-model_reasoning_effort column set (post high_conviction_flag). */
const PRE_EFFORT_CONFIG_COLUMNS =
  'model_id, triage_model_id, rr_min, high_conviction_enabled, high_conviction_model_id, updated_at'

const LEGACY_CONFIG_COLUMNS = 'model_id, triage_model_id, rr_min, updated_at'

/**
 * Mirrors the migration's column defaults. Used only to pad the read shape
 * when the live DB is pre-migration — routing never consults the model id
 * while the flag is false, so nothing is hardcoded into a model call.
 */
export const HIGH_CONVICTION_DEFAULTS = {
  high_conviction_enabled: false,
  high_conviction_model_id: 'anthropic/claude-opus-4-8',
} as const

/** Effort columns pad to null — provider default — when pre-migration. */
export const EFFORT_DEFAULTS = {
  model_effort: null,
  triage_model_effort: null,
  high_conviction_model_effort: null,
} as const

/**
 * Mirrors the execution_bar_volume migration default (feat-079) — the live
 * Sierra exporter's 750-volume bars. Pads the read shape when the live DB is
 * pre-migration, and backstops the prompt builders when config is unseeded.
 */
export const DEFAULT_EXECUTION_BAR_VOLUME = 750

const BAR_VOLUME_DEFAULTS = {
  execution_bar_volume: DEFAULT_EXECUTION_BAR_VOLUME,
} as const

/**
 * Pads the read shape when the live DB predates the significant_move_sigma
 * migration (feat-096). The multiple itself — and why it is 0.4σ rather than a
 * round number — is owned by `lib/engine/scaledGates.ts`; the point value it
 * resolves to is regime-dependent (~113 pts at the review's 283-pt sigma).
 */
const SIGNIFICANT_MOVE_DEFAULTS = {
  significant_move_sigma: DEFAULT_SIGNIFICANT_MOVE_SIGMA,
} as const

/** Samples per profile image when the vision read runs (feat-123 default S). */
export const DEFAULT_PROFILE_VISION_SAMPLES = 3

/**
 * Pads the read shape when the live DB predates the profile_vision_config
 * migration (feat-124): the read is OFF (null model id), provider-default
 * effort, the default sample count. A null model id is never a model call —
 * feat-128 reads it as "profile nodes unavailable" (R14).
 */
export const PROFILE_VISION_DEFAULTS = {
  profile_vision_model_id: null,
  profile_vision_model_effort: null,
  profile_vision_samples: DEFAULT_PROFILE_VISION_SAMPLES,
} as const

/** Postgres "undefined_column" — the column set predates a checked-in migration. */
export function isMissingColumnError(error: { code?: string; message?: string }): boolean {
  if (error.code === '42703') {
    return true
  }
  return /column .* does not exist/i.test(error.message ?? '')
}

async function selectConfig(
  supabase: SupabaseClient,
  columns: string,
): Promise<{ data: Record<string, unknown> | null; error: { code?: string; message?: string } | null }> {
  const { data, error } = await supabase
    .from('config')
    .select(columns)
    .eq('id', 1)
    .maybeSingle()
  return { data: data as Record<string, unknown> | null, error }
}

export async function fetchConfigRow(supabase: SupabaseClient): Promise<ConfigReadResult> {
  const full = await selectConfig(supabase, FULL_CONFIG_COLUMNS)
  if (!full.error) {
    return {
      row: (full.data as ConfigRow | null) ?? null,
      highConvictionColumnsMissing: false,
      effortColumnsMissing: false,
      barVolumeColumnMissing: false,
      significantMoveColumnMissing: false,
      profileVisionColumnsMissing: false,
    }
  }
  if (!isMissingColumnError(full.error)) {
    throw full.error
  }

  // Live DB predates the profile_vision_config migration (feat-124): retry
  // without those columns and pad with the read-OFF defaults.
  const preProfileVision = await selectConfig(supabase, PRE_PROFILE_VISION_CONFIG_COLUMNS)
  if (!preProfileVision.error) {
    return {
      row: preProfileVision.data
        ? ({ ...preProfileVision.data, ...PROFILE_VISION_DEFAULTS } as ConfigRow)
        : null,
      highConvictionColumnsMissing: false,
      effortColumnsMissing: false,
      barVolumeColumnMissing: false,
      significantMoveColumnMissing: false,
      profileVisionColumnsMissing: true,
    }
  }
  if (!isMissingColumnError(preProfileVision.error)) {
    throw preProfileVision.error
  }

  // Live DB predates the significant_move_sigma migration (or still carries
  // the retired points column): retry without it and pad with the default.
  const preSignificantMove = await selectConfig(supabase, PRE_SIGNIFICANT_MOVE_CONFIG_COLUMNS)
  if (!preSignificantMove.error) {
    return {
      row: preSignificantMove.data
        ? ({
            ...preSignificantMove.data,
            ...SIGNIFICANT_MOVE_DEFAULTS,
            ...PROFILE_VISION_DEFAULTS,
          } as ConfigRow)
        : null,
      highConvictionColumnsMissing: false,
      effortColumnsMissing: false,
      barVolumeColumnMissing: false,
      significantMoveColumnMissing: true,
      profileVisionColumnsMissing: true,
    }
  }
  if (!isMissingColumnError(preSignificantMove.error)) {
    throw preSignificantMove.error
  }

  // Predates the execution_bar_volume migration too: retry without it and
  // pad with the migration default.
  const preBarVolume = await selectConfig(supabase, PRE_BAR_VOLUME_CONFIG_COLUMNS)
  if (!preBarVolume.error) {
    return {
      row: preBarVolume.data
        ? ({
            ...preBarVolume.data,
            ...BAR_VOLUME_DEFAULTS,
            ...SIGNIFICANT_MOVE_DEFAULTS,
            ...PROFILE_VISION_DEFAULTS,
          } as ConfigRow)
        : null,
      highConvictionColumnsMissing: false,
      effortColumnsMissing: false,
      barVolumeColumnMissing: true,
      significantMoveColumnMissing: true,
      profileVisionColumnsMissing: true,
    }
  }
  if (!isMissingColumnError(preBarVolume.error)) {
    throw preBarVolume.error
  }

  // Predates the model_reasoning_effort migration too: retry with the
  // pre-effort column set and pad the effort columns with null.
  const preEffort = await selectConfig(supabase, PRE_EFFORT_CONFIG_COLUMNS)
  if (!preEffort.error) {
    return {
      row: preEffort.data
        ? ({
            ...preEffort.data,
            ...EFFORT_DEFAULTS,
            ...BAR_VOLUME_DEFAULTS,
            ...SIGNIFICANT_MOVE_DEFAULTS,
            ...PROFILE_VISION_DEFAULTS,
          } as ConfigRow)
        : null,
      highConvictionColumnsMissing: false,
      effortColumnsMissing: true,
      barVolumeColumnMissing: true,
      significantMoveColumnMissing: true,
      profileVisionColumnsMissing: true,
    }
  }
  if (!isMissingColumnError(preEffort.error)) {
    throw preEffort.error
  }

  // Predates the high_conviction_flag migration too: retry with the legacy
  // column set and pad with the (inert) defaults.
  const legacy = await selectConfig(supabase, LEGACY_CONFIG_COLUMNS)
  if (legacy.error) {
    throw legacy.error
  }
  return {
    row: legacy.data
      ? ({
          ...legacy.data,
          ...HIGH_CONVICTION_DEFAULTS,
          ...EFFORT_DEFAULTS,
          ...BAR_VOLUME_DEFAULTS,
          ...SIGNIFICANT_MOVE_DEFAULTS,
          ...PROFILE_VISION_DEFAULTS,
        } as ConfigRow)
      : null,
    highConvictionColumnsMissing: true,
    effortColumnsMissing: true,
    barVolumeColumnMissing: true,
    significantMoveColumnMissing: true,
    profileVisionColumnsMissing: true,
  }
}
