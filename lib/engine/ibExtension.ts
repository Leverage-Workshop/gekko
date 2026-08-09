import type { HtfBar } from './parseHtfBars'
import { HTF_BAR_MINUTES, groupRthSessions } from './rthSessions'
import type { RthSession } from './rthSessions'
import {
  IB_MINUTES,
  PINNED_IB_EXTENSION_DISTRIBUTION,
  extensionBand,
} from './tpoDayType'
import type { IbExtensionBand, IbExtensionDistribution } from './tpoDayType'

/**
 * Initial-Balance → day-range extension distribution (feat-100, bundle review
 * 2026-08-07 §B7) — classic Market Profile made empirical from data already in
 * every bundle.
 *
 * The doctrine's day-structure reads all hang off one question: having built
 * the first hour's Initial Balance, how much further does the session go? The
 * textbook answer ("a normal day is the IB holding") is not what this market
 * does — the review measured only 4% of sessions with no extension at all, and
 * a median day range of 1.52 IBs. feat-093 cut its day-type ladder at those
 * measured quantiles but had to PIN them as constants, because the daily
 * value-area history carries no Initial Balance. This module measures them
 * live, per bundle, by rebuilding the sessions from the 30-min HTF bars
 * (`rthSessions.ts`, shared with feat-095's volatility scale).
 *
 * Two payoffs, both of which need the sample size quoted next to every quantile
 * (the review is explicit about that — a quantile without its n is theatre):
 *
 * 1. **Target rungs get a distribution to sit on.** The quantiles are projected
 *    from the LIVE IB into prices ({@link IbExtensionProjection}), so a briefing
 *    can say "p75 of sessions extend to 29891 from this IB" instead of an
 *    impression. The projection is DIRECTIONAL — measured one-sided extension
 *    beyond the IB edge, not the day range re-anchored — because 79% of
 *    measured sessions extend one side only, and the review's own worked
 *    example is that number.
 * 2. **feat-093's classifier gets empirical thresholds.** `computeEngineFacts`
 *    passes {@link IbExtensionFacts.distribution} straight into
 *    `classifyTpoDay`, whose seam was built for exactly this — no classifier
 *    change, and the emitted fact says which distribution judged the session.
 *
 * When the export holds too little history the distribution falls back to the
 * review's pinned sample and says so ({@link IbExtensionFacts.fallbackReason}),
 * rather than cutting a trend threshold at a p90 estimated from two sessions.
 */

/**
 * The Initial Balance is the session's FIRST HOUR — Market Profile's
 * definition, shared with feat-093's `IB_MINUTES` so the two modules cannot
 * drift on what "IB" means. At the HTF export's 30-min bars that is the first
 * two bars of the RTH session (08:30 and 09:00 CT).
 */
export const IB_BARS = IB_MINUTES / HTF_BAR_MINUTES

/**
 * Complete RTH sessions required before the LIVE distribution is trusted over
 * the review's pinned one. Roughly one trading month.
 *
 * Chosen for the quantile the day-type ladder cuts hardest at: the p90 that
 * separates a trend day from an ordinary variation. At n = 20 that p90 is
 * interpolated between the 2nd and 3rd largest observations, so one wild
 * session cannot set the trend threshold by itself; below ~15 the p90 IS
 * essentially the sample maximum, which would make "trend day" mean "the
 * biggest day in the window". feat-095's `MIN_SIGMA_ESTIMATION_SESSIONS = 3` is
 * the precedent for the pattern, not the number — a mean over 3 sessions is a
 * usable scale, a top decile over 3 sessions is not a decile.
 *
 * The rolling-90-day HTF export carries ~60 complete RTH sessions, so live
 * bundles clear this comfortably; it binds only on a freshly-started export.
 */
export const MIN_IB_DISTRIBUTION_SESSIONS = 20

/**
 * The quantiles projected into prices. p25 is deliberately absent: a quarter of
 * sessions never extend past the IB at all, so the p25 one-sided extension is
 * 0.00 on real data and projects to the IB edge itself — a rung that says
 * nothing. The ratio quantiles below still report p25, because that is the cut
 * feat-093's `normal` day type uses.
 */
export const PROJECTED_QUANTILES = ['median', 'p75', 'p90'] as const

export type ProjectedQuantile = (typeof PROJECTED_QUANTILES)[number]

/**
 * Review B7's measured one-sided extension, as a multiple of the IB range:
 * "upside extension as a multiple of IB: median 0.15 | p90 0.76". Only those
 * two quantiles were published and only for the upside, so a pinned projection
 * emits exactly those — inventing a p75 or a downside quantile nobody measured
 * would be the fabrication this whole feature exists to remove.
 */
export const PINNED_EXTENSION_QUANTILES: ExtensionQuantiles = {
  up: { median: 0.15, p90: 0.76 },
  down: {},
}

/**
 * One side's extension quantiles, as multiples of the IB range. A quantile the
 * sample cannot support is ABSENT rather than null — it costs the prompt
 * nothing and cannot be mistaken for a measured zero.
 */
export type SideQuantiles = Partial<Record<ProjectedQuantile, number>>

export type ExtensionQuantiles = { up: SideQuantiles; down: SideQuantiles }

/** One quantile projected from the live IB into a price. */
export type IbExtensionProjection = {
  q: ProjectedQuantile
  /** Extension beyond the IB edge at this quantile, as a multiple of the IB range. */
  mult: number
  /** The price that extension reaches from the live IB edge. */
  price: number
  /** True when the session has already extended this far on this side. */
  reached: boolean
}

/** The live session's own IB and how far it has extended so far. */
export type LiveIbExtension = {
  /** Trading day of the session the IB was taken from. */
  date: string
  /** False while the session is still in progress — `ratio` can only grow. */
  complete: boolean
  ibHigh: number
  ibLow: number
  ibRangePts: number
  /** Session range so far, points. */
  rangePts: number
  /** `rangePts / ibRangePts` — the B7 statistic for this session. */
  ratio: number
  /** Where `ratio` sits in `distribution`, on the same cuts feat-093 uses. */
  band: IbExtensionBand
  /** Points extended above the IB high / below the IB low so far. */
  upPts: number
  downPts: number
}

export type IbExtensionFacts = {
  /** The IB definition in force: the first hour = the first two 30-min bars. */
  ibMinutes: number
  ibBars: number
  /** COMPLETE RTH sessions the live measurement had available. */
  sessionsAnalyzed: number
  /** Trading days spanned by those sessions (`YYYY-MM-DD`). */
  windowStart: string | null
  windowEnd: string | null
  /**
   * The distribution the session is banded against and feat-093's classifier is
   * cut from — `source: 'measured'` when this export carried enough history,
   * `'pinned-empirical'` (the review's n=62 sample) otherwise. `sampleSize` is
   * the n behind ITS quantiles, which is not `sessionsAnalyzed` on a fallback.
   */
  distribution: IbExtensionDistribution
  /** Why the pinned distribution is in force, or null when the live one is. */
  fallbackReason: string | null
  /** One-sided extension quantiles, as multiples of the IB range, per side. */
  extensionQuantiles: ExtensionQuantiles
  /** The live session's IB and extension so far; null before the IB completes. */
  session: LiveIbExtension | null
  /** `extensionQuantiles` projected from the live IB into prices, above the IB high. */
  upProjections: IbExtensionProjection[]
  /** …and below the IB low. */
  downProjections: IbExtensionProjection[]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Linear-interpolated quantile of an ASCENDING sample (the R-7 / NumPy default
 * — the same convention the review's numbers were produced with).
 */
export function quantile(ascending: readonly number[], p: number): number {
  const k = (ascending.length - 1) * p
  const lo = Math.floor(k)
  const hi = Math.ceil(k)
  if (lo === hi) return ascending[lo]
  return ascending[lo] + (ascending[hi] - ascending[lo]) * (k - lo)
}

/** One session's IB, range and one-sided extensions, in raw (unrounded) points. */
type SessionMeasure = {
  date: string
  complete: boolean
  ibHigh: number
  ibLow: number
  ibRange: number
  high: number
  low: number
  range: number
  /** Points beyond the IB edge; 0 when that side never extended. */
  up: number
  down: number
  /** `range / ibRange`. */
  ratio: number
}

/**
 * Measure one reconstructed RTH session against its own Initial Balance.
 * Null when the session is shorter than the IB itself, or when the IB is a
 * single price (a zero-width IB makes every ratio infinite).
 */
export function measureSession(session: RthSession): SessionMeasure | null {
  const { bars } = session
  if (bars.length < IB_BARS) return null
  const ibBars = bars.slice(0, IB_BARS)
  const ibHigh = Math.max(...ibBars.map((b) => b.high))
  const ibLow = Math.min(...ibBars.map((b) => b.low))
  const ibRange = ibHigh - ibLow
  if (!(ibRange > 0)) return null
  const high = Math.max(...bars.map((b) => b.high))
  const low = Math.min(...bars.map((b) => b.low))
  return {
    date: session.date,
    complete: session.complete,
    ibHigh,
    ibLow,
    ibRange,
    high,
    low,
    range: high - low,
    up: Math.max(0, high - ibHigh),
    down: Math.max(0, ibLow - low),
    ratio: (high - low) / ibRange,
  }
}

/**
 * The measured distribution over a set of COMPLETE sessions, plus the
 * directional quantiles the projections are built from. Callers gate on the
 * sample size themselves — this function reports what the sample says.
 */
function measureDistribution(measures: SessionMeasure[]): {
  distribution: IbExtensionDistribution
  extensionQuantiles: ExtensionQuantiles
} {
  const ratios = measures.map((m) => m.ratio).sort((a, b) => a - b)
  const ups = measures.map((m) => m.up / m.ibRange).sort((a, b) => a - b)
  const downs = measures.map((m) => m.down / m.ibRange).sort((a, b) => a - b)
  const sides = { none: 0, oneSided: 0, bothSides: 0 }
  for (const m of measures) {
    const up = m.up > 0
    const down = m.down > 0
    if (up && down) sides.bothSides += 1
    else if (up || down) sides.oneSided += 1
    else sides.none += 1
  }
  const share = (n: number) => round2(n / measures.length)
  const side = (sorted: number[]): SideQuantiles => ({
    median: round2(quantile(sorted, 0.5)),
    p75: round2(quantile(sorted, 0.75)),
    p90: round2(quantile(sorted, 0.9)),
  })
  return {
    distribution: {
      source: 'measured',
      sampleSize: measures.length,
      p25: round2(quantile(ratios, 0.25)),
      median: round2(quantile(ratios, 0.5)),
      p75: round2(quantile(ratios, 0.75)),
      p90: round2(quantile(ratios, 0.9)),
      max: round2(ratios[ratios.length - 1]),
      sides: {
        none: share(sides.none),
        oneSided: share(sides.oneSided),
        bothSides: share(sides.bothSides),
      },
    },
    extensionQuantiles: { up: side(ups), down: side(downs) },
  }
}

/** Project one side's quantiles from the live IB edge into prices. */
function project(
  quantiles: SideQuantiles,
  edge: number,
  direction: 'up' | 'down',
  ibRange: number,
  reachedPts: number,
): IbExtensionProjection[] {
  return PROJECTED_QUANTILES.flatMap((q) => {
    const mult = quantiles[q]
    // A zero-extension quantile projects to the IB edge itself — that is not a
    // rung, it is the statement that most sessions never extend this side, and
    // `extensionQuantiles` already carries it.
    if (mult === undefined || !Number.isFinite(mult) || mult <= 0) return []
    const pts = mult * ibRange
    return [
      {
        q,
        mult: round2(mult),
        price: round2(direction === 'up' ? edge + pts : edge - pts),
        reached: reachedPts >= pts,
      },
    ]
  })
}

export interface IbExtensionInput {
  /** Chronological parsed HTF export (oldest first, partial bar last). */
  bars: readonly HtfBar[]
}

/**
 * The IB→day-range extension read for one bundle.
 *
 * @returns null when the export holds no RTH bars at all — there is then
 *   neither a history to measure nor a live IB to project from, and the caller
 *   degrades with a warning rather than quoting the pinned distribution against
 *   nothing.
 */
export function computeIbExtension(input: IbExtensionInput): IbExtensionFacts | null {
  const sessions = groupRthSessions(input.bars)
  if (sessions.length === 0) return null

  // Complete sessions only (feat-095's hard-won rule): an in-progress or
  // early-close session has a truncated range, and a truncated range deflates
  // the very ratio being quoted.
  const history = sessions
    .filter((session) => session.complete)
    .map(measureSession)
    .filter((m): m is SessionMeasure => m !== null)

  const enough = history.length >= MIN_IB_DISTRIBUTION_SESSIONS
  const measured = history.length > 0 ? measureDistribution(history) : null
  const distribution =
    enough && measured ? measured.distribution : PINNED_IB_EXTENSION_DISTRIBUTION
  const extensionQuantiles =
    enough && measured ? measured.extensionQuantiles : PINNED_EXTENSION_QUANTILES
  const fallbackReason = enough
    ? null
    : `only ${history.length} complete RTH session${history.length === 1 ? '' : 's'} in this export (need ${MIN_IB_DISTRIBUTION_SESSIONS}) — using the review's pinned n=${PINNED_IB_EXTENSION_DISTRIBUTION.sampleSize} sample`

  // The live session is the last one in the export, in progress or not: its IB
  // is what every projection is anchored on.
  const live = measureSession(sessions[sessions.length - 1])

  return {
    ibMinutes: IB_MINUTES,
    ibBars: IB_BARS,
    sessionsAnalyzed: history.length,
    windowStart: history[0]?.date ?? null,
    windowEnd: history[history.length - 1]?.date ?? null,
    distribution,
    fallbackReason,
    extensionQuantiles,
    session:
      live === null
        ? null
        : {
            date: live.date,
            complete: live.complete,
            ibHigh: round2(live.ibHigh),
            ibLow: round2(live.ibLow),
            ibRangePts: round2(live.ibRange),
            rangePts: round2(live.range),
            ratio: round2(live.ratio),
            band: extensionBand(round2(live.ratio), distribution),
            upPts: round2(live.up),
            downPts: round2(live.down),
          },
    upProjections:
      live === null
        ? []
        : project(extensionQuantiles.up, live.ibHigh, 'up', live.ibRange, live.up),
    downProjections:
      live === null
        ? []
        : project(extensionQuantiles.down, live.ibLow, 'down', live.ibRange, live.down),
  }
}

/** Re-exported so callers need one import for the shape they pass on. */
export type { IbExtensionDistribution }
