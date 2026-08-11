import type { HtfBar } from './parseHtfBars'
import {
  HTF_BAR_MINUTES,
  RTH_BARS_PER_SESSION,
  RTH_CLOSE_MINUTES,
  groupRthSessions,
  sessionOhlc,
} from './rthSessions'
import type { Ohlc } from './rthSessions'

/**
 * RTH session reconstruction moved to `rthSessions.ts` (feat-100) so the IB
 * extension distribution measures sessions the same way this module does; the
 * constants and `sessionOhlc` stay exported from here, unchanged, for the
 * callers that already import them.
 */
export { HTF_BAR_MINUTES, RTH_BARS_PER_SESSION, RTH_CLOSE_MINUTES, sessionOhlc }
export type { Ohlc }

/**
 * Code-owned volatility SCALE read (feat-095) — the engine's answer to "how
 * big is a point right now?".
 *
 * Bundle review 2026-08-07 §B6: `htfStructure.atrPoints` was the engine's only
 * scale measure, and every fixed-point gate in the system (the significant-move
 * floor, the entry standoff and chase gates) is quoted in raw points against a
 * regime that moves. Range-based estimators fix the measurement half of that:
 *
 * - **Parkinson** (high/low) — σ²ₚ = ln(H/L)² / (4·ln2)
 * - **Garman-Klass** (OHLC) — σ²_GK = ½·ln(H/L)² − (2·ln2 − 1)·ln(C/O)²
 *
 * Both are ~5x more statistically efficient per period than close-to-close
 * (they use the whole bar, not one point of it), and both need no new data —
 * the 30-min HTF export already carries OHLC.
 *
 * Each estimator is measured at TWO granularities over the same window, each
 * from the 30-min bars, and neither is scaled across time (no √t assumption —
 * intraday ranges rotate rather than compound, and scaling a 30-min sigma up
 * to a session overstates it by ~25% on this data):
 *
 * - **bar sigma** — the per-30-min-bar statistic, RMS-averaged over the window.
 * - **session sigma** — the same statistic applied to each RTH session's own
 *   OHLC (open of the first bar, session high/low, close of the last), then
 *   combined across sessions by {@link ewMeanSigma}. This is the headline
 *   {@link VolatilityScaleFacts.sessionSigmaPts}: how far this market normally
 *   travels in a day. The review measured a 283-pt median over the 61 RTH
 *   sessions reconstructed from bundle 1c15934a's own HTF export.
 *
 * **Why the session statistic is not an RMS (feat-112).** It was, through
 * feat-095: `√(mean σ²)` over a flat window, the textbook variance estimator.
 * That estimator assumes a stationary process and it is neither robust nor
 * recency-aware, so it failed on both counts at once. Backtested over the 60
 * RTH sessions in bundle b6f71b2e's own export — each estimator predicting the
 * NEXT session's realized sigma, 40 test points:
 *
 * ```
 *                        RMSE    bias   P(actual < predicted)
 * flat RMS, 10 sessions  153.4   +58.6        65%
 * median, 10 sessions    127.4    −6.9        50%
 * EW mean of sigma λ.75  133.9   +27.6        60%
 * ```
 *
 * The flat RMS was the WORST of the seventeen candidates swept: it overstated
 * the next session by 58 points on average and two thirds of sessions came in
 * under its forecast. Two compounding reasons, both fixed here:
 *
 * 1. **Squaring lets one day own the window.** RMS aggregates variance, so a
 *    single 898-pt session carries ~27x the weight of a 181-pt one. Merely
 *    exponentially weighting the *variance* could not undo that (it moved the
 *    live estimate 364 → 271 at λ=0.70); weighting SIGMA does.
 * 2. **A flat window cannot see a regime turn.** On 2026-08-11 the last three
 *    sessions ranged 445 / 296 / 181 pts and the engine's own `dailyRanges`
 *    read "contracting", while this module still reported 363.9 — a scale set
 *    by the late-July expansion (898 / 748 / 651 / 646 / 601-pt days). Every
 *    gate resolved against it, so the significant-move floor demanded 145.6 pts
 *    of reversal room on a market whose whole prior session travelled 181.
 *
 * So the session statistic is a RECENCY-WEIGHTED MEAN OF SIGMA. It is not the
 * lowest-RMSE candidate — the 10-session median is, and it is very nearly
 * unbiased — but the median is a flat window wearing a robust hat: it read
 * 352.8 on the same export, i.e. it does not turn either. Between an estimator
 * that is best on average over a mixed sample and one that tracks the regime
 * the operator is actually trading, this takes the second and accepts ~+27 pts
 * of residual conservatism.
 *
 * With one scale number, a point distance also reads as a fraction of a
 * session's normal excursion: 29 pts is "0.10σ — inside the noise", not a
 * meaningful gap. Points are never replaced — every distance here reports
 * BOTH ({@link SigmaDistance}), because the operator's map, the MGI levels and
 * every prompt still speak points.
 *
 * Notes:
 * - Both estimators assume zero drift and are computed in LOG space, then
 *   converted to points at {@link VolatilityScaleFacts.referencePrice} (the
 *   live price), so the number is quoted at today's price level.
 * - On synthetic bars where Close == Open, Garman-Klass reads ~1.18x Parkinson
 *   in sigma (½ vs 1/(4·ln2) on the same range term). That is the formula, not
 *   a bug — the two converge on real bars, where the close-open term bites.
 * - Only COMPLETE RTH sessions feed the window ({@link RTH_BARS_PER_SESSION}
 *   bars or more): the in-progress session has a truncated range and would
 *   deflate the scale, and folding in the much quieter overnight bars would
 *   deflate it further.
 */

/**
 * RTH sessions the estimate is measured over — ~two trading weeks. Long enough
 * that a single wild session cannot set the scale, short enough to track a
 * regime change (the review's 20-session range history runs 445–748 pts).
 */
export const SIGMA_ESTIMATION_SESSIONS = 10

/**
 * Minimum COMPLETE RTH sessions before a sigma is reported at all. Below this
 * the estimate is one or two days of weather, not a regime, and the fact
 * degrades to null.
 */
export const MIN_SIGMA_ESTIMATION_SESSIONS = 3

/**
 * Per-session decay for {@link ewMeanSigma}: the newest session weighs 1 and
 * each older one `0.75^age`, so the last three sessions carry 55% of the weight
 * and the last five 68%.
 *
 * Chosen for the turn rate, not for RMSE — the sweep in the module doc is flat
 * across 0.60–0.90 (RMSE 133 ± 3), so this end of the range costs nothing
 * measurable and buys responsiveness. λ=0.75 has a ~2.4-session half-life,
 * which is the shortest memory that still spans a long weekend without letting
 * one quiet Friday set Monday's scale.
 *
 * The window is deliberately NOT widened to match: 1 − 0.75¹⁰ = 94.4% of the
 * total weight already falls inside {@link SIGMA_ESTIMATION_SESSIONS}, and
 * running the same estimator unbounded moved the live number 257.45 → 259.61
 * (0.8%). Ten sessions stays the one window every statistic here is measured
 * over — the medians and the bar sigma included.
 */
export const SESSION_SIGMA_DECAY = 0.75

/** Parkinson's variance scaling: 1 / (4·ln2). */
export const PARKINSON_VARIANCE_SCALING = 1 / (4 * Math.LN2)

/** Garman-Klass's range coefficient. */
export const GARMAN_KLASS_RANGE_COEFF = 0.5

/** Garman-Klass's close/open coefficient: 2·ln2 − 1. */
export const GARMAN_KLASS_CLOSE_OPEN_COEFF = 2 * Math.LN2 - 1

/**
 * Sigma bands for a distance to structure. A move under
 * {@link SIGMA_NOISE_MAX} of a session sigma is inside the session's normal
 * excursion — it is not, on its own, a gap worth planning around.
 */
export const SIGMA_NOISE_MAX = 0.25
export const SIGMA_MINOR_MAX = 0.5
export const SIGMA_MEANINGFUL_MAX = 1

export type SigmaBand = 'noise' | 'minor' | 'meaningful' | 'large'

/** A structural price the distance read is taken against. */
export type StructureReference = {
  /** Human label for the prompt, e.g. "PDH (nearest Tier-1 above)". */
  label: string
  price: number
}

/** One distance to structure, reported in points AND in session sigma. */
export type SigmaDistance = {
  label: string
  price: number
  /** Signed points from the reference price (positive = structure is above). */
  pts: number
  /** |pts| / sessionSigmaPts, 2 dp. */
  sigma: number
  band: SigmaBand
}

/** One estimator, measured at both granularities and converted to points. */
export type EstimatorScale = {
  /** Sigma of one 30-min bar, points — RMS over the window's bars. */
  barSigmaPts: number
  /**
   * Sigma of one RTH session, points — the window's per-session sigmas
   * combined by {@link ewMeanSigma}, so recent sessions dominate.
   */
  sessionSigmaPts: number
}

export type VolatilityScaleFacts = {
  /** RTH bars in the estimation window. */
  barsAnalyzed: number
  /** Complete RTH sessions in the estimation window. */
  sessionsAnalyzed: number
  /** First/last bar start times of the window (`YYYY-MM-DD HH:MM` chart time). */
  windowStart: string
  windowEnd: string
  barMinutes: number
  barsPerSession: number
  /** Price the log-space sigma was converted to points at. */
  referencePrice: number
  /**
   * The engine's scale number: one RTH session's Parkinson sigma, in points,
   * recency-weighted across the window ({@link SESSION_SIGMA_DECAY}). Every
   * sigma-normalized distance below divides by this, and every scaled gate in
   * `scaledGates.ts` resolves against it.
   */
  sessionSigmaPts: number
  /** Which estimator {@link VolatilityScaleFacts.sessionSigmaPts} came from. */
  estimator: 'parkinson'
  parkinson: EstimatorScale
  garmanKlass: EstimatorScale
  /** Median 30-min RTH bar range in the window, points — the plain-language scale. */
  medianBarRangePts: number
  /** Median RTH session range in the window, points. */
  medianSessionRangePts: number
  /**
   * Distance from the reference price to each supplied structural price, in
   * points AND session sigma. Empty when the caller supplied no structure.
   */
  distancesToStructure: SigmaDistance[]
}

export interface VolatilityScaleInput {
  /** Chronological parsed HTF export (oldest first, partial bar last). */
  bars: readonly HtfBar[]
  /** Live price; falls back to the last bar's close when null/non-finite. */
  currentPrice: number | null
  /** Structural prices to sigma-normalize the distance to. */
  structure?: readonly StructureReference[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function fmtChartTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Parkinson variance for one period in LOG space: ln(H/L)² / (4·ln2).
 * Returns 0 for a non-positive or degenerate period (never NaN — a single bad
 * row must not poison the window mean).
 */
export function parkinsonVariance(period: Pick<Ohlc, 'high' | 'low'>): number {
  if (!(period.high > 0) || !(period.low > 0) || period.high < period.low) return 0
  const u = Math.log(period.high / period.low)
  return u * u * PARKINSON_VARIANCE_SCALING
}

/**
 * Garman-Klass variance for one period in LOG space:
 * ½·ln(H/L)² − (2·ln2 − 1)·ln(C/O)².
 * Mathematically non-negative (|ln(C/O)| ≤ ln(H/L) for any well-formed
 * period); clamped anyway so a drifted export cannot produce a negative one.
 */
export function garmanKlassVariance(period: Ohlc): number {
  if (
    !(period.high > 0) ||
    !(period.low > 0) ||
    !(period.open > 0) ||
    !(period.close > 0) ||
    period.high < period.low
  ) {
    return 0
  }
  const u = Math.log(period.high / period.low)
  const c = Math.log(period.close / period.open)
  return Math.max(0, GARMAN_KLASS_RANGE_COEFF * u * u - GARMAN_KLASS_CLOSE_OPEN_COEFF * c * c)
}

/**
 * Recency-weighted mean of per-period SIGMA — the session aggregator (feat-112).
 *
 * Weights are `decay^age` with age 0 on the LAST element, so `sigmas` must be
 * chronological (oldest first) exactly like the session window itself. The
 * weights are normalized by their own sum, so a short window is not silently
 * deflated and the function is scale-free in `decay`.
 *
 * Averaging SIGMA rather than variance is the point, not an implementation
 * detail: it is what keeps one outsized session from owning the estimate. See
 * the module doc for the backtest that chose it.
 *
 * @param sigmas Per-period sigma, chronological. Empty → 0 (no scale).
 * @param decay  Per-period weight ratio; defaults to {@link SESSION_SIGMA_DECAY}.
 */
export function ewMeanSigma(
  sigmas: readonly number[],
  decay: number = SESSION_SIGMA_DECAY,
): number {
  let weighted = 0
  let totalWeight = 0
  for (let i = 0; i < sigmas.length; i++) {
    const weight = decay ** (sigmas.length - 1 - i)
    weighted += weight * sigmas[i]
    totalWeight += weight
  }
  return totalWeight > 0 ? weighted / totalWeight : 0
}

/** Which band a sigma multiple falls in. Bounds are inclusive of the max. */
export function classifySigmaDistance(sigma: number): SigmaBand {
  const abs = Math.abs(sigma)
  if (abs <= SIGMA_NOISE_MAX) return 'noise'
  if (abs <= SIGMA_MINOR_MAX) return 'minor'
  if (abs <= SIGMA_MEANINGFUL_MAX) return 'meaningful'
  return 'large'
}

/**
 * Point distance → session-sigma multiple (2 dp). Null when there is no usable
 * scale, so callers degrade to points rather than dividing by zero.
 */
export function sigmaOfPoints(
  points: number,
  scale: Pick<VolatilityScaleFacts, 'sessionSigmaPts'> | null,
): number | null {
  if (scale === null || !(scale.sessionSigmaPts > 0) || !Number.isFinite(points)) return null
  return round2(points / scale.sessionSigmaPts)
}

/**
 * Session-sigma multiple → points (2 dp) — the inverse of
 * {@link sigmaOfPoints}. This is the resolver a sigma-expressed gate uses to
 * quote its live point value (feat-096). Null when there is no usable scale.
 */
export function pointsForSigma(
  sigmaMultiple: number,
  scale: Pick<VolatilityScaleFacts, 'sessionSigmaPts'> | null,
): number | null {
  if (scale === null || !(scale.sessionSigmaPts > 0) || !Number.isFinite(sigmaMultiple)) {
    return null
  }
  return round2(sigmaMultiple * scale.sessionSigmaPts)
}

/**
 * A structural price rendered in points AND sigma from `referencePrice`.
 * Exported so callers with structure the engine pass did not supply (an eval's
 * entry level, a stop excursion) get the identical treatment.
 */
export function sigmaDistanceTo(
  reference: StructureReference,
  referencePrice: number,
  sessionSigmaPts: number,
): SigmaDistance {
  const pts = round2(reference.price - referencePrice)
  const sigma = sessionSigmaPts > 0 ? round2(Math.abs(pts) / sessionSigmaPts) : 0
  return {
    label: reference.label,
    price: round2(reference.price),
    pts,
    sigma,
    band: classifySigmaDistance(sigma),
  }
}

/**
 * @returns null when the export holds fewer than
 *   {@link MIN_SIGMA_ESTIMATION_SESSIONS} COMPLETE RTH sessions — an
 *   unmeasurable regime; callers degrade with a warning instead of quoting a
 *   fabricated scale.
 * @throws when `bars` is empty — callers gate on a non-empty parse.
 */
export function computeVolatilityScale(
  input: VolatilityScaleInput,
): VolatilityScaleFacts | null {
  const { bars, currentPrice, structure = [] } = input
  if (bars.length === 0) {
    throw new Error('volatility scale needs at least one bar')
  }

  // Complete sessions only: the in-progress day (and any early close) carries a
  // truncated range that would understate the scale exactly when it is quoted.
  const sessions = groupRthSessions(bars)
    .filter((session) => session.complete)
    .slice(-SIGMA_ESTIMATION_SESSIONS)
  if (sessions.length < MIN_SIGMA_ESTIMATION_SESSIONS) return null

  const sessionBars = sessions.map((session) => session.bars)
  const windowBars = sessionBars.flat()

  const referencePrice =
    currentPrice !== null && Number.isFinite(currentPrice) && currentPrice > 0
      ? currentPrice
      : bars[bars.length - 1].close

  /** RMS of a per-BAR variance over the window, in points at the live price. */
  const barSigmaPts = (variances: number[]): number =>
    round2(
      Math.sqrt(variances.reduce((a, b) => a + b, 0) / variances.length) * referencePrice,
    )

  /**
   * Per-SESSION variances → the recency-weighted sigma, in points at the live
   * price. Sessions are chronological, which is what {@link ewMeanSigma} needs.
   */
  const sessionSigmaPtsOf = (variances: number[]): number =>
    round2(ewMeanSigma(variances.map(Math.sqrt)) * referencePrice)

  const sessionPeriods = sessionBars.map(sessionOhlc)
  const parkinson: EstimatorScale = {
    barSigmaPts: barSigmaPts(windowBars.map(parkinsonVariance)),
    sessionSigmaPts: sessionSigmaPtsOf(sessionPeriods.map(parkinsonVariance)),
  }
  const garmanKlass: EstimatorScale = {
    barSigmaPts: barSigmaPts(windowBars.map(garmanKlassVariance)),
    sessionSigmaPts: sessionSigmaPtsOf(sessionPeriods.map(garmanKlassVariance)),
  }

  const sessionSigmaPts = parkinson.sessionSigmaPts

  return {
    barsAnalyzed: windowBars.length,
    sessionsAnalyzed: sessions.length,
    windowStart: fmtChartTime(windowBars[0].dateTime),
    windowEnd: fmtChartTime(windowBars[windowBars.length - 1].dateTime),
    barMinutes: HTF_BAR_MINUTES,
    barsPerSession: RTH_BARS_PER_SESSION,
    referencePrice: round2(referencePrice),
    sessionSigmaPts,
    estimator: 'parkinson',
    parkinson,
    garmanKlass,
    medianBarRangePts: round2(median(windowBars.map((b) => b.high - b.low))),
    medianSessionRangePts: round2(median(sessionPeriods.map((s) => s.high - s.low))),
    distancesToStructure: structure.map((reference) =>
      sigmaDistanceTo(reference, referencePrice, sessionSigmaPts),
    ),
  }
}
