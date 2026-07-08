import type { Direction } from '@/knowledge/schema/briefing.schema'

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

export interface ProximityAssessment {
  /** true when the nearest active level is within `thresholdPoints`. */
  nearEntry: boolean
  /** Closest active level by |price − currentPrice|, or null when none usable. */
  nearest: { level: EntryLevelRow; distancePoints: number } | null
  thresholdPoints: number
}

/**
 * Pick the active entry level nearest to the current price and decide the
 * near/not-near gate. Levels without a finite price are ignored.
 */
export function assessProximity(
  levels: readonly EntryLevelRow[],
  currentPrice: number,
  thresholdPoints: number = DEFAULT_NEAR_ENTRY_POINTS,
): ProximityAssessment {
  if (!Number.isFinite(thresholdPoints) || thresholdPoints <= 0) {
    throw new Error('assessProximity: thresholdPoints must be a positive finite number')
  }

  let nearest: ProximityAssessment['nearest'] = null
  for (const level of levels) {
    if (typeof level.price !== 'number' || !Number.isFinite(level.price)) {
      continue
    }
    const distancePoints = Math.abs(level.price - currentPrice)
    if (nearest === null || distancePoints < nearest.distancePoints) {
      nearest = { level, distancePoints }
    }
  }

  return {
    nearEntry: nearest !== null && nearest.distancePoints <= thresholdPoints,
    nearest,
    thresholdPoints,
  }
}
