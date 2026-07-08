import { BUNDLE_ID_FIELD, FILE_FIELDS, MGI_FIELD } from '@/lib/ingest'

/**
 * Reads the Sierra Chart export folder into an in-memory bundle and turns it
 * into the multipart body POST /api/ingest expects.
 *
 * The ingest field name and content-type for each file are single-sourced from
 * the ingest manifest (`FILE_FIELDS`), but the *local* export filenames are the
 * names Sierra Chart actually writes into the export folder (see the
 * `chart-data/` samples) — these are NOT the manifest's `filename`, which is the
 * object name the server uses inside the Storage bucket.
 *
 * The current price and time are NOT separate uploads: Sierra writes them into
 * `mgi_static_levels.json` (`current.price` / `current.time`), and the ingest
 * endpoint extracts the price from that JSON. The uploader just ships the file.
 */

/** Local export filename Sierra Chart writes for each ingest field. */
const LOCAL_FILENAME_BY_FIELD: Readonly<Record<string, string>> = {
  htf_png: 'htf_clean.png',
  tpo_png: 'tpo.png',
  exec_png: 'execution_clean.png',
  exec_csv: 'execution_bar_data.rolling.csv',
  vol_profile: 'vbp_export.md',
  delta_profile: 'delta_vbp_export.md',
}

type LocalFile = {
  readonly field: string
  readonly filename: string
  readonly contentType: string
}

const LOCAL_FILES: readonly LocalFile[] = FILE_FIELDS.map((f) => {
  const filename = LOCAL_FILENAME_BY_FIELD[f.field]
  if (!filename) {
    throw new Error(`No local export filename mapped for ingest field '${f.field}'`)
  }
  return { field: f.field, filename, contentType: f.contentType }
})

/** Sidecar filename holding the MGI static-levels JSON (posted as the `mgi` field). */
export const MGI_FILENAME = 'mgi_static_levels.json'

/** Every filename the uploader watches for inside the export folder. */
export const BUNDLE_FILENAMES: readonly string[] = [
  ...LOCAL_FILES.map((f) => f.filename),
  MGI_FILENAME,
]

export type BundlePart = {
  readonly field: string
  readonly filename: string
  readonly contentType: string
  readonly bytes: Uint8Array
}

export type Bundle = {
  readonly files: readonly BundlePart[]
  readonly mgi: string | null
}

/** Reads one export-folder file; resolves to `null` when the file is absent. */
export type FileReader = (filename: string) => Promise<Uint8Array | null>

const decoder = new TextDecoder()

/** Reads every present bundle file via the injected reader. */
export async function readBundle(read: FileReader): Promise<Bundle> {
  const files: BundlePart[] = []
  for (const f of LOCAL_FILES) {
    const bytes = await read(f.filename)
    if (bytes) {
      files.push({ field: f.field, filename: f.filename, contentType: f.contentType, bytes })
    }
  }

  const mgiBytes = await read(MGI_FILENAME)
  const mgi = mgiBytes ? decoder.decode(mgiBytes).trim() : null

  return { files, mgi: mgi || null }
}

/**
 * A bundle the ingest endpoint would reject as empty (no files and no MGI). The
 * uploader skips posting these so a partial mid-export write isn't sent.
 */
export function isEmptyBundle(bundle: Bundle): boolean {
  return bundle.files.length === 0 && bundle.mgi === null
}

/**
 * Builds the multipart body for POST /api/ingest from a read bundle.
 *
 * `bundleId` (a canonical UUID, minted once per bundle before the retry loop)
 * rides along as the `BUNDLE_ID_FIELD` so every retry of this body carries the
 * same id and the server can dedupe a retried POST instead of storing twice.
 */
export function toFormData(bundle: Bundle, bundleId?: string): FormData {
  const form = new FormData()
  for (const part of bundle.files) {
    // Copy into a fresh ArrayBuffer-backed view so the Blob part is a valid BlobPart.
    const view = new Uint8Array(part.bytes)
    form.append(part.field, new Blob([view], { type: part.contentType }), part.filename)
  }
  if (bundle.mgi !== null) {
    form.append(MGI_FIELD, bundle.mgi)
  }
  if (bundleId !== undefined) {
    form.append(BUNDLE_ID_FIELD, bundleId)
  }
  return form
}
