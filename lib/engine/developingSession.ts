import type { DailyValueArea } from './parseDailyValueAreas'
import { RTH_OPEN_MINUTES, minutesOfDay } from './overnightSession'
import { RTH_CLOSE_MINUTES, classifyRvol } from './relativeVolume'
import type { RvolBand } from './relativeVolume'
import { positionVsValueArea } from './valueMigration'
import type { PricePosition } from './valueMigration'

/**
 * Code-owned DEVELOPING-session read (feat-089; bundle review 2026-08-07 D1).
 *
 * `daily-value-areas.csv` ships the live in-progress RTH session as row 1,
 * contradicting its own exporter contract. Every consumer that documented its
 * input as "completed sessions" therefore read today as the prior day. The fix
 * partitions rather than discards, because that row is the only VOLUME-based
 * view of the live session anywhere in the bundle — developing volume
 * POC/VAH/VAL, session high/low and volume so far — and it is genuinely
 * distinct from the time-based TPO read on the same day (bundle 1c15934a:
 * volume POC 29520 / VA 29476.75–29620 against TPO POC 29541 / VA 29478–29638,
 * a ~20-pt POC disagreement between how VOLUME and how TIME distributed).
 *
 * An unfinished value area at 09:00 is not the same object as one at 14:30, so
 * the fact carries a MATURITY qualifier the model reads before trusting it:
 *
 *  - elapsed RTH minutes against the 390-minute cash session,
 *  - volume so far against the time-of-day expectation — the feat-094 seam
 *    (`expectedRthVolumeThrough(...).expectedFraction`) multiplied by the
 *    completed-session volume median, so the comparison stays in
 *    `SessionVolume` units instead of forking the baseline,
 *  - range used so far against the completed-session median range (445 of a
 *    typical 464 pts on the reference bundle — a full day's travel already
 *    printed by 13:31, a different statement from "the range is contracting").
 *
 * Every leg degrades independently: no chart clock → no elapsed read, no HTF
 * volume history → no volume read, too few completed sessions → no range read.
 */

/** Minutes in a full RTH cash session (08:30–15:00 chart time). */
export const RTH_SESSION_MINUTES = RTH_CLOSE_MINUTES - RTH_OPEN_MINUTES

/** Completed sessions the range/volume medians need before they are trusted. */
export const DEVELOPING_MIN_BASELINE_SESSIONS = 5

/** At or below this fraction of the session elapsed, the value area is barely formed. */
export const DEVELOPING_EARLY_MAX_FRACTION = 0.34

/** At or above this fraction elapsed, the developing value area is worth reading as structure. */
export const DEVELOPING_MATURE_MIN_FRACTION = 0.67

/**
 * How much of the session the developing value area has had to form:
 * 'early' — barely more than the Initial Balance, 'developing' — half-built,
 * 'mature' — most of the auction is in, 'unknown' — no clock or volume
 * expectation was available (treat it as unqualified).
 */
export type DevelopingMaturityRead = 'early' | 'developing' | 'mature' | 'unknown'

export type DevelopingSessionFacts = {
  /** The live trading day this row belongs to (matched by date, never by position). */
  date: string
  /** Developing VOLUME point of control — compare against `tpo.poc`, the TIME-based read. */
  poc: number
  /** Developing volume value-area high. */
  vah: number
  /** Developing volume value-area low. */
  val: number
  sessionHigh: number
  sessionLow: number
  /** RTH volume so far (a running total, never a whole-session number). */
  sessionVolume: number
  /** Session travel so far, high − low (2 dp). */
  rangePts: number
  /**
   * Where the current price sits relative to the DEVELOPING value area. This is
   * the "am I inside the value being built right now" read — distinct from
   * `valueMigration.currentPriceVsPriorValue`, which answers it against the
   * prior COMPLETED session. Null without a current price.
   */
  currentPriceVsDevelopingValue: { position: PricePosition; pointsOutside: number } | null
  maturity: {
    read: DevelopingMaturityRead
    /** RTH minutes elapsed at the bundle's chart clock, clamped to the session. Null when no clock. */
    elapsedRthMinutes: number | null
    /** elapsedRthMinutes / {@link RTH_SESSION_MINUTES} (2 dp); null when no clock. */
    elapsedFraction: number | null
    /**
     * Volume so far against what a normal session has printed by this time of
     * day. Null when the bundle carries no per-slot volume history (feat-094)
     * or too few completed sessions for a whole-session median.
     */
    volume: {
      /** Median `SessionVolume` across the completed sessions. */
      medianSessionVolume: number
      /** Fraction of a normal session's volume expected by now (feat-094). */
      expectedFraction: number
      /** medianSessionVolume × expectedFraction, rounded. */
      expectedVolume: number
      /** sessionVolume / expectedVolume (2 dp). */
      ratio: number
      band: RvolBand
    } | null
    /**
     * Range used so far against the completed-session median range. Null with
     * fewer than {@link DEVELOPING_MIN_BASELINE_SESSIONS} completed sessions.
     */
    range: {
      medianCompletedRangePts: number
      /** rangePts / medianCompletedRangePts (2 dp) — >1 means a full day's travel already printed. */
      usedFraction: number
    } | null
    /** One-line summary of the qualifier, for the briefing prose. */
    basis: string
  }
}

export type DevelopingSessionInput = {
  /** The live session's row — `partitionDailyValueAreas(...).developing`. */
  developing: DailyValueArea
  /** The completed remainder, newest first, for the medians. */
  completed: readonly DailyValueArea[]
  /** Live price for the vs-developing-value read; null when unavailable. */
  currentPrice: number | null
  /**
   * Freshest chart-time instant in the bundle (the last execution bar's
   * timestamp). Chart time is US Central, same assumption as
   * `overnightSession`. Null → the elapsed-minutes leg degrades.
   */
  chartNow?: Date | null
  /**
   * `relativeVolume.sessionSoFar.expectedFraction` (feat-094) — the fraction of
   * a normal session's volume printed by now. Reusing it keeps ONE time-of-day
   * expectation in the engine and keeps the day-level RVOL and this qualifier
   * from disagreeing. Null → the volume leg degrades.
   */
  expectedVolumeFraction?: number | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function classifyMaturity(fraction: number | null): DevelopingMaturityRead {
  if (fraction === null) return 'unknown'
  if (fraction <= DEVELOPING_EARLY_MAX_FRACTION) return 'early'
  if (fraction >= DEVELOPING_MATURE_MIN_FRACTION) return 'mature'
  return 'developing'
}

export function computeDevelopingSession(
  input: DevelopingSessionInput,
): DevelopingSessionFacts {
  const { developing, completed, currentPrice } = input

  const rangePts = round2(developing.sessionHigh - developing.sessionLow)

  const elapsedRthMinutes =
    input.chartNow instanceof Date && !isNaN(input.chartNow.getTime())
      ? Math.max(
          0,
          Math.min(RTH_SESSION_MINUTES, minutesOfDay(input.chartNow) - RTH_OPEN_MINUTES),
        )
      : null
  const elapsedFraction =
    elapsedRthMinutes === null ? null : round2(elapsedRthMinutes / RTH_SESSION_MINUTES)

  const volumes = completed
    .map((s) => s.sessionVolume)
    .filter((v) => Number.isFinite(v) && v > 0)
  const expectedFraction = input.expectedVolumeFraction
  let volume: DevelopingSessionFacts['maturity']['volume'] = null
  if (
    volumes.length >= DEVELOPING_MIN_BASELINE_SESSIONS &&
    typeof expectedFraction === 'number' &&
    Number.isFinite(expectedFraction) &&
    expectedFraction > 0 &&
    Number.isFinite(developing.sessionVolume) &&
    developing.sessionVolume > 0
  ) {
    const medianSessionVolume = Math.round(median(volumes))
    const expectedVolume = Math.round(medianSessionVolume * expectedFraction)
    if (expectedVolume > 0) {
      const ratio = round2(developing.sessionVolume / expectedVolume)
      volume = {
        medianSessionVolume,
        expectedFraction,
        expectedVolume,
        ratio,
        band: classifyRvol(ratio),
      }
    }
  }

  const completedRanges = completed
    .map((s) => s.sessionHigh - s.sessionLow)
    .filter((r) => Number.isFinite(r) && r > 0)
  let range: DevelopingSessionFacts['maturity']['range'] = null
  if (completedRanges.length >= DEVELOPING_MIN_BASELINE_SESSIONS) {
    const medianCompletedRangePts = round2(median(completedRanges))
    if (medianCompletedRangePts > 0) {
      range = {
        medianCompletedRangePts,
        usedFraction: round2(rangePts / medianCompletedRangePts),
      }
    }
  }

  // The clock is the primary qualifier; the volume expectation is the fallback
  // when the bundle has no chart clock but does have slot history.
  const read = classifyMaturity(elapsedFraction ?? volume?.expectedFraction ?? null)

  const parts: string[] = []
  if (elapsedRthMinutes !== null) {
    parts.push(`${elapsedRthMinutes} of ${RTH_SESSION_MINUTES} RTH minutes elapsed`)
  }
  if (volume !== null) {
    parts.push(
      `volume so far ${developing.sessionVolume} vs an expected ${volume.expectedVolume} (${Math.round(volume.expectedFraction * 100)}% of a normal session's participation)`,
    )
  }
  if (range !== null) {
    parts.push(
      `${rangePts} pts travelled vs a ${range.medianCompletedRangePts}-pt completed-session median`,
    )
  }
  const basis =
    parts.length > 0
      ? parts.join('; ')
      : 'no clock, volume or range baseline available — treat the developing value area as unqualified'

  return {
    date: developing.date,
    poc: developing.poc,
    vah: developing.vah,
    val: developing.val,
    sessionHigh: developing.sessionHigh,
    sessionLow: developing.sessionLow,
    sessionVolume: developing.sessionVolume,
    rangePts,
    currentPriceVsDevelopingValue:
      currentPrice !== null && Number.isFinite(currentPrice)
        ? positionVsValueArea(currentPrice, developing.vah, developing.val)
        : null,
    maturity: {
      read,
      elapsedRthMinutes,
      elapsedFraction,
      volume,
      range,
      basis,
    },
  }
}
