/**
 * Status tone for the Features tab, shared by the table cell and the detail
 * dialog. Client-safe on purpose: `lib/features/featureList` reaches for
 * `node:fs`, so nothing but its types may cross into a client component.
 *
 * `feature_list.json` is hand-edited, so an unlisted status is expected — it
 * falls back to plain body text rather than going invisible.
 */
const STATUS_TONE: Record<string, string> = {
  done: 'text-success',
  'in-progress': 'text-bmw-blue',
  'not-started': 'text-muted',
  skipped: 'text-warning',
  blocked: 'text-m-red',
}

export function statusTone(status: string): string {
  return STATUS_TONE[status] ?? 'text-body'
}
