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
    field: 'vol_profile',
    bucket: 'bundle-csvs',
    column: 'vol_profile_ref',
    filename: 'vbp_export.md',
    contentType: 'text/markdown',
  },
  {
    field: 'delta_profile',
    bucket: 'bundle-csvs',
    column: 'delta_profile_ref',
    filename: 'delta_vbp_export.md',
    contentType: 'text/markdown',
  },
] as const

/**
 * multipart field carrying the MGI static-levels JSON (stored inline as jsonb).
 * The current price and time are NOT separate fields — they live inside this
 * JSON at `current.price` / `current.time` and are extracted on ingest.
 */
export const MGI_FIELD = 'mgi'
