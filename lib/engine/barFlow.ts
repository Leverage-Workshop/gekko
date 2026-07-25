import type { ExecBar } from './parseExecBars'

/**
 * Raw order-flow facts computed from the enriched execution bars (feat-047):
 * cumulative delta, delta divergence at the recent price extremes, delta
 * climax bars and average trade size. Delta convention throughout: per-bar
 * `delta = AskVolume − BidVolume` (buy aggression positive).
 *
 * These are 750-VOLUME bars, so per-bar volume is ~flat by construction —
 * "heavy volume" reads come from bar COUNT at a price (many volume bars = many
 * contracts), trade count and delta magnitude, never from the Volume column
 * itself. Pure + immutable; no file I/O.
 */

export type FlowTrend = 'rising' | 'falling' | 'flat'

/**
 * Cumulative-delta divergence at the recent window's fresh price extreme:
 * 'bearish' = a fresh price high the cumulative delta failed to confirm,
 * 'bullish' = a fresh price low with cumulative delta holding above its prior
 * low (sell aggression not paid off). Null when neither (or both — chop).
 */
export type FlowDivergence = 'bullish' | 'bearish' | null

export type BarFlow = {
  /** # of most-recent bars the recent stats cover. */
  recentWindow: number
  recentTotalVolume: number
  /** Net raw delta (ask − bid) summed over the recent window. */
  recentNetDelta: number
  /** recentTotalVolume / recent trade count; null when trades are absent. */
  recentAvgTradeSize: number | null
  cumulativeDelta: {
    /** Sum of per-bar delta over the whole series (the rolling export window). */
    total: number
    /** Net change over the recent window (= recentNetDelta). */
    recentChange: number
    /** Sign of the recent change, flat within ±DELTA_TREND_EPSILON. */
    trend: FlowTrend
  }
  divergence: FlowDivergence
  /**
   * Delta climax bars in the recent window: |delta| ≥ CLIMAX_DELTA_FRACTION of
   * the bar's volume (≥75% of contracts one-sided) — initiative blowoff /
   * exhaustion prints.
   */
  climax: {
    count: number
    /** Side and close of the most recent climax bar, else null. */
    last: { side: 'buy' | 'sell'; price: number } | null
  }
}

// |delta| at or above this fraction of the bar's volume is a climax print
// (0.5 → one side traded ≥75% of the bar). Exported for the drift guard.
export const CLIMAX_DELTA_FRACTION = 0.5

// Climax detection ignores bars below this volume — a tiny partial bar is
// trivially one-sided. Exported for the drift guard.
export const MIN_CLIMAX_VOLUME = 300

// Net/trend deltas within this many contracts read as flat/unconfirmed.
export const DELTA_TREND_EPSILON = 50

// Smallest meaningful price move: one NQ tick.
const PRICE_EPSILON = 0.25

// The last third of the recent window is "fresh" for divergence purposes.
const FRESH_FRACTION = 1 / 3

const DEFAULT_RECENT_WINDOW = 20

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function classifyTrend(change: number): FlowTrend {
  if (change > DELTA_TREND_EPSILON) return 'rising'
  if (change < -DELTA_TREND_EPSILON) return 'falling'
  return 'flat'
}

/**
 * Divergence at the recent window's fresh extreme: price prints a new
 * high/low in the window's last third while the running cumulative delta
 * fails to make (bearish) / holds above (bullish) its own prior extreme.
 */
function detectDivergence(recent: readonly ExecBar[]): FlowDivergence {
  const freshStart = Math.max(1, recent.length - Math.max(1, Math.floor(recent.length * FRESH_FRACTION)))
  const prior = recent.slice(0, freshStart)
  const fresh = recent.slice(freshStart)
  if (prior.length === 0 || fresh.length === 0) return null

  // Running cumulative delta across the window (index-aligned with `recent`).
  const cum: number[] = []
  let running = 0
  for (const bar of recent) {
    running += bar.delta
    cum.push(running)
  }

  const priorHigh = Math.max(...prior.map(b => b.high))
  const priorLow = Math.min(...prior.map(b => b.low))
  const priorMaxCd = Math.max(...cum.slice(0, freshStart))
  const priorMinCd = Math.min(...cum.slice(0, freshStart))

  // Last occurrence of the fresh region's extreme high/low.
  let freshHighIdx = freshStart
  let freshLowIdx = freshStart
  for (let i = freshStart; i < recent.length; i++) {
    if (recent[i].high >= recent[freshHighIdx].high) freshHighIdx = i
    if (recent[i].low <= recent[freshLowIdx].low) freshLowIdx = i
  }

  const bearish =
    recent[freshHighIdx].high > priorHigh + PRICE_EPSILON &&
    cum[freshHighIdx] < priorMaxCd - DELTA_TREND_EPSILON
  const bullish =
    recent[freshLowIdx].low < priorLow - PRICE_EPSILON &&
    cum[freshLowIdx] > priorMinCd + DELTA_TREND_EPSILON

  if (bearish === bullish) return null // neither, or both (chop) — no signal
  return bearish ? 'bearish' : 'bullish'
}

/**
 * Reduce enriched execution bars (ascending time, from parseExecBars) to the
 * raw order-flow summary: engine-computed cumulative delta, divergence at the
 * fresh extreme, climax prints, trade-size context.
 */
export function computeBarFlow(bars: readonly ExecBar[], opts: { recentWindow?: number } = {}): BarFlow {
  if (bars.length === 0) throw new Error('computeBarFlow: no bars')

  const recentWindow = Math.min(opts.recentWindow ?? DEFAULT_RECENT_WINDOW, bars.length)
  const recent = bars.slice(bars.length - recentWindow)

  const total = bars.reduce((sum, b) => sum + b.delta, 0)
  const recentNetDelta = recent.reduce((sum, b) => sum + b.delta, 0)
  const recentTotalVolume = recent.reduce((sum, b) => sum + b.volume, 0)
  const recentTrades = recent.reduce((sum, b) => sum + b.numberOfTrades, 0)

  const climaxBars = recent.filter(
    b => b.volume >= MIN_CLIMAX_VOLUME && Math.abs(b.delta) >= CLIMAX_DELTA_FRACTION * b.volume,
  )
  const lastClimax = climaxBars[climaxBars.length - 1]

  return {
    recentWindow,
    recentTotalVolume,
    recentNetDelta,
    recentAvgTradeSize: recentTrades === 0 ? null : round2(recentTotalVolume / recentTrades),
    cumulativeDelta: {
      total,
      recentChange: recentNetDelta,
      trend: classifyTrend(recentNetDelta),
    },
    divergence: detectDivergence(recent),
    climax: {
      count: climaxBars.length,
      last: lastClimax ? { side: lastClimax.delta > 0 ? 'buy' : 'sell', price: lastClimax.close } : null,
    },
  }
}
