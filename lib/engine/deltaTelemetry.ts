import type { ExecBar } from './parseExecBars'
import { RED_EXTREME } from './ripStatus'

export type DeltaTrend = 'rising' | 'falling' | 'flat'
export type DeltaSign = 'positive' | 'negative' | 'neutral'
export type VwapPosition = 'above' | 'below' | 'at' | 'unknown'

export type DeltaTelemetry = {
  barCount: number // total bars analyzed
  recentWindow: number // # of most-recent bars used for "recent" stats
  recentMeanDelta: number // mean deltaIntensity over the recent window (rounded)
  recentRedExtremeCount: number // bars with deltaIntensity <= RED_EXTREME (-3) in the recent window
  recentBlueExtremeCount: number // bars with deltaIntensity >= +3 in the recent window
  recentTrend: DeltaTrend // slope sign across the recent window
  sign: DeltaSign // sign of recentMeanDelta (neutral within epsilon of 0)
  recentRange: {
    high: number // highest high across the recent window
    low: number // lowest low across the recent window
    lastClose: number // latest bar close
    // Where the last close sits in the window's range: 0 = at the low, 1 = at
    // the high. Null when the window's range is under one tick. This is the
    // sequence-aware recovery signal: after a red flush, a high position means
    // the selling failed to keep price down (absorption), even though the
    // window MEAN is still red — and mirrored for blue flushes.
    position: number | null
  }
  extremes: {
    posStrong: number // count of deltaIntensity === +3 (whole series)
    posExtreme: number // count of === +4
    negStrong: number // count of === -3
    negExtreme: number // count of === -4
    lastExtreme: number | null // most recent |deltaIntensity| >= 3 reading, else null
  }
  legVwap: {
    value: number | null // latest non-zero legVWAP (pre-leg zeros ignored), else null
    close: number // latest bar close
    distance: number | null // close - value, else null
    position: VwapPosition // above/below/at relative to value; 'unknown' if no leg yet
  }
}

const DEFAULT_RECENT_WINDOW = 20
// Blue mirror of ripStatus's RED_EXTREME: a +3/+4 initiative print.
const BLUE_EXTREME = -RED_EXTREME
// Smallest meaningful move: one NQ tick (0.25). Differences within this are treated as flat/neutral/at.
const EPSILON = 0.25

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((sum, n) => sum + n, 0) / nums.length
}

function classifyTrend(earlier: number, later: number): DeltaTrend {
  const diff = later - earlier
  if (diff > EPSILON) return 'rising'
  if (diff < -EPSILON) return 'falling'
  return 'flat'
}

function classifySign(value: number): DeltaSign {
  if (value > EPSILON) return 'positive'
  if (value < -EPSILON) return 'negative'
  return 'neutral'
}

function classifyPosition(close: number, value: number): VwapPosition {
  const diff = close - value
  if (diff > EPSILON) return 'above'
  if (diff < -EPSILON) return 'below'
  return 'at'
}

/**
 * Reduce parsed execution bars (ascending time, from parseExecBars) to a compact delta
 * summary for the prompt: recent delta trend + sign, ±3/±4 intensity extremes, and the
 * latest close's position relative to the Leg VWAP.
 */
export function computeDeltaTelemetry(
  bars: ExecBar[],
  opts: { recentWindow?: number } = {},
): DeltaTelemetry {
  if (bars.length === 0) throw new Error('computeDeltaTelemetry: no bars')

  const recentWindow = Math.min(opts.recentWindow ?? DEFAULT_RECENT_WINDOW, bars.length)
  const recent = bars.slice(bars.length - recentWindow)
  const recentDeltas = recent.map(b => b.deltaIntensity)

  const recentMeanDelta = round2(mean(recentDeltas))

  // Red-extreme prints within the recent window. These are 750-volume bars, so a single rogue
  // -3/-4 print is possible; ripStatus confirms Condition Red only when several cluster
  // (RED_BUILDING_MIN_BARS), which is why the count — not the mean — is the flip signal.
  const recentRedExtremeCount = recentDeltas.filter(d => d <= RED_EXTREME).length
  const recentBlueExtremeCount = recentDeltas.filter(d => d >= BLUE_EXTREME).length

  // Trend: compare the mean delta of the window's first half vs its second half.
  const mid = Math.floor(recentDeltas.length / 2)
  const recentTrend =
    recentDeltas.length < 2
      ? 'flat'
      : classifyTrend(mean(recentDeltas.slice(0, mid)), mean(recentDeltas.slice(mid)))

  const extremes = {
    posStrong: bars.filter(b => b.deltaIntensity === 3).length,
    posExtreme: bars.filter(b => b.deltaIntensity === 4).length,
    negStrong: bars.filter(b => b.deltaIntensity === -3).length,
    negExtreme: bars.filter(b => b.deltaIntensity === -4).length,
    lastExtreme:
      [...bars].reverse().find(b => Math.abs(b.deltaIntensity) >= 3)?.deltaIntensity ?? null,
  }

  const last = bars[bars.length - 1]

  const recentHigh = Math.max(...recent.map(b => b.high))
  const recentLow = Math.min(...recent.map(b => b.low))
  const recentSpan = recentHigh - recentLow
  const recentRange = {
    high: recentHigh,
    low: recentLow,
    lastClose: last.close,
    position: recentSpan < EPSILON ? null : round2((last.close - recentLow) / recentSpan),
  }

  // Pre-leg rows carry legVWAP === 0; the latest non-zero value is the active Leg VWAP.
  const legValue = [...bars].reverse().find(b => b.legVWAP !== 0)?.legVWAP ?? null
  const legVwap = {
    value: legValue,
    close: last.close,
    distance: legValue === null ? null : round2(last.close - legValue),
    position: legValue === null ? ('unknown' as VwapPosition) : classifyPosition(last.close, legValue),
  }

  return {
    barCount: bars.length,
    recentWindow,
    recentMeanDelta,
    recentRedExtremeCount,
    recentBlueExtremeCount,
    recentTrend,
    sign: classifySign(recentMeanDelta),
    recentRange,
    extremes,
    legVwap,
  }
}
