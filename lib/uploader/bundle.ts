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

/**
 * Local export filename candidates Sierra Chart writes for each ingest field,
 * in priority order — the first present file wins. `exec_csv` prefers the
 * full-session Globex export (feat-062) and falls back to the retired rolling
 * 250-bar export so a not-yet-reconfigured chart still ships a bundle.
 */
const LOCAL_FILENAMES_BY_FIELD: Readonly<Record<string, readonly string[]>> = {
  htf_png: ['htf_clean.png'],
  tpo_png: ['tpo.png'],
  exec_png: ['execution_clean.png'],
  exec_csv: [
    'execution_bar_data.globex.csv',
    'execution_bar_data.globex',
    'execution_bar_data.rolling.csv',
  ],
  rotation_vbp: ['four-hundred-rotation.vbp.md'],
  balance_area_vbp: ['balance-area.vbp.md'],
  half_rotation_delta: ['half-rotation-delta.vbp.md'],
  full_rotation_delta: ['full-rotation-delta.vbp.md'],
  tpo_data: ['tpo.data.md'],
  daily_va: ['daily-value-areas.csv'],
  htf_csv: ['htf_bar_data.rolling.csv'],
  // Job-planning inputs (feat-121): the names feat-118's JobStudyExporter and the
  // companion profile studies write. Absent until that exporter is deployed — the
  // uploader skips missing files, so bundles simply lack the refs until then.
  job_study: ['job-study.json'],
  five_day_vbp: ['five-day-rolling.vbp.md'],
  four_hour_vbp: ['four-hour-rolling.vbp.md'],
}

type LocalFile = {
  readonly field: string
  readonly filenames: readonly string[]
  readonly contentType: string
}

const LOCAL_FILES: readonly LocalFile[] = FILE_FIELDS.map((f) => {
  const filenames = LOCAL_FILENAMES_BY_FIELD[f.field]
  if (!filenames || filenames.length === 0) {
    throw new Error(`No local export filename mapped for ingest field '${f.field}'`)
  }
  return { field: f.field, filenames, contentType: f.contentType }
})

/** Sidecar filename holding the MGI static-levels JSON (posted as the `mgi` field). */
export const MGI_FILENAME = 'mgi_static_levels.json'

/** Every filename the uploader watches for inside the export folder. */
export const BUNDLE_FILENAMES: readonly string[] = [
  ...LOCAL_FILES.flatMap((f) => f.filenames),
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
    for (const filename of f.filenames) {
      const bytes = await read(filename)
      if (bytes) {
        files.push({ field: f.field, filename, contentType: f.contentType, bytes })
        break
      }
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
