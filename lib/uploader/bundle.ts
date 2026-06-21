import { CURRENT_PRICE_FIELD, FILE_FIELDS, MGI_FIELD } from '@/lib/ingest'

/**
 * Reads the Sierra Chart export folder into an in-memory bundle and turns it
 * into the multipart body POST /api/ingest expects.
 *
 * The local export filenames are exactly the `filename` of each ingest
 * `FILE_FIELD` (htf.png, tpo.png, exec.png, execution_bars.csv, vbp_export.md,
 * delta_vbp_export.md). Two sidecars carry the non-file fields: `mgi.json` holds
 * the MGI static-levels JSON and `current_price.txt` holds the latest price.
 * Reusing the ingest manifest keeps the field/filename contract single-sourced.
 */

/** Sidecar filename holding the MGI static-levels JSON (posted as the `mgi` field). */
export const MGI_FILENAME = 'mgi.json'

/** Sidecar filename holding the current price as plain text (posted as `current_price`). */
export const CURRENT_PRICE_FILENAME = 'current_price.txt'

/** Every filename the uploader watches for inside the export folder. */
export const BUNDLE_FILENAMES: readonly string[] = [
  ...FILE_FIELDS.map((f) => f.filename),
  MGI_FILENAME,
  CURRENT_PRICE_FILENAME,
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
  readonly currentPrice: string | null
}

/** Reads one export-folder file; resolves to `null` when the file is absent. */
export type FileReader = (filename: string) => Promise<Uint8Array | null>

const decoder = new TextDecoder()

/** Reads every present bundle file/sidecar via the injected reader. */
export async function readBundle(read: FileReader): Promise<Bundle> {
  const files: BundlePart[] = []
  for (const f of FILE_FIELDS) {
    const bytes = await read(f.filename)
    if (bytes) {
      files.push({ field: f.field, filename: f.filename, contentType: f.contentType, bytes })
    }
  }

  const mgiBytes = await read(MGI_FILENAME)
  const priceBytes = await read(CURRENT_PRICE_FILENAME)
  const mgi = mgiBytes ? decoder.decode(mgiBytes).trim() : null
  const currentPrice = priceBytes ? decoder.decode(priceBytes).trim() : null

  return {
    files,
    mgi: mgi || null,
    currentPrice: currentPrice || null,
  }
}

/**
 * A bundle the ingest endpoint would reject as empty (no files and no MGI). The
 * uploader skips posting these so a partial mid-export write isn't sent.
 */
export function isEmptyBundle(bundle: Bundle): boolean {
  return bundle.files.length === 0 && bundle.mgi === null
}

/** Builds the multipart body for POST /api/ingest from a read bundle. */
export function toFormData(bundle: Bundle): FormData {
  const form = new FormData()
  for (const part of bundle.files) {
    // Copy into a fresh ArrayBuffer-backed view so the Blob part is a valid BlobPart.
    const view = new Uint8Array(part.bytes)
    form.append(part.field, new Blob([view], { type: part.contentType }), part.filename)
  }
  if (bundle.mgi !== null) {
    form.append(MGI_FIELD, bundle.mgi)
  }
  if (bundle.currentPrice !== null) {
    form.append(CURRENT_PRICE_FIELD, bundle.currentPrice)
  }
  return form
}
