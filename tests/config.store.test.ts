import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  MIGRATION_REQUIRED_MESSAGE,
  fetchConfigRow,
  isMissingColumnError,
  updateConfigRow,
} from '@/lib/config'

// feat-031 rollout guard: the high_conviction_flag migration is committed but
// may not be applied to the live DB yet, so config reads must degrade
// gracefully (42703 → legacy column set + inert defaults) and writes must
// fail with an actionable "apply the migration" message. Offline, DI'd fakes.

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
  it('returns the full row when the high-conviction columns exist', async () => {
    const { client, selects } = selectClient(() => ({ data: FULL_ROW, error: null }))
    const result = await fetchConfigRow(client)

    expect(result.row).toEqual(FULL_ROW)
    expect(result.highConvictionColumnsMissing).toBe(false)
    expect(selects).toHaveLength(1)
    expect(selects[0]).toContain('high_conviction_enabled')
    expect(selects[0]).toContain('high_conviction_model_id')
  })

  it('falls back to the legacy column set on 42703 with the flag defaulted off', async () => {
    const { client, selects } = selectClient((columns) =>
      columns.includes('high_conviction_enabled')
        ? { data: null, error: MISSING_COLUMN_ERROR }
        : { data: LEGACY_ROW, error: null },
    )
    const result = await fetchConfigRow(client)

    expect(selects).toHaveLength(2)
    expect(selects[1]).not.toContain('high_conviction')
    expect(result.highConvictionColumnsMissing).toBe(true)
    expect(result.row).toEqual({
      ...LEGACY_ROW,
      high_conviction_enabled: false,
      high_conviction_model_id: 'anthropic/claude-opus-4-8',
    })
  })

  it('falls back on a message-shaped missing-column error without a code', async () => {
    const { client } = selectClient((columns) =>
      columns.includes('high_conviction_enabled')
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
