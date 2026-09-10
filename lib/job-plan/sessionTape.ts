import type { HtfBar } from '@/lib/engine/parseHtfBars'
import { GLOBEX_OPEN_MINUTES } from '@/lib/engine/overnightSession'
import { MINUTE_MS, tradingDayOfMs, wallMsOfDate, wallMsOfString, wallStringOfMs } from './chartClock'
import type { ObservationScope, SessionTape, SessionTapeBar } from './contextTypes'

/**
 * The session tape (feat-154): this trading day's completed 30-min HTF bars
 * since the Globex open, so the LLM planner can see where price has been —
 * whether it is grinding into a level or already made a V off it, what the
 * overnight built, whether the RTH open gapped through structure.
 *
 * Operator, 2026-09-09: "just so the model can get a bit of context on where
 * price has been and if it has interacted with any of the levels being
 * evaluated" / "let's just use the 30 min". The bundle carries no 5-min
 * series; the 750-volume exec bars are sparse overnight; the rolling 30-min
 * export already reaches the Globex open.
 *
 * The bars are context, never levels: `validate.ts` keeps bar prices OUT of
 * the known-price set, so a bar high or low quoted as a level in the plan is
 * an invented price.
 *
 * The tape takes the RAW export (not `htfBarsAsOf`, which drops the last
 * row): operator, 2026-09-09 — "the current in progress bar should be
 * included". Every bar of asOf's trading day that has CLOSED by asOf is in
 * (Sierra stamps a bar with its open time, so closed = open + 30 min <= asOf),
 * plus the export's LAST ROW when it spans asOf — the genuinely live bar,
 * flagged `inProgress` so the model knows its high, low and close are still
 * moving. A bar that spans asOf but has later rows behind it is a replay
 * export's finalized bar: its OHLC already holds trades through its close,
 * so it stays out (Codex P1 on the first cut). Nothing stamped after asOf and
 * nothing from another session gets in.
 */

export const HTF_BAR_MINUTES = 30

function scopeOf(ms: number, rthOpenMs: number): ObservationScope {
  return ms >= rthOpenMs ? 'session' : 'overnight'
}

/** Wall-ms of the 17:00 CT Globex open that starts a `YYYY-MM-DD` trading day (the prior calendar evening). */
export function globexOpenMsOf(tradingDay: string): number {
  const dayMs = wallMsOfString(`${tradingDay}T00:00:00`)
  if (dayMs === null) throw new Error(`globexOpenMsOf: not a calendar date: ${tradingDay}`)
  return dayMs - 24 * 60 * MINUTE_MS + GLOBEX_OPEN_MINUTES * MINUTE_MS
}

function tapeBar(bar: HtfBar, rthOpenMs: number, asOfMs: number): SessionTapeBar {
  const ms = wallMsOfDate(bar.dateTime)
  return {
    wall: wallStringOfMs(ms),
    scope: scopeOf(ms, rthOpenMs),
    inProgress: ms + HTF_BAR_MINUTES * MINUTE_MS > asOfMs,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }
}

export function buildSessionTape(input: {
  /** The raw HTF export, chronological, in-progress bar last. */
  readonly htfBars: readonly HtfBar[]
  readonly tradingDay: string
  readonly rthOpenMs: number
  readonly asOfMs: number
}): SessionTape {
  const { htfBars, tradingDay, rthOpenMs, asOfMs } = input
  const lastRow = htfBars.length - 1
  const bars = htfBars
    .filter((bar, i) => {
      const ms = wallMsOfDate(bar.dateTime)
      if (ms > asOfMs || tradingDayOfMs(ms) !== tradingDay) return false
      const closedByAsOf = ms + HTF_BAR_MINUTES * MINUTE_MS <= asOfMs
      return closedByAsOf || i === lastRow
    })
    .map((bar) => tapeBar(bar, rthOpenMs, asOfMs))
  return {
    source: 'htf-30m',
    tradingDay,
    globexOpenAt: wallStringOfMs(globexOpenMsOf(tradingDay)),
    rthOpenAt: wallStringOfMs(rthOpenMs),
    bars,
    overnightBars: bars.filter((b) => b.scope === 'overnight').length,
    sessionBars: bars.filter((b) => b.scope === 'session').length,
  }
}

/** One bar as the model reads it — one line, fixed order, no key noise; the open bar says so. */
export function tapeBarLine(bar: SessionTapeBar): string {
  const line = `${bar.wall.slice(0, 16)} ${bar.scope} O ${bar.open} H ${bar.high} L ${bar.low} C ${bar.close}`
  return bar.inProgress ? `${line} (in progress)` : line
}
