import { getServiceClient } from '@/lib/supabase/server'
import type { CleanupCandidate, CleanupDeps } from './cleanupBundles'

/**
 * Real side effects for the cleanup-task, wired to the service-role Supabase
 * client (mirrors lib/eval/deps.ts). Selection goes through the SQL function
 * `unused_bundles_before` — the NOT EXISTS predicate lives server-side so the
 * task can never bulk-delete a bundle that a briefing or eval references.
 */
export function realCleanupDeps(): CleanupDeps {
  const supabase = getServiceClient()
  return {
    listUnusedBundles: async (cutoffIso, limit) => {
      const { data, error } = await supabase.rpc('unused_bundles_before', {
        p_cutoff: cutoffIso,
        p_limit: limit,
      })
      if (error) {
        throw error
      }
      return (data ?? []) as CleanupCandidate[]
    },

    removeObjects: async (bucket, paths) => {
      // remove() reports per-object outcomes in `data` and only errors on
      // request-level failures; already-missing paths are not an error, which
      // is what we want — a rerun after a partial failure must be idempotent.
      const { error } = await supabase.storage.from(bucket).remove(paths)
      if (error) {
        throw error
      }
    },

    deleteBundleRows: async (ids) => {
      const { error } = await supabase.from('raw_bundles').delete().in('id', ids)
      if (error) {
        throw error
      }
    },

    now: () => new Date(),
  }
}
