import type { IngestBucket } from '@/lib/ingest'
import type { ChartImage } from '@/lib/llm'
import type { MgiStaticLevels } from '@/lib/engine/mgiPriority'
import type { ChartAttachment } from './prompt'

/**
 * Load the latest ingested export bundle back out of Supabase: the
 * `raw_bundles` row plus the Storage objects its `*_ref` columns point at.
 * Side effects are injected (`LoadBundleDeps`) so the loader is unit-testable.
 */

/** Thrown when no usable bundle exists — retrying cannot help. */
export class AnalyzeInputError extends Error {}

/** The `raw_bundles` columns the analyze-task consumes. */
export interface BundleRow {
  id: string
  received_at: string | null
  mgi_json: unknown
  current_price: number | null
  is_stale: boolean
  exec_csv_ref: string | null
  vol_profile_ref: string | null
  delta_profile_ref: string | null
  htf_png_ref: string | null
  tpo_png_ref: string | null
  exec_png_ref: string | null
}

export interface LoadBundleDeps {
  /** Latest `raw_bundles` row by `received_at`, or null when none exist. */
  fetchLatestBundle(): Promise<BundleRow | null>
  /** Download one Storage object (bucket + path from the ref columns). */
  downloadObject(bucket: IngestBucket, path: string): Promise<Uint8Array>
}

export interface LoadedBundle {
  row: BundleRow
  vbpContent: string
  deltaContent: string
  execCsvContent: string
  mgi: MgiStaticLevels
  /** Attached chart images, aligned index-for-index with `charts`. */
  images: ChartImage[]
  charts: ChartAttachment[]
  /** Non-fatal gaps (e.g. a missing screenshot). */
  warnings: string[]
}

const CHART_REFS = [
  { column: 'htf_png_ref', label: 'HTF planning chart (30-min, 90-day)' },
  { column: 'tpo_png_ref', label: 'TPO / Market Profile chart' },
  { column: 'exec_png_ref', label: 'Execution chart (short timeframe)' },
] as const

async function requireText(
  deps: LoadBundleDeps,
  ref: string | null,
  what: string,
): Promise<string> {
  if (!ref) {
    throw new AnalyzeInputError(`bundle is missing the ${what} export`)
  }
  const bytes = await deps.downloadObject('bundle-csvs', ref)
  return new TextDecoder().decode(bytes)
}

/**
 * Fetch the latest bundle and everything the engine + model call need from it.
 *
 * @throws {AnalyzeInputError} when there is no bundle, the MGI JSON is absent,
 *   or a required text export (VbP / delta / exec CSV) is missing.
 */
export async function loadLatestBundle(deps: LoadBundleDeps): Promise<LoadedBundle> {
  const row = await deps.fetchLatestBundle()
  if (!row) {
    throw new AnalyzeInputError('no ingested bundle exists — run the uploader first')
  }
  if (row.mgi_json === null || row.mgi_json === undefined) {
    throw new AnalyzeInputError(`bundle ${row.id} has no mgi_json`)
  }

  const [vbpContent, deltaContent, execCsvContent] = await Promise.all([
    requireText(deps, row.vol_profile_ref, 'VbP volume profile'),
    requireText(deps, row.delta_profile_ref, 'delta profile'),
    requireText(deps, row.exec_csv_ref, 'execution-bar CSV'),
  ])

  const warnings: string[] = []
  const images: ChartImage[] = []
  const charts: ChartAttachment[] = []
  for (const { column, label } of CHART_REFS) {
    const ref = row[column]
    if (!ref) {
      warnings.push(`bundle ${row.id} has no ${label} screenshot`)
      continue
    }
    const bytes = await deps.downloadObject('chart-images', ref)
    images.push({ base64: Buffer.from(bytes).toString('base64') })
    charts.push({ label })
  }

  return {
    row,
    vbpContent,
    deltaContent,
    execCsvContent,
    mgi: row.mgi_json as MgiStaticLevels,
    images,
    charts,
    warnings,
  }
}
