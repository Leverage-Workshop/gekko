/**
 * Debounces a stream of filesystem events into single bundle runs.
 *
 * Sierra Chart rewrites the whole export folder every ~15s, firing many `add`/
 * `change` events in a burst. We wait for the burst to settle (`debounceMs` of
 * quiet) before running, coalesce overlapping triggers, and never run two
 * uploads concurrently — a trigger arriving mid-run schedules exactly one more.
 *
 * Timers are injected so the behavior is testable with vitest fake timers.
 */

type Timers = {
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void
}

export type SchedulerOptions = {
  readonly debounceMs: number
  readonly run: () => Promise<void>
  readonly onError?: (error: unknown) => void
  readonly timers?: Timers
}

export type Scheduler = {
  /** Note a filesystem event; (re)starts the debounce window. */
  trigger: () => void
  /**
   * Cancel any pending debounce timer and any queued rerun (does not abort an
   * in-flight run).
   */
  cancel: () => void
}

// Resolve the globals lazily (inside the closures) so test fake-timer swaps,
// installed after this module loads, still take effect.
const defaultTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle),
}

export function createScheduler(options: SchedulerOptions): Scheduler {
  const timers = options.timers ?? defaultTimers
  let pendingTimer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let rerunQueued = false

  function trigger(): void {
    if (running) {
      rerunQueued = true
      return
    }
    if (pendingTimer !== null) {
      timers.clearTimeout(pendingTimer)
    }
    pendingTimer = timers.setTimeout(fire, options.debounceMs)
  }

  function fire(): void {
    pendingTimer = null
    running = true
    // Wrap the call in a resolved promise so a *synchronous* throw from run()
    // still takes the rejection path below — otherwise `running` would stay
    // true forever and the scheduler would deadlock.
    Promise.resolve()
      .then(() => options.run())
      .catch((error) => options.onError?.(error))
      .finally(() => {
        running = false
        if (rerunQueued) {
          rerunQueued = false
          trigger()
        }
      })
  }

  function cancel(): void {
    if (pendingTimer !== null) {
      timers.clearTimeout(pendingTimer)
      pendingTimer = null
    }
    // Also drop a rerun queued during an in-flight run — cancel() means "no
    // more runs", not "one more after the current one finishes".
    rerunQueued = false
  }

  return { trigger, cancel }
}
