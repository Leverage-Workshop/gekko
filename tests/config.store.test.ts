import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  MIGRATION_REQUIRED_MESSAGE,
  fetchConfigRow,
  isMissingColumnError,
  updateConfigRow,
} from '@/lib/config'

// Migration rollout guards: the high_conviction_flag (feat-031) and
// model_reasoning_effort migrations are committed but may not be applied to
// the live DB yet, so config reads must degrade gracefully (42703 → next-older
// column set + inert defaults) and writes must fail with an actionable "apply
// the migration" message. Offline, DI'd fakes.

interface FakeResult {
  data: Record<string, unknown> | null
  error: { code?: string; message: string } | null
}

const FULL_ROW = {
  model_id: 'anthropic/claude-sonnet-5',
  triage_model_id: 'anthropic/claude-haiku-4-5',
  rr_min: 3,
  high_conviction_enabled: true,
  high_conviction_model_id: 'anthropic/claude-opus-4-8',
  model_effort: 'high' as const,
  triage_model_effort: null,
  high_conviction_model_effort: 'xhigh' as const,
  execution_bar_volume: 750,
  significant_move_sigma: 0.3,
  profile_vision_model_id: 'openai/gpt-5.6-terra',
  profile_vision_model_effort: 'medium' as const,
  profile_vision_samples: 3,
  updated_at: '2026-07-08T12:00:00Z',
}

/** Post significant_move_sigma, pre profile_vision_config (feat-124). */
const PRE_PROFILE_VISION_ROW = {
  model_id: 'anthropic/claude-sonnet-5',
  triage_model_id: 'anthropic/claude-haiku-4-5',
  rr_min: 3,
  high_conviction_enabled: true,
  high_conviction_model_id: 'anthropic/claude-opus-4-8',
  model_effort: 'high' as const,
  triage_model_effort: null,
  high_conviction_model_effort: 'xhigh' as const,
  execution_bar_volume: 750,
  significant_move_sigma: 0.3,
  updated_at: '2026-07-08T12:00:00Z',
}

const PROFILE_VISION_PAD = {
  profile_vision_model_id: null,
  profile_vision_model_effort: null,
  profile_vision_samples: 3,
}

/** Post execution_bar_volume, pre significant_move_sigma (feat-096 units change). */
const PRE_SIGNIFICANT_MOVE_ROW = {
  model_id: 'anthropic/claude-sonnet-5',
  triage_model_id: 'anthropic/claude-haiku-4-5',
  rr_min: 3,
  high_conviction_enabled: true,
  high_conviction_model_id: 'anthropic/claude-opus-4-8',
  model_effort: 'high' as const,
  triage_model_effort: null,
  high_conviction_model_effort: 'xhigh' as const,
  execution_bar_volume: 750,
  updated_at: '2026-07-08T12:00:00Z',
}

/** Post model_reasoning_effort, pre execution_bar_volume (feat-079). */
const PRE_BAR_VOLUME_ROW = {
  model_id: 'anthropic/claude-sonnet-5',
  triage_model_id: 'anthropic/claude-haiku-4-5',
  rr_min: 3,
  high_conviction_enabled: true,
  high_conviction_model_id: 'anthropic/claude-opus-4-8',
  model_effort: 'high' as const,
  triage_model_effort: null,
  high_conviction_model_effort: 'xhigh' as const,
  updated_at: '2026-07-08T12:00:00Z',
}

const PRE_EFFORT_ROW = {
  model_id: 'anthropic/claude-sonnet-5',
  triage_model_id: 'anthropic/claude-haiku-4-5',
  rr_min: 3,
  high_conviction_enabled: true,
  high_conviction_model_id: 'anthropic/claude-opus-4-8',
  updated_at: '2026-07-08T12:00:00Z',
}

const LEGACY_ROW = {
  model_id: 'anthropic/claude-sonnet-5',
  triage_model_id: 'anthropic/claude-haiku-4-5',
  rr_min: 3,
  updated_at: '2026-07-08T12:00:00Z',
}

const MISSING_COLUMN_ERROR = {
  code: '42703',
  message: 'column config.high_conviction_enabled does not exist',
}

/** Fake read-side client: responds per select() column list. */
function selectClient(respond: (columns: string) => FakeResult) {
  const selects: string[] = []
  const client = {
    from: () => ({
      select: (columns: string) => {
        selects.push(columns)
        return { eq: () => ({ maybeSingle: async () => respond(columns) }) }
      },
    }),
  } as unknown as SupabaseClient
  return { client, selects }
}

/** Fake write-side client capturing update().eq().select().maybeSingle(). */
function updateClient(result: FakeResult) {
  const updates: Record<string, unknown>[] = []
  const client = {
    from: () => ({
      update: (values: Record<string, unknown>) => {
        updates.push(values)
        return {
          eq: () => ({ select: () => ({ maybeSingle: async () => result }) }),
        }
      },
    }),
  } as unknown as SupabaseClient
  return { client, updates }
}

describe('isMissingColumnError', () => {
  it('matches Postgres 42703 by code and by message shape', () => {
    expect(isMissingColumnError(MISSING_COLUMN_ERROR)).toBe(true)
    expect(isMissingColumnError({ message: 'column "x" does not exist' })).toBe(true)
    expect(isMissingColumnError({ code: 'XX000', message: 'internal error' })).toBe(false)
    expect(isMissingColumnError({ message: 'permission denied' })).toBe(false)
  })
})

describe('fetchConfigRow', () => {
  it('returns the full row when every migration column exists', async () => {
    const { client, selects } = selectClient(() => ({ data: FULL_ROW, error: null }))
    const result = await fetchConfigRow(client)

    expect(result.row).toEqual(FULL_ROW)
    expect(result.highConvictionColumnsMissing).toBe(false)
    expect(result.effortColumnsMissing).toBe(false)
    expect(result.barVolumeColumnMissing).toBe(false)
    expect(result.significantMoveColumnMissing).toBe(false)
    expect(result.profileVisionColumnsMissing).toBe(false)
    expect(selects).toHaveLength(1)
    expect(selects[0]).toContain('profile_vision_model_id')
    expect(selects[0]).toContain('profile_vision_samples')
    expect(selects[0]).toContain('high_conviction_enabled')
    expect(selects[0]).toContain('model_effort')
    expect(selects[0]).toContain('triage_model_effort')
    expect(selects[0]).toContain('high_conviction_model_effort')
    expect(selects[0]).toContain('execution_bar_volume')
    expect(selects[0]).toContain('significant_move_sigma')
  })

  it('falls back to the pre-profile-vision column set on 42703 with the read-OFF defaults padded (feat-124)', async () => {
    const { client, selects } = selectClient((columns) =>
      columns.includes('profile_vision_model_id')
        ? {
            data: null,
            error: { code: '42703', message: 'column config.profile_vision_model_id does not exist' },
          }
        : { data: PRE_PROFILE_VISION_ROW, error: null },
    )
    const result = await fetchConfigRow(client)

    expect(selects).toHaveLength(2)
    expect(selects[1]).not.toContain('profile_vision_model_id')
    expect(result.profileVisionColumnsMissing).toBe(true)
    expect(result.significantMoveColumnMissing).toBe(false)
    expect(result.row).toEqual({ ...PRE_PROFILE_VISION_ROW, ...PROFILE_VISION_PAD })
  })

  it('falls back to the pre-significant-move column set on 42703 with the 0.3-sigma default padded (feat-096, feat-112)', async () => {
    const { client, selects } = selectClient((columns) =>
      columns.includes('significant_move_sigma')
        ? {
            data: null,
            error: { code: '42703', message: 'column config.significant_move_sigma does not exist' },
          }
        : { data: PRE_SIGNIFICANT_MOVE_ROW, error: null },
    )
    const result = await fetchConfigRow(client)

    expect(selects).toHaveLength(3)
    expect(selects[2]).not.toContain('significant_move_sigma')
    expect(result.significantMoveColumnMissing).toBe(true)
    expect(result.barVolumeColumnMissing).toBe(false)
    expect(result.profileVisionColumnsMissing).toBe(true)
    expect(result.row).toEqual({
      ...PRE_SIGNIFICANT_MOVE_ROW,
      significant_move_sigma: 0.3,
      ...PROFILE_VISION_PAD,
    })
  })

  it('falls back to the pre-bar-volume column set on 42703 with the 750 default padded (feat-079)', async () => {
    const { client, selects } = selectClient((columns) =>
      columns.includes('execution_bar_volume')
        ? {
            data: null,
            error: { code: '42703', message: 'column config.execution_bar_volume does not exist' },
          }
        : { data: PRE_BAR_VOLUME_ROW, error: null },
    )
    const result = await fetchConfigRow(client)

    expect(selects).toHaveLength(4)
    expect(selects[3]).not.toContain('execution_bar_volume')
    expect(result.barVolumeColumnMissing).toBe(true)
    expect(result.significantMoveColumnMissing).toBe(true)
    expect(result.profileVisionColumnsMissing).toBe(true)
    expect(result.effortColumnsMissing).toBe(false)
    expect(result.row).toEqual({
      ...PRE_BAR_VOLUME_ROW,
      execution_bar_volume: 750,
      significant_move_sigma: 0.3,
      ...PROFILE_VISION_PAD,
    })
  })

  it('falls back to the pre-effort column set on 42703 with efforts padded null', async () => {
    const { client, selects } = selectClient((columns) =>
      columns.includes('model_effort')
        ? { data: null, error: { code: '42703', message: 'column config.model_effort does not exist' } }
        : { data: PRE_EFFORT_ROW, error: null },
    )
    const result = await fetchConfigRow(client)

    expect(selects).toHaveLength(5)
    expect(selects[4]).not.toContain('model_effort')
    expect(result.effortColumnsMissing).toBe(true)
    expect(result.barVolumeColumnMissing).toBe(true)
    expect(result.significantMoveColumnMissing).toBe(true)
    expect(result.profileVisionColumnsMissing).toBe(true)
    expect(result.highConvictionColumnsMissing).toBe(false)
    expect(result.row).toEqual({
      ...PRE_EFFORT_ROW,
      model_effort: null,
      triage_model_effort: null,
      high_conviction_model_effort: null,
      execution_bar_volume: 750,
      significant_move_sigma: 0.3,
      ...PROFILE_VISION_PAD,
    })
  })

  it('falls back to the legacy column set when both migrations are missing', async () => {
    const { client, selects } = selectClient((columns) =>
      columns.includes('model_effort') || columns.includes('high_conviction_enabled')
        ? { data: null, error: MISSING_COLUMN_ERROR }
        : { data: LEGACY_ROW, error: null },
    )
    const result = await fetchConfigRow(client)

    expect(selects).toHaveLength(6)
    expect(selects[5]).not.toContain('high_conviction')
    expect(result.highConvictionColumnsMissing).toBe(true)
    expect(result.effortColumnsMissing).toBe(true)
    expect(result.barVolumeColumnMissing).toBe(true)
    expect(result.significantMoveColumnMissing).toBe(true)
    expect(result.profileVisionColumnsMissing).toBe(true)
    expect(result.row).toEqual({
      ...LEGACY_ROW,
      high_conviction_enabled: false,
      high_conviction_model_id: 'anthropic/claude-opus-4-8',
      model_effort: null,
      triage_model_effort: null,
      high_conviction_model_effort: null,
      execution_bar_volume: 750,
      significant_move_sigma: 0.3,
      ...PROFILE_VISION_PAD,
    })
  })

  it('falls back on a message-shaped missing-column error without a code', async () => {
    const { client } = selectClient((columns) =>
      columns.includes('model_effort') || columns.includes('high_conviction_enabled')
        ? { data: null, error: { message: 'column config.high_conviction_model_id does not exist' } }
        : { data: LEGACY_ROW, error: null },
    )
    const result = await fetchConfigRow(client)
    expect(result.highConvictionColumnsMissing).toBe(true)
    expect(result.row?.high_conviction_enabled).toBe(false)
  })

  it('returns a null row (not an error) when the config table is unseeded', async () => {
    const { client } = selectClient(() => ({ data: null, error: null }))
    const result = await fetchConfigRow(client)
    expect(result.row).toBeNull()
    expect(result.highConvictionColumnsMissing).toBe(false)
  })

  it('rethrows non-column errors instead of masking them', async () => {
    const { client } = selectClient(() => ({
      data: null,
      error: { code: 'XX000', message: 'connection refused' },
    }))
    await expect(fetchConfigRow(client)).rejects.toMatchObject({ code: 'XX000' })
  })

  it('rethrows when the legacy fallback itself errors', async () => {
    const { client } = selectClient((columns) =>
      columns.includes('high_conviction_enabled')
        ? { data: null, error: MISSING_COLUMN_ERROR }
        : { data: null, error: { code: '42501', message: 'permission denied' } },
    )
    await expect(fetchConfigRow(client)).rejects.toMatchObject({ code: '42501' })
  })
})

describe('updateConfigRow', () => {
  const update = {
    model_id: 'anthropic/claude-sonnet-5',
    triage_model_id: 'anthropic/claude-haiku-4-5',
    rr_min: 2.5,
    high_conviction_enabled: true,
    high_conviction_model_id: 'anthropic/claude-opus-4-8',
    model_effort: 'high' as const,
    triage_model_effort: null,
    high_conviction_model_effort: null,
    execution_bar_volume: 750,
    significant_move_sigma: 0.3,
    profile_vision_model_id: 'openai/gpt-5.6-terra',
    profile_vision_model_effort: 'medium' as const,
    profile_vision_samples: 3,
  }

  it('updates row id=1 with a fresh updated_at and returns the row', async () => {
    const { client, updates } = updateClient({ data: FULL_ROW, error: null })
    const outcome = await updateConfigRow(client, update)

    expect(outcome).toEqual({ ok: true, row: FULL_ROW })
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject(update)
    expect(typeof updates[0].updated_at).toBe('string')
    expect(Number.isNaN(new Date(updates[0].updated_at as string).getTime())).toBe(false)
  })

  it('maps a missing-column error to the actionable migration message', async () => {
    const { client } = updateClient({ data: null, error: MISSING_COLUMN_ERROR })
    const outcome = await updateConfigRow(client, update)

    expect(outcome).toEqual({ ok: false, status: 400, error: MIGRATION_REQUIRED_MESSAGE })
    expect(MIGRATION_REQUIRED_MESSAGE).toContain('high_conviction_flag')
    expect(MIGRATION_REQUIRED_MESSAGE).toContain('model_reasoning_effort')
    expect(MIGRATION_REQUIRED_MESSAGE).toContain('execution_bar_volume')
    expect(MIGRATION_REQUIRED_MESSAGE).toContain('volatility_scaled_gates')
    expect(MIGRATION_REQUIRED_MESSAGE).toContain('profile_vision_config')
  })

  it('reports a 404 when the config row is unseeded', async () => {
    const { client } = updateClient({ data: null, error: null })
    const outcome = await updateConfigRow(client, update)
    expect(outcome).toMatchObject({ ok: false, status: 404 })
  })

  it('rethrows non-column errors', async () => {
    const { client } = updateClient({
      data: null,
      error: { code: 'XX000', message: 'connection refused' },
    })
    await expect(updateConfigRow(client, update)).rejects.toMatchObject({ code: 'XX000' })
  })
})
