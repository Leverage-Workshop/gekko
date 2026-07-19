import type { Direction } from '@/knowledge/schema/briefing.schema'
import type { ExecBar } from '@/lib/engine/parseExecBars'

/**
 * Code-owned proximity logic for the eval-task ("Check Entry"). The doctrine's
 * "IF price is near an entry from prior briefing" gate is decided HERE, in
 * code, never by the model: the model only judges ENTER/WAIT/NOT_VALID once
 * code has said the price is near an active level (else the status must be
 * NO_ENTRY_NEAR).
 */

/** One active `entry_levels` row as the eval-task consumes it. */
export interface EntryLevelRow {
  id: string
  briefing_id: string
  objective: string | null
  label: string | null
  price: number | null
  direction: Direction | null
  stop: number | null
  targets: number[] | null
}

/**
 * Default "near an entry" radius in NQ points. The doctrine gives no numeric
 * threshold ("near" is qualitative in the Gem); 20 points (~80 ticks) is the
 * practical approach window for an NQ LVN-border entry — inside it a retest
 * can be judged from the execution chart, outside it the answer is always
 * "wait for price to travel". Overridable per call (and a future `config`
 * column can feed it).
 */
export const DEFAULT_NEAR_ENTRY_POINTS = 20

/**
 * Default recency window (seconds) for the bar-range half of the gate,
 * mirroring the `config.proximity_window_seconds` column default. Bundles
 * export ~every 30s, so a snapshot-only gate misses any wick through a level
 * that pulls back between exports; 60s of execution bars covers roughly two
 * export cycles of intrabar price action.
 */
export const DEFAULT_PROXIMITY_WINDOW_SECONDS = 60

/** High/low span of the execution bars inside the recency window. */
export interface RecentBarRange {
  low: number
  high: number
  /** How many bars the window covered (always >= 1 — the last bar). */
  barCount: number
}

/**
 * The exec bars whose timestamp falls within `windowMs` of the LAST bar's
 * timestamp. The window is anchored to the last bar — not wall-clock now — so
 * Sierra's chart-local timestamps are only ever compared to each other (no
 * timezone/clock-skew exposure) and a stale bundle does not empty the window
 * (staleness is assessed and surfaced separately).
 */
export function filterRecentBars(
  bars: readonly ExecBar[],
  windowMs: number,
): ExecBar[] {
  if (bars.length === 0 || !Number.isFinite(windowMs) || windowMs < 0) {
    return []
  }
  let anchorMs = -Infinity
  for (const bar of bars) {
    anchorMs = Math.max(anchorMs, bar.dateTime.getTime())
  }
  return bars.filter((bar) => anchorMs - bar.dateTime.getTime() <= windowMs)
}

/** Combined [low, high] hull of a bar set; null when empty. */
function rangeOfBars(bars: readonly ExecBar[]): RecentBarRange | null {
  let range: RecentBarRange | null = null
  for (const bar of bars) {
    range =
      range === null
        ? { low: bar.low, high: bar.high, barCount: 1 }
        : {
            low: Math.min(range.low, bar.low),
            high: Math.max(range.high, bar.high),
            barCount: range.barCount + 1,
          }
  }
  return range
}

/**
 * Combined [low, high] of the exec bars inside the recency window (see
 * {@link filterRecentBars}). Reporting-only: the gate itself measures
 * per-bar, never against this collapsed hull.
 */
export function computeRecentBarRange(
  bars: readonly ExecBar[],
  windowMs: number,
): RecentBarRange | null {
  return rangeOfBars(filterRecentBars(bars, windowMs))
}

export interface ProximityOptions {
  thresholdPoints?: number
  /**
   * Recent execution bars (from {@link filterRecentBars}). When present, a
   * level counts as near if EITHER the snapshot price or any of these bars
   * comes within the threshold, and nearest-selection prefers the level price
   * touched most RECENTLY. Omit/empty for snapshot-only.
   */
  recentBars?: readonly ExecBar[] | null
}

export interface ProximityAssessment {
  /** true when the nearest active level is within `thresholdPoints`. */
  nearEntry: boolean
  /**
   * The level to evaluate: the one price was within threshold of most
   * RECENTLY (snapshot beats any bar; newer bars beat older). When no level
   * was ever within threshold, the closest by effective distance. Null when
   * none usable.
   */
  nearest: {
    level: EntryLevelRow
    /** |level.price − currentPrice| — the snapshot distance. */
    distancePoints: number
    /**
     * min(snapshot distance, per-bar distances in the recent window) — what
     * the gate compares against the threshold. Equals `distancePoints` when
     * no recent bars were supplied; 0 when a bar traded through the level.
     */
    effectiveDistancePoints: number
  } | null
  thresholdPoints: number
  /** [low, high] hull of the recent bars (reporting), or null when snapshot-only. */
  barRange: RecentBarRange | null
}

/** Distance from a price to a bar's [low, high] span; 0 when inside it. */
function distanceToBar(price: number, bar: ExecBar): number {
  if (price < bar.low) return bar.low - price
  if (price > bar.high) return price - bar.high
  return 0
}

/** Internal nearest-candidate with the recency facts the selection orders on. */
interface Candidate {
  level: EntryLevelRow
  distancePoints: number
  effectiveDistancePoints: number
  /**
   * Timestamp (ms) of the most recent contact within threshold: Infinity for
   * the snapshot, a bar's time otherwise, -Infinity when never within.
   */
  lastNearMs: number
  /** Distance at that most recent contact; Infinity when never within. */
  lastNearDistancePoints: number
}

/** Selection order: most recent in-threshold contact first, then distance. */
function beats(a: Candidate, b: Candidate): boolean {
  if (a.lastNearMs !== b.lastNearMs) return a.lastNearMs > b.lastNearMs
  if (a.lastNearDistancePoints !== b.lastNearDistancePoints) {
    return a.lastNearDistancePoints < b.lastNearDistancePoints
  }
  if (a.effectiveDistancePoints !== b.effectiveDistancePoints) {
    return a.effectiveDistancePoints < b.effectiveDistancePoints
  }
  return a.distancePoints < b.distancePoints
}

/**
 * Pick the active entry level to evaluate and decide the near/not-near gate.
 * A level's effective distance is the SMALLEST of its distance to the
 * snapshot `currentPrice` and its distance to each recent exec bar's
 * [low, high] (when supplied) — a wick through a level between bundle exports
 * passes the gate even though the snapshot has pulled away. Distances are
 * per-bar, never against a collapsed multi-bar hull: a level lying in the
 * corridor between the snapshot and the bars — or in a gap between bars — is
 * near neither.
 *
 * When SEVERAL levels came within threshold inside the window, the one price
 * touched most RECENTLY wins (the snapshot is the most recent observation of
 * all) — price sweeping through the primary entry on its way to the secondary
 * must be evaluated against the secondary, not whichever is closer to the
 * snapshot. Levels without a finite price are ignored.
 */
export function assessProximity(
  levels: readonly EntryLevelRow[],
  currentPrice: number,
  options: ProximityOptions = {},
): ProximityAssessment {
  const thresholdPoints = options.thresholdPoints ?? DEFAULT_NEAR_ENTRY_POINTS
  const recentBars = options.recentBars ?? []
  if (!Number.isFinite(thresholdPoints) || thresholdPoints <= 0) {
    throw new Error('assessProximity: thresholdPoints must be a positive finite number')
  }

  let nearest: Candidate | null = null
  for (const level of levels) {
    if (typeof level.price !== 'number' || !Number.isFinite(level.price)) {
      continue
    }
    const distancePoints = Math.abs(level.price - currentPrice)
    let minBarDistancePoints = Infinity
    let lastNearMs = -Infinity
    let lastNearDistancePoints = Infinity
    for (const bar of recentBars) {
      const barDistance = distanceToBar(level.price, bar)
      minBarDistancePoints = Math.min(minBarDistancePoints, barDistance)
      if (barDistance <= thresholdPoints) {
        const barMs = bar.dateTime.getTime()
        if (
          barMs > lastNearMs ||
          (barMs === lastNearMs && barDistance < lastNearDistancePoints)
        ) {
          lastNearMs = barMs
          lastNearDistancePoints = barDistance
        }
      }
    }
    if (distancePoints <= thresholdPoints) {
      lastNearMs = Infinity
      lastNearDistancePoints = distancePoints
    }
    const candidate: Candidate = {
      level,
      distancePoints,
      effectiveDistancePoints: Math.min(distancePoints, minBarDistancePoints),
      lastNearMs,
      lastNearDistancePoints,
    }
    if (nearest === null || beats(candidate, nearest)) {
      nearest = candidate
    }
  }

  return {
    nearEntry: nearest !== null && nearest.effectiveDistancePoints <= thresholdPoints,
    nearest:
      nearest === null
        ? null
        : {
            level: nearest.level,
            distancePoints: nearest.distancePoints,
            effectiveDistancePoints: nearest.effectiveDistancePoints,
          },
    thresholdPoints,
    barRange: rangeOfBars(recentBars),
  }
}
