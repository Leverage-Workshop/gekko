import { beforeEach, describe, expect, it, vi } from 'vitest'

// Offline route test: the trigger.dev SDK is replaced with a hoisted fake so
// POST /api/eval/run can be exercised without TRIGGER_SECRET_KEY or any
// network access (same discipline as tests/briefings.run.route.test.ts).
const { trigger } = vi.hoisted(() => ({ trigger: vi.fn() }))
vi.mock('@trigger.dev/sdk', () => ({ tasks: { trigger } }))

import { POST } from '@/app/api/eval/run/route'

describe('POST /api/eval/run', () => {
  beforeEach(() => {
    trigger.mockReset()
  })

  it('triggers eval-task with an empty payload and returns the run id + realtime token', async () => {
    trigger.mockResolvedValue({ id: 'run_eval123', publicAccessToken: 'pat_eval123' })

    const res = await POST()
    const body = await res.json()

    expect(trigger).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveBeenCalledWith('eval-task', {})
    expect(res.status).toBe(202)
    expect(body).toEqual({
      success: true,
      data: { runId: 'run_eval123', publicAccessToken: 'pat_eval123' },
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

  it('falls back to a generic error message on non-Error throws', async () => {
    trigger.mockRejectedValue('boom')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body).toEqual({ success: false, error: 'Failed to trigger eval-task' })
    consoleError.mockRestore()
  })
})
