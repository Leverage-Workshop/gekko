import { GLOBEX_OPEN_MINUTES, RTH_OPEN_MINUTES } from '@/lib/engine/overnightSession'

/**
 * Wall-clock arithmetic for the Job planner (feat-126).
 *
 * Every timestamp the planner touches is exchange wall time (America/Chicago —
 * the chart's own clock): the exec / HTF bar parsers build `Date`s from naive
 * `YYYY-MM-DD HH:MM:SS` strings (so the process-local fields ARE the chart
 * fields), the Job-study exporter writes `YYYY-MM-DDTHH:MM:SS` wall strings, and
 * the planner's `asOf` is the same shape. To keep the origin windows (R5–R9,
 * wall-clock minutes on exec-bar timestamps) independent of the process TZ,
 * everything is reduced to WALL MILLISECONDS: the wall fields laid onto a UTC
 * axis via `Date.UTC`. Differences between two wall-ms values are wall-clock
 * differences; no offset is ever applied.
 *
 * Pure, no clock reads.
 */

export const MINUTE_MS = 60_000
export const SECOND_MS = 1_000

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/

/** Wall milliseconds of a bar `Date` (process-local fields = chart fields). */
export function wallMsOfDate(d: Date): number {
  return Date.UTC(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  )
}

/** Wall milliseconds of a `YYYY-MM-DDTHH:MM:SS` string, or null when malformed. */
export function wallMsOfString(wall: string): number | null {
  const m = WALL_RE.exec(wall)
  if (!m) return null
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  if (hour > 23 || minute > 59 || second > 59) return null
  const ms = Date.UTC(year, month - 1, day, hour, minute, second)
  // Reject normalized overflow (2026-02-30 → March 2).
  return new Date(ms).getUTCDate() === day ? ms : null
}

/** `YYYY-MM-DDTHH:MM:SS` of a wall-ms value. */
export function wallStringOfMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19)
}

/** `YYYY-MM-DD` of a wall-ms value (calendar date, no roll). */
export function calendarDateOfMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Minutes after midnight of a wall-ms value. */
export function minutesOfDayMs(ms: number): number {
  const d = new Date(ms)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

/**
 * Trading day a wall instant belongs to: at/after the 17:00 Globex reopen it
 * rolls to the next calendar day (the engine's `tradingDayOf` rule).
 */
export function tradingDayOfMs(ms: number): string {
  const rolled = minutesOfDayMs(ms) >= GLOBEX_OPEN_MINUTES ? ms + 24 * 60 * MINUTE_MS : ms
  return calendarDateOfMs(rolled)
}

/** Wall-ms of the RTH open (08:30 CT) on a `YYYY-MM-DD` trading day. */
export function rthOpenMsOf(tradingDay: string): number {
  const dayMs = wallMsOfString(`${tradingDay}T00:00:00`)
  if (dayMs === null) throw new Error(`rthOpenMsOf: not a calendar date: ${tradingDay}`)
  return dayMs + RTH_OPEN_MINUTES * MINUTE_MS
}

/** True when the wall instant falls in the RTH window (08:30 → 17:00 CT). */
export function isRthMs(ms: number): boolean {
  const mins = minutesOfDayMs(ms)
  return mins >= RTH_OPEN_MINUTES && mins < GLOBEX_OPEN_MINUTES
}

/** Whole-minute wall-clock span (b − a), 2 dp. */
export function minutesBetween(a: number, b: number): number {
  return Math.round(((b - a) / MINUTE_MS) * 100) / 100
}
