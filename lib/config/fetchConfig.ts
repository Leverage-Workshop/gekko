import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReasoningEffort } from '@/lib/llm/reasoning'

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

/** The full `config` singleton row (post execution_bar_volume migration). */
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
}

export const FULL_CONFIG_COLUMNS =
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
    }
  }
  if (!isMissingColumnError(full.error)) {
    throw full.error
  }

  // Live DB predates the execution_bar_volume migration: retry without it and
  // pad with the migration default.
  const preBarVolume = await selectConfig(supabase, PRE_BAR_VOLUME_CONFIG_COLUMNS)
  if (!preBarVolume.error) {
    return {
      row: preBarVolume.data
        ? ({ ...preBarVolume.data, ...BAR_VOLUME_DEFAULTS } as ConfigRow)
        : null,
      highConvictionColumnsMissing: false,
      effortColumnsMissing: false,
      barVolumeColumnMissing: true,
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
        ? ({ ...preEffort.data, ...EFFORT_DEFAULTS, ...BAR_VOLUME_DEFAULTS } as ConfigRow)
        : null,
      highConvictionColumnsMissing: false,
      effortColumnsMissing: true,
      barVolumeColumnMissing: true,
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
        } as ConfigRow)
      : null,
    highConvictionColumnsMissing: true,
    effortColumnsMissing: true,
    barVolumeColumnMissing: true,
  }
}
