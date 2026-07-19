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
  rotation_vbp_ref: string | null
  balance_area_vbp_ref: string | null
  half_rotation_delta_ref: string | null
  full_rotation_delta_ref: string | null
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
  rotationVbpContent: string
  balanceAreaVbpContent: string
  halfRotationDeltaContent: string
  fullRotationDeltaContent: string
  execCsvContent: string
  mgi: MgiStaticLevels
  /** Attached chart images, aligned index-for-index with `charts`. */
  images: ChartImage[]
  charts: ChartAttachment[]
  /** Non-fatal gaps (e.g. a missing screenshot). */
  warnings: string[]
}

/**
 * The relaxed (`requireTexts: 'exec-only'`) load: only the exec CSV is
 * required — the profile exports are neither required nor fetched, so the
 * fields are absent rather than nullable.
 */
export type LoadedExecBundle = Omit<
  LoadedBundle,
  | 'rotationVbpContent'
  | 'balanceAreaVbpContent'
  | 'halfRotationDeltaContent'
  | 'fullRotationDeltaContent'
>

/**
 * The eval-task (`requireTexts: 'exec-plus-delta'`) load: exec CSV required,
 * the two execution delta exports fetched best-effort (null + warning when a
 * ref is missing or the download fails — absorption facts are additive, so a
 * partial bundle must never block an entry check).
 */
export type LoadedEvalBundle = LoadedExecBundle & {
  halfRotationDeltaContent: string | null
  fullRotationDeltaContent: string | null
}

export interface LoadBundleOptions {
  /**
   * Which text exports are hard requirements. `'all'` (default — analyze)
   * requires the four profile exports + exec CSV; `'exec-plus-delta'` (eval)
   * requires the exec CSV and fetches the two delta exports best-effort;
   * `'exec-only'` requires only the exec CSV and skips the profiles entirely.
   */
  requireTexts?: 'all' | 'exec-only' | 'exec-plus-delta'
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

/** Best-effort text fetch: a missing ref or failed download degrades to null + warning. */
async function optionalText(
  deps: LoadBundleDeps,
  ref: string | null,
  what: string,
  warnings: string[],
): Promise<string | null> {
  if (!ref) {
    warnings.push(`bundle has no ${what} export`)
    return null
  }
  try {
    const bytes = await deps.downloadObject('bundle-csvs', ref)
    return new TextDecoder().decode(bytes)
  } catch (error) {
    warnings.push(
      `failed to download the ${what} export: ${error instanceof Error ? error.message : String(error)}`,
    )
    return null
  }
}

/**
 * Fetch the latest bundle and everything the engine + model call need from it.
 *
 * @throws {AnalyzeInputError} when there is no bundle, the MGI JSON is absent,
 *   or a required text export is missing (the four profile exports + exec CSV
 *   by default; exec CSV only with `requireTexts: 'exec-only'`).
 */
export async function loadLatestBundle(
  deps: LoadBundleDeps,
  options?: { requireTexts?: 'all' },
): Promise<LoadedBundle>
export async function loadLatestBundle(
  deps: LoadBundleDeps,
  options: { requireTexts: 'exec-only' },
): Promise<LoadedExecBundle>
export async function loadLatestBundle(
  deps: LoadBundleDeps,
  options: { requireTexts: 'exec-plus-delta' },
): Promise<LoadedEvalBundle>
export async function loadLatestBundle(
  deps: LoadBundleDeps,
  options: LoadBundleOptions = {},
): Promise<LoadedBundle | LoadedExecBundle | LoadedEvalBundle> {
  const requireTexts = options.requireTexts ?? 'all'

  const row = await deps.fetchLatestBundle()
  if (!row) {
    throw new AnalyzeInputError('no ingested bundle exists — run the uploader first')
  }
  if (row.mgi_json === null || row.mgi_json === undefined) {
    throw new AnalyzeInputError(`bundle ${row.id} has no mgi_json`)
  }

  const warnings: string[] = []
  const execCsvContent = await requireText(deps, row.exec_csv_ref, 'execution-bar CSV')
  const profileTexts =
    requireTexts === 'all'
      ? await Promise.all([
          requireText(deps, row.rotation_vbp_ref, '400-pt rotation volume profile'),
          requireText(deps, row.balance_area_vbp_ref, 'balance-area volume profile'),
          requireText(deps, row.half_rotation_delta_ref, 'half-rotation delta profile'),
          requireText(deps, row.full_rotation_delta_ref, 'full-rotation delta profile'),
        ])
      : null
  const deltaTexts =
    requireTexts === 'exec-plus-delta'
      ? await Promise.all([
          optionalText(deps, row.half_rotation_delta_ref, 'half-rotation delta profile', warnings),
          optionalText(deps, row.full_rotation_delta_ref, 'full-rotation delta profile', warnings),
        ])
      : null
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

  const base: LoadedExecBundle = {
    row,
    execCsvContent,
    mgi: row.mgi_json as MgiStaticLevels,
    images,
    charts,
    warnings,
  }
  if (deltaTexts !== null) {
    return {
      ...base,
      halfRotationDeltaContent: deltaTexts[0],
      fullRotationDeltaContent: deltaTexts[1],
    }
  }
  if (profileTexts === null) {
    return base
  }
  return {
    ...base,
    rotationVbpContent: profileTexts[0],
    balanceAreaVbpContent: profileTexts[1],
    halfRotationDeltaContent: profileTexts[2],
    fullRotationDeltaContent: profileTexts[3],
  }
}
