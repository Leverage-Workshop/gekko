import { describe, expect, it } from 'vitest'
import { DEFAULT_TIMEOUT_MS, effectiveTimeoutMs } from '@/lib/job-plan/profile-vision/identifyProfileNodes'
import { VISION_READ_BUDGET_MS } from '@/lib/job-plan/profile-vision/identifyProfileNodes'
import { WAIT_TIMEOUT_MS } from '@/lib/bundleRequests'

/**
 * feat-131 / Codex P1. `job-plan-task` runs under `maxDuration: 300` and can
 * spend WAIT_TIMEOUT_MS waiting for a fresh bundle first. A per-call vision
 * timeout that ignores that budget lets trigger.dev kill the run before the R14
 * degraded plan is persisted — losing the plan AND re-billing the calls on retry.
 */
const TASK_MAX_DURATION_MS = 300_000

describe('vision read stays inside the task budget', () => {
  it('leaves room after the bundle wait for the work that follows the read', () => {
    const afterBundleWait = TASK_MAX_DURATION_MS - WAIT_TIMEOUT_MS
    expect(VISION_READ_BUDGET_MS).toBeLessThan(afterBundleWait)
    // the reserve pays for image uploads, plan build and persistence
    expect(afterBundleWait - VISION_READ_BUDGET_MS).toBeGreaterThanOrEqual(50_000)
  })

  it('clamps a call to the time remaining, not the per-call ceiling', () => {
    const now = 1_000_000
    expect(
      effectiveTimeoutMs({ deadlineAt: now + 30_000, now: () => now })
    ).toBe(30_000)
    // the per-call ceiling still wins when the deadline is far away
    expect(
      effectiveTimeoutMs({ deadlineAt: now + 10 * DEFAULT_TIMEOUT_MS, now: () => now })
    ).toBe(DEFAULT_TIMEOUT_MS)
  })

  it('goes non-positive once the deadline has passed, so no paid call starts', () => {
    const now = 1_000_000
    expect(effectiveTimeoutMs({ deadlineAt: now - 1, now: () => now })).toBeLessThanOrEqual(0)
  })

  it('is unbounded for a caller with no deadline (the bench)', () => {
    expect(effectiveTimeoutMs({})).toBe(DEFAULT_TIMEOUT_MS)
    expect(effectiveTimeoutMs({ timeoutMs: 240_000 })).toBe(240_000)
  })
})
