import type { HtfBar } from './parseHtfBars'

/**
 * Code-owned HTF structure read (feat-049) — trend state, swing highs/lows,
 * rotation extent and measured ATR computed from the 30-min planning chart's
 * bars (`htf_bar_data.rolling.csv`), so `meta.htfTrend` is verifiable engine
 * data instead of a pure vision read of the planning-chart PNG. The
 * ATR-normalized distances answer the position-eval question "is this adverse
 * move normal rotation noise or a trend break?" numerically.
 */

/** Bars on each side that must be strictly exceeded for a pivot (2.5 h @ 30-min). */
export const SWING_PIVOT_STRENGTH = 5

/** Wilder ATR period, in 30-min bars (14 bars = one RTH session). */
export const ATR_PERIOD_BARS = 14

/** Confirmed swings reported per side (newest first). */
export const REPORTED_SWINGS_PER_SIDE = 3

export type HtfSwing = {
  price: number
  /** Bar start time, `YYYY-MM-DD HH:MM` chart time. */
  dateTime: string
}

export type HtfTrendState = 'up' | 'down' | 'range'

export type HtfStructureFacts = {
  barsAnalyzed: number
  /** First/last bar start times in the export (`YYYY-MM-DD HH:MM`). */
  windowStart: string
  windowEnd: string
  lastClose: number
  /** Wilder ATR over the last {@link ATR_PERIOD_BARS} 30-min bars, points (2 dp). */
  atrPoints: number
  trend: {
    state: HtfTrendState
    /** What the state was read from (swing sequence), for the briefing prose. */
    basis: string
  }
  /** Most recent CONFIRMED swing highs/lows, newest first (up to 3 each). */
  recentSwingHighs: HtfSwing[]
  recentSwingLows: HtfSwing[]
  /**
   * The current rotation: the span between the most recent confirmed swing
   * high and swing low. Null until one of each has printed.
   */
  rotation: {
    high: number
    low: number
    extentPts: number
    /** Extent in ATR multiples (1 dp) — how large this rotation is vs normal. */
    extentAtr: number
  } | null
  /**
   * Current price vs the latest swings, ATR-normalized — the trend-break vs
   * rotation-noise gauge for position evals. Null without a swing of that side.
   */
  currentVsSwings: {
    /** Signed points from the last swing high (positive = above it). */
    fromLastSwingHighPts: number | null
    fromLastSwingHighAtr: number | null
    /** Signed points from the last swing low (positive = above it). */
    fromLastSwingLowPts: number | null
    fromLastSwingLowAtr: number | null
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function fmtChartTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Wilder-smoothed ATR over the final {@link ATR_PERIOD_BARS} bars, seeded with
 * a simple average of the prior period (standard Wilder recurrence).
 */
export function computeAtr(bars: readonly HtfBar[], period: number = ATR_PERIOD_BARS): number {
  if (bars.length < 2) return 0
  const trs: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const prevClose = bars[i - 1].close
    trs.push(
      Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - prevClose),
        Math.abs(bars[i].low - prevClose),
      ),
    )
  }
  const p = Math.min(period, trs.length)
  let atr = trs.slice(0, p).reduce((a, b) => a + b, 0) / p
  for (let i = p; i < trs.length; i++) {
    atr = (atr * (p - 1) + trs[i]) / p
  }
  return round2(atr)
}

type Pivot = { index: number; price: number; dateTime: Date }

/**
 * Confirmed fractal pivots: a swing high's High strictly exceeds the Highs of
 * `strength` bars on BOTH sides (mirror for lows), so the last `strength` bars
 * — including the in-progress bar — can never carry an unconfirmed swing.
 */
function findPivots(
  bars: readonly HtfBar[],
  side: 'high' | 'low',
  strength: number,
): Pivot[] {
  const pivots: Pivot[] = []
  for (let i = strength; i < bars.length - strength; i++) {
    const v = side === 'high' ? bars[i].high : bars[i].low
    let isPivot = true
    for (let k = i - strength; k <= i + strength && isPivot; k++) {
      if (k === i) continue
      const other = side === 'high' ? bars[k].high : bars[k].low
      if (side === 'high' ? other >= v : other <= v) isPivot = false
    }
    if (isPivot) pivots.push({ index: i, price: v, dateTime: bars[i].dateTime })
  }
  return pivots
}

/**
 * @param bars chronological parsed export (oldest first, partial bar last).
 * @param currentPrice live price for the swing-distance read; falls back to
 *   the last bar's close when null.
 * @throws when `bars` is empty — callers gate on a non-empty parse.
 */
export function computeHtfStructure(
  bars: readonly HtfBar[],
  currentPrice: number | null,
): HtfStructureFacts {
  if (bars.length === 0) {
    throw new Error('HTF structure needs at least one bar')
  }

  const price =
    currentPrice !== null && Number.isFinite(currentPrice)
      ? currentPrice
      : bars[bars.length - 1].close

  const atrPoints = computeAtr(bars)

  const highs = findPivots(bars, 'high', SWING_PIVOT_STRENGTH)
  const lows = findPivots(bars, 'low', SWING_PIVOT_STRENGTH)

  const lastHigh = highs.at(-1) ?? null
  const prevHigh = highs.at(-2) ?? null
  const lastLow = lows.at(-1) ?? null
  const prevLow = lows.at(-2) ?? null

  let state: HtfTrendState = 'range'
  let basis = 'fewer than two confirmed swings per side — no readable sequence'
  if (lastHigh && prevHigh && lastLow && prevLow) {
    const higherHighs = lastHigh.price > prevHigh.price
    const higherLows = lastLow.price > prevLow.price
    const lowerHighs = lastHigh.price < prevHigh.price
    const lowerLows = lastLow.price < prevLow.price
    if (higherHighs && higherLows) {
      state = 'up'
      basis = 'higher swing highs and higher swing lows'
    } else if (lowerHighs && lowerLows) {
      state = 'down'
      basis = 'lower swing highs and lower swing lows'
    } else {
      state = 'range'
      basis = 'mixed swing sequence (no aligned higher/lower highs and lows)'
    }
  }

  const toSwing = (p: Pivot): HtfSwing => ({
    price: round2(p.price),
    dateTime: fmtChartTime(p.dateTime),
  })

  const rotation =
    lastHigh && lastLow
      ? {
          high: round2(lastHigh.price),
          low: round2(lastLow.price),
          extentPts: round2(lastHigh.price - lastLow.price),
          extentAtr: atrPoints > 0 ? round1((lastHigh.price - lastLow.price) / atrPoints) : 0,
        }
      : null

  const fromHighPts = lastHigh ? round2(price - lastHigh.price) : null
  const fromLowPts = lastLow ? round2(price - lastLow.price) : null

  return {
    barsAnalyzed: bars.length,
    windowStart: fmtChartTime(bars[0].dateTime),
    windowEnd: fmtChartTime(bars[bars.length - 1].dateTime),
    lastClose: round2(bars[bars.length - 1].close),
    atrPoints,
    trend: { state, basis },
    recentSwingHighs: highs.slice(-REPORTED_SWINGS_PER_SIDE).reverse().map(toSwing),
    recentSwingLows: lows.slice(-REPORTED_SWINGS_PER_SIDE).reverse().map(toSwing),
    rotation,
    currentVsSwings: {
      fromLastSwingHighPts: fromHighPts,
      fromLastSwingHighAtr:
        fromHighPts !== null && atrPoints > 0 ? round1(fromHighPts / atrPoints) : null,
      fromLastSwingLowPts: fromLowPts,
      fromLastSwingLowAtr:
        fromLowPts !== null && atrPoints > 0 ? round1(fromLowPts / atrPoints) : null,
    },
  }
}
