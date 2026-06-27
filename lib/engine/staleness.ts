/**
 * Bundle staleness detection.
 *
 * Gekko has no live price feed: Sierra Chart exports the bundle every ~30s and
 * the local uploader (feat-009) POSTs it to /api/ingest, so the latest
 * `raw_bundles` row IS the "current" market state. The whole pipeline therefore
 * depends on one machine staying up — if Sierra Chart or the uploader stops, no
 * new bundles arrive and the "latest" bundle silently goes cold.
 *
 * Top Risk #3 in docs/agent-architecture-plan.md: "no running Sierra
 * Chart/uploader = no data; must detect and surface staleness, never serve
 * stale briefings as fresh." This module is that detector. At button-press time
 * (a briefing run or an entry eval) the caller assesses the latest bundle's age
 * against a margin; if it exceeds the margin — or there is no bundle at all —
 * the result is flagged stale so the task can mark it and the UI can warn,
 * rather than presenting cold data as the live picture.
 *
 * Pure, deterministic, and serializable: `now` is injected (defaults to the
 * wall clock) so it is unit-testable, and the returned assessment is plain JSON
 * meant to be embedded in a Briefing/EvalResult payload and rendered by the UI.
 * Plain TypeScript types (an engine fact, not a model-facing Briefing output —
 * no Zod).
 */

/**
 * Default freshness margin: 3 minutes (~6 missed 30s exports). One or two
 * skipped exports are normal jitter; sustained silence past this means the
 * single-machine pipeline is likely down. Callers may override (e.g. from a
 * future config column) via `marginMs`.
 */
export const DEFAULT_STALENESS_MARGIN_MS = 3 * 60 * 1000

export type StalenessInput = {
  /**
   * When the latest bundle was received (`raw_bundles.received_at`). Accepts an
   * ISO string, epoch milliseconds, or a Date. `null`/`undefined`/unparseable
   * means "no bundle to serve" and is treated as maximally stale.
   */
  receivedAt: string | number | Date | null | undefined
  /** Evaluation instant ("button-press time"). Defaults to the wall clock. */
  now?: string | number | Date
  /** Freshness budget in ms. Defaults to {@link DEFAULT_STALENESS_MARGIN_MS}. */
  marginMs?: number
}

export type StalenessAssessment = {
  /** true when the latest bundle is older than the margin, or absent entirely. */
  isStale: boolean
  /** false when there is no usable bundle (then `ageMs` is Infinity). */
  hasData: boolean
  /** now − receivedAt, in ms (never negative; Infinity when no data). */
  ageMs: number
  /** `ageMs` rounded to whole seconds (Infinity when no data). */
  ageSeconds: number
  /** The margin the age was compared against, in ms. */
  marginMs: number
  /** ISO timestamp of the assessed bundle, or null when no data. */
  receivedAt: string | null
  /** ISO timestamp of the evaluation instant (`now`). */
  evaluatedAt: string
  /**
   * Human-readable warning to surface in the UI — present iff `isStale`, null
   * when fresh. Never serve a stale result without showing this.
   */
  warning: string | null
}

function toMs(value: string | number | Date): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  return new Date(value).getTime()
}

/** Parse a timestamp to epoch ms, or null when missing/unparseable. */
function parseInstant(value: string | number | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const ms = toMs(value)
  return Number.isFinite(ms) ? ms : null
}

/** "0s", "45s", "3m 5s", "1h 2m" — compact age for the staleness warning. */
function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return 'unknown'
  const s = Math.max(0, Math.round(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

/**
 * Assess whether the latest bundle is fresh enough to act on.
 *
 * @param input.receivedAt  Latest `raw_bundles.received_at`; null/unparseable
 *                          ⇒ no data ⇒ stale.
 * @param input.now         Evaluation instant; defaults to the wall clock.
 * @param input.marginMs    Freshness budget; defaults to the 3-minute default.
 * @throws if `marginMs` is not a positive finite number.
 */
export function assessStaleness(input: StalenessInput): StalenessAssessment {
  const marginMs = input.marginMs ?? DEFAULT_STALENESS_MARGIN_MS
  if (!Number.isFinite(marginMs) || marginMs <= 0) {
    throw new Error('assessStaleness: marginMs must be a positive finite number')
  }

  const nowMs = parseInstant(input.now ?? new Date())
  if (nowMs === null) {
    throw new Error('assessStaleness: `now` is not a valid instant')
  }
  const evaluatedAt = new Date(nowMs).toISOString()
  const marginSeconds = Math.round(marginMs / 1000)

  const receivedMs = parseInstant(input.receivedAt)

  // No bundle at all (uploader/Sierra never started, or DB empty): the strongest
  // form of staleness — there is no live picture to serve.
  if (receivedMs === null) {
    return {
      isStale: true,
      hasData: false,
      ageMs: Infinity,
      ageSeconds: Infinity,
      marginMs,
      receivedAt: null,
      evaluatedAt,
      warning:
        `No bundle available — Sierra Chart/uploader appears offline. ` +
        `This result is STALE; do not treat it as the live market picture.`,
    }
  }

  // Clamp future-dated bundles (minor clock skew between machines) to age 0 so a
  // bundle from "the future" never reads as stale.
  const ageMs = Math.max(0, nowMs - receivedMs)
  const ageSeconds = Math.round(ageMs / 1000)
  const isStale = ageMs > marginMs

  return {
    isStale,
    hasData: true,
    ageMs,
    ageSeconds,
    marginMs,
    receivedAt: new Date(receivedMs).toISOString(),
    evaluatedAt,
    warning: isStale
      ? `Latest bundle is ${formatDuration(ageSeconds)} old (freshness margin ` +
        `${formatDuration(marginSeconds)}) — Sierra Chart/uploader may be offline. ` +
        `This result is STALE; do not treat it as the live market picture.`
      : null,
  }
}
