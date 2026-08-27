import { JOB_STUDY_EXCHANGE_TZ } from '../jobStudyMeta'

/**
 * Display formatting for the Job plan card (feat-129). Two clocks meet here:
 * row timestamps (`created_at`, ISO instants) are shown in Chicago like every
 * other operator-facing time, and the plan's own stamps (`asOf`, `factAt`,
 * export times) are ALREADY exchange wall-clock strings
 * ("2026-08-24T09:30:00") — those are shown as-is, minus the `T`.
 */

const CT_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: JOB_STUDY_EXCHANGE_TZ,
  dateStyle: 'short',
  timeStyle: 'short',
  hour12: false,
})

/** An ISO instant → "2026-08-24 09:31 CT"; unparseable input is returned verbatim. */
export function formatInstantCt(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${CT_FORMAT.format(date).replace(', ', ' ')} CT`
}

/** An exchange wall-clock stamp → "2026-08-24 09:30:00 CT" (no conversion — it is already Chicago). */
export function formatWallClock(wall: string): string {
  return `${wall.replace('T', ' ')} CT`
}

export function formatPts(pts: number): string {
  const sign = pts > 0 ? '+' : ''
  return `${sign}${pts.toFixed(2)} pts`
}

export function formatBand(low: number, high: number): string {
  return low === high ? low.toFixed(2) : `${low.toFixed(2)} – ${high.toFixed(2)}`
}

/** A sha256 shortened for a meta cell; the full value goes in `title`. */
export function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 12)}…` : hash
}
