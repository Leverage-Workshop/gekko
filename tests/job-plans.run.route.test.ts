import { beforeEach, describe, expect, it, vi } from 'vitest'

// Offline route test (same discipline as tests/briefings.run.route.test.ts):
// the trigger.dev SDK and the bundle-request module are hoisted fakes, so
// POST /api/job-plans/run runs without TRIGGER_SECRET_KEY or Supabase env.
const { trigger, requestFreshBundle } = vi.hoisted(() => ({
  trigger: vi.fn(),
  requestFreshBundle: vi.fn(),
}))
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger } }))
vi.mock('@/lib/bundleRequests', () => ({ requestFreshBundle }))

import { POST } from '@/app/api/job-plans/run/route'

const post = (body?: string, headers?: Record<string, string>) =>
  POST(
    new Request('http://localhost/api/job-plans/run', {
      method: 'POST',
      ...(body === undefined
        ? {}
        : { body, headers: { 'Content-Type': 'application/json', ...headers } }),
    })
  )

describe('POST /api/job-plans/run', () => {
  beforeEach(() => {
    trigger.mockReset()
    requestFreshBundle.mockReset()
    requestFreshBundle.mockResolvedValue('req-job-1')
    trigger.mockResolvedValue({ id: 'run_job_1', publicAccessToken: 'pat_job_1' })
  })

  it('records a job-plan bundle request, then triggers job-plan-task carrying its id (no body)', async () => {
    const res = await post()
    const body = await res.json()

    expect(requestFreshBundle).toHaveBeenCalledTimes(1)
    expect(requestFreshBundle).toHaveBeenCalledWith('job-plan')
    expect(trigger).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveBeenCalledWith('job-plan-task', {
      triggerReason: 'manual',
      bundleRequestId: 'req-job-1',
    })
    expect(res.status).toBe(202)
    expect(body).toEqual({
      success: true,
      data: { runId: 'run_job_1', publicAccessToken: 'pat_job_1' },
    })
  })

  it('accepts an optional triggerReason in the body', async () => {
    const res = await post(JSON.stringify({ triggerReason: 'post-open' }))
    expect(res.status).toBe(202)
    expect(trigger).toHaveBeenCalledWith('job-plan-task', {
      triggerReason: 'post-open',
      bundleRequestId: 'req-job-1',
    })
  })

  it('rejects a malformed JSON body with 400 and does NOT record a request or trigger', async () => {
    const res = await post('{not json')
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toMatch(/json/i)
    expect(requestFreshBundle).not.toHaveBeenCalled()
    expect(trigger).not.toHaveBeenCalled()
  })

  it('rejects an invalid body (unknown key / empty reason) with 400 + fieldErrors', async () => {
    for (const payload of [
      { triggerReason: '' },
      { bundleRequestId: 'spoofed' },
      { triggerReason: 42 },
    ]) {
      const res = await post(JSON.stringify(payload))
      const body = await res.json()
      expect(res.status).toBe(400)
      expect(body.success).toBe(false)
      expect(body.fieldErrors).toBeDefined()
    }
    expect(requestFreshBundle).not.toHaveBeenCalled()
    expect(trigger).not.toHaveBeenCalled()
  })

  it('returns a clean 500 and does NOT trigger when the bundle request cannot be recorded', async () => {
    requestFreshBundle.mockRejectedValue(new Error('db down'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await post()
    const body = await res.json()

    expect(trigger).not.toHaveBeenCalled()
    expect(res.status).toBe(500)
    expect(body).toEqual({ success: false, error: 'db down' })
    consoleError.mockRestore()
  })

  it('returns a clean 500 when triggering fails, with a generic message on non-Error throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    trigger.mockRejectedValue(new Error('Missing TRIGGER_SECRET_KEY'))
    let res = await post()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ success: false, error: 'Missing TRIGGER_SECRET_KEY' })

    trigger.mockRejectedValue('boom')
    res = await post()
    expect(await res.json()).toEqual({ success: false, error: 'Failed to trigger job-plan-task' })
    consoleError.mockRestore()
  })
})
