import { describe, expect, it } from 'vitest'
import { DEFAULT_TIMEOUT_MS, effectiveTimeoutMs } from '@/lib/job-plan/profile-vision/identifyProfileNodes'
import { VISION_READ_DEADLINE_FROM_TASK_START_MS } from '@/lib/job-plan/profile-vision/identifyProfileNodes'
import { WAIT_TIMEOUT_MS } from '@/lib/bundleRequests'

/**
 * feat-131 / Codex P1. `job-plan-task` runs under `maxDuration: 300` and can
 * spend WAIT_TIMEOUT_MS waiting for a fresh bundle first. A per-call vision
 * timeout that ignores that budget lets trigger.dev kill the run before the R14
 * degraded plan is persisted — losing the plan AND re-billing the calls on retry.
 */
const TASK_MAX_DURATION_MS = 300_000

describe('vision read stays inside the task budget', () => {
  it('reserves time after the read for uploads, plan build and persistence', () => {
    const reserve = TASK_MAX_DURATION_MS - VISION_READ_DEADLINE_FROM_TASK_START_MS
    expect(reserve).toBeGreaterThanOrEqual(50_000)
  })

  it('is measured from TASK START, so the bundle wait eats into it rather than adding to it', () => {
    // The regression this pins: a budget set before waitForFreshBundle as
    // "now + N" expires during a slow wait and reports `deadline exceeded` on
    // every call while the task still has minutes left.
    expect(VISION_READ_DEADLINE_FROM_TASK_START_MS).toBeGreaterThan(WAIT_TIMEOUT_MS)
    const worstCaseRemaining = VISION_READ_DEADLINE_FROM_TASK_START_MS - WAIT_TIMEOUT_MS
    // even after the longest legal bundle wait there is room for a real call
    expect(worstCaseRemaining).toBeGreaterThanOrEqual(2 * 60_000)
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


/**
 * feat-131 Codex P1. `prominence` must stay a PROFILE-WIDE scale: the planner
 * ranks nodes against each other regardless of kind
 * (`confluenceBands.ts` sorts by it across all references) and treats an
 * absolute value as weak (`referenceRoles.ts` WEAK_NODE_PROMINENCE). A per-kind
 * ordinal would silently promote a lone weak node of some kind to rank 1.
 */
describe('prominence stays a profile-wide scale', () => {
  it('the prompt does not tell the model to rank within kind', async () => {
    const { CRITERIA } = await import('@/lib/job-plan/profile-vision/prompt')
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(process.cwd(), 'lib/job-plan/profile-vision/prompt.ts'),
      'utf8'
    )
    expect(src).not.toMatch(/prominence: ordinal WITHIN each kind/)
    expect(src).toContain('on ONE scale across all kinds')
    expect(CRITERIA.length).toBeGreaterThan(0)
  })
})
