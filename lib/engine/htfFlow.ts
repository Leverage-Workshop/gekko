import type { HtfBar } from './parseHtfBars'
import { REPORTED_SWINGS_PER_SIDE, SWING_PIVOT_STRENGTH, findPivots } from './htfStructure'
import type { Pivot } from './htfStructure'
import { HTF_BAR_MINUTES, groupRthSessions, sessionOhlc } from './rthSessions'

/**
 * Code-owned HTF order-flow read (feat-102) — cumulative delta and swing-level
 * flow annotation on the 30-min planning-chart bars, the exact analogue of what
 * `barFlow.ts` computes on the execution timeframe.
 *
 * WHY this exists: `parseHtfBars` has always produced `volume`, `bidVolume`,
 * `askVolume` and a per-bar `delta`, and every consumer of that export
 * (`htfStructure`, `multiDayTpo`, `overnightSession`, `relativeVolume`'s price
 * legs) read OHLC and nothing else — 87 days of 30-min order flow parsed,
 * typed and feeding nothing (bundle review 2026-08-07, findings B5/D4).
 * `htfStructure` locates the confirmed swings from OHLC and stops there while
 * the delta at those very bars sits in the same rows. This module reads them.
 *
 * WHAT IT IS NOT — read this before using the output. Two negative results,
 * both measured, both binding on this module:
 *
 * 1. **Divergence has no empirical support and is NOT shipped to the model.**
 *    A 2026-08-07 delta-intensity review tested DAY-LEVEL HTF delta divergence
 *    as a fade signal and rejected it (slight CONTINUATION bias — the opposite
 *    of the fade thesis). A 2026-08-12 base-rate control study then replicated
 *    that at SWING level over 3,559 union'd HTF bars (78 trading days, 6x this
 *    repo's fixture): across 89 divergent swings the fade thesis UNDERPERFORMED
 *    the unconditional base rate by 6.7 / 5.6 / 6.7 / 11.3 pp at 4 / 8 / 16 / 34
 *    bars ahead; every 95% CI contained the base rate; nothing survived Holm
 *    correction; and holding "fresh price extreme" fixed, the delta's own
 *    contribution flipped sign between horizons. {@link HtfFlowFacts.divergence}
 *    is therefore COMPUTED (it is testable, and the operator may choose to
 *    expose it later behind a verbatim caveat) but deliberately withheld from
 *    the model — `lib/analyze/prompt.ts`'s `modelHtfFlow` drops it at a marked
 *    seam, and a gate test pins that omission so it cannot start shipping by
 *    accident. Nothing anywhere may treat it as a directional trigger.
 *
 * 2. **A bare cumulative-delta total is misleading, so this module never emits
 *    one.** Over the same study window price rose +2,491 pts while the running
 *    cumulative delta fell to −53,901 contracts, and the running total carried
 *    the OPPOSITE sign to the realised price direction on 60 of 78 trading days
 *    (77%). The level is also anchor-dependent — its zero is wherever the
 *    rolling export happens to start. Every cumulative-delta number here is
 *    therefore WINDOW-ANCHORED (the anchor bar is named in the fact) and
 *    PAIRED with the price change over that same window, so the number can
 *    never be read as a direction on its own.
 *
 * WHAT IS ACTUALLY LOAD-BEARING: the per-swing delta and volume annotation.
 * Measured over the study window: delta at confirmed swing highs median +44
 * (55% positive, n=206), at swing lows median −121 (36% positive, n=216), and
 * swings print ~55% more volume than a typical bar (median ~7,526 / 7,662 vs
 * 4,866). Real, checkable, non-directional — this is the feature's deliverable.
 *
 * Delta convention throughout, matching `parseHtfBars` and `barFlow`: per-bar
 * `delta = askVolume − bidVolume` (buy aggression positive). Pure + immutable;
 * no file I/O.
 *
 * Two deliberate scope choices, both documented at their constants:
 *  - the per-session delta walk is RTH-ONLY and session-anchored through
 *    `rthSessions.ts`, so one session's net delta is comparable with another's;
 *  - the swing annotation and the divergence read run over the WHOLE bar series
 *    (overnight included), because that is the tape `htfStructure` pivots on and
 *    the price extremes the divergence read is about are printed on it.
 *
 * There is deliberately NO climax analogue of `barFlow.climax` here: measured
 * over the live export, a 30-min bar's |delta| reaches at most 19% of its own
 * volume (median 3%), so barFlow's ≥50% one-sided test can never fire on this
 * timeframe — it would be a field that is always zero. Nor is there an
 * average-trade-size analogue: the HTF export carries no trade count.
 */

/**
 * 30-min bars in one full trading day: the 23 h Globex-reopen → RTH-close span
 * (the CME maintenance halt takes the 24th hour, so no bars print in it).
 * Verified against the live export — every complete day carries exactly 46.
 */
export const BARS_PER_TRADING_DAY = (24 * 60 - 60) / HTF_BAR_MINUTES

/**
 * Trading days in the divergence lookback. Long enough that a "fresh extreme"
 * means a multi-session one rather than a bar-scale wiggle, short enough that
 * the cumulative delta inside it still describes the current auction.
 */
export const DIVERGENCE_WINDOW_DAYS = 3

/** The divergence lookback in bars (also the cumulative-delta `recentChange` window). */
export const DIVERGENCE_WINDOW_BARS = DIVERGENCE_WINDOW_DAYS * BARS_PER_TRADING_DAY

/**
 * The last third of the lookback is the "fresh" region a new extreme must print
 * in — `barFlow.FRESH_FRACTION`, kept identical so the two timeframes' reads
 * mean the same thing at different scales.
 */
export const FRESH_FRACTION = 1 / 3

/**
 * RTH sessions in the per-session delta walk. Matches
 * `multiDayTpo.MULTI_DAY_TPO_SESSIONS` so the multi-day flow read and the
 * multi-day profile describe the SAME days (~one trading week, today included).
 */
export const DELTA_WALK_SESSIONS = 5

/**
 * Cumulative delta must miss (or hold above) its prior extreme by more than
 * this fraction of the window's OWN cumulative-delta range before the miss
 * counts as a divergence. Adaptive rather than a fixed contract count because
 * 30-min bar volume swings ~13x across the day on the live export (p10 2_224 →
 * p90 29_746 contracts): any single hardcoded epsilon is a near-impossible test
 * overnight and a rounding error at the open.
 */
export const DIVERGENCE_DELTA_EPSILON_FRACTION = 0.05

/**
 * Net cumulative-delta change under this fraction of the window's own delta
 * range reads 'flat' — the flow round-tripped inside the window rather than
 * building in one direction. Same reasoning (and same scale) as the divergence
 * epsilon, set higher because a directional CLAIM about the whole window should
 * clear more than a threshold test at one bar.
 */
export const DELTA_TREND_EPSILON_FRACTION = 0.1

/** One NQ tick — an extreme must clear the prior region by more than this to be "fresh". */
const PRICE_EPSILON = 0.25

export type HtfFlowTrend = 'rising' | 'falling' | 'flat'

/**
 * Cumulative-delta divergence at the lookback's fresh price extreme, in the
 * same convention as `barFlow.FlowDivergence`: 'bearish' = a fresh price high
 * the cumulative delta failed to confirm, 'bullish' = a fresh price low with
 * cumulative delta holding above its own prior low. Null when neither printed,
 * or when both did (two-sided rotation — no single-sided read).
 *
 * NEUTRAL LABEL, NOT A SIGNAL: the names describe which side of the auction
 * failed to show up, not a predicted direction. See the module header.
 */
export type HtfFlowDivergence = 'bullish' | 'bearish' | null

/**
 * One confirmed swing from `htfStructure`, with the flow that printed at it —
 * the empirically supported half of this fact (see the module header).
 *
 * There is deliberately NO running-cumulative-delta field here: a running total
 * at a swing is anchor-dependent, and comparing one swing's total with the next
 * IS swing-level divergence, which the 2026-08-12 control study found no
 * support for. Per-bar delta and volume are measurements of that bar.
 */
export type HtfSwingFlow = {
  price: number
  /** Bar start time, `YYYY-MM-DD HH:MM` chart time — matches `HtfSwing.dateTime`. */
  dateTime: string
  /** The pivot bar's own delta (ask − bid). */
  delta: number
  /** The pivot bar's own volume. */
  volume: number
}

/** One RTH session's net flow (`rthSessions.groupRthSessions`). */
export type HtfSessionFlow = {
  /** Trading day, `YYYY-MM-DD`. */
  date: string
  /** Net delta over the session's RTH bars — anchored at that session's open. */
  netDelta: number
  /**
   * Price change over the SAME bars (session close − session open), points.
   * Never emitted without it: the study's 77%-of-days sign disagreement makes a
   * naked net delta read as a direction it does not carry.
   */
  pricePts: number
  /** Total volume over the same bars — the participation the net delta came out of. */
  volume: number
  /** False for the in-progress session: delta SO FAR, not a finished session. */
  complete: boolean
}

/**
 * The export window itself (`barsAnalyzed`, `windowStart`, `windowEnd`) is NOT
 * repeated here: `htfStructure` already reports it for the same bars, and one
 * fact belongs in one place.
 */
export type HtfFlowFacts = {
  /**
   * Cumulative delta over an EXPLICIT window, paired with the price change over
   * that same window. There is no export-wide signed total — see the module
   * header's negative result #2.
   */
  cumulativeDelta: {
    /** The bar every number in this block counts from: its chart time and open. */
    anchor: { dateTime: string; price: number }
    /** Bars in the window ({@link DIVERGENCE_WINDOW_BARS}, capped by series length). */
    windowBars: number
    /** Net delta from the anchor through the last bar. */
    netDelta: number
    /** Price change over the same window, points (last close − anchor open). */
    pricePts: number
    /** Sign of the net delta, flat inside {@link DELTA_TREND_EPSILON_FRACTION}. */
    trend: HtfFlowTrend
    /** Per-RTH-session net delta walk, newest first (up to {@link DELTA_WALK_SESSIONS}). */
    sessions: HtfSessionFlow[]
  }
  /**
   * The confirmed swings `htfStructure` reports (same pivots, same order,
   * newest first), each carrying the flow that printed at it.
   */
  swings: {
    highs: HtfSwingFlow[]
    lows: HtfSwingFlow[]
  }
  /**
   * WITHHELD FROM THE MODEL. Computed and tested, never placed in a prompt:
   * the 2026-08-12 base-rate control study found no support for swing-level
   * divergence (module header, negative result #1). `lib/analyze/prompt.ts`
   * drops this key at a marked seam and a gate test pins the omission.
   */
  divergence: {
    state: HtfFlowDivergence
    /** Plain-language OBSERVATION of what was measured — never a recommendation. */
    basis: string
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function fmtChartTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Contracts are whole units; float artifacts from summing have no meaning here. */
function contracts(n: number): number {
  return Math.round(n)
}

/**
 * Running cumulative delta as a prefix array of length `bars.length + 1`:
 * `prefix[i]` is the cumulative delta BEFORE bar `i`, so `prefix[i + 1]` is the
 * cumulative delta THROUGH bar `i` and `prefix[b] − prefix[a]` is the net delta
 * over bars `[a, b)`.
 */
function cumulativePrefix(bars: readonly HtfBar[]): number[] {
  const prefix = [0]
  for (const bar of bars) prefix.push(prefix[prefix.length - 1] + bar.delta)
  return prefix
}

/**
 * The window's own cumulative-delta range — max minus min of the CD path from
 * the window's opening baseline through its last bar. Every threshold in this
 * module is a fraction of it, so the same code reads a quiet overnight stretch
 * and a heavy trend day on their own scales.
 */
function deltaScaleOf(prefix: readonly number[], from: number): number {
  const path = prefix.slice(from)
  return Math.max(...path) - Math.min(...path)
}

type DivergenceRead = { state: HtfFlowDivergence; basis: string }

/**
 * Divergence at the lookback's fresh extreme, the `barFlow.detectDivergence`
 * algorithm on the HTF series: price prints a new high/low in the window's last
 * third while the running cumulative delta fails to make (bearish) / holds
 * above (bullish) its own prior extreme.
 *
 * @param bars   the whole series (oldest first).
 * @param from   index the lookback starts at.
 * @param prefix the cumulative-delta prefix from {@link cumulativePrefix}.
 */
function detectDivergence(
  bars: readonly HtfBar[],
  from: number,
  prefix: readonly number[],
  windowDays: number,
): DivergenceRead {
  const recent = bars.slice(from)
  if (recent.length < 3) {
    return {
      state: null,
      basis: 'the export is too short for an HTF cumulative-delta divergence read',
    }
  }

  const freshOffset = Math.max(
    1,
    recent.length - Math.max(1, Math.floor(recent.length * FRESH_FRACTION)),
  )
  const freshStart = from + freshOffset
  const prior = bars.slice(from, freshStart)
  const fresh = bars.slice(freshStart)
  if (prior.length === 0 || fresh.length === 0) {
    return {
      state: null,
      basis: 'the export is too short for an HTF cumulative-delta divergence read',
    }
  }

  const priorHigh = Math.max(...prior.map((b) => b.high))
  const priorLow = Math.min(...prior.map((b) => b.low))
  // CD through each PRIOR bar: prefix[from + 1 .. freshStart].
  const priorCd = prefix.slice(from + 1, freshStart + 1)
  const priorMaxCd = Math.max(...priorCd)
  const priorMinCd = Math.min(...priorCd)
  const epsilon = DIVERGENCE_DELTA_EPSILON_FRACTION * deltaScaleOf(prefix, from)

  // Last occurrence of the fresh region's extreme high/low.
  let highIdx = freshStart
  let lowIdx = freshStart
  for (let i = freshStart; i < bars.length; i++) {
    if (bars[i].high >= bars[highIdx].high) highIdx = i
    if (bars[i].low <= bars[lowIdx].low) lowIdx = i
  }

  const freshHigh = bars[highIdx].high > priorHigh + PRICE_EPSILON
  const freshLow = bars[lowIdx].low < priorLow - PRICE_EPSILON
  const cdAtHigh = prefix[highIdx + 1]
  const cdAtLow = prefix[lowIdx + 1]
  const bearish = freshHigh && cdAtHigh < priorMaxCd - epsilon
  const bullish = freshLow && cdAtLow > priorMinCd + epsilon

  const span = `${windowDays}-day`
  if (bearish && !bullish) {
    return {
      state: 'bearish',
      basis:
        `price printed a fresh ${span} high at ${round2(bars[highIdx].high)} (${fmtChartTime(bars[highIdx].dateTime)}) ` +
        `while cumulative delta sat ${contracts(priorMaxCd - cdAtHigh)} contracts under its own high for the window — ` +
        `the new high did not carry matching buy aggression`,
    }
  }
  if (bullish && !bearish) {
    return {
      state: 'bullish',
      basis:
        `price printed a fresh ${span} low at ${round2(bars[lowIdx].low)} (${fmtChartTime(bars[lowIdx].dateTime)}) ` +
        `while cumulative delta held ${contracts(cdAtLow - priorMinCd)} contracts above its own low for the window — ` +
        `the new low did not carry matching sell aggression`,
    }
  }
  if (bearish && bullish) {
    return {
      state: null,
      basis: `both a fresh ${span} high and a fresh ${span} low printed in the window — two-sided rotation, no single-sided flow read`,
    }
  }
  if (freshHigh || freshLow) {
    const side = freshHigh ? 'high' : 'low'
    const price = round2(freshHigh ? bars[highIdx].high : bars[lowIdx].low)
    return {
      state: null,
      basis: `the fresh ${span} ${side} at ${price} printed with cumulative delta at its own extreme for the window — the move is delta-confirmed, no divergence`,
    }
  }
  return {
    state: null,
    basis: `no fresh ${span} extreme printed in the last ${recent.length} bars — nothing for cumulative delta to confirm or miss`,
  }
}

/** `htfStructure`'s reported swings (newest first) with the flow at each pivot bar. */
function annotateSwings(bars: readonly HtfBar[], pivots: readonly Pivot[]): HtfSwingFlow[] {
  return pivots
    .slice(-REPORTED_SWINGS_PER_SIDE)
    .reverse()
    .map((pivot) => {
      const bar = bars[pivot.index]
      return {
        price: round2(pivot.price),
        dateTime: fmtChartTime(pivot.dateTime),
        delta: contracts(bar.delta),
        volume: contracts(bar.volume),
      }
    })
}

/**
 * Net delta, price change and volume for the most recent RTH sessions, newest
 * first. The price change travels with the delta by contract — a session's net
 * delta alone is the number the control study showed disagrees with realised
 * direction on 77% of days.
 */
function sessionWalk(bars: readonly HtfBar[]): HtfSessionFlow[] {
  return groupRthSessions(bars)
    .slice(-DELTA_WALK_SESSIONS)
    .reverse()
    .map((session) => {
      const ohlc = sessionOhlc(session.bars)
      return {
        date: session.date,
        netDelta: contracts(session.bars.reduce((sum, b) => sum + b.delta, 0)),
        pricePts: round2(ohlc.close - ohlc.open),
        volume: contracts(session.bars.reduce((sum, b) => sum + b.volume, 0)),
        complete: session.complete,
      }
    })
}

function classifyTrend(change: number, scale: number): HtfFlowTrend {
  const epsilon = DELTA_TREND_EPSILON_FRACTION * scale
  if (change > epsilon) return 'rising'
  if (change < -epsilon) return 'falling'
  return 'flat'
}

/**
 * Reduce the parsed HTF bars to the order-flow summary: window-anchored
 * cumulative delta paired with the window's price change, the per-RTH-session
 * delta walk, the flow at each confirmed swing, and the (model-withheld)
 * divergence observation at the window's fresh extreme.
 *
 * @param bars chronological parsed export (oldest first, partial bar last).
 * @param opts.recentWindowBars overrides the lookback length (tests/tuning).
 * @throws when `bars` is empty — callers gate on a non-empty parse, exactly as
 *   `computeHtfStructure` does, so a missing export surfaces as a null fact plus
 *   a warning at the assembly site rather than a silent zero-filled read.
 */
export function computeHtfFlow(
  bars: readonly HtfBar[],
  opts: { recentWindowBars?: number } = {},
): HtfFlowFacts {
  if (bars.length === 0) {
    throw new Error('HTF flow needs at least one bar')
  }

  const prefix = cumulativePrefix(bars)
  const windowBars = Math.min(opts.recentWindowBars ?? DIVERGENCE_WINDOW_BARS, bars.length)
  const from = bars.length - windowBars
  const netDelta = prefix[bars.length] - prefix[from]
  const windowDays = Math.max(1, Math.round(windowBars / BARS_PER_TRADING_DAY))

  return {
    cumulativeDelta: {
      anchor: {
        dateTime: fmtChartTime(bars[from].dateTime),
        price: round2(bars[from].open),
      },
      windowBars,
      netDelta: contracts(netDelta),
      pricePts: round2(bars[bars.length - 1].close - bars[from].open),
      trend: classifyTrend(netDelta, deltaScaleOf(prefix, from)),
      sessions: sessionWalk(bars),
    },
    swings: {
      highs: annotateSwings(bars, findPivots(bars, 'high', SWING_PIVOT_STRENGTH)),
      lows: annotateSwings(bars, findPivots(bars, 'low', SWING_PIVOT_STRENGTH)),
    },
    divergence: detectDivergence(bars, from, prefix, windowDays),
  }
}
