import type { ExecBar } from './parseExecBars'
import { GLOBEX_OPEN_MINUTES, RTH_OPEN_MINUTES } from './overnightSession'

/**
 * Code-owned session-anchored intraday facts (feat-063) — session VWAP,
 * session cumulative delta and sub-30-min one-timeframing, computed from the
 * full-session Globex execution-bar export (feat-062).
 *
 * Motivation (operator, 2026-07-29): the briefing's only "trend" was the
 * 30-min HTF swing sequence, which confirms 2.5 h late and froze on "Down"
 * through a ~700-pt intraday rally. The operator trades minutes-long intraday
 * entries; these facts give the pipeline a session-scoped read instead.
 * Everything here is computed in code from the exec bars — the operator
 * explicitly wants NO new chart studies or export columns.
 *
 * feat-097 adds the volume-weighted sigma envelope around each session VWAP,
 * computed over those same raw exec bars, plus the flattened rung structure
 * (`vwapRungs`) entries, stops and target rungs may anchor on.
 *
 * VWAP and cumulative delta accumulate over the RAW exec bars (finer than any
 * resample); the 5-minute resample exists for time-based series (the VWAP
 * slope) and the 15-minute bars for one-timeframing. Chart time is US Central
 * (exchange-local), same convention as `overnightSession`.
 *
 * Pure + immutable; no file I/O. Plain TypeScript types (engine fact, not a
 * Briefing output — no Zod).
 */

/** Time-bar width the exec bars are resampled to for the VWAP slope series. */
export const RESAMPLE_MINUTES = 5

/**
 * One-timeframing bar width. Operator decision 2026-07-29: 30-min is too high
 * for NQ, 5-min breaks on every pause — 15-min is the working intraday read.
 */
export const OTF_TIMEFRAME_MINUTES = 15

/** Minimum consecutive completed OTF bars before a one-timeframing state is called. */
export const MIN_OTF_BARS = 2

/**
 * The export must start within this many minutes of the Globex open to count
 * as full-session coverage. The retired rolling export (~250 bars, ~3 h) fails
 * this by hours; the first volume bar of a real Globex session opens within
 * minutes of the 17:00 reopen.
 */
export const FULL_COVERAGE_TOLERANCE_MINUTES = 30

/** VWAP drift below this many points per 30 min reads as flat. */
export const VWAP_SLOPE_EPSILON_PTS = 2

/**
 * Sigma multiples the session-VWAP bands are minted at (feat-097), inner-first.
 * ±1σ is the mean-reversion rung the session keeps rotating back through; ±2σ
 * is the extension/exhaustion rung. Deliberately the same pair the ACSIL
 * `vwapBands` export will carry for the 24h/weekly/monthly anchors (feat-051),
 * so the two families of bands read identically downstream.
 */
export const VWAP_BAND_MULTIPLES = [1, 2] as const

/** Cumulative-delta change within this many contracts per 30 min reads as flat. */
export const CUM_DELTA_EPSILON = 50

/** Smallest meaningful price move: one NQ tick. */
const PRICE_EPSILON = 0.25

const MS_PER_MINUTE = 60_000

export type SessionTrend = 'rising' | 'falling' | 'flat'
export type SessionPosition = 'above' | 'below' | 'at'

/** One sigma band around a session VWAP. */
export type SessionVwapBand = {
  /** Signed sigma multiple — −2, −1, +1, +2 (see {@link VWAP_BAND_MULTIPLES}). */
  multiple: number
  /** VWAP + multiple × sigma. */
  price: number
}

/**
 * Volume-weighted sigma envelope around a session VWAP (feat-097). Computed
 * over the SAME exec bars that produce the VWAP itself — `execution_bars.csv`
 * already carries per-bar volume, so no export change is involved (the
 * 24h/weekly/monthly bands do need one: those VWAPs arrive as bare scalars in
 * `mgi_static_levels.json` with no underlying series — feat-051).
 */
export type SessionVwapSigmaBands = {
  /**
   * Volume-weighted standard deviation of bar typical price about the VWAP, in
   * points (population sigma, weights = bar volume).
   */
  sigma: number
  /** The bands, price-ascending: −2σ, −1σ, +1σ, +2σ. */
  bands: SessionVwapBand[]
  /**
   * Where current price sits in the envelope: (current − VWAP) / sigma. Null
   * when sigma is 0 (a session with no dispersion yet — one bar, or every bar
   * at one price).
   */
  z: number | null
}

export type SessionVwapAnchor = {
  /** Volume-weighted average price since the anchor, from the raw exec bars. */
  value: number
  /** Signed distance, current − VWAP. */
  distancePts: number
  position: SessionPosition
  /** VWAP now vs VWAP 30 minutes ago — the direction the average is dragging. */
  slope: SessionTrend
  slopePtsPer30Min: number | null
  /**
   * Volume-weighted sigma bands around this VWAP (feat-097). Null only when the
   * anchor carries no volume — and the whole `vwap` block is already null on
   * partial coverage, so the bands degrade with it.
   */
  sigmaBands: SessionVwapSigmaBands | null
}

/** Which session VWAP a rung belongs to. */
export type SessionVwapAnchorName = 'globex' | 'rth'

/**
 * A session-VWAP price usable as entry / stop / target-rung structure
 * (feat-097) — the VWAP centerline itself plus its sigma bands, each carrying
 * the attribution label the briefing must quote when it anchors there.
 */
export type SessionVwapRung = {
  price: number
  anchor: SessionVwapAnchorName
  /** 0 for the VWAP centerline, ±1 / ±2 for the sigma bands. */
  multiple: number
  /** Attribution label, e.g. "Globex session VWAP −1σ". */
  label: string
}

export type SessionCumDeltaAnchor = {
  /** Net delta (ask − bid) since the anchor. */
  total: number
  /** Net delta change over the last 30 minutes. */
  last30MinChange: number | null
  trend: SessionTrend
}

export type OneTimeframingFacts = {
  timeframeMinutes: number
  /** 'none' = two-timeframing (rotational) — neither side is in control. */
  state: 'up' | 'down' | 'none'
  /** Consecutive completed bars the current state has held (0 when 'none'). */
  barsHeld: number
  /** Bar start time (`YYYY-MM-DD HH:MM` chart time) the current run began, else null. */
  since: string | null
  /**
   * The price that flips the read: the prior completed bar's low (up OTF) or
   * high (down OTF) — the developing bar trading through it breaks the run.
   * Null when state is 'none'.
   */
  breakLevel: number | null
  /**
   * True when the DEVELOPING bar has already traded through `breakLevel` —
   * the run is broken in real time even though the bar hasn't completed.
   */
  developingBarBroke: boolean
}

export type SessionIntradayFacts = {
  /** The trading day (YYYY-MM-DD chart time) the exec bars belong to. */
  sessionDate: string
  barCount: number
  firstBarTime: string
  lastBarTime: string
  /**
   * 'full' when the export starts at the Globex open (within tolerance);
   * 'partial' otherwise (e.g. the retired rolling export). Session-anchored
   * VWAP (with its sigma bands) / cumulative delta are null on partial
   * coverage — a "session VWAP" accumulated from mid-session would be a lie
   * with a label, and a sigma envelope around it doubly so.
   */
  coverage: 'full' | 'partial'
  vwap: {
    globex: SessionVwapAnchor
    /** Anchored at the 08:30 CT open; null before RTH. */
    rth: SessionVwapAnchor | null
  } | null
  /**
   * Session-VWAP prices (centerline + sigma bands) flattened into rung
   * structure for entries, stops and target rungs (feat-097), price-descending.
   * Empty when `vwap` is null — on partial coverage there is no honest session
   * average, so there are no honest bands to trade off either.
   */
  vwapRungs: SessionVwapRung[]
  cumulativeDelta: {
    globex: SessionCumDeltaAnchor
    rth: SessionCumDeltaAnchor | null
  } | null
  /**
   * One-timeframing on the resampled bars. Computed even on partial coverage
   * (recent structure is valid regardless of where the file starts); null only
   * when fewer than MIN_OTF_BARS + 1 completed bars exist.
   */
  oneTimeframing: OneTimeframingFacts | null
}

type TimeBar = {
  start: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
  delta: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function fmtChartTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

function classifyPosition(diff: number): SessionPosition {
  if (diff > PRICE_EPSILON) return 'above'
  if (diff < -PRICE_EPSILON) return 'below'
  return 'at'
}

function classifyTrend(change: number, epsilon: number): SessionTrend {
  if (change > epsilon) return 'rising'
  if (change < -epsilon) return 'falling'
  return 'flat'
}

/** The session's Globex open (17:00 CT the prior calendar day for daytime bars). */
function globexOpenOf(lastBar: ExecBar): Date {
  const d = new Date(lastBar.dateTime)
  if (minutesOfDay(d) < GLOBEX_OPEN_MINUTES) d.setDate(d.getDate() - 1)
  d.setHours(Math.floor(GLOBEX_OPEN_MINUTES / 60), GLOBEX_OPEN_MINUTES % 60, 0, 0)
  return d
}

/** The session's RTH open (08:30 CT on the trading day), derived from the Globex open. */
function rthOpenOf(globexOpen: Date): Date {
  const d = new Date(globexOpen)
  d.setDate(d.getDate() + 1)
  d.setHours(Math.floor(RTH_OPEN_MINUTES / 60), RTH_OPEN_MINUTES % 60, 0, 0)
  return d
}

/**
 * Resample volume bars into fixed time buckets (empty buckets skipped). The
 * final bar is the developing one — callers treat it as partial.
 */
export function resampleBars(bars: readonly ExecBar[], minutes: number): TimeBar[] {
  const bucketMs = minutes * MS_PER_MINUTE
  const out: TimeBar[] = []
  for (const bar of bars) {
    const start = Math.floor(bar.dateTime.getTime() / bucketMs) * bucketMs
    const last = out[out.length - 1]
    if (last && last.start.getTime() === start) {
      out[out.length - 1] = {
        ...last,
        high: Math.max(last.high, bar.high),
        low: Math.min(last.low, bar.low),
        close: bar.close,
        volume: last.volume + bar.volume,
        delta: last.delta + bar.delta,
      }
    } else {
      out.push({
        start: new Date(start),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
        delta: bar.delta,
      })
    }
  }
  return out
}

/** Running VWAP over exec bars using each bar's typical price (H+L+C)/3. */
function vwapOf(bars: readonly ExecBar[]): number | null {
  let pv = 0
  let vol = 0
  for (const bar of bars) {
    const typical = (bar.high + bar.low + bar.close) / 3
    pv += typical * bar.volume
    vol += bar.volume
  }
  return vol > 0 ? pv / vol : null
}

/**
 * Volume-weighted standard deviation of bar typical price about `vwap`, over
 * the same bars the VWAP accumulated on: sqrt(Σ vᵢ(pᵢ − VWAP)² / Σ vᵢ).
 * Population sigma — this describes where the session actually traded, it does
 * not estimate a parameter of a wider population, so there is no n−1 to make.
 */
function vwapSigmaOf(bars: readonly ExecBar[], vwap: number): number | null {
  let weightedSquares = 0
  let vol = 0
  for (const bar of bars) {
    const typical = (bar.high + bar.low + bar.close) / 3
    const deviation = typical - vwap
    weightedSquares += deviation * deviation * bar.volume
    vol += bar.volume
  }
  return vol > 0 ? Math.sqrt(weightedSquares / vol) : null
}

/**
 * The sigma envelope around one anchor's VWAP. Band prices are derived from the
 * UNROUNDED VWAP and sigma and rounded once, so a band never inherits two
 * roundings.
 */
function sigmaBandsOf(
  bars: readonly ExecBar[],
  vwap: number,
  currentPrice: number,
): SessionVwapSigmaBands | null {
  const sigma = vwapSigmaOf(bars, vwap)
  if (sigma === null) return null
  const bands = [...VWAP_BAND_MULTIPLES]
    .flatMap((multiple) => [-multiple, multiple])
    .sort((a, b) => a - b)
    .map((multiple) => ({ multiple, price: round2(vwap + multiple * sigma) }))
  return {
    sigma: round2(sigma),
    bands,
    z: sigma > 0 ? round2((currentPrice - vwap) / sigma) : null,
  }
}

/**
 * Flatten the session VWAPs and their sigma bands into rung structure
 * (feat-097): every price an objective may legitimately anchor an entry, stop
 * or target on, price-descending, each with its attribution label. Empty when
 * `vwap` is null (partial coverage).
 */
export function sessionVwapRungs(vwap: SessionIntradayFacts['vwap']): SessionVwapRung[] {
  if (vwap === null) return []
  const anchors: Array<[SessionVwapAnchorName, SessionVwapAnchor | null, string]> = [
    ['globex', vwap.globex, 'Globex session VWAP'],
    ['rth', vwap.rth, 'RTH session VWAP'],
  ]
  const rungs: SessionVwapRung[] = []
  for (const [anchor, facts, name] of anchors) {
    if (facts === null) continue
    rungs.push({ price: facts.value, anchor, multiple: 0, label: name })
    for (const band of facts.sigmaBands?.bands ?? []) {
      rungs.push({
        price: band.price,
        anchor,
        multiple: band.multiple,
        label: `${name} ${band.multiple > 0 ? '+' : '−'}${Math.abs(band.multiple)}σ`,
      })
    }
  }
  return rungs.sort((a, b) => b.price - a.price)
}

function vwapAnchor(bars: readonly ExecBar[], currentPrice: number): SessionVwapAnchor | null {
  const value = vwapOf(bars)
  if (value === null) return null

  // Slope: VWAP over the full anchor window vs the same accumulation cut 30
  // minutes before the last bar — how far the average dragged in 30 minutes.
  const cutoff = bars[bars.length - 1].dateTime.getTime() - 30 * MS_PER_MINUTE
  const earlier = bars.filter((b) => b.dateTime.getTime() <= cutoff)
  const earlierVwap = vwapOf(earlier)
  const slopePts = earlierVwap === null ? null : round2(value - earlierVwap)

  return {
    value: round2(value),
    distancePts: round2(currentPrice - value),
    position: classifyPosition(currentPrice - value),
    slope: slopePts === null ? 'flat' : classifyTrend(slopePts, VWAP_SLOPE_EPSILON_PTS),
    slopePtsPer30Min: slopePts,
    sigmaBands: sigmaBandsOf(bars, value, currentPrice),
  }
}

function cumDeltaAnchor(bars: readonly ExecBar[]): SessionCumDeltaAnchor | null {
  if (bars.length === 0) return null
  const total = bars.reduce((sum, b) => sum + b.delta, 0)
  const cutoff = bars[bars.length - 1].dateTime.getTime() - 30 * MS_PER_MINUTE
  const recent = bars.filter((b) => b.dateTime.getTime() > cutoff)
  const change = recent.length < bars.length ? recent.reduce((sum, b) => sum + b.delta, 0) : null
  return {
    total,
    last30MinChange: change,
    trend: change === null ? 'flat' : classifyTrend(change, CUM_DELTA_EPSILON),
  }
}

/**
 * One-timeframing over completed time bars: an up run holds while each bar's
 * low stays at-or-above the prior bar's low (never auctions below it); a down
 * run mirrors on highs. Inside bars extend both runs; the state is whichever
 * run is longer, 'none' when tied or below MIN_OTF_BARS.
 */
function computeOneTimeframing(timeBars: readonly TimeBar[]): OneTimeframingFacts | null {
  // The last bar is developing — runs are read off completed bars only.
  const completed = timeBars.slice(0, -1)
  const developing = timeBars[timeBars.length - 1] ?? null
  if (completed.length < MIN_OTF_BARS + 1) return null

  let upRun = 0
  for (let i = completed.length - 1; i >= 1; i--) {
    if (completed[i].low < completed[i - 1].low - PRICE_EPSILON) break
    upRun++
  }
  let downRun = 0
  for (let i = completed.length - 1; i >= 1; i--) {
    if (completed[i].high > completed[i - 1].high + PRICE_EPSILON) break
    downRun++
  }

  let state: OneTimeframingFacts['state'] = 'none'
  if (upRun >= MIN_OTF_BARS && upRun > downRun) state = 'up'
  else if (downRun >= MIN_OTF_BARS && downRun > upRun) state = 'down'

  const run = state === 'up' ? upRun : state === 'down' ? downRun : 0
  const lastCompleted = completed[completed.length - 1]
  const breakLevel =
    state === 'up' ? lastCompleted.low : state === 'down' ? lastCompleted.high : null

  const developingBarBroke =
    developing !== null && breakLevel !== null
      ? state === 'up'
        ? developing.low < breakLevel - PRICE_EPSILON
        : developing.high > breakLevel + PRICE_EPSILON
      : false

  return {
    timeframeMinutes: OTF_TIMEFRAME_MINUTES,
    state,
    barsHeld: run,
    since: run > 0 ? fmtChartTime(completed[completed.length - run].start) : null,
    breakLevel: breakLevel === null ? null : round2(breakLevel),
    developingBarBroke,
  }
}

/**
 * @param bars chronological parsed exec bars (oldest first, partial bar last).
 * @param currentPrice live price; falls back to the last bar's close.
 * @throws when `bars` is empty — callers gate on a non-empty parse.
 */
export function computeSessionIntraday(
  bars: readonly ExecBar[],
  currentPrice: number | null,
): SessionIntradayFacts {
  if (bars.length === 0) {
    throw new Error('session intraday needs at least one bar')
  }

  const lastBar = bars[bars.length - 1]
  const price =
    currentPrice !== null && Number.isFinite(currentPrice) ? currentPrice : lastBar.close

  const globexOpen = globexOpenOf(lastBar)
  const rthOpen = rthOpenOf(globexOpen)
  const sessionDay = new Date(globexOpen)
  sessionDay.setDate(sessionDay.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  const sessionDate = `${sessionDay.getFullYear()}-${pad(sessionDay.getMonth() + 1)}-${pad(sessionDay.getDate())}`

  // Bars belonging to this session only (robust to an export that reaches back
  // past the reopen), and the RTH slice within it.
  const sessionBars = bars.filter((b) => b.dateTime.getTime() >= globexOpen.getTime())
  const rthBars = sessionBars.filter((b) => b.dateTime.getTime() >= rthOpen.getTime())

  const firstBar = sessionBars[0] ?? lastBar
  const coverage: SessionIntradayFacts['coverage'] =
    sessionBars.length > 0 &&
    firstBar.dateTime.getTime() - globexOpen.getTime() <=
      FULL_COVERAGE_TOLERANCE_MINUTES * MS_PER_MINUTE
      ? 'full'
      : 'partial'

  const vwap =
    coverage === 'full'
      ? {
          globex: vwapAnchor(sessionBars, price)!,
          rth: rthBars.length > 0 ? vwapAnchor(rthBars, price) : null,
        }
      : null

  const cumulativeDelta =
    coverage === 'full'
      ? {
          globex: cumDeltaAnchor(sessionBars)!,
          rth: rthBars.length > 0 ? cumDeltaAnchor(rthBars) : null,
        }
      : null

  const otfSource = sessionBars.length > 0 ? sessionBars : bars
  const oneTimeframing = computeOneTimeframing(resampleBars(otfSource, OTF_TIMEFRAME_MINUTES))

  return {
    sessionDate,
    barCount: bars.length,
    firstBarTime: fmtChartTime(bars[0].dateTime),
    lastBarTime: fmtChartTime(lastBar.dateTime),
    coverage,
    vwap,
    vwapRungs: sessionVwapRungs(vwap),
    cumulativeDelta,
    oneTimeframing,
  }
}
