/**
 * Shared API response envelope + JSON helper for the app's route handlers.
 *
 * Every route responds with `{ success, data?, error? }` (plus optional
 * per-field Zod validation messages). Centralized here so the routes under
 * app/api/{config,briefings/run,eval/run,push/subscribe} share one contract
 * instead of re-declaring it. (/api/ingest keeps its own bearer-authed shape.)
 */

export type ApiResponse<T = undefined> = {
  success: boolean
  data?: T
  error?: string
  /** Per-field validation messages (Zod), keyed by field name. */
  fieldErrors?: Record<string, string[]>
}

export function json<T>(body: ApiResponse<T>, status: number): Response {
  return Response.json(body, { status })
}
