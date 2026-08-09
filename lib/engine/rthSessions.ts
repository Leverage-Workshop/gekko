import type { HtfBar } from './parseHtfBars'
import {
  GLOBEX_OPEN_MINUTES,
  RTH_OPEN_MINUTES,
  minutesOfDay,
  tradingDayOf,
} from './overnightSession'

/**
 * RTH session reconstruction from the 30-min HTF export (feat-100, extracted
 * from feat-095's `volatilityScale.ts` without a behaviour change).
 *
 * The daily value-area history carries no Initial Balance and no intraday
 * shape, so every statistic measured over a session's own OHLC — the volatility
 * scale (feat-095) and the IB→day-range extension distribution (feat-100) —
 * has to rebuild the sessions from the 30-min bars first. That reconstruction is
 * now owned here, once, so the two callers cannot drift apart on what "one RTH
 * session" means.
 *
 * Two facts that cost feat-095 real debugging time and are pinned here:
 *
 * 1. A complete RTH session carries {@link RTH_BARS_PER_SESSION} = **15** bars
 *    (08:30–15:30 starts, closing at 16:00 CT), not the 17 implied by the
 *    open→Globex-reopen window: no bars print during the 16:00–17:00 CME
 *    maintenance halt. Requiring 17 rejected every session in the real export.
 * 2. INCOMPLETE sessions must be excluded from any statistic. The in-progress
 *    day (and an early close) carries a truncated range that deflates the
 *    statistic exactly when it is being quoted.
 */

/** HTF planning-chart bar size, minutes (the `htf_bar_data.rolling.csv` export). */
export const HTF_BAR_MINUTES = 30

/**
 * RTH close, minutes after midnight chart time (16:00 CT) — the CME
 * maintenance halt. Bars stop printing here even though the next trading day
 * does not begin until the 17:00 Globex reopen ({@link GLOBEX_OPEN_MINUTES}),
 * so a session's bar count is measured against THIS boundary, not that one.
 * Verified against the live export: RTH sessions carry 15 bars, 08:30–15:30.
 */
export const RTH_CLOSE_MINUTES = 16 * 60

/** 30-min bars in one complete RTH session (08:30 → 16:00 CT = 15 bars). */
export const RTH_BARS_PER_SESSION =
  (RTH_CLOSE_MINUTES - RTH_OPEN_MINUTES) / HTF_BAR_MINUTES

/** The OHLC shape a period statistic consumes — one bar or one whole session. */
export type Ohlc = { open: number; high: number; low: number; close: number }

/** One reconstructed RTH session: its trading day and its bars, chronological. */
export type RthSession = {
  /** Trading day, `YYYY-MM-DD` (the Globex-reopen roll rule of `overnightSession`). */
  date: string
  bars: HtfBar[]
  /** `bars.length >= RTH_BARS_PER_SESSION` — a full session, not in progress. */
  complete: boolean
}

/** Is this bar inside the RTH window (08:30 CT → the Globex reopen)? */
export function isRthBar(bar: HtfBar): boolean {
  const mins = minutesOfDay(bar.dateTime)
  return mins >= RTH_OPEN_MINUTES && mins < GLOBEX_OPEN_MINUTES
}

/**
 * Every RTH session in the export, oldest first, each with its bars in
 * chronological order. Non-RTH (overnight) bars are dropped: they are much
 * quieter than the day session and folding them in deflates every session
 * statistic.
 */
export function groupRthSessions(bars: readonly HtfBar[]): RthSession[] {
  const byDate = new Map<string, HtfBar[]>()
  for (const bar of bars) {
    if (!isRthBar(bar)) continue
    const day = tradingDayOf(bar)
    const existing = byDate.get(day)
    if (existing) existing.push(bar)
    else byDate.set(day, [bar])
  }
  return [...byDate.keys()].sort().map((date) => {
    const sessionBars = byDate.get(date)!
    return {
      date,
      bars: sessionBars,
      complete: sessionBars.length >= RTH_BARS_PER_SESSION,
    }
  })
}

/** One session's bars collapsed into a single OHLC period. */
export function sessionOhlc(bars: readonly HtfBar[]): Ohlc {
  return {
    open: bars[0].open,
    high: Math.max(...bars.map((b) => b.high)),
    low: Math.min(...bars.map((b) => b.low)),
    close: bars[bars.length - 1].close,
  }
}
