import { FILE_FIELDS, type IngestBucket } from '@/lib/ingest/manifest'

/**
 * Orchestration for the scheduled bundle-cleanup task (feat-039).
 *
 * Deletes raw_bundles that nothing references — no briefings row, no
 * eval_results row (the selection predicate lives in the SQL function
 * `unused_bundles_before`, see its migration for the safety rationale) — along
 * with their Storage objects. Storage objects are removed BEFORE the rows:
 * if object removal fails the rows survive and the next run retries them,
 * whereas deleting rows first would strand orphaned objects forever.
 */

/** How long an unused bundle is kept before it becomes a cleanup candidate. */
export const RETENTION_HOURS = 24

/** Bundles fetched (and deleted) per selection round-trip. */
export const CLEANUP_BATCH_SIZE = 200

/** Max batches per run — caps one run at 10k bundles (backlog drains daily). */
export const MAX_BATCHES_PER_RUN = 50

/** Max object paths per storage remove call. */
export const REMOVE_CHUNK_SIZE = 100

/**
 * A cleanup candidate as returned by the selection function: the row id plus
 * whatever ref columns are present. Ref columns not in FILE_FIELDS are ignored.
 */
export type CleanupCandidate = {
  readonly id: string
  readonly [column: string]: string | null | undefined
}

export type CleanupDeps = {
  /** Unreferenced bundles older than `cutoffIso`, oldest first, at most `limit`. */
  listUnusedBundles: (cutoffIso: string, limit: number) => Promise<CleanupCandidate[]>
  /** Removes objects from a bucket; tolerates already-missing paths. */
  removeObjects: (bucket: IngestBucket, paths: string[]) => Promise<void>
  /** Deletes the raw_bundles rows with these ids. */
  deleteBundleRows: (ids: string[]) => Promise<void>
  /** Current time (injected for tests). */
  now: () => Date
}

export type CleanupResult = {
  readonly deletedBundles: number
  readonly deletedObjects: number
  readonly batches: number
  /** True when the run stopped at MAX_BATCHES_PER_RUN with candidates left. */
  readonly truncated: boolean
  readonly cutoffIso: string
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

/**
 * Collect the Storage object paths of a batch, grouped by bucket. The
 * column→bucket mapping is the ingest manifest (FILE_FIELDS) — the same
 * contract that placed the objects — so cleanup can never invent a path
 * ingest didn't write.
 */
export function collectObjectPaths(
  candidates: readonly CleanupCandidate[],
): ReadonlyMap<IngestBucket, string[]> {
  const byBucket = new Map<IngestBucket, string[]>()
  for (const candidate of candidates) {
    for (const field of FILE_FIELDS) {
      const ref = candidate[field.column]
      if (typeof ref === 'string' && ref !== '') {
        const paths = byBucket.get(field.bucket) ?? []
        byBucket.set(field.bucket, [...paths, ref])
      }
    }
  }
  return byBucket
}

/**
 * Run one cleanup pass: select → remove objects → delete rows, in batches,
 * until no candidates remain or MAX_BATCHES_PER_RUN is hit. Any error aborts
 * the run (the schedule retries next day; nothing here is time-critical).
 */
export async function cleanupBundles(deps: CleanupDeps): Promise<CleanupResult> {
  const cutoffIso = new Date(
    deps.now().getTime() - RETENTION_HOURS * 60 * 60 * 1000,
  ).toISOString()

  let deletedBundles = 0
  let deletedObjects = 0
  let batches = 0

  while (batches < MAX_BATCHES_PER_RUN) {
    const candidates = await deps.listUnusedBundles(cutoffIso, CLEANUP_BATCH_SIZE)
    if (candidates.length === 0) {
      return { deletedBundles, deletedObjects, batches, truncated: false, cutoffIso }
    }
    batches += 1

    for (const [bucket, paths] of collectObjectPaths(candidates)) {
      for (const pathChunk of chunk(paths, REMOVE_CHUNK_SIZE)) {
        await deps.removeObjects(bucket, pathChunk)
        deletedObjects += pathChunk.length
      }
    }

    await deps.deleteBundleRows(candidates.map((c) => c.id))
    deletedBundles += candidates.length

    // A short batch means the backlog is drained — skip the extra round-trip.
    if (candidates.length < CLEANUP_BATCH_SIZE) {
      return { deletedBundles, deletedObjects, batches, truncated: false, cutoffIso }
    }
  }

  return { deletedBundles, deletedObjects, batches, truncated: true, cutoffIso }
}
