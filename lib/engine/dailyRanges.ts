import type { DailyValueArea } from './parseDailyValueAreas'

/**
 * Code-owned daily-range read (feat-060) — how wide the completed RTH sessions
 * have been travelling, and whether the recent sessions are contracting or
 * expanding relative to the sessions before them. Contraction (coiling ranges)
 * often precedes an expansion day; the overview's HTF view narrates that from
 * these numbers. Expressed in plain points BY DESIGN — the overview doctrine
 * forbids citing ATR, so the model quotes the actual recent ranges instead of
 * a volatility statistic.
 */

/** Completed sessions (newest-first) surfaced in the range series. */
export const RANGE_SERIES_SESSIONS = 10

/** Newest sessions whose mean range is compared against the prior sessions'. */
export const RANGE_RECENT_SESSIONS = 3

/** Recent-vs-prior mean-range ratio beyond ±this fraction reads as a real shift. */
export const RANGE_SHIFT_RATIO = 0.2

export type DailyRangeRead = 'contracting' | 'expanding' | 'stable'

export type DailyRangeFacts = {
  /** Per-session high−low travel, newest first, capped at {@link RANGE_SERIES_SESSIONS}. */
  days: { date: string; rangePts: number }[]
  /** Mean range of the newest {@link RANGE_RECENT_SESSIONS} sessions (2 dp). */
  meanRecentPts: number
  /** Mean range of the remaining (older) sessions in the window (2 dp). */
  meanPriorPts: number
  /** meanRecentPts / meanPriorPts (2 dp); 1 when there are no prior sessions. */
  ratio: number
  read: DailyRangeRead
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function mean(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * @param sessions completed sessions, most recent first (as parsed).
 * @throws when `sessions` is empty — callers gate on a non-empty parse.
 */
export function computeDailyRanges(sessions: readonly DailyValueArea[]): DailyRangeFacts {
  if (sessions.length === 0) {
    throw new Error('daily ranges need at least one completed session')
  }

  const days = sessions.slice(0, RANGE_SERIES_SESSIONS).map((s) => ({
    date: s.date,
    rangePts: round2(s.sessionHigh - s.sessionLow),
  }))

  const recent = days.slice(0, RANGE_RECENT_SESSIONS).map((d) => d.rangePts)
  const prior = days.slice(RANGE_RECENT_SESSIONS).map((d) => d.rangePts)

  const meanRecentPts = round2(mean(recent))
  // Without prior sessions there is nothing to compare against — the read
  // degrades to 'stable' with ratio 1 rather than inventing a trend.
  const meanPriorPts = prior.length > 0 ? round2(mean(prior)) : meanRecentPts
  const ratio = meanPriorPts > 0 ? round2(meanRecentPts / meanPriorPts) : 1

  const read: DailyRangeRead =
    prior.length === 0
      ? 'stable'
      : ratio <= 1 - RANGE_SHIFT_RATIO
        ? 'contracting'
        : ratio >= 1 + RANGE_SHIFT_RATIO
          ? 'expanding'
          : 'stable'

  return { days, meanRecentPts, meanPriorPts, ratio, read }
}
