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
 * Combined [low, high] of the exec bars whose timestamp falls within
 * `windowMs` of the LAST bar's timestamp. The window is anchored to the last
 * bar — not wall-clock now — so Sierra's chart-local timestamps are only ever
 * compared to each other (no timezone/clock-skew exposure) and a stale bundle
 * does not empty the window (staleness is assessed and surfaced separately).
 */
export function computeRecentBarRange(
  bars: readonly ExecBar[],
  windowMs: number,
): RecentBarRange | null {
  if (bars.length === 0 || !Number.isFinite(windowMs) || windowMs < 0) {
    return null
  }
  let anchorMs = -Infinity
  for (const bar of bars) {
    anchorMs = Math.max(anchorMs, bar.dateTime.getTime())
  }
  let range: RecentBarRange | null = null
  for (const bar of bars) {
    if (anchorMs - bar.dateTime.getTime() > windowMs) {
      continue
    }
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

export interface ProximityOptions {
  thresholdPoints?: number
  /**
   * Recent execution-bar range (from {@link computeRecentBarRange}). When
   * present, a level counts as near if EITHER the snapshot price or this
   * range comes within the threshold. Omit/null for snapshot-only.
   */
  barRange?: RecentBarRange | null
}

export interface ProximityAssessment {
  /** true when the nearest active level is within `thresholdPoints`. */
  nearEntry: boolean
  /** Closest active level by {@link effectiveDistancePoints}, or null when none usable. */
  nearest: {
    level: EntryLevelRow
    /** |level.price − currentPrice| — the snapshot distance. */
    distancePoints: number
    /**
     * min(snapshot distance, distance to the recent bar range) — what the
     * gate compares against the threshold. Equals `distancePoints` when no
     * bar range was supplied; 0 when the level sits inside the range.
     */
    effectiveDistancePoints: number
  } | null
  thresholdPoints: number
  /** The bar range the gate consulted, or null when snapshot-only. */
  barRange: RecentBarRange | null
}

/** Distance from a price to the [low, high] span; 0 when inside it. */
function distanceToRange(price: number, range: RecentBarRange): number {
  if (price < range.low) return range.low - price
  if (price > range.high) return price - range.high
  return 0
}

/**
 * Pick the active entry level nearest to recent price action and decide the
 * near/not-near gate. A level's effective distance is the SMALLER of its
 * distance to the snapshot `currentPrice` and its distance to the recent
 * exec-bar [low, high] range (when supplied) — a wick through a level between
 * bundle exports passes the gate even though the snapshot has pulled away.
 * The two distances are deliberately NOT merged into one hull: a level lying
 * between a far-off snapshot and the bar range is near neither. Levels
 * without a finite price are ignored.
 */
export function assessProximity(
  levels: readonly EntryLevelRow[],
  currentPrice: number,
  options: ProximityOptions = {},
): ProximityAssessment {
  const thresholdPoints = options.thresholdPoints ?? DEFAULT_NEAR_ENTRY_POINTS
  const barRange = options.barRange ?? null
  if (!Number.isFinite(thresholdPoints) || thresholdPoints <= 0) {
    throw new Error('assessProximity: thresholdPoints must be a positive finite number')
  }

  let nearest: ProximityAssessment['nearest'] = null
  for (const level of levels) {
    if (typeof level.price !== 'number' || !Number.isFinite(level.price)) {
      continue
    }
    const distancePoints = Math.abs(level.price - currentPrice)
    const effectiveDistancePoints = barRange
      ? Math.min(distancePoints, distanceToRange(level.price, barRange))
      : distancePoints
    if (
      nearest === null ||
      effectiveDistancePoints < nearest.effectiveDistancePoints ||
      (effectiveDistancePoints === nearest.effectiveDistancePoints &&
        distancePoints < nearest.distancePoints)
    ) {
      nearest = { level, distancePoints, effectiveDistancePoints }
    }
  }

  return {
    nearEntry: nearest !== null && nearest.effectiveDistancePoints <= thresholdPoints,
    nearest,
    thresholdPoints,
    barRange,
  }
}
