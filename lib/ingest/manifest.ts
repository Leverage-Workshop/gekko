/**
 * Multipart field contract for POST /api/ingest.
 *
 * The local uploader (feat-009) bundles the Sierra Chart export folder and
 * posts it as multipart/form-data. Each file field maps to a Storage bucket and
 * the `raw_bundles` ref column that records its object path. PNG snapshots live
 * in `chart-images`; CSV/Markdown telemetry exports live in `bundle-csvs`.
 *
 * Files are stored under a per-bundle prefix (`<bundleId>/<filename>`), so the
 * stored ref is the object path *within* its bucket (the bucket is implied by
 * the column).
 */
export type IngestBucket = 'chart-images' | 'bundle-csvs'

export type FileField = {
  /** multipart form field name */
  readonly field: string
  /** Storage bucket the object is written to */
  readonly bucket: IngestBucket
  /** raw_bundles column that stores the object path */
  readonly column: string
  /** filename used within the per-bundle Storage prefix */
  readonly filename: string
  /** content type set on the uploaded object */
  readonly contentType: string
}

export const FILE_FIELDS: readonly FileField[] = [
  { field: 'htf_png', bucket: 'chart-images', column: 'htf_png_ref', filename: 'htf.png', contentType: 'image/png' },
  { field: 'tpo_png', bucket: 'chart-images', column: 'tpo_png_ref', filename: 'tpo.png', contentType: 'image/png' },
  { field: 'exec_png', bucket: 'chart-images', column: 'exec_png_ref', filename: 'exec.png', contentType: 'image/png' },
  {
    field: 'exec_csv',
    bucket: 'bundle-csvs',
    column: 'exec_csv_ref',
    filename: 'execution_bars.csv',
    contentType: 'text/csv',
  },
  {
    field: 'rotation_vbp',
    bucket: 'bundle-csvs',
    column: 'rotation_vbp_ref',
    filename: 'four-hundred-rotation.vbp.md',
    contentType: 'text/markdown',
  },
  {
    field: 'five_day_vbp',
    bucket: 'bundle-csvs',
    column: 'five_day_vbp_ref',
    filename: 'rolling-five-day.vbp.md',
    contentType: 'text/markdown',
  },
  {
    field: 'half_rotation_delta',
    bucket: 'bundle-csvs',
    column: 'half_rotation_delta_ref',
    filename: 'half-rotation-delta.vbp.md',
    contentType: 'text/markdown',
  },
  {
    field: 'full_rotation_delta',
    bucket: 'bundle-csvs',
    column: 'full_rotation_delta_ref',
    filename: 'full-rotation-delta.vbp.md',
    contentType: 'text/markdown',
  },
] as const

/**
 * multipart field carrying the MGI static-levels JSON (stored inline as jsonb).
 * The current price and time are NOT separate fields — they live inside this
 * JSON at `current.price` / `current.time` and are extracted on ingest.
 */
export const MGI_FIELD = 'mgi'

/**
 * Optional multipart field carrying a client-generated bundle UUID. The uploader
 * mints one id per bundle (before its retry loop) and every retry reuses it, so
 * a retried POST after a dropped response lands on the same Storage prefix and
 * `raw_bundles` row instead of minting a duplicate. When absent, ingest
 * generates the id server-side.
 */
export const BUNDLE_ID_FIELD = 'bundle_id'
