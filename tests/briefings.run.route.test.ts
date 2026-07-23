import { beforeEach, describe, expect, it, vi } from 'vitest'

// Offline route test: the trigger.dev SDK and the bundle-request module are
// replaced with hoisted fakes so POST /api/briefings/run can be exercised
// without TRIGGER_SECRET_KEY, Supabase env, or any network access (same
// offline discipline as the other route/orchestration tests).
const { trigger, requestFreshBundle } = vi.hoisted(() => ({
  trigger: vi.fn(),
  requestFreshBundle: vi.fn(),
}))
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger } }))
vi.mock('@/lib/bundleRequests', () => ({ requestFreshBundle }))

import { POST } from '@/app/api/briefings/run/route'

describe('POST /api/briefings/run', () => {
  beforeEach(() => {
    trigger.mockReset()
    requestFreshBundle.mockReset()
    requestFreshBundle.mockResolvedValue('req-abc123')
  })

  it('records a fresh-bundle request, then triggers analyze-task carrying its id', async () => {
    trigger.mockResolvedValue({ id: 'run_abc123', publicAccessToken: 'pat_abc123' })

    const res = await POST()
    const body = await res.json()

    expect(requestFreshBundle).toHaveBeenCalledTimes(1)
    expect(requestFreshBundle).toHaveBeenCalledWith('analyze')
    expect(trigger).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveBeenCalledWith('analyze-task', {
      triggerReason: 'manual',
      bundleRequestId: 'req-abc123',
    })
    expect(res.status).toBe(202)
    expect(body).toEqual({
      success: true,
      data: { runId: 'run_abc123', publicAccessToken: 'pat_abc123' },
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
    expect(body).toEqual({ success: false, error: 'Failed to trigger analyze-task' })
    consoleError.mockRestore()
  })
})
