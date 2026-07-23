import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Offline route test for the fresh-bundle handshake halves of /api/ingest:
// GET (the uploader's pending poll) and the POST-side fulfilment. The
// bundle-request module, ingestBundle, and the Supabase client factory are
// hoisted fakes; the real timing-safe isAuthorized stays in play so the
// bearer gate is exercised for both verbs.
const { hasPendingRequest, fulfillPendingRequests, realBundleRequestDeps, ingestBundle } =
  vi.hoisted(() => ({
    hasPendingRequest: vi.fn(),
    fulfillPendingRequests: vi.fn(),
    realBundleRequestDeps: vi.fn(() => ({ kind: 'fake-deps' })),
    ingestBundle: vi.fn(),
  }))
vi.mock('@/lib/bundleRequests', () => ({
  hasPendingRequest,
  fulfillPendingRequests,
  realBundleRequestDeps,
}))
vi.mock('@/lib/ingest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ingest')>()
  return { ...actual, ingestBundle }
})
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: vi.fn(() => ({})) }))

import { GET, POST } from '@/app/api/ingest/route'

const TOKEN = 'test-ingest-token'
const authed = { authorization: `Bearer ${TOKEN}` }

function getRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://gekko.local/api/ingest', { method: 'GET', headers })
}

function postRequest(headers: Record<string, string> = {}): Request {
  const form = new FormData()
  form.set('mgi_json', '{}')
  return new Request('https://gekko.local/api/ingest', {
    method: 'POST',
    headers,
    body: form,
  })
}

describe('/api/ingest pending handshake', () => {
  beforeEach(() => {
    vi.stubEnv('INGEST_BEARER_TOKEN', TOKEN)
    hasPendingRequest.mockReset()
    fulfillPendingRequests.mockReset()
    ingestBundle.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('GET (uploader poll)', () => {
    it('rejects a missing or wrong bearer token', async () => {
      expect((await GET(getRequest())).status).toBe(401)
      expect(
        (await GET(getRequest({ authorization: 'Bearer wrong' }))).status,
      ).toBe(401)
      expect(hasPendingRequest).not.toHaveBeenCalled()
    })

    it('reports whether a fresh bundle is required', async () => {
      hasPendingRequest.mockResolvedValue(true)

      const res = await GET(getRequest(authed))
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body).toEqual({ success: true, data: { pending: true } })
    })

    it('returns a clean 500 when the check fails', async () => {
      hasPendingRequest.mockRejectedValue(new Error('db down'))
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const res = await GET(getRequest(authed))
      const body = await res.json()

      expect(res.status).toBe(500)
      expect(body).toEqual({ success: false, error: 'Failed to check pending requests' })
      consoleError.mockRestore()
    })
  })

  describe('POST fulfilment', () => {
    it('marks pending requests fulfilled with the stored bundle id after ingest succeeds', async () => {
      ingestBundle.mockResolvedValue({ id: 'bundle-42' })
      fulfillPendingRequests.mockResolvedValue(undefined)

      const res = await POST(postRequest(authed))
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body).toEqual({ success: true, data: { bundleId: 'bundle-42' } })
      expect(fulfillPendingRequests).toHaveBeenCalledTimes(1)
      expect(fulfillPendingRequests).toHaveBeenCalledWith(
        { kind: 'fake-deps' },
        'bundle-42',
      )
    })

    it('still returns 201 when fulfilment fails — the bundle IS stored', async () => {
      ingestBundle.mockResolvedValue({ id: 'bundle-42' })
      fulfillPendingRequests.mockRejectedValue(new Error('db hiccup'))
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const res = await POST(postRequest(authed))
      const body = await res.json()

      expect(res.status).toBe(201)
      expect(body).toEqual({ success: true, data: { bundleId: 'bundle-42' } })
      consoleError.mockRestore()
    })

    it('does not fulfil anything when ingest itself fails', async () => {
      ingestBundle.mockRejectedValue(new Error('storage down'))
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

      const res = await POST(postRequest(authed))

      expect(res.status).toBe(500)
      expect(fulfillPendingRequests).not.toHaveBeenCalled()
      consoleError.mockRestore()
    })
  })
})
