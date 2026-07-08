import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MIGRATION_REQUIRED_MESSAGE } from '@/lib/config'

// Offline route test (feat-028): the service client is replaced with a fake
// via a hoisted module mock (same discipline as briefings.run.route.test.ts)
// so GET/POST /api/config run without Supabase env or network access.

const state = vi.hoisted(() => ({
  client: undefined as unknown,
}))
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => state.client,
}))

import { GET, POST } from '@/app/api/config/route'

interface FakeResult {
  data: Record<string, unknown> | null
  error: { code?: string; message: string } | null
}

const ROW = {
  model_id: 'anthropic/claude-sonnet-5',
  triage_model_id: 'anthropic/claude-haiku-4-5',
  rr_min: 3,
  high_conviction_enabled: false,
  high_conviction_model_id: 'anthropic/claude-opus-4-8',
  updated_at: '2026-07-08T12:00:00Z',
}

const VALID_BODY = {
  model_id: 'anthropic/claude-sonnet-5',
  triage_model_id: 'anthropic/claude-haiku-4-5',
  rr_min: 2.5,
  high_conviction_enabled: true,
  high_conviction_model_id: 'anthropic/claude-opus-4-8',
}

function fakeClient({
  select = () => ({ data: ROW, error: null }),
  update = () => ({ data: ROW, error: null }),
}: {
  select?: (columns: string) => FakeResult
  update?: (values: Record<string, unknown>) => FakeResult
} = {}) {
  const updates: Record<string, unknown>[] = []
  state.client = {
    from: () => ({
      select: (columns: string) => ({
        eq: () => ({ maybeSingle: async () => select(columns) }),
      }),
      update: (values: Record<string, unknown>) => {
        updates.push(values)
        return {
          eq: () => ({ select: () => ({ maybeSingle: async () => update(values) }) }),
        }
      },
    }),
  }
  return { updates }
}

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  state.client = undefined
})

describe('GET /api/config', () => {
  it('returns the config row with the migration-status flag', async () => {
    fakeClient()
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      success: true,
      data: { config: ROW, highConvictionColumnsMissing: false },
    })
  })

  it('reports missing high-conviction columns via the fallback read', async () => {
    const { model_id, triage_model_id, rr_min, updated_at } = ROW
    fakeClient({
      select: (columns) =>
        columns.includes('high_conviction_enabled')
          ? { data: null, error: { code: '42703', message: 'column does not exist' } }
          : { data: { model_id, triage_model_id, rr_min, updated_at }, error: null },
    })
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.highConvictionColumnsMissing).toBe(true)
    expect(body.data.config.high_conviction_enabled).toBe(false)
  })

  it('returns 404 when the config row is unseeded', async () => {
    fakeClient({ select: () => ({ data: null, error: null }) })
    const res = await GET()
    expect(res.status).toBe(404)
    expect((await res.json()).success).toBe(false)
  })

  it('returns a clean 500 on unexpected read errors', async () => {
    fakeClient({
      select: () => ({ data: null, error: { code: 'XX000', message: 'connection refused' } }),
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET()
    expect(res.status).toBe(500)
    expect((await res.json()).success).toBe(false)
    consoleError.mockRestore()
  })
})

describe('POST /api/config', () => {
  it('validates, updates row id=1, and returns the updated row', async () => {
    const updated = { ...ROW, ...VALID_BODY, updated_at: '2026-07-08T13:00:00Z' }
    const { updates } = fakeClient({ update: () => ({ data: updated, error: null }) })

    const res = await POST(postRequest(VALID_BODY))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, data: { config: updated } })
    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject(VALID_BODY)
    expect(typeof updates[0].updated_at).toBe('string')
  })

  it('returns 400 with per-field messages on validation failure (no DB write)', async () => {
    const { updates } = fakeClient()
    const res = await POST(
      postRequest({ ...VALID_BODY, model_id: 'no-slash', rr_min: 0 }),
    )
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Validation failed')
    expect(body.fieldErrors.model_id[0]).toMatch(/provider\/model/)
    expect(body.fieldErrors.rr_min[0]).toMatch(/at least 0.5/)
    expect(updates).toHaveLength(0)
  })

  it('returns 400 on a non-JSON body', async () => {
    fakeClient()
    const res = await POST(postRequest('not json {'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Expected a JSON body')
  })

  it('surfaces "apply the migration first" when the live DB lacks the columns', async () => {
    fakeClient({
      update: () => ({
        data: null,
        error: { code: '42703', message: 'column config.high_conviction_enabled does not exist' },
      }),
    })
    const res = await POST(postRequest(VALID_BODY))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe(MIGRATION_REQUIRED_MESSAGE)
    expect(body.error).toContain('high_conviction_flag')
  })

  it('returns a clean 500 on unexpected write errors', async () => {
    fakeClient({
      update: () => ({ data: null, error: { code: 'XX000', message: 'connection refused' } }),
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(postRequest(VALID_BODY))
    expect(res.status).toBe(500)
    expect((await res.json()).success).toBe(false)
    consoleError.mockRestore()
  })
})
