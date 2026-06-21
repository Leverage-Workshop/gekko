import { z } from 'zod'
import { FILE_FIELDS, MGI_FIELD, type IngestBucket } from './manifest'

/**
 * Raised for client-correctable problems (bad JSON, empty bundle, non-numeric
 * price). The route maps this to HTTP 400; any other thrown error is a 500.
 */
export class IngestValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IngestValidationError'
  }
}

/** A row insert for `public.raw_bundles`. Refs are object paths within buckets. */
export type RawBundleRecord = {
  id: string
  mgi_json: unknown | null
  current_price: number | null
  is_stale: boolean
  htf_png_ref: string | null
  tpo_png_ref: string | null
  exec_png_ref: string | null
  exec_csv_ref: string | null
  vol_profile_ref: string | null
  delta_profile_ref: string | null
}

/** Side effects injected so the orchestration stays pure and unit-testable. */
export type IngestDeps = {
  /** uploads object bytes to `<bucket>/<path>`; throws on failure. */
  uploadObject: (
    bucket: IngestBucket,
    path: string,
    bytes: Uint8Array,
    contentType: string,
  ) => Promise<void>
  /** inserts the bundle row; returns the persisted id. */
  insertBundle: (record: RawBundleRecord) => Promise<{ id: string }>
  /** generates the bundle id (also used as the Storage prefix). */
  newId: () => string
}

function isFile(value: FormDataEntryValue | null): value is File {
  return typeof value === 'object' && value !== null && 'arrayBuffer' in value
}

function parseMgi(form: FormData): unknown | null {
  const raw = form.get(MGI_FIELD)
  if (raw == null || isFile(raw) || raw === '') {
    return null
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new IngestValidationError(`'${MGI_FIELD}' is not valid JSON`)
  }
}

/** The MGI JSON carries the live price/time at `current.price` / `current.time`. */
const mgiCurrentSchema = z.object({
  current: z.object({ price: z.number().finite() }),
})

/**
 * Pull the current price out of the MGI static-levels JSON. The price is not a
 * separate upload field — Sierra writes it into `mgi_static_levels.json` at
 * `current.price` (alongside `current.time`, which stays inside the stored
 * jsonb). Returns null when the MGI is absent or lacks a numeric price.
 */
function extractCurrentPrice(mgiJson: unknown): number | null {
  const parsed = mgiCurrentSchema.safeParse(mgiJson)
  return parsed.success ? parsed.data.current.price : null
}

/**
 * Store one ingested export bundle: upload present files to Storage, write the
 * MGI JSON inline, and insert a `raw_bundles` row holding the object refs.
 *
 * Per the architecture (docs/agent-architecture-plan.md), ingest performs **no
 * auto-analyze** — it only persists the raw bundle. Briefings are produced later
 * by the analyze-task, triggered on demand from /api/briefings/run.
 *
 * @throws {IngestValidationError} if the bundle is empty or a field is malformed.
 */
export async function ingestBundle(
  form: FormData,
  deps: IngestDeps,
): Promise<{ id: string }> {
  const mgiJson = parseMgi(form)
  const currentPrice = extractCurrentPrice(mgiJson)

  const id = deps.newId()

  const refs: Record<string, string | null> = {
    htf_png_ref: null,
    tpo_png_ref: null,
    exec_png_ref: null,
    exec_csv_ref: null,
    vol_profile_ref: null,
    delta_profile_ref: null,
  }

  const presentFiles = FILE_FIELDS.map((f) => ({ f, value: form.get(f.field) })).filter(
    (x): x is { f: (typeof FILE_FIELDS)[number]; value: File } => isFile(x.value),
  )

  if (presentFiles.length === 0 && mgiJson === null) {
    throw new IngestValidationError('bundle is empty: no files and no mgi JSON')
  }

  for (const { f, value } of presentFiles) {
    const path = `${id}/${f.filename}`
    const bytes = new Uint8Array(await value.arrayBuffer())
    await deps.uploadObject(f.bucket, path, bytes, f.contentType)
    refs[f.column] = path
  }

  const record: RawBundleRecord = {
    id,
    mgi_json: mgiJson,
    current_price: currentPrice,
    is_stale: false,
    htf_png_ref: refs.htf_png_ref,
    tpo_png_ref: refs.tpo_png_ref,
    exec_png_ref: refs.exec_png_ref,
    exec_csv_ref: refs.exec_csv_ref,
    vol_profile_ref: refs.vol_profile_ref,
    delta_profile_ref: refs.delta_profile_ref,
  }

  return deps.insertBundle(record)
}
