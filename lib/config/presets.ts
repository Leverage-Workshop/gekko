import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ConfigUpdateSchema, type ConfigUpdate } from './updateConfig'

/**
 * Config presets (feat-155): named snapshots of the config singleton's
 * editable fields. The singleton (id=1) stays the one live row every pipeline
 * reads; a preset only ever reaches it through the ordinary /api/config write.
 *
 * `values` is jsonb holding the ConfigUpdate fields. Reads are lenient
 * (`applyPresetValues` merges known keys over a base and ignores the rest) so
 * a preset saved before a config column existed still loads; writes are strict
 * (`ConfigUpdateSchema`) so a preset can never hold a value the live row would
 * reject.
 */

export interface ConfigPreset {
  id: string
  name: string
  values: ConfigUpdate
  created_at: string
  updated_at: string
}

export const PRESET_NAME_MAX = 60

const presetName = z
  .string('Required')
  .trim()
  .min(1, 'Required')
  .max(PRESET_NAME_MAX, `Must be at most ${PRESET_NAME_MAX} characters`)

export const PresetCreateSchema = z.object({
  name: presetName,
  values: ConfigUpdateSchema,
})

export const PresetUpdateSchema = z.object({
  name: presetName.optional(),
  values: ConfigUpdateSchema,
})

export type PresetCreate = z.infer<typeof PresetCreateSchema>
export type PresetUpdate = z.infer<typeof PresetUpdateSchema>

const PRESET_COLUMNS = 'id, name, values, created_at, updated_at'

/** Postgres "undefined_table" — the config_presets migration is not applied yet. */
export function isMissingTableError(error: { code?: string; message?: string }): boolean {
  if (error.code === '42P01') {
    return true
  }
  return /relation .* does not exist/i.test(error.message ?? '')
}

/** Postgres "unique_violation" — a preset with that name already exists. */
export function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  if (error.code === '23505') {
    return true
  }
  return /duplicate key value/i.test(error.message ?? '')
}

export const PRESETS_MIGRATION_REQUIRED_MESSAGE =
  'The config_presets table is missing in the live database — apply the ' +
  'supabase/migrations/20260910200000_config_presets.sql migration first.'

const CONFIG_UPDATE_KEYS = Object.keys(ConfigUpdateSchema.shape) as (keyof ConfigUpdate)[]

/**
 * Merge a stored preset over a base row: every ConfigUpdate key present in the
 * preset wins, unknown keys are dropped, missing keys keep the base value. The
 * result is exactly what the settings form would POST, so it still passes
 * `ConfigUpdateSchema` on save.
 */
export function applyPresetValues(base: ConfigUpdate, stored: unknown): ConfigUpdate {
  if (stored === null || typeof stored !== 'object' || Array.isArray(stored)) {
    return { ...base }
  }
  const source = stored as Record<string, unknown>
  const picked = Object.fromEntries(
    CONFIG_UPDATE_KEYS.filter((key) => key in source).map((key) => [key, source[key]]),
  )
  return { ...base, ...picked }
}

/** True when two value sets agree on every ConfigUpdate field. */
export function presetValuesEqual(a: ConfigUpdate, b: ConfigUpdate): boolean {
  return CONFIG_UPDATE_KEYS.every((key) => a[key] === b[key])
}

/** The live row's editable fields, in ConfigUpdate shape (drops updated_at). */
export function toConfigUpdate(row: ConfigUpdate): ConfigUpdate {
  return Object.fromEntries(CONFIG_UPDATE_KEYS.map((key) => [key, row[key]])) as ConfigUpdate
}

/**
 * The preset the live row currently matches, if any — derived, never tracked
 * on row 1, so an edited-but-unapplied preset reads as "not applied" instead
 * of lying about what the pipelines are running.
 */
export function findActivePreset(
  presets: readonly ConfigPreset[],
  live: ConfigUpdate,
): ConfigPreset | null {
  return presets.find((preset) => presetValuesEqual(preset.values, live)) ?? null
}

export interface PresetListResult {
  presets: ConfigPreset[]
  /** True when the live DB predates the config_presets migration. */
  tableMissing: boolean
}

type PgError = { code?: string; message?: string }

// `as unknown`: supabase-js can't statically parse the column list into a
// row shape, so it types the data as an error sentinel.
function asPreset(row: unknown): ConfigPreset {
  return row as ConfigPreset
}

export async function fetchConfigPresets(supabase: SupabaseClient): Promise<PresetListResult> {
  const { data, error } = await supabase
    .from('config_presets')
    .select(PRESET_COLUMNS)
    .order('name', { ascending: true })
  if (error) {
    if (isMissingTableError(error)) {
      return { presets: [], tableMissing: true }
    }
    throw error
  }
  return {
    presets: ((data ?? []) as unknown[]).map(asPreset),
    tableMissing: false,
  }
}

export type PresetWriteOutcome =
  | { ok: true; preset: ConfigPreset }
  | { ok: false; status: number; error: string }

function writeFailure(error: PgError): PresetWriteOutcome | null {
  if (isMissingTableError(error)) {
    return { ok: false, status: 400, error: PRESETS_MIGRATION_REQUIRED_MESSAGE }
  }
  if (isUniqueViolation(error)) {
    return { ok: false, status: 409, error: 'A preset with that name already exists.' }
  }
  return null
}

export async function createConfigPreset(
  supabase: SupabaseClient,
  input: PresetCreate,
): Promise<PresetWriteOutcome> {
  const { data, error } = await supabase
    .from('config_presets')
    .insert({ name: input.name, values: input.values })
    .select(PRESET_COLUMNS)
    .single()
  if (error) {
    const failure = writeFailure(error)
    if (failure) return failure
    throw error
  }
  return { ok: true, preset: asPreset(data) }
}

export async function updateConfigPreset(
  supabase: SupabaseClient,
  id: string,
  input: PresetUpdate,
): Promise<PresetWriteOutcome> {
  const patch = {
    values: input.values,
    updated_at: new Date().toISOString(),
    ...(input.name === undefined ? {} : { name: input.name }),
  }
  const { data, error } = await supabase
    .from('config_presets')
    .update(patch)
    .eq('id', id)
    .select(PRESET_COLUMNS)
    .maybeSingle()
  if (error) {
    const failure = writeFailure(error)
    if (failure) return failure
    throw error
  }
  if (!data) {
    return { ok: false, status: 404, error: 'Preset not found.' }
  }
  return { ok: true, preset: asPreset(data) }
}

export type PresetDeleteOutcome = { ok: true } | { ok: false; status: number; error: string }

export async function deleteConfigPreset(
  supabase: SupabaseClient,
  id: string,
): Promise<PresetDeleteOutcome> {
  const { data, error } = await supabase
    .from('config_presets')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) {
    if (isMissingTableError(error)) {
      return { ok: false, status: 400, error: PRESETS_MIGRATION_REQUIRED_MESSAGE }
    }
    throw error
  }
  if (!data) {
    return { ok: false, status: 404, error: 'Preset not found.' }
  }
  return { ok: true }
}
