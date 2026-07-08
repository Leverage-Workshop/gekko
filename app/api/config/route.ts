import { z } from 'zod'
import { json } from '@/lib/api/respond'
import {
  ConfigUpdateSchema,
  fetchConfigRow,
  updateConfigRow,
  type ConfigRow,
} from '@/lib/config'
import { getServiceClient } from '@/lib/supabase/server'

/**
 * GET/POST /api/config — read + write the singleton config row (feat-028).
 *
 * POST validates with Zod (model ids must be `provider/model`, rr_min a
 * bounded number, the flag a boolean) and updates row id=1, returning the
 * updated row. Validation failures → 400 with per-field messages the settings
 * form surfaces inline. If the live DB predates the high_conviction_flag
 * migration, POST fails with an explicit "apply the migration" 400 instead of
 * a raw Postgres error (feat-031 rollout guard).
 *
 * Auth decision: intentionally unauthenticated, same rationale as
 * /api/briefings/run (feat-020, progress.md): the app runs only on the user's
 * local trading machine, and the write surface is the advisory engine's own
 * tuning knobs. /api/ingest stays bearer-authed because a separate process
 * POSTs data into it.
 */

// Node runtime: uses the service-role Supabase client.
export const runtime = 'nodejs'

type ConfigPayload = {
  config: ConfigRow
  highConvictionColumnsMissing?: boolean
}

export async function GET(): Promise<Response> {
  try {
    const { row, highConvictionColumnsMissing } = await fetchConfigRow(getServiceClient())
    if (!row) {
      return json(
        { success: false, error: 'Config row (id=1) is missing — apply the seed_config migration first.' },
        404,
      )
    }
    return json<ConfigPayload>(
      { success: true, data: { config: row, highConvictionColumnsMissing } },
      200,
    )
  } catch (error) {
    console.error('Failed to read config:', error)
    const message = error instanceof Error ? error.message : 'Failed to read config'
    return json({ success: false, error: message }, 500)
  }
}

export async function POST(req: Request): Promise<Response> {
  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return json({ success: false, error: 'Expected a JSON body' }, 400)
  }

  const parsed = ConfigUpdateSchema.safeParse(payload)
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error)
    return json({ success: false, error: 'Validation failed', fieldErrors }, 400)
  }

  try {
    const outcome = await updateConfigRow(getServiceClient(), parsed.data)
    if (!outcome.ok) {
      return json({ success: false, error: outcome.error }, outcome.status)
    }
    return json<ConfigPayload>({ success: true, data: { config: outcome.row } }, 200)
  } catch (error) {
    console.error('Failed to update config:', error)
    const message = error instanceof Error ? error.message : 'Failed to update config'
    return json({ success: false, error: message }, 500)
  }
}
