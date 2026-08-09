import type { DailyValueArea } from './parseDailyValueAreas'
import type { HtfBar } from './parseHtfBars'
import { RTH_OPEN_MINUTES, minutesOfDay, tradingDayOf } from './overnightSession'

/**
 * Code-owned relative-volume read (feat-094; bundle review 2026-08-07 B1/D4).
 *
 * "Is participation heavy or light right now" was a vision read on the
 * execution chart. `htf_bar_data.rolling.csv` already ships ~90 days of 30-min
 * bars WITH volume — 46 distinct intraday slots at a median of ~64 sessions
 * each — and `htfStructure` / `multiDayTpo` / `overnightSession` all read OHLC
 * only. This module turns that unused column into a number: a per-slot volume
 * baseline (median across prior sessions, so a single news day cannot move it)
 * and today's volume against it.
 *
 * The day-level companion comes from `daily-value-areas.csv`'s `SessionVolume`,
 * which was parsed into `DailyValueArea.sessionVolume` and referenced nowhere
 * else. When that row is the live in-progress session its volume is a
 * volume-SO-FAR, so it is compared against the time-of-day expectation
 * (the fraction of a normal session's volume that has typically printed by
 * now), not against a whole-session median.
 *
 * RVOL is deliberately surfaced as a SCALAR the other facts cite rather than a
 * trigger of its own: a delta divergence at 0.7x is noise, the same divergence
 * at 1.4x is information. Every read degrades to null when a slot has too
 * little history rather than reporting a ratio built on three sessions.
 *
 * Chart time is US Central (exchange-local) — the same assumption
 * `overnightSession` verified against the live export; the RTH open/close
 * constants are shared with it rather than re-derived.
 */

/** RTH close, minutes after midnight chart time (15:00 CT) — the cash close the value-area export's `SessionVolume` covers. */
export const RTH_CLOSE_MINUTES = 15 * 60

/** Prior sessions a slot needs before its median is trusted as a baseline. */
export const RVOL_MIN_SLOT_SESSIONS = 10

/** Most recent prior sessions per slot that feed the median (recency without losing robustness). */
export const RVOL_BASELINE_LOOKBACK_SESSIONS = 60

/** Completed slots reported in the per-slot series (3 h @ 30-min). */
export const RVOL_REPORTED_SLOTS = 6

/** Completed sessions the day-level `SessionVolume` median needs. */
export const RVOL_MIN_DAILY_SESSIONS = 5

/** Below this ratio the tape is effectively dead — participation has left. */
export const RVOL_DEAD_MAX = 0.5

/** Below this ratio participation is light: order-flow signals get discounted. */
export const RVOL_LIGHT_MAX = 0.8

/** Up to this ratio participation is normal — no confirmation, no discount. */
export const RVOL_NORMAL_MAX = 1.25

/** Up to this ratio participation is elevated; beyond it, heavy. */
export const RVOL_ELEVATED_MAX = 1.75

/** Where the measured ratio sits against the {@link RVOL_DEAD_MAX} … {@link RVOL_ELEVATED_MAX} bands. */
export type RvolBand = 'dead' | 'light' | 'normal' | 'elevated' | 'heavy'

/**
 * What the band means for OTHER order-flow facts: 'discount' — treat delta,
 * absorption and pace reads as low-information; 'confirming' — participation
 * backs them; 'neutral' — no adjustment either way.
 */
export type RvolGate = 'discount' | 'neutral' | 'confirming'

/**
 * Which read the headline scalar came from. Resolution order is
 * slot → session-so-far → daily: the tightest read that has enough history
 * wins, and the coarser ones are the fallback rather than the default.
 */
export type RvolSource = 'slot' | 'session-so-far' | 'daily'

export type SlotBaseline = {
  /** Slot start, minutes after midnight chart time. */
  slotMinutes: number
  /** Slot start as `HH:MM` chart time. */
  slot: string
  /** Median volume for this slot across the contributing prior sessions. */
  medianVolume: number
  /** Prior sessions behind the median. */
  sessions: number
}

export type SlotRvol = {
  /** Slot start as `HH:MM` chart time. */
  slot: string
  /** Bar start time, `YYYY-MM-DD HH:MM` chart time. */
  dateTime: string
  volume: number
  /** The slot's baseline median; null when fewer than {@link RVOL_MIN_SLOT_SESSIONS} prior sessions. */
  baselineVolume: number | null
  baselineSessions: number
  /** volume / baselineVolume (2 dp); null without a baseline. */
  rvol: number | null
  band: RvolBand | null
}

export type SessionSoFarRvol = {
  /** `HH:MM` of the last COMPLETED RTH slot included. */
  throughSlot: string
  /** Today's volume summed over the covered slots. */
  volume: number
  /** Sum of those slots' baseline medians. */
  expectedVolume: number
  /** Covered slots / RTH slots with a usable baseline. */
  slotsCovered: number
  slotsTotal: number
  /** expectedVolume / the full RTH day's expected volume (2 dp) — how far into a normal day's participation we are. */
  expectedFraction: number
  /** volume / expectedVolume (2 dp). */
  rvol: number
  band: RvolBand
}

export type DailyVolumeRvol = {
  /** The session the `SessionVolume` row belongs to. */
  date: string
  sessionVolume: number
  /** Median `SessionVolume` across the other sessions in the history. */
  medianSessionVolume: number
  baselineSessions: number
  /** True when this row is the live, still-developing session (its volume is a floor). */
  inProgress: boolean
  /**
   * Fraction of a normal session's volume expected by now — the time-of-day
   * expectation from the per-slot baselines. 1 for a completed session, and 1
   * (with `inProgress` true) when no intraday expectation could be computed.
   */
  expectedFraction: number
  /** medianSessionVolume × expectedFraction, rounded. */
  expectedVolume: number
  /** sessionVolume / expectedVolume (2 dp). */
  rvol: number
  band: RvolBand
}

export type RelativeVolumeFacts = {
  /** Chart-time trading day the intraday reads cover (from the last HTF bar). */
  sessionDate: string
  /**
   * The most recent COMPLETED 30-min slot WITH a usable baseline, vs its own
   * history — the headline "right now" read. Null before the session's first
   * slot completes, or when none of the reported slots has enough history.
   */
  current: SlotRvol | null
  /** The completed slots of this session, newest first, capped at {@link RVOL_REPORTED_SLOTS}. */
  recentSlots: SlotRvol[]
  /** Cumulative RTH volume so far vs what a normal session prints by this time. Null before the RTH open. */
  sessionSoFar: SessionSoFarRvol | null
  /** Day-level companion from `daily-value-areas.csv`'s `SessionVolume`. Null without enough history. */
  daily: DailyVolumeRvol | null
  /**
   * The scalar every other fact cites. Resolved from the strongest available
   * read: the current slot, else session-so-far, else the day level. Null when
   * none of the three has enough history — the honest "no RVOL" state.
   */
  participation: {
    rvol: number
    band: RvolBand
    gate: RvolGate
    source: RvolSource
    /** What the number was measured against, for the briefing prose. */
    basis: string
  } | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function fmtChartTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtSlot(slotMinutes: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(slotMinutes / 60))}:${pad(slotMinutes % 60)}`
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/** Band lookup for a measured ratio; shared by every read so one set of constants governs. */
export function classifyRvol(rvol: number): RvolBand {
  if (rvol < RVOL_DEAD_MAX) return 'dead'
  if (rvol < RVOL_LIGHT_MAX) return 'light'
  if (rvol <= RVOL_NORMAL_MAX) return 'normal'
  if (rvol <= RVOL_ELEVATED_MAX) return 'elevated'
  return 'heavy'
}

/**
 * The confidence gate other order-flow facts read. Derived from the band so
 * there is exactly one set of thresholds to drift.
 */
export function rvolGate(band: RvolBand): RvolGate {
  if (band === 'dead' || band === 'light') return 'discount'
  if (band === 'normal') return 'neutral'
  return 'confirming'
}

/**
 * Per-intraday-slot volume medians across the export's prior sessions.
 *
 * Exported for reuse: feat-089's developing-session maturity qualifier needs
 * the same time-of-day expectation, and recomputing it there would fork the
 * baseline. Pair with {@link expectedRthVolumeThrough}.
 *
 * @param bars chronological parsed export (oldest first, partial bar last).
 * @param opts.excludeTradingDay a chart-time trading day (`YYYY-MM-DD`) whose
 *   bars are kept OUT of the medians — pass the live session so it is never
 *   measured against itself (and so the in-progress final bar never pollutes a
 *   baseline).
 */
export function computeSlotBaselines(
  bars: readonly HtfBar[],
  opts?: { excludeTradingDay?: string | null },
): SlotBaseline[] {
  const exclude = opts?.excludeTradingDay ?? null
  const bySlot = new Map<number, number[]>()
  for (const bar of bars) {
    if (!Number.isFinite(bar.volume) || bar.volume <= 0) continue
    if (exclude !== null && tradingDayOf(bar) === exclude) continue
    const slotMinutes = minutesOfDay(bar.dateTime)
    const list = bySlot.get(slotMinutes)
    if (list) list.push(bar.volume)
    else bySlot.set(slotMinutes, [bar.volume])
  }

  return [...bySlot.entries()]
    .map(([slotMinutes, volumes]) => {
      // Bars arrive chronologically, so the tail is the most recent history.
      const window = volumes.slice(-RVOL_BASELINE_LOOKBACK_SESSIONS)
      return {
        slotMinutes,
        slot: fmtSlot(slotMinutes),
        medianVolume: Math.round(median(window)),
        sessions: window.length,
      }
    })
    .sort((a, b) => a.slotMinutes - b.slotMinutes)
}

export type RthVolumeExpectation = {
  /** Sum of the baseline medians for the covered RTH slots. */
  expectedVolume: number
  /** expectedVolume / the whole RTH day's expected volume (2 dp). */
  expectedFraction: number
  slotsCovered: number
  /** RTH slots with a usable baseline across the whole session. */
  slotsTotal: number
  /** The covered slots' start minutes — so a caller sums the SAME slots it expects. */
  coveredSlotMinutes: number[]
}

/**
 * How much RTH volume a normal session has printed from the open through
 * `throughMinutes` (inclusive of the slot starting at that minute).
 *
 * Exported alongside {@link computeSlotBaselines} for feat-089: multiply
 * `expectedFraction` by a whole-session volume median to get an expected
 * volume-so-far in `SessionVolume` units, or use `expectedVolume` directly
 * when working in 30-min bar units.
 *
 * @returns null when no RTH slot carries a usable baseline.
 */
export function expectedRthVolumeThrough(
  baselines: readonly SlotBaseline[],
  throughMinutes: number,
): RthVolumeExpectation | null {
  const rth = baselines.filter(
    (b) =>
      b.sessions >= RVOL_MIN_SLOT_SESSIONS &&
      b.slotMinutes >= RTH_OPEN_MINUTES &&
      b.slotMinutes < RTH_CLOSE_MINUTES,
  )
  if (rth.length === 0) return null
  const total = rth.reduce((sum, b) => sum + b.medianVolume, 0)
  if (total <= 0) return null

  const covered = rth.filter((b) => b.slotMinutes <= throughMinutes)
  const expectedVolume = covered.reduce((sum, b) => sum + b.medianVolume, 0)
  return {
    expectedVolume,
    expectedFraction: round2(expectedVolume / total),
    slotsCovered: covered.length,
    slotsTotal: rth.length,
    coveredSlotMinutes: covered.map((b) => b.slotMinutes),
  }
}

function slotRvol(bar: HtfBar, baseline: SlotBaseline | undefined): SlotRvol {
  const usable =
    baseline !== undefined &&
    baseline.sessions >= RVOL_MIN_SLOT_SESSIONS &&
    baseline.medianVolume > 0
  const rvol = usable ? round2(bar.volume / baseline.medianVolume) : null
  return {
    slot: fmtSlot(minutesOfDay(bar.dateTime)),
    dateTime: fmtChartTime(bar.dateTime),
    volume: bar.volume,
    baselineVolume: usable ? baseline.medianVolume : null,
    baselineSessions: baseline?.sessions ?? 0,
    rvol,
    band: rvol === null ? null : classifyRvol(rvol),
  }
}

/**
 * Day-level RVOL from the value-area history's `SessionVolume`.
 *
 * The newest row is the subject; the remaining rows are the baseline. When the
 * newest row is the live session its volume is a running total, so it is
 * measured against `medianSessionVolume × expectedFraction` instead of the
 * whole-session median — otherwise every morning reads as "light".
 */
function computeDailyVolumeRvol(
  sessions: readonly DailyValueArea[],
  sessionDate: string,
  intradayExpectedFraction: number | null,
): DailyVolumeRvol | null {
  if (sessions.length === 0) return null
  const subject = sessions[0]
  const baseline = sessions
    .slice(1)
    .filter((s) => s.date !== subject.date && Number.isFinite(s.sessionVolume) && s.sessionVolume > 0)
  if (baseline.length < RVOL_MIN_DAILY_SESSIONS) return null
  if (!Number.isFinite(subject.sessionVolume) || subject.sessionVolume <= 0) return null

  const medianSessionVolume = Math.round(median(baseline.map((s) => s.sessionVolume)))
  if (medianSessionVolume <= 0) return null

  const inProgress = subject.date === sessionDate
  // A completed row is measured against a whole session. A live row without a
  // usable intraday expectation falls back to fraction 1 — `inProgress` tells
  // the model the ratio is a floor, which beats suppressing the fact entirely.
  const expectedFraction =
    inProgress && intradayExpectedFraction !== null && intradayExpectedFraction > 0
      ? intradayExpectedFraction
      : 1
  const expectedVolume = Math.round(medianSessionVolume * expectedFraction)
  if (expectedVolume <= 0) return null

  const rvol = round2(subject.sessionVolume / expectedVolume)
  return {
    date: subject.date,
    sessionVolume: subject.sessionVolume,
    medianSessionVolume,
    baselineSessions: baseline.length,
    inProgress,
    expectedFraction,
    expectedVolume,
    rvol,
    band: classifyRvol(rvol),
  }
}

export type RelativeVolumeInput = {
  /** Chronological parsed HTF export (oldest first, in-progress bar last). */
  bars: readonly HtfBar[]
  /**
   * Daily value-area history (newest first), for the day-level companion.
   * Omit/null when the bundle carries none — `daily` degrades to null.
   */
  dailySessions?: readonly DailyValueArea[] | null
}

/**
 * @throws when `bars` is empty — callers gate on a non-empty parse.
 */
export function computeRelativeVolume(input: RelativeVolumeInput): RelativeVolumeFacts {
  const { bars } = input
  if (bars.length === 0) {
    throw new Error('relative volume needs at least one bar')
  }

  const sessionDate = tradingDayOf(bars[bars.length - 1])
  const baselines = computeSlotBaselines(bars, { excludeTradingDay: sessionDate })
  const baselineBySlot = new Map(baselines.map((b) => [b.slotMinutes, b]))

  // The export's final row is the in-progress bar (parseHtfBars contract), so a
  // partial 30-min volume can never be compared against a full-slot median.
  const todayBars = bars
    .slice(0, -1)
    .filter((b) => tradingDayOf(b) === sessionDate && Number.isFinite(b.volume) && b.volume > 0)

  const completedSlots = todayBars.map((bar) => slotRvol(bar, baselineBySlot.get(minutesOfDay(bar.dateTime))))
  const recentSlots = completedSlots.slice(-RVOL_REPORTED_SLOTS).reverse()
  const current = recentSlots.find((s) => s.rvol !== null) ?? null

  const todayRthBars = todayBars.filter((b) => {
    const mins = minutesOfDay(b.dateTime)
    return mins >= RTH_OPEN_MINUTES && mins < RTH_CLOSE_MINUTES
  })
  let sessionSoFar: SessionSoFarRvol | null = null
  if (todayRthBars.length > 0) {
    const throughMinutes = minutesOfDay(todayRthBars[todayRthBars.length - 1].dateTime)
    const expectation = expectedRthVolumeThrough(baselines, throughMinutes)
    if (expectation !== null && expectation.expectedVolume > 0) {
      // Sum exactly the slots the expectation covers, so a today-slot without a
      // usable baseline cannot inflate the numerator against a smaller denominator.
      const covered = new Set(expectation.coveredSlotMinutes)
      const volume = todayRthBars
        .filter((b) => covered.has(minutesOfDay(b.dateTime)))
        .reduce((sum, b) => sum + b.volume, 0)
      const rvol = round2(volume / expectation.expectedVolume)
      sessionSoFar = {
        throughSlot: fmtSlot(throughMinutes),
        volume,
        expectedVolume: expectation.expectedVolume,
        slotsCovered: expectation.slotsCovered,
        slotsTotal: expectation.slotsTotal,
        expectedFraction: expectation.expectedFraction,
        rvol,
        band: classifyRvol(rvol),
      }
    }
  }

  const daily = input.dailySessions
    ? computeDailyVolumeRvol(input.dailySessions, sessionDate, sessionSoFar?.expectedFraction ?? null)
    : null

  let participation: RelativeVolumeFacts['participation'] = null
  if (current !== null && current.rvol !== null) {
    participation = {
      rvol: current.rvol,
      band: current.band ?? classifyRvol(current.rvol),
      gate: rvolGate(current.band ?? classifyRvol(current.rvol)),
      source: 'slot',
      basis: `the ${current.slot} 30-min slot traded ${current.volume} vs a ${current.baselineVolume} median over ${current.baselineSessions} prior sessions`,
    }
  } else if (sessionSoFar !== null) {
    participation = {
      rvol: sessionSoFar.rvol,
      band: sessionSoFar.band,
      gate: rvolGate(sessionSoFar.band),
      source: 'session-so-far',
      basis: `RTH volume through ${sessionSoFar.throughSlot} is ${sessionSoFar.volume} vs an expected ${sessionSoFar.expectedVolume} (${sessionSoFar.slotsCovered}/${sessionSoFar.slotsTotal} slots)`,
    }
  } else if (daily !== null) {
    participation = {
      rvol: daily.rvol,
      band: daily.band,
      gate: rvolGate(daily.band),
      source: 'daily',
      basis: `session volume ${daily.sessionVolume} vs an expected ${daily.expectedVolume} (${daily.medianSessionVolume} median over ${daily.baselineSessions} sessions${daily.inProgress ? `, ${Math.round(daily.expectedFraction * 100)}% of the day elapsed` : ''})`,
    }
  }

  return { sessionDate, current, recentSlots, sessionSoFar, daily, participation }
}
