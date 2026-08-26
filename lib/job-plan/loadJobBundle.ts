import type { BundleRow } from '@/lib/analyze/loadBundle'
import type { BundleWaitResult } from '@/lib/bundleRequests'
import type { IngestBucket } from '@/lib/ingest'
import { JOB_STUDY_EXCHANGE_TZ } from './jobStudyMeta'
import { wallClockAt } from './exchangeTime'
import { JOB_PLAN_SOURCE_KEYS, type JobPlanSourceKey, type SourceBytes } from './fingerprint'
import { JobPlanAbortError, bundleWaitError, missingRefError } from './jobPlanErrors'

/**
 * Bundle binding + download for the job-plan task (feat-128, plan "Key
 * decisions" 2 and 3).
 *
 * BINDING: a dashboard run carries the `bundle_requests` id its button
 * inserted; the task waits on it and loads THE BUNDLE THE REQUEST WAS
 * FULFILLED WITH, by id — never "latest" (the analyze/eval tasks' latest-row
 * load has a false-freshness hole this task closes). Timeout / missing row /
 * fulfilled-without-id abort non-retryably. A run WITHOUT a request id (a
 * trigger.dev test run) may use the latest row, and says so loudly.
 *
 * REFS: every job-planning export is REQUIRED (the two job-study files, the
 * two rolling profiles, the exec + HTF bar CSVs); a NULL ref aborts with the
 * two usual causes named. The MGI JSON is stored inline (`mgi_json`), so its
 * "bytes" are its canonical serialization — jsonb key order is deterministic,
 * so the hash is stable for the same stored value.
 */

export type BundleWaitOutcome = 'not-requested' | BundleWaitResult['outcome']

export type BundleBinding = {
  readonly bundleRequestId: string | null
  readonly bundleWait: BundleWaitOutcome
}

export interface LoadJobBundleDeps {
  /** Poll the bundle request until fulfilled / missing / timed out (lib/bundleRequests). */
  waitForBundle: (bundleRequestId: string) => Promise<BundleWaitResult>
  /** One `raw_bundles` row by id, or null when it no longer exists. */
  fetchBundleById: (id: string) => Promise<BundleRow | null>
  /** Latest `raw_bundles` row — test runs without a request only. */
  fetchLatestBundle: () => Promise<BundleRow | null>
  downloadObject: (bucket: IngestBucket, path: string) => Promise<Uint8Array>
}

export type JobBundleTexts = Readonly<Record<JobPlanSourceKey, string>>

export type LoadedJobBundle = {
  readonly row: BundleRow
  readonly binding: BundleBinding
  /** The exact bytes downloaded, per source — the fingerprint's input. */
  readonly sources: SourceBytes
  readonly texts: JobBundleTexts
  /** The run's `asOf`: the bundle's `received_at` on the exchange wall clock. */
  readonly asOf: string
  readonly warnings: readonly string[]
}

export const LATEST_BUNDLE_WARNING =
  'bundle_binding_latest: this run carries no bundleRequestId, so it planned on the LATEST stored bundle rather than a bound fresh one — test runs only; dashboard runs always bind'

type RequiredRef = {
  readonly column: keyof BundleRow
  readonly key: Exclude<JobPlanSourceKey, 'mgi'>
  readonly what: string
}

const REQUIRED_REFS: readonly RequiredRef[] = [
  { column: 'job_study_daily_ref', key: 'jobStudyDaily', what: 'Job daily study (job-study-daily.json)' },
  { column: 'job_study_weekly_ref', key: 'jobStudyWeekly', what: 'Job weekly study (job-study-weekly.json)' },
  { column: 'exec_csv_ref', key: 'execBars', what: 'execution-bar CSV' },
  { column: 'htf_csv_ref', key: 'htfBars', what: 'HTF 30-min bar CSV' },
  { column: 'five_day_vbp_ref', key: 'fiveDayProfile', what: '5-day rolling volume profile' },
  { column: 'four_hour_vbp_ref', key: 'fourHourProfile', what: '4-hour rolling volume profile' },
]

const TEXT_BUCKET: IngestBucket = 'bundle-csvs'

async function boundRow(deps: LoadJobBundleDeps, bundleRequestId: string): Promise<{ row: BundleRow; binding: BundleBinding }> {
  const wait = await deps.waitForBundle(bundleRequestId)
  if (wait.outcome !== 'fulfilled') throw bundleWaitError(wait.outcome, bundleRequestId)
  if (wait.bundleId === null) throw bundleWaitError('unfulfilled', bundleRequestId)
  const row = await deps.fetchBundleById(wait.bundleId)
  if (row === null) {
    throw new JobPlanAbortError(
      'bundle_not_found',
      `bundle ${wait.bundleId} (the one request ${bundleRequestId} was fulfilled with) no longer exists — request a fresh bundle from the dashboard`,
    )
  }
  return { row, binding: { bundleRequestId, bundleWait: 'fulfilled' } }
}

async function latestRow(deps: LoadJobBundleDeps): Promise<{ row: BundleRow; binding: BundleBinding }> {
  const row = await deps.fetchLatestBundle()
  if (row === null) {
    throw new JobPlanAbortError('bundle_not_found', 'no ingested bundle exists — run the uploader first')
  }
  return { row, binding: { bundleRequestId: null, bundleWait: 'not-requested' } }
}

/** The bundle the run is bound to: by fulfilled request id, or (test runs) the latest row. */
export async function resolveBoundBundle(
  deps: LoadJobBundleDeps,
  bundleRequestId: string | undefined,
): Promise<{ row: BundleRow; binding: BundleBinding }> {
  return bundleRequestId ? boundRow(deps, bundleRequestId) : latestRow(deps)
}

function requireRef(row: BundleRow, ref: RequiredRef): string {
  const value = row[ref.column]
  if (typeof value !== 'string' || value.length === 0) throw missingRefError(row.id, ref.what, String(ref.column))
  return value
}

/** The exchange wall clock of the bundle's arrival — every planner window keys off it. */
export function asOfFromReceivedAt(receivedAt: string | null, bundleId: string): string {
  const epochMs = receivedAt === null ? Number.NaN : Date.parse(receivedAt)
  const asOf = wallClockAt(epochMs, JOB_STUDY_EXCHANGE_TZ)
  if (asOf === null) {
    throw new JobPlanAbortError('bundle_invalid', `bundle ${bundleId} has no usable received_at (${String(receivedAt)})`)
  }
  return asOf
}

function mgiBytes(row: BundleRow): Uint8Array {
  if (row.mgi_json === null || row.mgi_json === undefined) {
    throw new JobPlanAbortError('bundle_invalid', `bundle ${row.id} has no mgi_json`)
  }
  return new TextEncoder().encode(JSON.stringify(row.mgi_json))
}

async function downloadSources(deps: LoadJobBundleDeps, row: BundleRow): Promise<SourceBytes> {
  // Every ref is checked BEFORE any download, so a partial bundle fails fast and names its gap.
  const refs = REQUIRED_REFS.map((ref) => ({ key: ref.key, path: requireRef(row, ref) }))
  const downloaded = await Promise.all(
    refs.map(async ({ key, path }) => [key, await deps.downloadObject(TEXT_BUCKET, path)] as const),
  )
  return { ...Object.fromEntries(downloaded), mgi: mgiBytes(row) } as SourceBytes
}

function decodeAll(sources: SourceBytes): JobBundleTexts {
  const decoder = new TextDecoder()
  return Object.fromEntries(JOB_PLAN_SOURCE_KEYS.map((key) => [key, decoder.decode(sources[key])])) as JobBundleTexts
}

/**
 * Bind, then download everything the planner consumes.
 * @throws {JobPlanAbortError} on every binding / ref / row failure (non-retryable).
 */
export async function loadJobBundle(
  deps: LoadJobBundleDeps,
  bundleRequestId: string | undefined,
): Promise<LoadedJobBundle> {
  const { row, binding } = await resolveBoundBundle(deps, bundleRequestId)
  const asOf = asOfFromReceivedAt(row.received_at, row.id)
  const sources = await downloadSources(deps, row)
  return {
    row,
    binding,
    sources,
    texts: decodeAll(sources),
    asOf,
    warnings: binding.bundleWait === 'not-requested' ? [LATEST_BUNDLE_WARNING] : [],
  }
}
