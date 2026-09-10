import { z } from 'zod'
import { json } from '@/lib/api/respond'
import {
  PresetCreateSchema,
  createConfigPreset,
  fetchConfigPresets,
  type ConfigPreset,
} from '@/lib/config'
import { getServiceClient } from '@/lib/supabase/server'

/**
 * GET/POST /api/config/presets — list + create config presets (feat-155).
 *
 * A preset is a named snapshot of the config singleton's editable fields.
 * Creating one never touches row 1: the settings form loads a preset into its
 * fields and the ordinary POST /api/config makes it live.
 *
 * Auth decision: unauthenticated, the same local-only posture as /api/config
 * (the app runs on the operator's trading machine; presets are the engine's
 * own tuning knobs).
 */

// Node runtime: uses the service-role Supabase client.
export const runtime = 'nodejs'

type PresetsPayload = { presets: ConfigPreset[]; tableMissing: boolean }

export async function GET(): Promise<Response> {
  try {
    const result = await fetchConfigPresets(getServiceClient())
    return json<PresetsPayload>({ success: true, data: result }, 200)
  } catch (error) {
    console.error('Failed to list config presets:', error)
    const message = error instanceof Error ? error.message : 'Failed to list config presets'
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

  const parsed = PresetCreateSchema.safeParse(payload)
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error)
    return json({ success: false, error: 'Validation failed', fieldErrors }, 400)
  }

  try {
    const outcome = await createConfigPreset(getServiceClient(), parsed.data)
    if (!outcome.ok) {
      return json({ success: false, error: outcome.error }, outcome.status)
    }
    return json<{ preset: ConfigPreset }>({ success: true, data: { preset: outcome.preset } }, 201)
  } catch (error) {
    console.error('Failed to create config preset:', error)
    const message = error instanceof Error ? error.message : 'Failed to create config preset'
    return json({ success: false, error: message }, 500)
  }
}
