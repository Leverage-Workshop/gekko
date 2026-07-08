import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createScheduler } from '@/lib/uploader'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createScheduler', () => {
  it('coalesces a burst of triggers into a single run after the quiet window', async () => {
    const run = vi.fn(async () => {})
    const scheduler = createScheduler({ debounceMs: 1000, run })

    scheduler.trigger()
    vi.advanceTimersByTime(400)
    scheduler.trigger() // resets the window
    vi.advanceTimersByTime(400)
    scheduler.trigger() // resets again
    expect(run).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('never overlaps runs; a trigger mid-run queues exactly one rerun', async () => {
    let release!: () => void
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const scheduler = createScheduler({ debounceMs: 100, run })

    scheduler.trigger()
    await vi.advanceTimersByTimeAsync(100) // first run starts and is now in-flight
    expect(run).toHaveBeenCalledTimes(1)

    scheduler.trigger() // arrives mid-run → queued, not started
    scheduler.trigger() // collapses into the same single rerun
    await vi.advanceTimersByTimeAsync(100)
    expect(run).toHaveBeenCalledTimes(1)

    release() // first run finishes → queued rerun is scheduled
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('routes a thrown run error to onError without breaking future runs', async () => {
    const onError = vi.fn()
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined)
    const scheduler = createScheduler({ debounceMs: 100, run, onError })

    scheduler.trigger()
    await vi.advanceTimersByTimeAsync(100)
    expect(onError).toHaveBeenCalledTimes(1)

    scheduler.trigger()
    await vi.advanceTimersByTimeAsync(100)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('cancel() drops a pending run', async () => {
    const run = vi.fn(async () => {})
    const scheduler = createScheduler({ debounceMs: 100, run })

    scheduler.trigger()
    scheduler.cancel()
    await vi.advanceTimersByTimeAsync(100)
    expect(run).not.toHaveBeenCalled()
  })

  it('routes a *synchronous* throw from run to onError without deadlocking', async () => {
    const onError = vi.fn()
    const run = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => {
        throw new Error('sync boom') // thrown before a promise even exists
      })
      .mockResolvedValueOnce(undefined)
    const scheduler = createScheduler({ debounceMs: 100, run, onError })

    scheduler.trigger()
    await vi.advanceTimersByTimeAsync(100)
    expect(onError).toHaveBeenCalledTimes(1)

    // `running` must have been released — the next trigger still runs.
    scheduler.trigger()
    await vi.advanceTimersByTimeAsync(100)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('cancel() during an in-flight run also drops the queued rerun', async () => {
    let release!: () => void
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const scheduler = createScheduler({ debounceMs: 100, run })

    scheduler.trigger()
    await vi.advanceTimersByTimeAsync(100) // first run starts and is now in-flight
    expect(run).toHaveBeenCalledTimes(1)

    scheduler.trigger() // queues a rerun behind the in-flight run
    scheduler.cancel() // must clear the queued rerun, not just the timer

    release() // in-flight run finishes → nothing further should fire
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(run).toHaveBeenCalledTimes(1)
  })
})
