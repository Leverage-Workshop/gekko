import type { TpoMeta, TpoPeriodAnchor } from './parseTpo'

/**
 * Letter → clock-time resolver for the TPO export (feat-092).
 *
 * `tpo.data.md` exports period letters but, before feat-092, nothing tying
 * them to the clock — so "single prints from B period" could not be turned
 * into "single prints at 09:00" without assuming which period opens the
 * session. The export now carries a two-line anchor in `## Metadata`
 * (`First Period Letter` / `First Period Start`); combined with
 * `TPO Period Minutes` that is enough to place every letter on the clock:
 *
 *     time(letter) = firstPeriodStart + (index(letter) - index(firstLetter)) * periodMinutes
 *
 * Everything here degrades to `null` / `[]` when the anchor is absent (older
 * bundles) — the resolver never throws, and callers stay unchanged.
 *
 * Times are naive local wall-clock, exactly as the Sierra study writes them
 * (no timezone conversion — see review item A5). Arithmetic runs in UTC purely
 * so DST never shifts a period boundary.
 */

/**
 * Market Profile period letters in order: `A`–`Z` then `a`–`z`, matching both
 * Sierra's TPO lettering and the `[A-Za-z]` alphabet `parseTpo` accepts in the
 * `Letters` column. 52 periods covers a full 24h session at 30-min periods.
 */
export const TPO_PERIOD_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

export type TpoPeriodTime = {
  letter: string
  /** Periods elapsed since the session's first period (0 for that period). */
  index: number
  /** Naive local start, `YYYY-MM-DD HH:MM:SS`. */
  start: string
  /** Naive local end (exclusive), `YYYY-MM-DD HH:MM:SS`. */
  end: string
  /** Compact `HH:MM` start — the form projected into engine facts. */
  clock: string
}

/** Position of a letter in the A–Z/a–z period sequence, or -1. */
function letterIndex(letter: string): number {
  return letter.length === 1 ? TPO_PERIOD_LETTERS.indexOf(letter) : -1
}

/** `YYYY-MM-DD HH:MM:SS` → epoch ms treated as UTC, or null when unparseable. */
function stampToMs(start: string): number | null {
  const m = start.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!m) return null
  const [y, mo, d, hh, mm, ss] = m.slice(1).map((part) => Number(part))
  return Date.UTC(y, mo - 1, d, hh, mm, ss)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function msToStamp(ms: number): string {
  const d = new Date(ms)
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  )
}

/**
 * Resolve one period letter against the anchor. Returns null when the anchor
 * is missing or malformed, the period length is not positive, the letter is
 * not a period letter, or the letter sorts *before* the session's first
 * period (which would mean a letter the anchor cannot explain).
 */
export function resolveTpoPeriodTime(
  anchor: TpoPeriodAnchor | null,
  periodMinutes: number,
  letter: string,
): TpoPeriodTime | null {
  if (!anchor) return null
  if (!Number.isFinite(periodMinutes) || periodMinutes <= 0) return null

  const firstIdx = letterIndex(anchor.letter)
  const idx = letterIndex(letter)
  if (firstIdx < 0 || idx < 0 || idx < firstIdx) return null

  const startMs = stampToMs(anchor.start)
  if (startMs === null) return null

  const index = idx - firstIdx
  const periodMs = periodMinutes * 60_000
  const from = startMs + index * periodMs
  const start = msToStamp(from)
  return { letter, index, start, end: msToStamp(from + periodMs), clock: start.slice(11, 16) }
}

/**
 * Resolve a set of letters (any order, duplicates fine) into period times,
 * sorted by period order. Empty when the meta carries no usable anchor.
 */
export function buildTpoPeriodClock(meta: TpoMeta, letters: Iterable<string>): TpoPeriodTime[] {
  const seen = new Set<string>()
  for (const chunk of letters) {
    for (const letter of chunk) seen.add(letter)
  }
  return [...seen]
    .map((letter) => resolveTpoPeriodTime(meta.firstPeriod, meta.tpoPeriodMinutes, letter))
    .filter((t): t is TpoPeriodTime => t !== null)
    .sort((a, b) => a.index - b.index)
}
