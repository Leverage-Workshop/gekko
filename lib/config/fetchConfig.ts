import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Shared config-row read used by the analyze pipeline (lib/analyze/deps.ts),
 * the /settings page, and /api/config.
 *
 * feat-031 ships the high-conviction columns as a checked-in migration
 * (supabase/migrations/20260708090000_high_conviction_flag.sql) that may not
 * be applied to the live database yet — this environment cannot run DDL, so
 * the user applies it via the Supabase MCP server or dashboard. Reads
 * therefore degrade gracefully: select the full column set first and, on
 * Postgres 42703 (undefined column), retry with the legacy column set and
 * report the columns as missing so callers can surface "apply the migration".
 */

/** The full `config` singleton row (post high_conviction_flag migration). */
export interface ConfigRow {
  model_id: string
  triage_model_id: string
  rr_min: number
  high_conviction_enabled: boolean
  high_conviction_model_id: string
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
}

export const FULL_CONFIG_COLUMNS =
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

/** Postgres "undefined_column" — the column set predates a checked-in migration. */
export function isMissingColumnError(error: { code?: string; message?: string }): boolean {
  if (error.code === '42703') {
    return true
  }
  return /column .* does not exist/i.test(error.message ?? '')
}

export async function fetchConfigRow(supabase: SupabaseClient): Promise<ConfigReadResult> {
  const full = await supabase
    .from('config')
    .select(FULL_CONFIG_COLUMNS)
    .eq('id', 1)
    .maybeSingle()
  if (!full.error) {
    return {
      row: (full.data as ConfigRow | null) ?? null,
      highConvictionColumnsMissing: false,
    }
  }
  if (!isMissingColumnError(full.error)) {
    throw full.error
  }

  // Live DB predates the high_conviction_flag migration: retry with the
  // legacy column set and pad with the (inert) defaults.
  const legacy = await supabase
    .from('config')
    .select(LEGACY_CONFIG_COLUMNS)
    .eq('id', 1)
    .maybeSingle()
  if (legacy.error) {
    throw legacy.error
  }
  return {
    row: legacy.data
      ? {
          ...(legacy.data as Omit<
            ConfigRow,
            'high_conviction_enabled' | 'high_conviction_model_id'
          >),
          ...HIGH_CONVICTION_DEFAULTS,
        }
      : null,
    highConvictionColumnsMissing: true,
  }
}
