import { describe, expect, it, vi } from 'vitest'
import {
  PENDING_MAX_AGE_MS,
  WAIT_POLL_MS,
  WAIT_TIMEOUT_MS,
  createBundleRequest,
  fulfillPendingRequests,
  hasPendingRequest,
  waitForBundleRequest,
  type BundleRequestDeps,
  type BundleRequestStatus,
} from '@/lib/bundleRequests'

// Unit tests for the fresh-bundle handshake logic (button → pending flag →
// uploader → fulfilment → task). All DB access and time is injected, so the
// suite runs offline with no real clocks.

function fakeDeps(overrides: Partial<BundleRequestDeps> = {}): BundleRequestDeps {
  return {
    insertRequest: vi.fn().mockResolvedValue({ id: 'req-1' }),
    countPendingSince: vi.fn().mockResolvedValue(0),
    fulfillPending: vi.fn().mockResolvedValue(undefined),
    fetchRequestStatus: vi.fn().mockResolvedValue(null),
    ...overrides,
  }
}

describe('createBundleRequest', () => {
  it('inserts a pending row with the given reason and returns its id', async () => {
    const deps = fakeDeps()
    const id = await createBundleRequest(deps, 'analyze')
    expect(deps.insertRequest).toHaveBeenCalledWith('analyze')
    expect(id).toBe('req-1')
  })
})

describe('hasPendingRequest', () => {
  it('is true when a recent pending row exists', async () => {
    const deps = fakeDeps({ countPendingSince: vi.fn().mockResolvedValue(2) })
    await expect(hasPendingRequest(deps)).resolves.toBe(true)
  })

  it('is false when no pending rows exist', async () => {
    const deps = fakeDeps()
    await expect(hasPendingRequest(deps)).resolves.toBe(false)
  })

  it('only counts rows newer than the max-age cutoff (stale flags never re-arm the uploader)', async () => {
    const countPendingSince = vi.fn().mockResolvedValue(0)
    const deps = fakeDeps({ countPendingSince })
    const nowMs = Date.parse('2026-07-23T12:00:00.000Z')

    await hasPendingRequest(deps, { now: () => nowMs })

    expect(countPendingSince).toHaveBeenCalledWith(
      new Date(nowMs - PENDING_MAX_AGE_MS).toISOString(),
    )
  })
})

describe('fulfillPendingRequests', () => {
  it('marks all pending rows fulfilled by the stored bundle', async () => {
    const deps = fakeDeps()
    await fulfillPendingRequests(deps, 'bundle-9')
    expect(deps.fulfillPending).toHaveBeenCalledWith('bundle-9')
  })
})

describe('waitForBundleRequest', () => {
  const sleep = () => Promise.resolve()

  it('returns fulfilled (with the bundle id) as soon as the row flips', async () => {
    const statuses: Array<{ status: BundleRequestStatus; bundle_id: string | null }> = [
      { status: 'pending', bundle_id: null },
      { status: 'pending', bundle_id: null },
      { status: 'fulfilled', bundle_id: 'bundle-9' },
    ]
    const fetchRequestStatus = vi.fn(async () => statuses.shift()!)
    const deps = fakeDeps({ fetchRequestStatus })

    const result = await waitForBundleRequest(deps, 'req-1', { sleep, now: () => 0 })

    expect(result).toEqual({ outcome: 'fulfilled', bundleId: 'bundle-9' })
    expect(fetchRequestStatus).toHaveBeenCalledTimes(3)
  })

  it('returns missing when the request row does not exist', async () => {
    const deps = fakeDeps()
    const result = await waitForBundleRequest(deps, 'req-gone', { sleep, now: () => 0 })
    expect(result).toEqual({ outcome: 'missing' })
  })

  it('times out (without throwing) when the row stays pending past the deadline', async () => {
    const deps = fakeDeps({
      fetchRequestStatus: vi
        .fn()
        .mockResolvedValue({ status: 'pending', bundle_id: null }),
    })
    // Advance a fake clock by one poll interval per sleep so the deadline passes.
    let clock = 0
    const tickingSleep = (ms: number) => {
      clock += ms
      return Promise.resolve()
    }

    const result = await waitForBundleRequest(deps, 'req-1', {
      sleep: tickingSleep,
      now: () => clock,
    })

    expect(result).toEqual({ outcome: 'timed-out' })
    expect(clock).toBeGreaterThanOrEqual(WAIT_TIMEOUT_MS)
  })

  it('polls on the configured interval', async () => {
    const statuses: Array<{ status: BundleRequestStatus; bundle_id: string | null }> = [
      { status: 'pending', bundle_id: null },
      { status: 'fulfilled', bundle_id: null },
    ]
    const deps = fakeDeps({ fetchRequestStatus: vi.fn(async () => statuses.shift()!) })
    const sleepSpy = vi.fn().mockResolvedValue(undefined)

    await waitForBundleRequest(deps, 'req-1', { sleep: sleepSpy, now: () => 0 })

    expect(sleepSpy).toHaveBeenCalledTimes(1)
    expect(sleepSpy).toHaveBeenCalledWith(WAIT_POLL_MS)
  })
})
