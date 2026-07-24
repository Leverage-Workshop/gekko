import { beforeEach, describe, expect, it, vi } from 'vitest'

// Offline route test: the trigger.dev SDK and the bundle-request module are
// replaced with hoisted fakes so POST /api/eval/run can be exercised without
// TRIGGER_SECRET_KEY, Supabase env, or any network access (same discipline as
// tests/briefings.run.route.test.ts).
const { trigger, requestFreshBundle } = vi.hoisted(() => ({
  trigger: vi.fn(),
  requestFreshBundle: vi.fn(),
}))
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger } }))
vi.mock('@/lib/bundleRequests', () => ({ requestFreshBundle }))

import { POST } from '@/app/api/eval/run/route'

/** Build the POST request the buttons send: body-less (Eval) or JSON (Long/Short). */
function post(body?: unknown): Promise<Response> {
  return POST(
    new Request('http://localhost/api/eval/run', {
      method: 'POST',
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    }),
  )
}

describe('POST /api/eval/run', () => {
  beforeEach(() => {
    trigger.mockReset()
    requestFreshBundle.mockReset()
    requestFreshBundle.mockResolvedValue('req-eval123')
  })

  it('records a fresh-bundle request, then triggers eval-task carrying its id', async () => {
    trigger.mockResolvedValue({ id: 'run_eval123', publicAccessToken: 'pat_eval123' })

    const res = await post()
    const body = await res.json()

    expect(requestFreshBundle).toHaveBeenCalledTimes(1)
    expect(requestFreshBundle).toHaveBeenCalledWith('eval')
    expect(trigger).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveBeenCalledWith('eval-task', {
      bundleRequestId: 'req-eval123',
    })
    expect(res.status).toBe(202)
    expect(body).toEqual({
      success: true,
      data: { runId: 'run_eval123', publicAccessToken: 'pat_eval123' },
    })
  })

  it.each(['long', 'short'] as const)(
    'forwards a %s position direction to the task payload',
    async (direction) => {
      trigger.mockResolvedValue({ id: 'run_eval123', publicAccessToken: 'pat_eval123' })

      const res = await post({ direction })

      expect(trigger).toHaveBeenCalledWith('eval-task', {
        bundleRequestId: 'req-eval123',
        direction,
      })
      expect(res.status).toBe(202)
    },
  )

  it('rejects an unknown direction with a 400 before recording anything', async () => {
    const res = await post({ direction: 'sideways' })
    const body = await res.json()

    expect(requestFreshBundle).not.toHaveBeenCalled()
    expect(trigger).not.toHaveBeenCalled()
    expect(res.status).toBe(400)
    expect(body).toEqual({
      success: false,
      error: 'direction must be "long" or "short"',
    })
  })

  it('treats a malformed body as the plain entry check', async () => {
    // A body that is not valid JSON must not break the Eval button's plain
    // POST semantics — the route degrades to the direction-less entry check.
    trigger.mockResolvedValue({ id: 'run_eval123', publicAccessToken: 'pat_eval123' })

    const res = await POST(
      new Request('http://localhost/api/eval/run', { method: 'POST', body: '{oops' }),
    )

    expect(trigger).toHaveBeenCalledWith('eval-task', {
      bundleRequestId: 'req-eval123',
    })
    expect(res.status).toBe(202)
  })

  it('returns a clean 500 body when triggering fails', async () => {
    trigger.mockRejectedValue(new Error('Missing TRIGGER_SECRET_KEY'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await post()
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toEqual({ success: false, error: 'Missing TRIGGER_SECRET_KEY' })
    consoleError.mockRestore()
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

  it('falls back to a generic error message on non-Error throws', async () => {
    trigger.mockRejectedValue('boom')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await post()
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toEqual({ success: false, error: 'Failed to trigger eval-task' })
    consoleError.mockRestore()
  })
})
