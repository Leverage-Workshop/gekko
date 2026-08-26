import { minutesBetween } from './chartClock'
import type { ApproachFailureFact, ConfluenceBand } from './contextTypes'
import type { ObservedBar } from './observedBars'
import { r7ApproachFailure } from './rules'

/**
 * R7 approach failure (feat-126): price came within 2× merge tolerance of a
 * band WITHOUT touching it, then retreated ≥ 1× tolerance from its closest
 * approach, and that closest approach fell inside the last 60 min. Measured
 * per side over the APPROACH EPISODE — the completed bars since the last bar
 * that touched or crossed the band from that side (or the whole window when
 * none did), so an overnight visit to the band does not disqualify a fresh
 * session approach. The retreat is the last completed close vs the closest
 * print.
 */

type Band = Pick<ConfluenceBand, 'low' | 'high'>

const round2 = (n: number): number => Math.round(n * 100) / 100

function measureSide(
  bars: readonly ObservedBar[],
  band: Band,
  from: 'below' | 'above',
  asOfMs: number,
  merge: number,
): ApproachFailureFact | null {
  const touched = (bar: ObservedBar): boolean => (from === 'below' ? bar.high >= band.low : bar.low <= band.high)
  const lastTouch = bars.reduce((idx, bar, i) => (touched(bar) ? i : idx), -1)
  const episode = bars.slice(lastTouch + 1)
  if (episode.length === 0) return null

  const closest = episode.reduce((best, bar) =>
    from === 'below' ? (bar.high >= best.high ? bar : best) : bar.low <= best.low ? bar : best,
  )
  const closestPrice = from === 'below' ? closest.high : closest.low
  const lastClose = episode[episode.length - 1].close
  const measure = {
    closestApproachPts: round2(from === 'below' ? band.low - closestPrice : closestPrice - band.high),
    retreatPts: round2(from === 'below' ? closestPrice - lastClose : lastClose - closestPrice),
    minutesSinceClosest: minutesBetween(closest.ms, asOfMs),
  }
  if (!r7ApproachFailure(measure, merge)) return null
  return {
    from,
    closestApproachPts: measure.closestApproachPts,
    closestApproachAt: closest.wall,
    closestPrice,
    retreatPts: measure.retreatPts,
    minutesSinceClosest: measure.minutesSinceClosest,
    scope: closest.scope,
  }
}

/** The approach failure on the side price is currently on, or null. */
export function measureApproachFailure(
  bars: readonly ObservedBar[],
  band: Band,
  asOfMs: number,
  merge: number,
): ApproachFailureFact | null {
  return measureSide(bars, band, 'below', asOfMs, merge) ?? measureSide(bars, band, 'above', asOfMs, merge)
}
