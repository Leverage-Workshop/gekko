import type { HtfBar } from './parseHtfBars'

/**
 * Code-owned overnight-session read (feat-060) — the Globex session's
 * high/low/range and the RTH session-so-far extremes, computed from the 30-min
 * HTF bars. Gives the overview's "Current" section verifiable overnight
 * numbers instead of relying on `mgi.daily.onh`/`onl` (which export as 0.00
 * placeholders when the study snapshots at the wrong time) or a vision read.
 *
 * Chart time is US Central (exchange-local) — verified against the live
 * export 2026-07-28: open-auction volume spike at 08:30, Globex reopen 17:00,
 * maintenance halt 16:00–17:00. The constants below are DST-proof as long as
 * Sierra keeps the chart in CT.
 */

/** RTH open, minutes after midnight chart time (08:30 CT). */
export const RTH_OPEN_MINUTES = 8 * 60 + 30

/** Globex reopen, minutes after midnight chart time (17:00 CT) — bars at or after this belong to the NEXT trading day. */
export const GLOBEX_OPEN_MINUTES = 17 * 60

export type OvernightSessionFacts = {
  /** The trading day (YYYY-MM-DD) the overnight session leads into. */
  sessionDate: string
  overnight: {
    high: number
    low: number
    rangePts: number
    /** First overnight bar's open. */
    open: number
    /** Last overnight bar's close. */
    close: number
    /** Bar start time of the overnight high, `YYYY-MM-DD HH:MM` chart time. */
    highTime: string
    lowTime: string
    barCount: number
  }
  /** RTH extremes so far; null before the 08:30 open. */
  rthSoFar: {
    open: number
    high: number
    low: number
    rangePts: number
    barCount: number
  } | null
  /** Signed distances, current − level; null when no current price is known. */
  currentVsOvernight: {
    fromOnHighPts: number
    fromOnLowPts: number
  } | null
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function fmtChartTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Calendar date (chart time) of the trading day a bar belongs to: bars at/after
 * the Globex reopen roll to the next day. Takes any timestamped bar (HTF or
 * execution) — feat-089 resolves the live session date from the exec bars when
 * the bundle carries no TPO export.
 */
export function tradingDayOf(bar: { dateTime: Date }): string {
  const d = new Date(bar.dateTime)
  if (minutesOfDay(d) >= GLOBEX_OPEN_MINUTES) d.setDate(d.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * @param bars chronological parsed export (oldest first, partial bar last).
 *   The trading day is taken from the LAST bar — not the wall clock — so the
 *   module stays timezone-independent and testable.
 * @param currentPrice live price for the vs-overnight distances; null when
 *   unavailable (the distance fact is then null).
 * @returns null when the last trading day has no overnight bars (an RTH-only
 *   export) — callers degrade with a warning instead of fabricating a session.
 * @throws when `bars` is empty — callers gate on a non-empty parse.
 */
export function computeOvernightSession(
  bars: readonly HtfBar[],
  currentPrice: number | null,
): OvernightSessionFacts | null {
  if (bars.length === 0) {
    throw new Error('overnight session needs at least one bar')
  }

  const sessionDate = tradingDayOf(bars[bars.length - 1])
  const sessionBars = bars.filter((b) => tradingDayOf(b) === sessionDate)

  const isOvernight = (b: HtfBar) => {
    const mins = minutesOfDay(b.dateTime)
    // Evening bars (≥17:00, dated the prior calendar day) plus the pre-open
    // morning bars (<08:30 on the session date itself).
    return mins >= GLOBEX_OPEN_MINUTES || mins < RTH_OPEN_MINUTES
  }
  const overnightBars = sessionBars.filter(isOvernight)
  if (overnightBars.length === 0) return null

  let high = -Infinity
  let low = Infinity
  let highTime = overnightBars[0].dateTime
  let lowTime = overnightBars[0].dateTime
  for (const bar of overnightBars) {
    if (bar.high > high) {
      high = bar.high
      highTime = bar.dateTime
    }
    if (bar.low < low) {
      low = bar.low
      lowTime = bar.dateTime
    }
  }

  const rthBars = sessionBars.filter((b) => !isOvernight(b))
  const rthSoFar =
    rthBars.length > 0
      ? {
          open: round2(rthBars[0].open),
          high: round2(Math.max(...rthBars.map((b) => b.high))),
          low: round2(Math.min(...rthBars.map((b) => b.low))),
          rangePts: round2(
            Math.max(...rthBars.map((b) => b.high)) - Math.min(...rthBars.map((b) => b.low)),
          ),
          barCount: rthBars.length,
        }
      : null

  const currentVsOvernight =
    currentPrice !== null && Number.isFinite(currentPrice)
      ? {
          fromOnHighPts: round2(currentPrice - high),
          fromOnLowPts: round2(currentPrice - low),
        }
      : null

  return {
    sessionDate,
    overnight: {
      high: round2(high),
      low: round2(low),
      rangePts: round2(high - low),
      open: round2(overnightBars[0].open),
      close: round2(overnightBars[overnightBars.length - 1].close),
      highTime: fmtChartTime(highTime),
      lowTime: fmtChartTime(lowTime),
      barCount: overnightBars.length,
    },
    rthSoFar,
    currentVsOvernight,
  }
}
