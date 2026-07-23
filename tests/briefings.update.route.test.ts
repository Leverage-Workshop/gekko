import { beforeEach, describe, expect, it, vi } from 'vitest'

// Offline route test: the trigger.dev SDK and the bundle-request module are
// replaced with hoisted fakes so POST /api/briefings/update can be exercised
// without TRIGGER_SECRET_KEY, Supabase env, or any network access (mirrors
// tests/briefings.run.route.test.ts).
const { trigger, requestFreshBundle } = vi.hoisted(() => ({
  trigger: vi.fn(),
  requestFreshBundle: vi.fn(),
}))
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger } }))
vi.mock('@/lib/bundleRequests', () => ({ requestFreshBundle }))

import { POST } from '@/app/api/briefings/update/route'

describe('POST /api/briefings/update', () => {
  beforeEach(() => {
    trigger.mockReset()
    requestFreshBundle.mockReset()
    requestFreshBundle.mockResolvedValue('req-upd123')
  })

  it('records a fresh-bundle request, then triggers update-task carrying its id', async () => {
    trigger.mockResolvedValue({ id: 'run_upd123', publicAccessToken: 'pat_upd123' })

    const res = await POST()
    const body = await res.json()

    expect(requestFreshBundle).toHaveBeenCalledTimes(1)
    expect(requestFreshBundle).toHaveBeenCalledWith('update')
    expect(trigger).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveBeenCalledWith('update-task', {
      triggerReason: 'manual',
      bundleRequestId: 'req-upd123',
    })
    expect(res.status).toBe(202)
    expect(body).toEqual({
      success: true,
      data: { runId: 'run_upd123', publicAccessToken: 'pat_upd123' },
    })
  })

  it('returns a clean 500 body when triggering fails', async () => {
    trigger.mockRejectedValue(new Error('Missing TRIGGER_SECRET_KEY'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toEqual({ success: false, error: 'Missing TRIGGER_SECRET_KEY' })
    consoleError.mockRestore()
  })

  it('returns a clean 500 and does NOT trigger when the bundle request cannot be recorded', async () => {
    requestFreshBundle.mockRejectedValue(new Error('db down'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST()
    const body = await res.json()

    expect(trigger).not.toHaveBeenCalled()
    expect(res.status).toBe(500)
    expect(body).toEqual({ success: false, error: 'db down' })
    consoleError.mockRestore()
  })

  it('falls back to a generic error message on non-Error throws', async () => {
    trigger.mockRejectedValue('boom')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toEqual({ success: false, error: 'Failed to trigger update-task' })
    consoleError.mockRestore()
  })
})
