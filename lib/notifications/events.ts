/**
 * Shared alert-event model for web notifications (feat-026) and Web Push
 * (feat-027).
 *
 * The DB trigger (supabase/migrations/20260708120000_realtime_notifications.sql)
 * broadcasts `{ type, id, status?, created_at }` on the private Realtime topic
 * below whenever a `briefings` or `eval_results` row is inserted. The browser
 * (Realtime subscription → Notification API) and the server-side push sender
 * (lib/push/sendPush.ts → web-push) both turn that event into the SAME
 * human-facing content here, so the two channels never drift.
 *
 * Pure module: no browser or server APIs — fully unit-testable offline.
 */

/** Private Realtime broadcast topic — must match the SQL trigger. */
export const GEKKO_ALERTS_TOPIC = 'gekko:alerts'

/** Broadcast event name the client filters on — must match the SQL trigger. */
export const ALERT_INSERT_EVENT = 'insert'

export interface AlertEvent {
  type: 'briefing' | 'eval'
  /** Row id of the new briefings/eval_results row, when known. */
  id?: string
  /** eval_results.status (ENTER / WAIT / NOT_VALID / NO_ENTRY_NEAR). */
  status?: string
  /** ISO timestamp of the row, when known. */
  createdAt?: string
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Tolerant parse of a broadcast (or push) payload into an AlertEvent.
 * Anything that is not recognizably a Gekko alert returns null — the
 * subscriber simply ignores it rather than crashing.
 */
export function parseAlertEvent(payload: unknown): AlertEvent | null {
  if (typeof payload !== 'object' || payload === null) return null
  const record = payload as Record<string, unknown>
  const type = record.type
  if (type !== 'briefing' && type !== 'eval') return null
  return {
    type,
    id: asOptionalString(record.id),
    status: asOptionalString(record.status),
    createdAt: asOptionalString(record.created_at) ?? asOptionalString(record.createdAt),
  }
}

export interface AlertContent {
  title: string
  body: string
  /** Notification tag: replaces (rather than stacks) repeats of the same alert. */
  tag: string
}

/** Human-facing notification copy for one alert event. */
export function buildAlertContent(event: AlertEvent): AlertContent {
  const when = event.createdAt ? ` (${formatWhen(event.createdAt)})` : ''
  if (event.type === 'briefing') {
    return {
      title: 'New briefing ready',
      body: `Gekko produced a new tactical briefing${when} — open the dashboard for the read.`,
      tag: event.id ? `gekko-briefing-${event.id}` : 'gekko-briefing',
    }
  }
  const status = (event.status ?? 'UNKNOWN').replaceAll('_', ' ')
  return {
    title: `Entry eval: ${status}`,
    body: `Entry check verdict at the current price${when} — open the dashboard for details.`,
    tag: event.id ? `gekko-eval-${event.id}` : 'gekko-eval',
  }
}

/** "HH:MM UTC" for a parseable ISO timestamp; the raw string otherwise. */
function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return `${date.toISOString().slice(11, 16)} UTC`
}
