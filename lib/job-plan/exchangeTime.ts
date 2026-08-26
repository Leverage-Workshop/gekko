import { GLOBEX_OPEN_MINUTES } from '@/lib/engine/overnightSession'

/**
 * Exchange-TZ calendar and clock helpers for the Job-study exports (feat-125).
 *
 * The exporter writes naive wall-clock strings (`YYYY-MM-DDTHH:MM:SS`, no offset)
 * in the chart's exchange TZ (`America/Chicago`). Resolving them to instants has
 * to survive DST: a wall time is mapped through `Intl.DateTimeFormat` for the
 * named zone, re-checked once for the offset in force at the resolved instant,
 * and then round-tripped — a time that does not exist (spring-forward gap) fails
 * the round trip and is reported as unresolvable rather than silently shifted.
 *
 * Pure: no I/O, no clock reads.
 */

const WALL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

type WallParts = {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
}

function utcOfParts(p: WallParts): number {
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
}

/** Field-range check so `Date.UTC` never normalizes a bad wall time into a real one. */
function parseWall(wall: string): WallParts | null {
  const m = WALL_RE.exec(wall)
  if (!m || !isCalendarDate(wall.slice(0, 10))) return null
  const parts = {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6]),
  }
  const inRange = parts.hour < 24 && parts.minute < 60 && parts.second < 60
  return inRange ? parts : null
}

/** True when `tz` names a zone the runtime's Intl data knows. */
export function isValidTimeZone(tz: string): boolean {
  if (tz.length === 0) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** The wall-clock fields the zone shows at a given instant. */
function wallPartsAt(epochMs: number, tz: string): WallParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(epochMs))
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

const pad2 = (n: number): string => String(n).padStart(2, '0')

/**
 * The exchange-local `YYYY-MM-DDTHH:MM:SS` wall clock at an instant — the
 * inverse of {@link resolveWallClock}. The job-plan task (feat-128) derives a
 * run's `asOf` from the bundle's `received_at` this way. Null for an invalid
 * zone or a non-finite instant.
 */
export function wallClockAt(epochMs: number, tz: string): string | null {
  if (!Number.isFinite(epochMs) || !isValidTimeZone(tz)) return null
  const p = wallPartsAt(epochMs, tz)
  if ([p.year, p.month, p.day, p.hour, p.minute, p.second].some((n) => Number.isNaN(n))) return null
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`
}

/**
 * Resolve an exchange-local wall-clock string to UTC epoch milliseconds, or null
 * when the string is malformed, not a real calendar time, or falls in a DST gap.
 * An ambiguous fall-back time resolves to one of its two real instants.
 */
export function resolveWallClock(wall: string, tz: string): number | null {
  const target = parseWall(wall)
  if (target === null || !isValidTimeZone(tz)) return null
  const naive = utcOfParts(target)
  if (Number.isNaN(naive)) return null

  const firstOffset = utcOfParts(wallPartsAt(naive, tz)) - naive
  const firstGuess = naive - firstOffset
  const secondOffset = utcOfParts(wallPartsAt(firstGuess, tz)) - firstGuess
  const guess = firstOffset === secondOffset ? firstGuess : naive - secondOffset

  return utcOfParts(wallPartsAt(guess, tz)) === naive ? guess : null
}

function formatDate(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10)
}

/** True for a real `YYYY-MM-DD` calendar date (rejects 2026-02-30 and 2026-8-24). */
export function isCalendarDate(date: string): boolean {
  const m = DATE_RE.exec(date)
  if (!m) return false
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return !Number.isNaN(ms) && formatDate(ms) === date
}

/** Day of week for a calendar date: 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

export function isWeekend(date: string): boolean {
  const d = weekdayOf(date)
  return d === 0 || d === 6
}

/** Calendar arithmetic on `YYYY-MM-DD` (UTC-based, so no local-zone drift). */
export function addDays(date: string, days: number): string {
  return formatDate(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
}

/**
 * The trading day a wall-clock bar timestamp belongs to under the operator's
 * `Globex 17:00:00-16:59:59 CT` template: bars at/after the 17:00 reopen belong to
 * the NEXT calendar day, which is what folds Sunday-evening Globex into Monday.
 * Mirrors `tradingDayOf` (lib/engine/overnightSession.ts) without a Date object.
 */
export function tradingDayOfWallClock(wall: string): string | null {
  const p = parseWall(wall)
  if (p === null) return null
  const ms = Date.UTC(p.year, p.month - 1, p.day)
  if (Number.isNaN(ms)) return null
  const rolls = p.hour * 60 + p.minute >= GLOBEX_OPEN_MINUTES
  return formatDate(rolls ? ms + DAY_MS : ms)
}
