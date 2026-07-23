import {
  fulfillPendingRequests,
  hasPendingRequest,
  realBundleRequestDeps,
} from '@/lib/bundleRequests'
import { getServiceClient } from '@/lib/supabase/server'
import {
  ingestBundle,
  isAuthorized,
  IngestValidationError,
  type IngestDeps,
} from '@/lib/ingest'

/**
 * /api/ingest — the bearer-authed uploader endpoint, both halves of the
 * fresh-bundle handshake:
 *
 * GET  — the uploader's poll: `{ data: { pending } }` says whether a recent
 *        pending `bundle_requests` row exists (a dashboard button was pressed
 *        and a fresh bundle is required).
 * POST — multipart ingest of one export bundle. Stores PNG/CSV files to
 *        Supabase Storage, the MGI JSON inline as jsonb, and a `raw_bundles`
 *        row holding the object refs, then marks the pending bundle requests
 *        fulfilled so the waiting task can commence. Performs no auto-analyze
 *        (see docs/agent-architecture-plan.md): briefings are produced by the
 *        analyze-task, triggered on demand from /api/briefings/run.
 */

// Node runtime: uses node:crypto (timing-safe auth) and the service-role client.
export const runtime = 'nodejs'

type ApiResponse<T> = {
  success: boolean
  data?: T
  error?: string
}

function json<T>(body: ApiResponse<T>, status: number): Response {
  return Response.json(body, { status })
}

/**
 * Real side effects wired to the service-role Supabase client.
 *
 * Both writes are retry-tolerant so a client re-POSTing the same `bundle_id`
 * (after a dropped response) is idempotent: Storage uploads upsert onto the
 * same per-bundle path, and the row insert ignores an id conflict, returning
 * the same success shape for the already-committed bundle.
 */
function realDeps(): IngestDeps {
  const supabase = getServiceClient()
  return {
    newId: () => crypto.randomUUID(),
    uploadObject: async (bucket, path, bytes, contentType) => {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, bytes, { contentType, upsert: true })
      if (error) {
        throw error
      }
    },
    insertBundle: async (record) => {
      // ON CONFLICT (id) DO NOTHING — no .select(): a duplicate returns zero
      // rows, and the id is already known client-side.
      const { error } = await supabase
        .from('raw_bundles')
        .upsert(record, { onConflict: 'id', ignoreDuplicates: true })
      if (error) {
        throw error
      }
      return { id: record.id }
    },
  }
}

/** Shared bearer gate for both verbs; null means the request may proceed. */
function unauthorizedResponse(req: Request): Response | null {
  const expectedToken = process.env.INGEST_BEARER_TOKEN
  if (!expectedToken) {
    console.error('INGEST_BEARER_TOKEN not configured')
    return json({ success: false, error: 'Ingest is not configured' }, 500)
  }
  if (!isAuthorized(req.headers.get('authorization'), expectedToken)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }
  return null
}

export async function GET(req: Request): Promise<Response> {
  const denied = unauthorizedResponse(req)
  if (denied) {
    return denied
  }

  try {
    const pending = await hasPendingRequest(realBundleRequestDeps())
    return json({ success: true, data: { pending } }, 200)
  } catch (error) {
    console.error('Pending-request check failed:', error)
    return json({ success: false, error: 'Failed to check pending requests' }, 500)
  }
}

export async function POST(req: Request): Promise<Response> {
  const denied = unauthorizedResponse(req)
  if (denied) {
    return denied
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json({ success: false, error: 'Expected multipart/form-data body' }, 400)
  }

  try {
    const { id } = await ingestBundle(form, realDeps())
    // Fulfil the "fresh bundle required" flag AFTER the bundle is committed.
    // Best-effort: the bundle IS stored, so a fulfilment error must not fail
    // the upload — the uploader will still see the flag pending next poll,
    // re-upload, and retry the fulfilment (self-healing).
    try {
      await fulfillPendingRequests(realBundleRequestDeps(), id)
    } catch (error) {
      console.error('Failed to fulfil pending bundle requests:', error)
    }
    return json({ success: true, data: { bundleId: id } }, 201)
  } catch (error) {
    if (error instanceof IngestValidationError) {
      return json({ success: false, error: error.message }, 400)
    }
    console.error('Ingest failed:', error)
    return json({ success: false, error: 'Failed to store bundle' }, 500)
  }
}
