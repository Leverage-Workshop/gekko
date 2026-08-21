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

/**
 * A counter-move retracing more than this fraction of the defining rotation
 * puts the trend 'under-test' (feat-064). Confirmed pivots lag by
 * {@link SWING_PIVOT_STRENGTH} bars (2.5 h), so without this qualifier a fast
 * V-reversal leaves the state frozen — the 2026-07-29 incident: "down" while
 * price had retraced ~95% of the rotation and sat 30 pts under the swing high.
 */
export const UNDER_TEST_RETRACE_FRACTION = 0.5

/** One NQ tick — price beyond the defining swing by more than this breaks the sequence. */
const PRICE_EPSILON = 0.25

export type HtfSwing = {
  price: number
  /** Bar start time, `YYYY-MM-DD HH:MM` chart time. */
  dateTime: string
}

export type HtfTrendState = 'up' | 'down' | 'range'

/**
 * How the confirmed swing sequence squares with the CURRENT price (feat-064):
 * 'broken' — price has traded through the defining swing (above the last swing
 * high in a downtrend / below the last swing low in an uptrend); the sequence
 * is invalidated in real time even though new pivots haven't confirmed.
 * 'under-test' — the counter-move has retraced more than
 * {@link UNDER_TEST_RETRACE_FRACTION} of the defining rotation.
 * 'intact' — the counter-move is inside normal rotation.
 */
export type HtfTrendIntegrity = 'intact' | 'under-test' | 'broken'

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
    /**
     * Real-time qualifier on the lagging swing state (feat-064). Null when the
     * state is 'range' (no directional sequence to qualify) or swings are
     * missing. A directional state must NEVER be narrated without it.
     */
    integrity: HtfTrendIntegrity | null
    /** What the integrity was read from, for the briefing prose. */
    integrityBasis: string | null
  }
  /** Most recent CONFIRMED swing highs/lows, newest first (up to 3 each). */
  recentSwingHighs: HtfSwing[]
  recentSwingLows: HtfSwing[]
  /**
   * The defining rotation: the span between the most recent confirmed swing
   * high and swing low. Null until one of each has printed.
   *
   * Each leg carries its bar time (feat-117) because "most recent CONFIRMED"
   * is not the same as "current" — pivots lag {@link SWING_PIVOT_STRENGTH} bars
   * and the two legs need not come from the same session. Consumers must date
   * the rotation rather than presenting it as the live range; the 2026-08-21
   * briefing called a 13-hour-old 78-pt band "the current rotation" while the
   * session had traded 29220–29539.
   */
  rotation: {
    high: number
    /** Bar start time of the swing-high leg, `YYYY-MM-DD HH:MM` chart time. */
    highDateTime: string
    low: number
    /** Bar start time of the swing-low leg, `YYYY-MM-DD HH:MM` chart time. */
    lowDateTime: string
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

/** A confirmed fractal pivot: its bar index in the series, price and bar time. */
export type Pivot = { index: number; price: number; dateTime: Date }

/**
 * The minimal bar shape the pivot finder reads. Both the 30-min HTF bars and
 * the exec volume bars satisfy it, so `intradayTrend` shares this finder
 * instead of keeping a private copy that can drift (feat-117).
 */
export type PivotBar = { dateTime: Date; high: number; low: number }

/**
 * Confirmed fractal pivots: a swing high's High exceeds the Highs of `strength`
 * bars on BOTH sides (mirror for lows), so the last `strength` bars — including
 * the in-progress bar — can never carry an unconfirmed swing.
 *
 * The tie rule is ASYMMETRIC (feat-117): strictly above the left window, at or
 * above the right one, so the EARLIEST bar of an equal-extreme cluster is the
 * pivot. A symmetric strict rule annihilates BOTH halves of a double top — each
 * tied bar disqualifies the other and neither confirms. The 2026-08-21
 * incident: the session high 29539.00 printed twice (06:30 and 07:30, four bars
 * apart, at the ONH), so no swing high from that session confirmed at all, the
 * sequence read 'range', and 'range' switches off the {@link HtfTrendIntegrity}
 * qualifier that exists to square a lagging swing read against live price. The
 * briefing narrated a 13-hour-old 78-pt band as "the current rotation" while
 * the session had already traded 29220–29539. Taking the earliest of a tie also
 * confirms SOONEST, which matters for a read that already lags `strength` bars.
 *
 * Exported (feat-102) so the HTF order-flow read annotates the SAME swings this
 * module reports rather than re-implementing pivot detection with rules that
 * can drift — the single-definition precedent `rthSessions.ts` records for
 * "one RTH session".
 */
export function findPivots(
  bars: readonly PivotBar[],
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
      // Left window: ties lose. Right window: ties are tolerated, so an equal
      // extreme later in the cluster cannot cancel this one.
      const disqualifies =
        k < i
          ? side === 'high'
            ? other >= v
            : other <= v
          : side === 'high'
            ? other > v
            : other < v
      if (disqualifies) isPivot = false
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

  // Integrity (feat-064): square the lagging swing state with the live price.
  // A 'down' call means nothing when price has already traded through the
  // defining swing high — pivots need 2.5 h to confirm; the price doesn't.
  let integrity: HtfTrendIntegrity | null = null
  let integrityBasis: string | null = null
  if ((state === 'down' || state === 'up') && lastHigh && lastLow) {
    const extent = lastHigh.price - lastLow.price
    const counterMovePts = state === 'down' ? price - lastLow.price : lastHigh.price - price
    // Price extending WITH the trend (beyond the defining extreme) clamps to 0.
    const retrace = extent > 0 ? Math.max(0, counterMovePts / extent) : 0
    const retracePct = Math.round(retrace * 100)
    const brokeDefiningSwing =
      state === 'down'
        ? price > lastHigh.price + PRICE_EPSILON
        : price < lastLow.price - PRICE_EPSILON
    if (brokeDefiningSwing) {
      integrity = 'broken'
      integrityBasis =
        state === 'down'
          ? `price ${round2(price)} has traded above the ${round2(lastHigh.price)} defining swing high — the down sequence is broken in real time, pending new swing confirmation`
          : `price ${round2(price)} has traded below the ${round2(lastLow.price)} defining swing low — the up sequence is broken in real time, pending new swing confirmation`
    } else if (retrace > UNDER_TEST_RETRACE_FRACTION) {
      integrity = 'under-test'
      integrityBasis = `the counter-move has retraced ~${retracePct}% of the ${round2(extent)}-pt defining rotation (${round2(lastLow.price)}–${round2(lastHigh.price)})`
    } else {
      integrity = 'intact'
      integrityBasis = `the counter-move has retraced only ~${retracePct}% of the defining rotation`
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
          highDateTime: fmtChartTime(lastHigh.dateTime),
          low: round2(lastLow.price),
          lowDateTime: fmtChartTime(lastLow.dateTime),
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
    trend: { state, basis, integrity, integrityBasis },
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
