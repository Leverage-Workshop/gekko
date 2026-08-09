import type { TpoPeriodAnchor, TpoProfile, TpoRow } from './parseTpo'
import { buildTpoPeriodClock, TPO_PERIOD_LETTERS } from './tpoPeriodClock'

/**
 * Deterministic TPO / Market Profile reads (feat-046) — the day-structure
 * facts the analyze prompt previously delegated to a screenshot: single-print
 * zones, poor/unfinished extremes, excess tails (feat-091), POC prominence and
 * the Initial Balance.
 * Code-owned like ripStatus/lvnHvnNodes/terrainZones: the model narrates them,
 * never re-derives them from the TPO chart image.
 */

/**
 * A POC holding at least this multiple of the median per-bin TPO count is
 * "prominent" — time has visibly concentrated there, making it a stronger
 * magnet than an ordinary flat-profile POC.
 */
export const POC_PROMINENCE_MIN = 1.5

/**
 * A single-print run touching a profile extreme is only read as excess (a
 * tail) at this many bins or more (feat-091). One lone single-print bin at an
 * extreme is the ordinary shape of a quiet turn, not a rejection worth
 * narrating; two contiguous bins is the smallest run that shows the auction
 * was shut off rather than just thinned.
 */
export const EXCESS_MIN_BINS = 2

export type SinglePrintZone = {
  /** Highest bin price in the zone. */
  top: number
  /** Lowest bin price in the zone. */
  bottom: number
  /** The period letter(s) that traversed the zone (usually one). */
  letters: string
}

export type PoorExtreme = {
  price: number
  tpoCount: number
}

/**
 * TPO excess at one end of the profile (feat-091): the contiguous single-print
 * run that reaches the session extreme. Market Profile calls the one at the
 * LOW a buying tail (responsive buyers shut the auction off) and the one at
 * the HIGH a selling tail. This is the opposite read to `singlePrintZones`,
 * which is deliberately interior-only.
 */
export type TpoTail = {
  /** `buying` = at the session low, `selling` = at the session high. */
  kind: 'buying' | 'selling'
  /** Contiguous single-print bins in the tail. */
  bins: number
  /** Tail length in points (`bins * step` — each bin is one grid step tall). */
  points: number
  /** Highest bin price in the tail. */
  top: number
  /** Lowest bin price in the tail. */
  bottom: number
  /** The profile extreme the tail reaches (its low for buying, high for selling). */
  extreme: number
  /** Period letter(s) that built the tail, in period order (usually one). */
  letters: string
  /**
   * `HH:MM` start of the earliest period that built the tail — when the
   * excess was carved. Null on exports with no period→clock anchor.
   */
  clock: string | null
}

/**
 * Session-wide excess read (feat-091). Always present when the profile has
 * rows; the individual tails are null when that extreme is not single-printed
 * (or the run is shorter than `EXCESS_MIN_BINS`).
 */
export type TpoExcess = {
  /** Excess at the session low. */
  buyingTail: TpoTail | null
  /** Excess at the session high. */
  sellingTail: TpoTail | null
  /** Bins in the ladder holding exactly one TPO. */
  singlePrintBins: number
  /** Bins in the ladder. */
  totalBins: number
  /** `singlePrintBins / totalBins`, 0–1 rounded to 2 dp. */
  singlePrintFraction: number
}

export type TpoFacts = {
  sessionDate: string
  session: 'RTH' | 'ETH'
  tpoPeriodMinutes: number
  /**
   * The export's period→clock anchor (feat-092): which letter opens the
   * session and when. Null on bundles exported before the anchor lines
   * existed — letters then carry order but no time.
   */
  firstPeriod: TpoPeriodAnchor | null
  /**
   * Every period letter present in the ladder mapped to its `HH:MM` start,
   * in period order. Null when `firstPeriod` is null. Lets letter-sequenced
   * reads (which period built the high, when a single-print zone formed) be
   * stated as clock times instead of bare letters.
   */
  periodClock: Record<string, string> | null
  poc: {
    price: number
    tpoCount: number
    /** `tpoCount / median bin count`, rounded to 2 dp. */
    prominence: number
    prominent: boolean
  }
  valueArea: { high: number; low: number }
  /** First-hour Initial Balance; null when the export carries no IB (zeros). */
  initialBalance: { high: number; low: number } | null
  sessionRange: { high: number; low: number }
  /**
   * Contiguous count==1 runs strictly INSIDE the profile — one-sided
   * initiative traverses (operator doctrine 2026-07-27: they favor entries in
   * the direction of the move that created them, anchored at the near-edge
   * border; never a reason to disqualify that border). Runs touching the
   * profile's extreme rows are tails, not single-print zones — they are
   * measured in `excess` (feat-091), not here.
   */
  singlePrintZones: SinglePrintZone[]
  /** 2+ TPO shelf at the session high — an unfinished auction, repair magnet above. */
  poorHigh: PoorExtreme | null
  /** 2+ TPO shelf at the session low — an unfinished auction, repair magnet below. */
  poorLow: PoorExtreme | null
  /**
   * TPO excess at the extremes (feat-091) — the single-print runs
   * `singlePrintZones` drops by design, plus how much of the session was
   * single-printed at all. A poor extreme and a tail are mutually exclusive at
   * the same end: a 2+ TPO shelf is an unfinished auction, a single-print tail
   * is a finished (rejected) one.
   */
  excess: TpoExcess
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/**
 * Contiguous single-print runs, excluding runs that include the first or last
 * row (tails at the extremes are excess, measured by `detectExcess`, not
 * single-print zones). Rows are price-descending; a run breaks on any
 * price gap wider than one grid step (an untraded hole is not continuity).
 */
function detectSinglePrintZones(rows: TpoRow[], step: number): SinglePrintZone[] {
  const zones: SinglePrintZone[] = []
  let run: TpoRow[] = []

  const flush = () => {
    if (run.length === 0) return
    const touchesExtreme = run[0] === rows[0] || run[run.length - 1] === rows[rows.length - 1]
    if (!touchesExtreme) {
      zones.push({
        top: run[0].price,
        bottom: run[run.length - 1].price,
        letters: [...new Set(run.flatMap((r) => r.letters.split('')))].join(''),
      })
    }
    run = []
  }

  for (const row of rows) {
    const prev = run[run.length - 1]
    const contiguous =
      prev !== undefined && Math.abs(prev.price - row.price - step) < 0.0001
    if (row.tpoCount === 1) {
      if (prev !== undefined && !contiguous) flush()
      run = [...run, row]
    } else {
      flush()
    }
  }
  flush()
  return zones
}

/** 2+ TPOs at the extreme bin = an unfinished (poor) auction extreme. */
function detectPoorExtreme(row: TpoRow | undefined): PoorExtreme | null {
  if (!row || row.tpoCount < 2) return null
  return { price: row.price, tpoCount: row.tpoCount }
}

/**
 * The contiguous single-print run anchored at one end of the (price-descending)
 * ladder, top-down. Empty when that extreme bin holds 2+ TPOs. Contiguity uses
 * the same one-grid-step rule as `detectSinglePrintZones`: an untraded hole
 * ends the run.
 */
function extremeSinglePrintRun(rows: TpoRow[], step: number, end: 'top' | 'bottom'): TpoRow[] {
  const walk = end === 'top' ? rows : [...rows].reverse()
  const run: TpoRow[] = []
  for (const row of walk) {
    if (row.tpoCount !== 1) break
    const prev = run[run.length - 1]
    if (prev !== undefined && Math.abs(Math.abs(prev.price - row.price) - step) > 0.0001) break
    run.push(row)
  }
  return end === 'top' ? run : run.reverse()
}

/** Period letters of a run, de-duplicated and sorted into period order. */
function runLetters(run: TpoRow[]): string {
  return [...new Set(run.flatMap((r) => r.letters.split('')))]
    .sort((a, b) => TPO_PERIOD_LETTERS.indexOf(a) - TPO_PERIOD_LETTERS.indexOf(b))
    .join('')
}

function buildTail(
  run: TpoRow[],
  rowCount: number,
  step: number,
  kind: 'buying' | 'selling',
  periodClock: Record<string, string> | null,
): TpoTail | null {
  // A run covering the WHOLE ladder is a profile with no body — there is no
  // excess relative to value, so neither extreme gets a tail.
  if (run.length < EXCESS_MIN_BINS || run.length >= rowCount) return null
  const letters = runLetters(run)
  const first = letters[0]
  return {
    kind,
    bins: run.length,
    points: round4(run.length * step),
    top: run[0].price,
    bottom: run[run.length - 1].price,
    extreme: kind === 'selling' ? run[0].price : run[run.length - 1].price,
    letters,
    clock: (first !== undefined ? periodClock?.[first] : undefined) ?? null,
  }
}

/**
 * TPO excess at both extremes plus the session's single-print fraction
 * (feat-091). Additive to `detectSinglePrintZones`, which keeps its
 * interior-only semantics: the runs dropped there are measured here.
 */
function detectExcess(
  rows: TpoRow[],
  step: number,
  periodClock: Record<string, string> | null,
): TpoExcess {
  const singlePrintBins = rows.filter((r) => r.tpoCount === 1).length
  return {
    buyingTail: buildTail(
      extremeSinglePrintRun(rows, step, 'bottom'),
      rows.length,
      step,
      'buying',
      periodClock,
    ),
    sellingTail: buildTail(
      extremeSinglePrintRun(rows, step, 'top'),
      rows.length,
      step,
      'selling',
      periodClock,
    ),
    singlePrintBins,
    totalBins: rows.length,
    singlePrintFraction: round2(singlePrintBins / rows.length),
  }
}

export function computeTpoFacts(profile: TpoProfile): TpoFacts {
  const { meta, summary, rows } = profile
  if (rows.length === 0) {
    throw new Error('TPO profile has no rows')
  }

  const counts = rows.map((r) => r.tpoCount)
  const medianCount = median(counts)
  // The exported POC price is authoritative; fall back to the max-count row
  // only when the summary price is missing from the ladder (bin drift).
  const pocRow =
    rows.find((r) => Math.abs(r.price - summary.pocPrice) < 0.0001) ??
    rows.reduce((best, r) => (r.tpoCount > best.tpoCount ? r : best))
  const prominence = medianCount > 0 ? round2(pocRow.tpoCount / medianCount) : 0

  const hasIb = summary.ibHigh > 0 && summary.ibLow > 0
  const periods = buildTpoPeriodClock(
    meta,
    rows.map((r) => r.letters),
  )
  const periodClock =
    periods.length > 0 ? Object.fromEntries(periods.map((p) => [p.letter, p.clock])) : null

  return {
    sessionDate: meta.sessionDate,
    session: meta.session,
    tpoPeriodMinutes: meta.tpoPeriodMinutes,
    firstPeriod: meta.firstPeriod,
    periodClock,
    poc: {
      price: pocRow.price,
      tpoCount: pocRow.tpoCount,
      prominence,
      prominent: prominence >= POC_PROMINENCE_MIN,
    },
    valueArea: { high: summary.valueAreaHigh, low: summary.valueAreaLow },
    initialBalance: hasIb ? { high: summary.ibHigh, low: summary.ibLow } : null,
    sessionRange: { high: summary.sessionHigh, low: summary.sessionLow },
    singlePrintZones: detectSinglePrintZones(rows, meta.step),
    poorHigh: detectPoorExtreme(rows[0]),
    poorLow: detectPoorExtreme(rows[rows.length - 1]),
    excess: detectExcess(rows, meta.step, periodClock),
  }
}
