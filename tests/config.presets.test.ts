import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  PRESETS_MIGRATION_REQUIRED_MESSAGE,
  PresetCreateSchema,
  applyPresetValues,
  createConfigPreset,
  deleteConfigPreset,
  fetchConfigPresets,
  findActivePreset,
  presetValuesEqual,
  toConfigUpdate,
  updateConfigPreset,
  type ConfigPreset,
  type ConfigUpdate,
} from '@/lib/config'
import { presetStatus } from '@/app/components/use-config-presets'

// feat-155 config presets: pure merge/match helpers + the store against a
// DI'd fake client (offline). Presets are snapshots; nothing here touches
// the config singleton, and the store degrades on a missing table (42P01)
// the way the config read degrades on a missing column.

const LIVE: ConfigUpdate = {
  model_id: 'openai/gpt-5.6-terra',
  triage_model_id: 'openai/gpt-5.6-luna',
  rr_min: 3,
  high_conviction_enabled: false,
  high_conviction_model_id: 'anthropic/claude-opus-4-8',
  model_effort: 'high',
  triage_model_effort: null,
  high_conviction_model_effort: null,
  execution_bar_volume: 750,
  significant_move_sigma: 0.3,
  profile_vision_model_id: null,
  profile_vision_model_effort: null,
  profile_vision_samples: 3,
}

function preset(id: string, name: string, values: ConfigUpdate): ConfigPreset {
  return { id, name, values, created_at: '2026-09-10T20:00:00Z', updated_at: '2026-09-10T20:00:00Z' }
}

describe('applyPresetValues', () => {
  it('merges known keys over the base and keeps base values for missing keys', () => {
    const merged = applyPresetValues(LIVE, { model_id: 'anthropic/claude-sonnet-5', model_effort: 'low' })
    expect(merged).toEqual({ ...LIVE, model_id: 'anthropic/claude-sonnet-5', model_effort: 'low' })
  })

  it('ignores keys that are not config fields (a retired column in an old preset)', () => {
    const merged = applyPresetValues(LIVE, { significant_move_pts: 50, updated_at: 'x', model_id: 'a/b' })
    expect(merged).toEqual({ ...LIVE, model_id: 'a/b' })
    expect(merged).not.toHaveProperty('significant_move_pts')
    expect(merged).not.toHaveProperty('updated_at')
  })

  it('returns a copy of the base for a non-object payload', () => {
    for (const stored of [null, 'nope', 7, ['a']]) {
      const merged = applyPresetValues(LIVE, stored)
      expect(merged).toEqual(LIVE)
      expect(merged).not.toBe(LIVE)
    }
  })

  it('never mutates the base', () => {
    const base = { ...LIVE }
    applyPresetValues(base, { model_id: 'a/b' })
    expect(base).toEqual(LIVE)
  })
})

describe('presetValuesEqual / findActivePreset / toConfigUpdate', () => {
  it('compares every config field and nothing else', () => {
    expect(presetValuesEqual(LIVE, { ...LIVE })).toBe(true)
    expect(presetValuesEqual(LIVE, { ...LIVE, profile_vision_samples: 4 })).toBe(false)
    expect(presetValuesEqual(LIVE, { ...LIVE, model_effort: null })).toBe(false)
  })

  it('derives the active preset as the one whose values equal the live row', () => {
    const a = preset('a', 'Fast', { ...LIVE, model_effort: 'low' })
    const b = preset('b', 'Deep', LIVE)
    expect(findActivePreset([a, b], LIVE)).toBe(b)
    expect(findActivePreset([a], LIVE)).toBeNull()
    expect(findActivePreset([], LIVE)).toBeNull()
  })

  it('projects the live row onto the editable fields, dropping updated_at', () => {
    const row = { ...LIVE, updated_at: '2026-09-10T20:00:00Z' }
    expect(toConfigUpdate(row)).toEqual(LIVE)
  })
})

describe('presetStatus (settings form badge)', () => {
  const selected = preset('a', 'Fast', { ...LIVE, model_effort: 'low' })

  it('is null with no preset selected', () => {
    expect(presetStatus(null, LIVE, LIVE)).toBeNull()
  })

  it('reads active when form == preset == live', () => {
    expect(presetStatus(selected, selected.values, selected.values)).toBe('active')
  })

  it('reads not-applied when the form matches the preset but live differs', () => {
    expect(presetStatus(selected, selected.values, LIVE)).toBe('not-applied')
  })

  it('reads edited when the form drifted from the preset, whatever live says', () => {
    expect(presetStatus(selected, { ...selected.values, rr_min: 2 }, LIVE)).toBe('edited')
    expect(presetStatus(selected, LIVE, LIVE)).toBe('edited')
  })
})

describe('PresetCreateSchema', () => {
  it('trims the name, bounds its length and validates values as a config update', () => {
    const ok = PresetCreateSchema.safeParse({ name: '  Fast  ', values: LIVE })
    expect(ok.success).toBe(true)
    if (ok.success) expect(ok.data.name).toBe('Fast')

    expect(PresetCreateSchema.safeParse({ name: '   ', values: LIVE }).success).toBe(false)
    expect(PresetCreateSchema.safeParse({ name: 'x'.repeat(61), values: LIVE }).success).toBe(false)
    expect(
      PresetCreateSchema.safeParse({ name: 'Fast', values: { ...LIVE, model_id: 'not-namespaced' } })
        .success,
    ).toBe(false)
  })
})

// --- store against a fake client --------------------------------------------

interface FakeResult {
  data: unknown
  error: { code?: string; message: string } | null
}

type Op = { kind: 'select' | 'insert' | 'update' | 'delete'; payload?: unknown; filters: unknown[] }

function fakeClient(respond: (op: Op) => FakeResult) {
  const ops: Op[] = []
  function terminal(op: Op) {
    ops.push(op)
    return {
      single: async () => respond(op),
      maybeSingle: async () => respond(op),
      then: (resolve: (value: FakeResult) => unknown) => resolve(respond(op)),
    }
  }
  function chain(op: Op): Record<string, unknown> {
    return {
      select: () => chain(op),
      order: () => terminal(op),
      eq: (column: string, value: unknown) => {
        op.filters.push([column, value])
        return chain(op)
      },
      single: async () => {
        ops.push(op)
        return respond(op)
      },
      maybeSingle: async () => {
        ops.push(op)
        return respond(op)
      },
    }
  }
  const client = {
    from: () => ({
      select: () => chain({ kind: 'select', filters: [] }),
      insert: (payload: unknown) => chain({ kind: 'insert', payload, filters: [] }),
      update: (payload: unknown) => chain({ kind: 'update', payload, filters: [] }),
      delete: () => chain({ kind: 'delete', filters: [] }),
    }),
  } as unknown as SupabaseClient
  return { client, ops }
}

const ROW = preset('11111111-1111-4111-8111-111111111111', 'Fast', LIVE)
const MISSING_TABLE = { code: '42P01', message: 'relation "public.config_presets" does not exist' }

describe('fetchConfigPresets', () => {
  it('lists presets', async () => {
    const { client } = fakeClient(() => ({ data: [ROW], error: null }))
    expect(await fetchConfigPresets(client)).toEqual({ presets: [ROW], tableMissing: false })
  })

  it('degrades to an empty list when the table is missing', async () => {
    const { client } = fakeClient(() => ({ data: null, error: MISSING_TABLE }))
    expect(await fetchConfigPresets(client)).toEqual({ presets: [], tableMissing: true })
  })

  it('rethrows other errors', async () => {
    const { client } = fakeClient(() => ({ data: null, error: { code: 'XX000', message: 'boom' } }))
    await expect(fetchConfigPresets(client)).rejects.toMatchObject({ code: 'XX000' })
  })
})

describe('createConfigPreset', () => {
  it('inserts name + values and returns the row', async () => {
    const { client, ops } = fakeClient(() => ({ data: ROW, error: null }))
    const outcome = await createConfigPreset(client, { name: 'Fast', values: LIVE })
    expect(outcome).toEqual({ ok: true, preset: ROW })
    expect(ops[0]).toMatchObject({ kind: 'insert', payload: { name: 'Fast', values: LIVE } })
  })

  it('maps a unique violation to 409', async () => {
    const { client } = fakeClient(() => ({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    }))
    expect(await createConfigPreset(client, { name: 'Fast', values: LIVE })).toEqual({
      ok: false,
      status: 409,
      error: 'A preset with that name already exists.',
    })
  })

  it('maps a missing table to the apply-the-migration 400', async () => {
    const { client } = fakeClient(() => ({ data: null, error: MISSING_TABLE }))
    expect(await createConfigPreset(client, { name: 'Fast', values: LIVE })).toEqual({
      ok: false,
      status: 400,
      error: PRESETS_MIGRATION_REQUIRED_MESSAGE,
    })
  })
})

describe('updateConfigPreset', () => {
  it('writes values (+ name when given) with a fresh updated_at, filtered by id', async () => {
    const { client, ops } = fakeClient(() => ({ data: ROW, error: null }))
    const outcome = await updateConfigPreset(client, ROW.id, { name: 'Faster', values: LIVE })
    expect(outcome).toEqual({ ok: true, preset: ROW })
    expect(ops[0]).toMatchObject({ kind: 'update', filters: [['id', ROW.id]] })
    const payload = ops[0].payload as Record<string, unknown>
    expect(payload).toMatchObject({ name: 'Faster', values: LIVE })
    expect(typeof payload.updated_at).toBe('string')
  })

  it('leaves the name alone when omitted', async () => {
    const { client, ops } = fakeClient(() => ({ data: ROW, error: null }))
    await updateConfigPreset(client, ROW.id, { values: LIVE })
    expect(ops[0].payload).not.toHaveProperty('name')
  })

  it('returns 404 for an unknown id', async () => {
    const { client } = fakeClient(() => ({ data: null, error: null }))
    expect(await updateConfigPreset(client, ROW.id, { values: LIVE })).toEqual({
      ok: false,
      status: 404,
      error: 'Preset not found.',
    })
  })
})

describe('deleteConfigPreset', () => {
  it('deletes by id', async () => {
    const { client, ops } = fakeClient(() => ({ data: { id: ROW.id }, error: null }))
    expect(await deleteConfigPreset(client, ROW.id)).toEqual({ ok: true })
    expect(ops[0]).toMatchObject({ kind: 'delete', filters: [['id', ROW.id]] })
  })

  it('returns 404 for an unknown id', async () => {
    const { client } = fakeClient(() => ({ data: null, error: null }))
    expect(await deleteConfigPreset(client, ROW.id)).toEqual({
      ok: false,
      status: 404,
      error: 'Preset not found.',
    })
  })

  it('maps a missing table to the apply-the-migration 400', async () => {
    const { client } = fakeClient(() => ({ data: null, error: MISSING_TABLE }))
    expect(await deleteConfigPreset(client, ROW.id)).toMatchObject({ ok: false, status: 400 })
  })
})
