/**
 * Bundle-request flag logic (the "fresh bundle required" handshake).
 *
 * Flow: a dashboard run button inserts a pending `bundle_requests` row and
 * triggers its task with the request id → the local uploader polls
 * GET /api/ingest on its poll interval and uploads one bundle while a recent
 * pending request exists → POST /api/ingest marks the pending rows fulfilled
 * with the stored bundle id → the task, which has been polling the row, sees
 * it fulfilled and commences on the fresh bundle.
 *
 * All DB access is injected (`BundleRequestDeps`) so this module is pure and
 * unit-testable; the service-role wiring lives in ./deps.
 */

/** Pending requests older than this are ignored by the uploader's pending
 * check — a stray row from a crashed run must not make the uploader post
 * bundles forever. Comfortably above WAIT_TIMEOUT_MS so any request a task is
 * still waiting on is always visible to the uploader. */
export const PENDING_MAX_AGE_MS = 10 * 60 * 1000

/** How long a task waits for its request to be fulfilled before proceeding
 * with the latest bundle anyway (uploader down ≠ bricked button). */
export const WAIT_TIMEOUT_MS = 2 * 60 * 1000

/** Task-side poll interval while waiting for fulfilment. */
export const WAIT_POLL_MS = 3 * 1000

export type BundleRequestStatus = 'pending' | 'fulfilled'

export interface BundleRequestDeps {
  /** Insert a pending request row; returns its id. */
  insertRequest(reason: string): Promise<{ id: string }>
  /** Count pending rows with `requested_at >= cutoffIso`. */
  countPendingSince(cutoffIso: string): Promise<number>
  /** Mark ALL pending rows fulfilled by `bundleId` (one upload serves every
   * outstanding request — two buttons clicked back-to-back share a bundle). */
  fulfillPending(bundleId: string): Promise<void>
  /** Status + fulfilling bundle of one request, or null when the row is gone. */
  fetchRequestStatus(
    id: string,
  ): Promise<{ status: BundleRequestStatus; bundle_id: string | null } | null>
}

/** Record that a fresh bundle is required; returns the request id to hand to
 * the task payload. */
export async function createBundleRequest(
  deps: BundleRequestDeps,
  reason: string,
): Promise<string> {
  const { id } = await deps.insertRequest(reason)
  return id
}

/** The uploader's question: does any recent pending request exist? */
export async function hasPendingRequest(
  deps: BundleRequestDeps,
  options: { now?: () => number; maxAgeMs?: number } = {},
): Promise<boolean> {
  const now = options.now ?? Date.now
  const maxAgeMs = options.maxAgeMs ?? PENDING_MAX_AGE_MS
  const cutoffIso = new Date(now() - maxAgeMs).toISOString()
  return (await deps.countPendingSince(cutoffIso)) > 0
}

/** Ingest-side: a bundle arrived — satisfy every outstanding request. */
export async function fulfillPendingRequests(
  deps: BundleRequestDeps,
  bundleId: string,
): Promise<void> {
  await deps.fulfillPending(bundleId)
}

export type BundleWaitResult =
  /** The request was fulfilled — a fresh bundle is in the DB. */
  | { outcome: 'fulfilled'; bundleId: string | null }
  /** No fulfilment within the timeout — proceed with the latest bundle. */
  | { outcome: 'timed-out' }
  /** The request row does not exist (deleted or bad id) — nothing to wait on. */
  | { outcome: 'missing' }

export interface BundleWaitOptions {
  timeoutMs?: number
  pollMs?: number
  /** Injected for tests; defaults wired in ./deps use real timers. */
  sleep: (ms: number) => Promise<void>
  now?: () => number
}

/**
 * Task-side: poll the request row until it is fulfilled, the row disappears,
 * or `timeoutMs` elapses. Never throws on timeout — the caller decides how
 * loudly to degrade (tasks log a warning and run on the latest bundle).
 */
export async function waitForBundleRequest(
  deps: BundleRequestDeps,
  requestId: string,
  options: BundleWaitOptions,
): Promise<BundleWaitResult> {
  const timeoutMs = options.timeoutMs ?? WAIT_TIMEOUT_MS
  const pollMs = options.pollMs ?? WAIT_POLL_MS
  const now = options.now ?? Date.now
  const deadline = now() + timeoutMs

  for (;;) {
    const row = await deps.fetchRequestStatus(requestId)
    if (row === null) {
      return { outcome: 'missing' }
    }
    if (row.status === 'fulfilled') {
      return { outcome: 'fulfilled', bundleId: row.bundle_id }
    }
    if (now() >= deadline) {
      return { outcome: 'timed-out' }
    }
    await options.sleep(pollMs)
  }
}
