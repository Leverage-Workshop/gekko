import type { TpoPeriodAnchor, TpoProfile, TpoRow } from './parseTpo'
import { buildTpoPeriodClock } from './tpoPeriodClock'

/**
 * Deterministic TPO / Market Profile reads (feat-046) — the day-structure
 * facts the analyze prompt previously delegated to a screenshot: single-print
 * zones, poor/unfinished extremes, POC prominence and the Initial Balance.
 * Code-owned like ripStatus/lvnHvnNodes/terrainZones: the model narrates them,
 * never re-derives them from the TPO chart image.
 */

/**
 * A POC holding at least this multiple of the median per-bin TPO count is
 * "prominent" — time has visibly concentrated there, making it a stronger
 * magnet than an ordinary flat-profile POC.
 */
export const POC_PROMINENCE_MIN = 1.5

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
   * profile's extreme rows are tails, not single-print zones.
   */
  singlePrintZones: SinglePrintZone[]
  /** 2+ TPO shelf at the session high — an unfinished auction, repair magnet above. */
  poorHigh: PoorExtreme | null
  /** 2+ TPO shelf at the session low — an unfinished auction, repair magnet below. */
  poorLow: PoorExtreme | null
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Contiguous single-print runs, excluding runs that include the first or last
 * row (tails at the extremes belong to poor/tapered-extreme reads, not
 * single-print-zone reads). Rows are price-descending; a run breaks on any
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
  return {
    sessionDate: meta.sessionDate,
    session: meta.session,
    tpoPeriodMinutes: meta.tpoPeriodMinutes,
    firstPeriod: meta.firstPeriod,
    periodClock:
      periods.length > 0 ? Object.fromEntries(periods.map((p) => [p.letter, p.clock])) : null,
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
  }
}
