import { describe, expect, it, vi } from 'vitest'
import { checkPendingRequest } from '@/lib/uploader'

// The uploader's GET poll against /api/ingest: "is a fresh bundle required?"
// Never throws — every failure mode degrades to { ok: false } so the poll
// loop just logs and retries next interval.

const URL = 'https://gekko.example/api/ingest'
const TOKEN = 'secret-token'

function fetchResponding(status: number, body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), { status }),
  ) as unknown as typeof fetch
}

describe('checkPendingRequest', () => {
  it('GETs the ingest URL with bearer auth and reads the pending flag', async () => {
    const fetchImpl = fetchResponding(200, { success: true, data: { pending: true } })

    const result = await checkPendingRequest(URL, TOKEN, { fetch: fetchImpl })

    expect(result).toEqual({ ok: true, pending: true })
    expect(fetchImpl).toHaveBeenCalledWith(URL, {
      method: 'GET',
      headers: { authorization: `Bearer ${TOKEN}` },
    })
  })

  it('reports pending false verbatim', async () => {
    const fetchImpl = fetchResponding(200, { success: true, data: { pending: false } })
    await expect(checkPendingRequest(URL, TOKEN, { fetch: fetchImpl })).resolves.toEqual({
      ok: true,
      pending: false,
    })
  })

  it('fails soft on a non-2xx response', async () => {
    const fetchImpl = fetchResponding(401, { success: false, error: 'Unauthorized' })
    await expect(checkPendingRequest(URL, TOKEN, { fetch: fetchImpl })).resolves.toEqual({
      ok: false,
      error: 'pending check responded 401',
    })
  })

  it('fails soft on a malformed body', async () => {
    const fetchImpl = fetchResponding(200, { success: true, data: {} })
    await expect(checkPendingRequest(URL, TOKEN, { fetch: fetchImpl })).resolves.toEqual({
      ok: false,
      error: 'pending check returned a malformed body',
    })
  })

  it('fails soft on a network error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    await expect(checkPendingRequest(URL, TOKEN, { fetch: fetchImpl })).resolves.toEqual({
      ok: false,
      error: 'ECONNREFUSED',
    })
  })
})
