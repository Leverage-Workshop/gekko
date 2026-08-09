import type { TpoRow } from './parseTpo'
import { TPO_PERIOD_LETTERS } from './tpoPeriodClock'

/**
 * Day-type and open-type classification from the TPO letter sequence
 * (feat-093, bundle review 2026-08-07 item C2).
 *
 * Market Profile's canonical session reads — is this a normal day, a trend
 * day, a neutral day, a double distribution; did the session open on a drive
 * or auction around the open; which period extended the range and which one
 * printed the high and the low — are all derivable from the numeric TPO
 * ladder (`Price,TPOCount,Letters`), yet the engine had no name for any of
 * them: the doctrine leaned on them and the model inferred them from the TPO
 * screenshot. This module makes them code-owned facts.
 *
 * Two deliberate properties:
 *
 * 1. **Letter sequence is the only hard requirement.** Clock times come from
 *    feat-092's period→clock anchor, which live bundles will not carry until
 *    the Sierra ACSIL study ships the two metadata lines. Every `clock` here
 *    is therefore best-effort (`string | null`); nothing is classified from a
 *    time.
 * 2. **The thresholds are empirical, not textbook.** See
 *    `PINNED_IB_EXTENSION_DISTRIBUTION`.
 */

/**
 * The measured IB→day-range extension distribution the day-type thresholds
 * are cut from — review section B7, 62 reconstructed sessions from bundle
 * 1c15934a's HTF export.
 *
 * PINNED, NOT LIVE-COMPUTED. feat-093's spec says to ground classification in
 * the bundle's own extension distribution rather than textbook thresholds
 * where the two disagree, and they do disagree sharply: the textbook normal
 * day is "the Initial Balance holds" (day/IB ≈ 1.0), but only 4% of measured
 * sessions had no extension at all and the p25 is already 1.25 — a textbook
 * threshold would classify almost nothing as normal and everything as a
 * variation. Computing this distribution per bundle is feat-100 (`not-started`
 * and deliberately out of scope here), so the review's measured numbers are
 * pinned as constants.
 *
 * THE feat-100 SEAM: `classifyTpoDay` takes the distribution as an optional
 * argument defaulting to this constant. feat-100 computes an
 * `IbExtensionDistribution` from the daily history with
 * `source: 'measured'` and passes it in — no classifier rewrite, and the fact
 * carries `distribution.source`/`sampleSize` so a briefing can always tell
 * which one it was scored against.
 */
export type IbExtensionDistribution = {
  /** `pinned-empirical` = the review's B7 sample; `measured` = computed live (feat-100). */
  source: 'pinned-empirical' | 'measured'
  /** Sessions behind the quantiles — reported alongside every quantile, per B7. */
  sampleSize: number
  /** `day_range / IB_range` quantiles. */
  p25: number
  median: number
  p75: number
  p90: number
  max: number
  /** Share of sessions extending neither / one / both sides of the IB (0–1). */
  sides: { none: number; oneSided: number; bothSides: number }
}

/** @see IbExtensionDistribution — review 2026-08-07 section B7, n = 62. */
export const PINNED_IB_EXTENSION_DISTRIBUTION: IbExtensionDistribution = {
  source: 'pinned-empirical',
  sampleSize: 62,
  p25: 1.25,
  median: 1.52,
  p75: 2.08,
  p90: 2.58,
  max: 3.58,
  sides: { none: 0.04, oneSided: 0.79, bothSides: 0.16 },
}

/**
 * The Initial Balance is the session's first hour, by definition — used only
 * to work out how many period letters the IB spans when the export carries no
 * IB of its own (`IB High`/`IB Low` exported as zeros).
 */
export const IB_MINUTES = 60

/**
 * Range extension below this many bins is grid noise, not an extension: a
 * one-bin poke past the IB edge does not make a session two-sided. Counted in
 * bins so the rule scales with the export's bin size rather than assuming NQ
 * points.
 */
export const EXTENSION_MIN_BINS = 1

/**
 * Fewer distinct periods than this and the session is too young to classify —
 * the whole fact degrades to null. Three is the floor for any extension read
 * at all: two periods are the Initial Balance itself, so the third is the
 * first that *can* extend it.
 */
export const MIN_CLASSIFY_PERIODS = 3

/**
 * Periods the open-type read looks at — the opening hour and a half at 30-min
 * periods. Open type is a read on how the session started, not on where it
 * ended up; widening this window turns an open-drive into whatever the rest of
 * the day did.
 */
export const OPEN_WINDOW_PERIODS = 3

/**
 * An open drives when the move away from the opening period's own range is at
 * least this share of the opening window's total range — i.e. the drive is
 * bigger than the period it came from. Below this the opening period IS the
 * range and the session merely rotated inside it.
 */
export const OPEN_DRIVE_MIN_DRIVE_FRACTION = 0.5

/**
 * An open drive tolerates at most this share of the opening window traded
 * back through the opening period's far side. A true open-drive never trades
 * back through the open at all; one bin of slippage is grid noise, not a
 * counter-auction.
 */
export const OPEN_DRIVE_MAX_PROBE_FRACTION = 0.05

/**
 * A counter-probe up to this share of the opening window is a TEST of the
 * other side that failed (open-test-drive). Deeper than this the market
 * genuinely auctioned the other way first and then reversed
 * (open-rejection-reverse).
 */
export const OPEN_TEST_DRIVE_MAX_PROBE_FRACTION = 0.25

/** The drive leg of an open-test-drive must still be this share of the window. */
export const OPEN_TEST_DRIVE_MIN_DRIVE_FRACTION = 0.35

/**
 * An open-rejection-reverse must reverse *through* and beyond the rejected
 * probe by this multiple of the probe. A drive roughly equal to the probe is
 * two-sided rotation around the open — an open-auction.
 */
export const OPEN_REJECTION_MIN_DRIVE_RATIO = 1.5

/**
 * A double distribution needs a vacuum between its two bodies: an interior
 * single-print gap of at least this many bins AND at least this share of the
 * session range. Bins alone are bin-size dependent; the range fraction alone
 * lets a two-bin gap split a quiet session.
 */
export const DOUBLE_DISTRIBUTION_MIN_GAP_BINS = 3
export const DOUBLE_DISTRIBUTION_MIN_GAP_FRACTION = 0.1

/**
 * Each side of the gap must hold at least this share of the ladder's bins to
 * count as a distribution. Otherwise a long tail with one stray print beyond
 * it reads as a second distribution.
 */
export const DOUBLE_DISTRIBUTION_MIN_BODY_FRACTION = 0.2

/**
 * Canonical Market Profile day types.
 * - `normal` — the Initial Balance essentially held (below the measured p25).
 * - `normal-variation` — the IB was extended one way, the ordinary session.
 * - `trend` — one-sided extension in the measured top decile; one timeframe
 *   controlled the day.
 * - `neutral` — the IB was extended on BOTH sides; two-sided, responsive.
 * - `neutral-extreme` — a neutral day whose LAST period sits on one of the
 *   session extremes: the late auction resolved the fight.
 * - `double-distribution` — two separate bodies split by a single-print
 *   vacuum; the session accepted two different values.
 */
export type TpoDayType =
  | 'normal'
  | 'normal-variation'
  | 'trend'
  | 'neutral'
  | 'neutral-extreme'
  | 'double-distribution'

/**
 * Canonical Market Profile open types, read from the opening periods' ranges.
 * - `open-drive` — the market left the opening period and never came back.
 * - `open-test-drive` — a shallow probe one way failed, then it drove the other.
 * - `open-rejection-reverse` — it auctioned one way, was rejected, and reversed
 *   further the other way.
 * - `open-auction` — it rotated around the opening period; nobody was in control.
 */
export type TpoOpenType =
  | 'open-drive'
  | 'open-test-drive'
  | 'open-rejection-reverse'
  | 'open-auction'

/** Where a session's `day_range / IB_range` sits in the reference distribution. */
export type IbExtensionBand =
  | 'below-p25'
  | 'p25-median'
  | 'median-p75'
  | 'p75-p90'
  | 'above-p90'

/**
 * One period that pushed the session range beyond where it stood before it.
 * Deliberately four fields: the running high/low after each extension is
 * `tpo.sessionRange` walked backwards through `up`/`down`, and the prompt
 * budget is not spent on numbers the payload already carries.
 */
export type TpoRangeExtension = {
  letter: string
  /** `HH:MM` this period opened; null with no period→clock anchor (feat-092). */
  clock: string | null
  /** Points this period added to the session high (0 when it added none). */
  up: number
  /** Points this period added to the session low (0 when it added none). */
  down: number
}

/** Which period printed an extreme, and at what price. */
export type TpoPeriodExtreme = {
  letter: string
  clock: string | null
  price: number
}

/** The IB→day-range extension measurement the day type is cut from. */
export type TpoIbExtension = {
  high: number
  low: number
  /** `high - low`. */
  range: number
  /** `export` = the study's own IB High/Low; `reconstructed` = the first hour's letters. */
  source: 'export' | 'reconstructed'
  /** `(session range) / range`, 2 dp — the B7 statistic. The session range itself is `tpo.sessionRange`. */
  ratio: number
  /** Where `ratio` falls in the reference distribution. */
  band: IbExtensionBand
  /** Points extended above the IB high / below the IB low (0 when none). */
  up: number
  down: number
  /** Which sides were extended by more than `EXTENSION_MIN_BINS` bins. */
  sides: 'none' | 'up' | 'down' | 'both'
}

export type TpoClassification = {
  /** Null only when there is no usable IB and no double-distribution shape. */
  dayType: TpoDayType | null
  /** One line of evidence for `dayType`, with the numbers it was decided on. */
  dayTypeBasis: string
  openType: TpoOpenType | null
  /** Direction the open drove/reversed into; null on an open-auction. */
  openDirection: 'up' | 'down' | null
  openTypeBasis: string
  /** Every period letter in the ladder, in period order (e.g. "ABCDEFG"). */
  periods: string
  extension: TpoIbExtension | null
  /**
   * Range extension by period — only periods that actually extended the
   * session range are listed (a period that did not is, by definition,
   * rotation inside the existing range).
   */
  extensions: TpoRangeExtension[]
  /** The period that printed the session high (earliest one to reach it). */
  highPeriod: TpoPeriodExtreme
  /** The period that printed the session low. */
  lowPeriod: TpoPeriodExtreme
  /**
   * Provenance of the thresholds this session was scored against — the two
   * quantiles the day-type ladder actually cuts at, with the sample size B7
   * requires alongside every quantile. `band` already says where the ratio
   * sits relative to the median and p75.
   */
  distribution: {
    source: IbExtensionDistribution['source']
    sampleSize: number
    p25: number
    p90: number
  }
}

export type ClassifyTpoDayInput = {
  /** Price-descending ladder rows (as parsed). */
  rows: TpoRow[]
  /** Price distance between adjacent bins. */
  step: number
  /** Exported Initial Balance, or null when the export carries none. */
  ib: { high: number; low: number } | null
  /** Exported session extremes. */
  sessionRange: { high: number; low: number }
  /** Interior single-print runs (feat-046/091 `singlePrintZones`). */
  singlePrintZones: readonly { top: number; bottom: number }[]
  /** Letter → `HH:MM` map (feat-092); null on exports with no anchor. */
  periodClock: Record<string, string> | null
  tpoPeriodMinutes: number
  /** Reference distribution; defaults to the pinned B7 sample (feat-100 seam). */
  distribution?: IbExtensionDistribution
}

type PeriodRange = { letter: string; index: number; high: number; low: number }

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * Per-period high/low from the ladder. Rows are price-descending, so the first
 * row carrying a letter is that period's high and the last row is its low.
 */
function periodRanges(rows: TpoRow[]): PeriodRange[] {
  const byLetter = new Map<string, PeriodRange>()
  for (const row of rows) {
    for (const letter of row.letters) {
      const existing = byLetter.get(letter)
      if (existing === undefined) {
        byLetter.set(letter, {
          letter,
          index: TPO_PERIOD_LETTERS.indexOf(letter),
          high: row.price,
          low: row.price,
        })
      } else {
        if (row.price > existing.high) existing.high = row.price
        if (row.price < existing.low) existing.low = row.price
      }
    }
  }
  return [...byLetter.values()].sort((a, b) => a.index - b.index)
}

/**
 * Range extension by period: walk the periods in order carrying a running
 * high/low and record every period that pushed either out. The first period
 * establishes the range rather than extending it, so it is not listed.
 */
function rangeExtensions(
  periods: PeriodRange[],
  periodClock: Record<string, string> | null,
): TpoRangeExtension[] {
  const extensions: TpoRangeExtension[] = []
  let high = periods[0].high
  let low = periods[0].low
  for (const period of periods.slice(1)) {
    const up = period.high > high ? round4(period.high - high) : 0
    const down = period.low < low ? round4(low - period.low) : 0
    if (up === 0 && down === 0) continue
    high = Math.max(high, period.high)
    low = Math.min(low, period.low)
    extensions.push({ letter: period.letter, clock: periodClock?.[period.letter] ?? null, up, down })
  }
  return extensions
}

/** Earliest period whose extreme reaches `price` (within one grid step). */
function extremePeriod(
  periods: PeriodRange[],
  price: number,
  end: 'high' | 'low',
  step: number,
  periodClock: Record<string, string> | null,
): TpoPeriodExtreme {
  const best = periods.reduce((champion, period) =>
    end === 'high'
      ? period.high > champion.high
        ? period
        : champion
      : period.low < champion.low
        ? period
        : champion,
  )
  // Prefer the earliest period that reached the ladder extreme; the exported
  // session high/low can sit a fraction of a bin outside the binned ladder.
  const target = end === 'high' ? best.high : best.low
  const first =
    periods.find((period) =>
      end === 'high' ? period.high >= target - step / 2 : period.low <= target + step / 2,
    ) ?? best
  return {
    letter: first.letter,
    clock: periodClock?.[first.letter] ?? null,
    price: end === 'high' ? Math.max(target, price) : Math.min(target, price),
  }
}

function extensionBand(ratio: number, dist: IbExtensionDistribution): IbExtensionBand {
  if (ratio < dist.p25) return 'below-p25'
  if (ratio < dist.median) return 'p25-median'
  if (ratio < dist.p75) return 'median-p75'
  if (ratio < dist.p90) return 'p75-p90'
  return 'above-p90'
}

/**
 * The IB the extension is measured against: the study's own export when it
 * carries one, otherwise the first hour's period letters (the IB is the first
 * hour by definition). Null when neither is available.
 */
function resolveIb(
  ib: { high: number; low: number } | null,
  periods: PeriodRange[],
  tpoPeriodMinutes: number,
): { high: number; low: number; source: 'export' | 'reconstructed' } | null {
  if (ib && ib.high > ib.low) return { ...ib, source: 'export' }
  const span =
    Number.isFinite(tpoPeriodMinutes) && tpoPeriodMinutes > 0
      ? Math.max(1, Math.round(IB_MINUTES / tpoPeriodMinutes))
      : 1
  const ibPeriods = periods.slice(0, span)
  if (ibPeriods.length === 0) return null
  const high = Math.max(...ibPeriods.map((p) => p.high))
  const low = Math.min(...ibPeriods.map((p) => p.low))
  if (!(high > low)) return null
  return { high, low, source: 'reconstructed' }
}

function measureExtension(
  input: ClassifyTpoDayInput,
  periods: PeriodRange[],
  dist: IbExtensionDistribution,
): TpoIbExtension | null {
  const ib = resolveIb(input.ib, periods, input.tpoPeriodMinutes)
  if (!ib) return null
  const range = round4(ib.high - ib.low)
  const dayRange = round4(input.sessionRange.high - input.sessionRange.low)
  if (!(range > 0) || !(dayRange > 0)) return null

  const minExtension = EXTENSION_MIN_BINS * input.step
  const up = round4(Math.max(0, input.sessionRange.high - ib.high))
  const down = round4(Math.max(0, ib.low - input.sessionRange.low))
  const upSide = up >= minExtension
  const downSide = down >= minExtension
  const ratio = round2(dayRange / range)

  return {
    high: ib.high,
    low: ib.low,
    range,
    source: ib.source,
    ratio,
    band: extensionBand(ratio, dist),
    up,
    down,
    sides: upSide && downSide ? 'both' : upSide ? 'up' : downSide ? 'down' : 'none',
  }
}

/**
 * The interior single-print vacuum that splits the ladder into two bodies, or
 * null. Reuses the already-computed interior `singlePrintZones` (feat-046) —
 * runs touching an extreme are tails, and a tail is not a distribution gap.
 */
function findDistributionGap(
  input: ClassifyTpoDayInput,
  dayRange: number,
): { top: number; bottom: number; bins: number } | null {
  const total = input.rows.length
  const candidates = input.singlePrintZones
    .map((zone) => ({
      top: zone.top,
      bottom: zone.bottom,
      bins: Math.round((zone.top - zone.bottom) / input.step) + 1,
      points: round4(zone.top - zone.bottom + input.step),
    }))
    .filter(
      (gap) =>
        gap.bins >= DOUBLE_DISTRIBUTION_MIN_GAP_BINS &&
        gap.points >= DOUBLE_DISTRIBUTION_MIN_GAP_FRACTION * dayRange,
    )
    .sort((a, b) => b.bins - a.bins)

  for (const gap of candidates) {
    const above = input.rows.filter((row) => row.price > gap.top).length
    const below = input.rows.filter((row) => row.price < gap.bottom).length
    const minBody = DOUBLE_DISTRIBUTION_MIN_BODY_FRACTION * total
    if (above >= minBody && below >= minBody) {
      return { top: gap.top, bottom: gap.bottom, bins: gap.bins }
    }
  }
  return null
}

/**
 * Open type from the opening window's period ranges. The TPO export carries no
 * opening PRICE, so the opening period's own range stands in for the open: a
 * drive leaves that range and never returns, a test-drive poke through one
 * side of it and drives out the other, a rejection-reverse auctions well
 * beyond one side before reversing further past the other.
 */
function classifyOpen(
  periods: PeriodRange[],
  periodClock: Record<string, string> | null,
): Pick<TpoClassification, 'openType' | 'openDirection' | 'openTypeBasis'> {
  const window = periods.slice(0, OPEN_WINDOW_PERIODS)
  const first = window[0]
  const windowHigh = Math.max(...window.map((p) => p.high))
  const windowLow = Math.min(...window.map((p) => p.low))
  const windowRange = windowHigh - windowLow
  const openClock = periodClock?.[first.letter] ?? null
  const at = openClock ? ` (${first.letter} ${openClock})` : ` (${first.letter})`

  if (!(windowRange > 0)) {
    return {
      openType: 'open-auction',
      openDirection: null,
      openTypeBasis: `opening periods${at} traded a single bin — no directional information`,
    }
  }

  const above = round4(windowHigh - first.high)
  const below = round4(first.low - windowLow)
  const up = above >= below
  const drive = up ? above : below
  const probe = up ? below : above
  const driveFraction = drive / windowRange
  const probeFraction = probe / windowRange
  const direction: 'up' | 'down' = up ? 'up' : 'down'
  // Sequence matters: the rejected probe must come BEFORE the drive, or the
  // session drove first and faded — which is not an opening read at all.
  const reached = (end: 'high' | 'low', price: number): number =>
    window.findIndex((p) => (end === 'high' ? p.high >= price : p.low <= price))
  const driveIdx = reached(up ? 'high' : 'low', up ? windowHigh : windowLow)
  const probeIdx = reached(up ? 'low' : 'high', up ? windowLow : windowHigh)
  const driveAfterProbe = driveIdx >= probeIdx

  const numbers =
    `${first.letter} range ${round4(first.high - first.low)} pts, ` +
    `${direction} drive ${drive} pts, counter-probe ${probe} pts`

  if (probeFraction <= OPEN_DRIVE_MAX_PROBE_FRACTION && driveFraction >= OPEN_DRIVE_MIN_DRIVE_FRACTION) {
    return {
      openType: 'open-drive',
      openDirection: direction,
      openTypeBasis: `opened${at} and drove ${direction} without trading back through the opening period — ${numbers}`,
    }
  }
  if (
    driveAfterProbe &&
    probe > 0 &&
    probeFraction <= OPEN_TEST_DRIVE_MAX_PROBE_FRACTION &&
    driveFraction >= OPEN_TEST_DRIVE_MIN_DRIVE_FRACTION
  ) {
    return {
      openType: 'open-test-drive',
      openDirection: direction,
      openTypeBasis: `opened${at}, tested the other side shallowly and drove ${direction} — ${numbers}`,
    }
  }
  if (
    driveAfterProbe &&
    probe > 0 &&
    probeFraction > OPEN_TEST_DRIVE_MAX_PROBE_FRACTION &&
    drive >= probe * OPEN_REJECTION_MIN_DRIVE_RATIO
  ) {
    return {
      openType: 'open-rejection-reverse',
      openDirection: direction,
      openTypeBasis: `opened${at}, auctioned the other way, was rejected and reversed ${direction} past it — ${numbers}`,
    }
  }
  return {
    openType: 'open-auction',
    openDirection: null,
    openTypeBasis: `opened${at} and rotated around the opening period — ${numbers}`,
  }
}

/**
 * Day type. Priority is deliberate: the double-distribution SHAPE is checked
 * first because it is the most specific structural read and the one nothing
 * else in the engine names — a session can be both a double distribution and a
 * big one-sided extension (the classic double-distribution trend day), and the
 * basis line says so when it is. After that, both-sided extension is neutral
 * by definition, and the one-sided ladder is cut at the MEASURED quantiles.
 */
function classifyDay(
  input: ClassifyTpoDayInput,
  periods: PeriodRange[],
  extension: TpoIbExtension | null,
  dist: IbExtensionDistribution,
): { dayType: TpoDayType | null; dayTypeBasis: string } {
  const dayRange = round4(input.sessionRange.high - input.sessionRange.low)
  const gap = dayRange > 0 ? findDistributionGap(input, dayRange) : null
  const quantiles = `n=${dist.sampleSize}, ${dist.source}`

  if (gap) {
    const alsoTrend =
      extension && extension.sides !== 'both' && extension.ratio >= dist.p90
        ? `; the ${extension.ratio}x IB extension also clears the trend threshold (double-distribution trend day)`
        : ''
    return {
      dayType: 'double-distribution',
      dayTypeBasis: `two bodies split by a ${gap.bins}-bin single-print vacuum ${gap.bottom}–${gap.top}${alsoTrend}`,
    }
  }

  if (!extension) {
    return {
      dayType: null,
      dayTypeBasis: 'no Initial Balance in the export and none reconstructable — day type not classified',
    }
  }

  const ext = `day/IB ${extension.ratio}x (${extension.band}, ${quantiles})`

  if (extension.sides === 'both') {
    const last = periods[periods.length - 1]
    const atHigh = last.high >= input.sessionRange.high - input.step / 2
    const atLow = last.low <= input.sessionRange.low + input.step / 2
    if (atHigh || atLow) {
      return {
        dayType: 'neutral-extreme',
        dayTypeBasis: `IB extended both sides (up ${extension.up}, down ${extension.down} pts) and the last period ${last.letter} sits on the session ${atHigh ? 'high' : 'low'} — ${ext}`,
      }
    }
    return {
      dayType: 'neutral',
      dayTypeBasis: `IB extended both sides (up ${extension.up}, down ${extension.down} pts) — ${ext}`,
    }
  }

  if (extension.ratio >= dist.p90) {
    return {
      dayType: 'trend',
      dayTypeBasis: `one-sided ${extension.sides} extension of ${extension.sides === 'up' ? extension.up : extension.down} pts, ${ext} — at or above the p90 of ${dist.p90}`,
    }
  }
  if (extension.ratio >= dist.p25) {
    return {
      dayType: 'normal-variation',
      dayTypeBasis: `${extension.sides === 'none' ? 'no' : `one-sided ${extension.sides}`} extension, ${ext}`,
    }
  }
  return {
    dayType: 'normal',
    dayTypeBasis: `the Initial Balance essentially held, ${ext} — below the p25 of ${dist.p25}`,
  }
}

/**
 * Classify one session's TPO ladder. Returns null when the profile is too thin
 * to say anything (`MIN_CLASSIFY_PERIODS`) — never a guess.
 *
 * Requires only the LETTER SEQUENCE. `periodClock` is optional decoration:
 * every `clock` field is null on a bundle with no feat-092 anchor, and no
 * classification depends on one.
 */
export function classifyTpoDay(input: ClassifyTpoDayInput): TpoClassification | null {
  if (input.rows.length === 0) return null
  const periods = periodRanges(input.rows).filter((p) => p.index >= 0)
  if (periods.length < MIN_CLASSIFY_PERIODS) return null

  const dist = input.distribution ?? PINNED_IB_EXTENSION_DISTRIBUTION
  const extension = measureExtension(input, periods, dist)

  return {
    ...classifyDay(input, periods, extension, dist),
    ...classifyOpen(periods, input.periodClock),
    periods: periods.map((p) => p.letter).join(''),
    extension,
    extensions: rangeExtensions(periods, input.periodClock),
    highPeriod: extremePeriod(periods, input.sessionRange.high, 'high', input.step, input.periodClock),
    lowPeriod: extremePeriod(periods, input.sessionRange.low, 'low', input.step, input.periodClock),
    distribution: {
      source: dist.source,
      sampleSize: dist.sampleSize,
      p25: dist.p25,
      p90: dist.p90,
    },
  }
}
