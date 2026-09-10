import { z } from 'zod'
import { json } from '@/lib/api/respond'
import {
  PresetUpdateSchema,
  deleteConfigPreset,
  updateConfigPreset,
  type ConfigPreset,
} from '@/lib/config'
import { getServiceClient } from '@/lib/supabase/server'

/**
 * PUT/DELETE /api/config/presets/[id] — overwrite or remove one config preset
 * (feat-155). Neither touches the config singleton: deleting the preset the
 * live row happens to match leaves the live row exactly as it was.
 *
 * Auth decision: unauthenticated, same local-only posture as /api/config.
 */

// Node runtime: uses the service-role Supabase client.
export const runtime = 'nodejs'

type Params = { params: Promise<{ id: string }> }

const presetId = z.uuid('Must be a preset id')

export async function PUT(req: Request, { params }: Params): Promise<Response> {
  const { id } = await params
  if (!presetId.safeParse(id).success) {
    return json({ success: false, error: 'Preset not found.' }, 404)
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return json({ success: false, error: 'Expected a JSON body' }, 400)
  }

  const parsed = PresetUpdateSchema.safeParse(payload)
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error)
    return json({ success: false, error: 'Validation failed', fieldErrors }, 400)
  }

  try {
    const outcome = await updateConfigPreset(getServiceClient(), id, parsed.data)
    if (!outcome.ok) {
      return json({ success: false, error: outcome.error }, outcome.status)
    }
    return json<{ preset: ConfigPreset }>({ success: true, data: { preset: outcome.preset } }, 200)
  } catch (error) {
    console.error('Failed to update config preset:', error)
    const message = error instanceof Error ? error.message : 'Failed to update config preset'
    return json({ success: false, error: message }, 500)
  }
}

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  const { id } = await params
  if (!presetId.safeParse(id).success) {
    return json({ success: false, error: 'Preset not found.' }, 404)
  }

  try {
    const outcome = await deleteConfigPreset(getServiceClient(), id)
    if (!outcome.ok) {
      return json({ success: false, error: outcome.error }, outcome.status)
    }
    return json({ success: true }, 200)
  } catch (error) {
    console.error('Failed to delete config preset:', error)
    const message = error instanceof Error ? error.message : 'Failed to delete config preset'
    return json({ success: false, error: message }, 500)
  }
}
