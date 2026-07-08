import { beforeEach, describe, expect, it, vi } from 'vitest'

// Offline route test (feat-027): the service client is replaced with a fake
// via a hoisted module mock (same discipline as config.route.test.ts) so
// POST/DELETE /api/push/subscribe run without Supabase env or network.

const state = vi.hoisted(() => ({
  client: undefined as unknown,
}))
vi.mock('@/lib/supabase/server', () => ({
  getServiceClient: () => state.client,
}))

import { DELETE, POST } from '@/app/api/push/subscribe/route'

interface FakeError {
  message: string
}

function fakeClient({
  upsertError = null,
  deleteError = null,
}: {
  upsertError?: FakeError | null
  deleteError?: FakeError | null
} = {}) {
  const upserts: { values: Record<string, unknown>; options: Record<string, unknown> }[] = []
  const deletes: { column: string; value: unknown }[] = []
  state.client = {
    from: (table: string) => {
      expect(table).toBe('push_subscriptions')
      return {
        upsert: async (values: Record<string, unknown>, options: Record<string, unknown>) => {
          upserts.push({ values, options })
          return { error: upsertError }
        },
        delete: () => ({
          eq: async (column: string, value: unknown) => {
            deletes.push({ column, value })
            return { error: deleteError }
          },
        }),
      }
    },
  }
  return { upserts, deletes }
}

const SUBSCRIPTION = {
  endpoint: 'https://push.example/sub-1',
  expirationTime: null, // extra toJSON() field — must be tolerated
  keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
}

function request(method: 'POST' | 'DELETE', body: unknown): Request {
  return new Request('http://localhost/api/push/subscribe', {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  state.client = undefined
})

describe('POST /api/push/subscribe', () => {
  it('upserts the subscription keyed on endpoint', async () => {
    const { upserts } = fakeClient()
    const res = await POST(request('POST', SUBSCRIPTION))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(upserts).toEqual([
      {
        values: {
          endpoint: 'https://push.example/sub-1',
          p256dh: 'p256dh-key',
          auth: 'auth-secret',
        },
        options: { onConflict: 'endpoint' },
      },
    ])
  })

  it('rejects a subscription without keys (400, no write)', async () => {
    const { upserts } = fakeClient()
    const res = await POST(request('POST', { endpoint: SUBSCRIPTION.endpoint }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Validation failed')
    expect(upserts).toHaveLength(0)
  })

  it('rejects a non-URL endpoint', async () => {
    fakeClient()
    const res = await POST(request('POST', { ...SUBSCRIPTION, endpoint: 'not a url' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 on a non-JSON body', async () => {
    fakeClient()
    const res = await POST(request('POST', 'not json {'))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Expected a JSON body')
  })

  it('returns a clean 500 on a database error', async () => {
    fakeClient({ upsertError: { message: 'connection refused' } })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await POST(request('POST', SUBSCRIPTION))
    expect(res.status).toBe(500)
    expect((await res.json()).success).toBe(false)
    consoleError.mockRestore()
  })
})

describe('DELETE /api/push/subscribe', () => {
  it('deletes the row matching the endpoint', async () => {
    const { deletes } = fakeClient()
    const res = await DELETE(request('DELETE', { endpoint: SUBSCRIPTION.endpoint }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
    expect(deletes).toEqual([{ column: 'endpoint', value: SUBSCRIPTION.endpoint }])
  })

  it('rejects a missing endpoint (400, no delete)', async () => {
    const { deletes } = fakeClient()
    const res = await DELETE(request('DELETE', {}))
    expect(res.status).toBe(400)
    expect(deletes).toHaveLength(0)
  })

  it('returns a clean 500 on a database error', async () => {
    fakeClient({ deleteError: { message: 'connection refused' } })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await DELETE(request('DELETE', { endpoint: SUBSCRIPTION.endpoint }))
    expect(res.status).toBe(500)
    consoleError.mockRestore()
  })
})
