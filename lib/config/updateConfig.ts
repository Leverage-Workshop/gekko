import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { FULL_CONFIG_COLUMNS, isMissingColumnError, type ConfigRow } from './fetchConfig'

/**
 * Config-row write path for /api/config (feat-028). Validation lives here so
 * the route handler stays thin and the rules are unit-testable offline.
 */

/** OpenRouter model ids are namespaced `provider/model` (never hardcoded in code). */
const modelId = z
  .string()
  .trim()
  .min(1, 'Required')
  .regex(/^[\w.-]+\/[\w.:-]+$/, 'Must be an OpenRouter id shaped provider/model')

export const ConfigUpdateSchema = z.object({
  model_id: modelId,
  triage_model_id: modelId,
  // z.number() rejects NaN, and the bounds reject ±Infinity — finite by construction.
  rr_min: z
    .number('Must be a number')
    .min(0.5, 'Must be at least 0.5')
    .max(10, 'Must be at most 10'),
  high_conviction_enabled: z.boolean('Must be a boolean'),
  high_conviction_model_id: modelId,
})

export type ConfigUpdate = z.infer<typeof ConfigUpdateSchema>

export type ConfigUpdateOutcome =
  | { ok: true; row: ConfigRow }
  | { ok: false; status: number; error: string }

/** Surfaced (as a 400) when a POST touches columns the live DB doesn't have yet. */
export const MIGRATION_REQUIRED_MESSAGE =
  'The high-conviction columns are missing in the live database — apply the ' +
  'supabase/migrations/20260708090000_high_conviction_flag.sql migration ' +
  '(Supabase MCP server or dashboard SQL editor) first, then save again.'

export async function updateConfigRow(
  supabase: SupabaseClient,
  update: ConfigUpdate,
): Promise<ConfigUpdateOutcome> {
  const { data, error } = await supabase
    .from('config')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('id', 1)
    .select(FULL_CONFIG_COLUMNS)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) {
      return { ok: false, status: 400, error: MIGRATION_REQUIRED_MESSAGE }
    }
    throw error
  }
  if (!data) {
    return {
      ok: false,
      status: 404,
      error: 'Config row (id=1) is missing — apply the seed_config migration first.',
    }
  }
  return { ok: true, row: data as ConfigRow }
}
