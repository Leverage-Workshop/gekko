import type { ExecBar } from '@/lib/engine/parseExecBars'
import type { HtfBar } from '@/lib/engine/parseHtfBars'
import {
  MINUTE_MS,
  minutesBetween,
  rthOpenMsOf,
  tradingDayOfMs,
  wallMsOfDate,
  wallStringOfMs,
} from './chartClock'
import type { ObservationCoverage, ObservationScope } from './contextTypes'
import { EARLY_SESSION_MINUTES } from './rules'

/**
 * The exec bars the origin facts (R5–R9) are allowed to see, as of `asOf`
 * (feat-126). Ratified: windows are wall-clock on the 750-volume bars'
 * timestamps and THE IN-PROGRESS BAR NEVER COUNTS — the export's last row is
 * always dropped, then every bar after `asOf`, then every bar outside asOf's
 * trading day (kept aside for the historical-pivot tested check only).
 */

export type ObservedBar = {
  readonly ms: number
  readonly wall: string
  readonly tradingDay: string
  readonly scope: ObservationScope
  readonly open: number
  readonly high: number
  readonly low: number
  readonly close: number
}

export type Observation = {
  readonly asOfMs: number
  readonly tradingDay: string
  readonly rthOpenMs: number
  /** This trading day's completed bars at/before asOf, chronological. */
  readonly bars: readonly ObservedBar[]
  /** Every completed bar at/before asOf, any trading day (historical-pivot check). */
  readonly allCompleted: readonly ObservedBar[]
  readonly coverage: ObservationCoverage
}

function toObserved(bar: ExecBar, rthOpenByDay: (day: string) => number): ObservedBar {
  const ms = wallMsOfDate(bar.dateTime)
  const tradingDay = tradingDayOfMs(ms)
  return {
    ms,
    wall: wallStringOfMs(ms),
    tradingDay,
    scope: ms >= rthOpenByDay(tradingDay) ? 'session' : 'overnight',
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }
}

/**
 * @param execBars chronological export, in-progress bar last.
 * @param asOfMs wall-ms of the run's `asOf`.
 */
export function observeBars(execBars: readonly ExecBar[], asOfMs: number): Observation {
  const rthCache = new Map<string, number>()
  const rthOpenByDay = (day: string): number => {
    const cached = rthCache.get(day)
    if (cached !== undefined) return cached
    const ms = rthOpenMsOf(day)
    rthCache.set(day, ms)
    return ms
  }

  const completed = execBars.slice(0, -1).map((bar) => toObserved(bar, rthOpenByDay))
  const allCompleted = completed.filter((bar) => bar.ms <= asOfMs)
  const afterAsOf = completed.length - allCompleted.length

  // The session is asOf's trading day — never the last bar's: right after the
  // 17:00 Globex reopen asOf has rolled forward while every completed bar still
  // belongs to the prior day, and that day's bars must not feed R5–R9.
  const tradingDay = tradingDayOfMs(asOfMs)
  const bars = allCompleted.filter((bar) => bar.tradingDay === tradingDay)
  const rthOpenMs = rthOpenByDay(tradingDay)

  const sessionStarted = asOfMs >= rthOpenMs
  const minutesSinceOpen = sessionStarted ? minutesBetween(rthOpenMs, asOfMs) : null

  const coverage: ObservationCoverage = {
    asOf: wallStringOfMs(asOfMs),
    tradingDay,
    rthOpenAt: wallStringOfMs(rthOpenMs),
    sessionStarted,
    minutesSinceOpen,
    earlyWindow: sessionStarted && asOfMs - rthOpenMs < EARLY_SESSION_MINUTES * MINUTE_MS,
    overnightBars: bars.filter((bar) => bar.scope === 'overnight').length,
    sessionBars: bars.filter((bar) => bar.scope === 'session').length,
    firstBarAt: bars[0]?.wall ?? null,
    lastCompletedBarAt: bars.at(-1)?.wall ?? null,
    excludedBars: {
      inProgress: execBars.length > 0 ? 1 : 0,
      afterAsOf,
      priorTradingDays: allCompleted.length - bars.length,
    },
  }

  return { asOfMs, tradingDay, rthOpenMs, bars, allCompleted, coverage }
}

/**
 * The HTF bars a snapshot keyed off `asOf` may see: the export's last row is
 * dropped as in-progress, then every bar after `asOf`. `tradingDay` further
 * restricts to that session (the overnight fallback), so a rolling export that
 * runs past `asOf` can never leak a later day's levels or sessions.
 */
export function htfBarsAsOf(
  htfBars: readonly HtfBar[],
  asOfMs: number,
  tradingDay?: string,
): HtfBar[] {
  return htfBars.slice(0, -1).filter((bar) => {
    const ms = wallMsOfDate(bar.dateTime)
    return ms <= asOfMs && (tradingDay === undefined || tradingDayOfMs(ms) === tradingDay)
  })
}
