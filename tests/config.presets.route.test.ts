import { beforeEach, describe, expect, it, vi } from 'vitest'

// Offline route tests for /api/config/presets (feat-155): the service client
// is replaced with a hoisted fake (same discipline as config.route.test.ts).

const state = vi.hoisted((): { client: unknown } => ({ client: undefined }))
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => state.client,
}))

import { GET, POST } from '@/app/api/config/presets/route'
import { DELETE, PUT } from '@/app/api/config/presets/[id]/route'

const VALUES = {
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

const ID = '11111111-1111-4111-8111-111111111111'
const ROW = {
  id: ID,
  name: 'Fast',
  values: VALUES,
  created_at: '2026-09-10T20:00:00Z',
  updated_at: '2026-09-10T20:00:00Z',
}

interface FakeResult {
  data: unknown
  error: { code?: string; message: string } | null
}

function fakeClient(result: FakeResult) {
  // `order` ends the list read (awaited directly), so it resolves like a
  // thenable; the single-row writes end in single/maybeSingle.
  const listResult = { then: (resolve: (value: FakeResult) => unknown) => resolve(result) }
  const chain: Record<string, unknown> = {
    select: () => chain,
    order: () => listResult,
    eq: () => chain,
    single: async () => result,
    maybeSingle: async () => result,
  }
  state.client = {
    from: () => ({
      select: () => chain,
      insert: () => chain,
      update: () => chain,
      delete: () => chain,
    }),
  }
}

function request(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/config/presets', {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

const params = (id: string) => ({ params: Promise.resolve({ id }) })

beforeEach(() => {
  state.client = undefined
})

describe('GET /api/config/presets', () => {
  it('lists presets', async () => {
    fakeClient({ data: [ROW], error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: { presets: [ROW], tableMissing: false } })
  })

  it('reports a missing table instead of failing', async () => {
    fakeClient({ data: null, error: { code: '42P01', message: 'relation does not exist' } })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: { presets: [], tableMissing: true } })
  })

  it('returns a clean 500 on unexpected errors', async () => {
    fakeClient({ data: null, error: { code: 'XX000', message: 'connection refused' } })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await GET()
    expect(res.status).toBe(500)
    expect((await res.json()).success).toBe(false)
    consoleError.mockRestore()
  })
})

describe('POST /api/config/presets', () => {
  it('creates a preset (201)', async () => {
    fakeClient({ data: ROW, error: null })
    const res = await POST(request('POST', { name: 'Fast', values: VALUES }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ success: true, data: { preset: ROW } })
  })

  it('rejects a non-JSON body', async () => {
    fakeClient({ data: ROW, error: null })
    const res = await POST(request('POST', '{nope'))
    expect(res.status).toBe(400)
  })

  it('returns per-field validation errors', async () => {
    fakeClient({ data: ROW, error: null })
    const res = await POST(request('POST', { name: '', values: { ...VALUES, model_id: 'bad' } }))
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.fieldErrors.name).toBeDefined()
    expect(body.fieldErrors.values).toBeDefined()
  })

  it('maps a duplicate name to 409', async () => {
    fakeClient({ data: null, error: { code: '23505', message: 'duplicate key value' } })
    const res = await POST(request('POST', { name: 'Fast', values: VALUES }))
    expect(res.status).toBe(409)
  })
})

describe('PUT /api/config/presets/[id]', () => {
  it('updates a preset', async () => {
    fakeClient({ data: ROW, error: null })
    const res = await PUT(request('PUT', { values: VALUES }), params(ID))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, data: { preset: ROW } })
  })

  it('404s a malformed id before touching the database', async () => {
    const res = await PUT(request('PUT', { values: VALUES }), params('not-a-uuid'))
    expect(res.status).toBe(404)
  })

  it('404s an unknown id', async () => {
    fakeClient({ data: null, error: null })
    const res = await PUT(request('PUT', { values: VALUES }), params(ID))
    expect(res.status).toBe(404)
  })

  it('validates values', async () => {
    fakeClient({ data: ROW, error: null })
    const res = await PUT(request('PUT', { values: { ...VALUES, profile_vision_samples: 9 } }), params(ID))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/config/presets/[id]', () => {
  it('deletes a preset', async () => {
    fakeClient({ data: { id: ID }, error: null })
    const res = await DELETE(request('DELETE'), params(ID))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })

  it('404s a malformed id before touching the database', async () => {
    const res = await DELETE(request('DELETE'), params('nope'))
    expect(res.status).toBe(404)
  })

  it('surfaces the apply-the-migration message when the table is missing', async () => {
    fakeClient({ data: null, error: { code: '42P01', message: 'relation does not exist' } })
    const res = await DELETE(request('DELETE'), params(ID))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/config_presets/)
  })
})
