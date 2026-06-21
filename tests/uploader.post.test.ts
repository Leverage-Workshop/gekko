import { describe, it, expect, vi } from 'vitest'
import { postBundle, backoffDelay, type RetryConfig } from '@/lib/uploader'

const retry: RetryConfig = { maxAttempts: 4, baseDelayMs: 100, maxDelayMs: 1000 }

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** No-op sleep that records the delays it was asked to wait. */
function recordingSleep() {
  const delays: number[] = []
  return { sleep: async (ms: number) => void delays.push(ms), delays }
}

describe('backoffDelay', () => {
  it('doubles per attempt and caps at maxDelayMs', () => {
    expect(backoffDelay(1, 100, 1000)).toBe(100)
    expect(backoffDelay(2, 100, 1000)).toBe(200)
    expect(backoffDelay(3, 100, 1000)).toBe(400)
    expect(backoffDelay(10, 100, 1000)).toBe(1000)
  })
})

describe('postBundle', () => {
  it('posts with bearer auth and returns the bundle id on success', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, { success: true, data: { bundleId: 'abc' } }))
    const { sleep, delays } = recordingSleep()

    const result = await postBundle('http://x/api/ingest', 'tok', new FormData(), retry, {
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    })

    expect(result).toEqual({ ok: true, bundleId: 'abc', attempts: 1 })
    expect(delays).toEqual([])
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ authorization: 'Bearer tok' })
  })

  it('retries transient 5xx with exponential backoff, then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(jsonResponse(201, { data: { bundleId: 'z' } }))
    const { sleep, delays } = recordingSleep()

    const result = await postBundle('http://x', 'tok', new FormData(), retry, {
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    })

    expect(result).toEqual({ ok: true, bundleId: 'z', attempts: 3 })
    expect(delays).toEqual([100, 200])
  })

  it('retries network errors', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(jsonResponse(201, { data: { bundleId: 'n' } }))
    const { sleep } = recordingSleep()

    const result = await postBundle('http://x', 'tok', new FormData(), retry, {
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    })

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a permanent 4xx (e.g. 401)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, { error: 'Unauthorized' }))
    const { sleep, delays } = recordingSleep()

    const result = await postBundle('http://x', 'bad', new FormData(), retry, {
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    })

    expect(result).toEqual({ ok: false, error: 'ingest responded 401', status: 401, attempts: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(delays).toEqual([])
  })

  it('retries 429 (rate-limit) as transient', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, {}))
      .mockResolvedValueOnce(jsonResponse(201, { data: { bundleId: 'r' } }))
    const { sleep } = recordingSleep()

    const result = await postBundle('http://x', 'tok', new FormData(), retry, {
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    })

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after maxAttempts and reports the last error', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(500, {}))
    const { sleep, delays } = recordingSleep()

    const result = await postBundle('http://x', 'tok', new FormData(), retry, {
      fetch: fetchMock as unknown as typeof fetch,
      sleep,
    })

    expect(result).toEqual({ ok: false, error: 'ingest responded 500', status: 500, attempts: 4 })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    // One fewer sleep than attempts (no wait after the final failure).
    expect(delays).toEqual([100, 200, 400])
  })
})
