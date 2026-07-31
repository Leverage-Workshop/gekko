import type { BundleRow } from '@/lib/analyze/loadBundle'
import { getServiceClient } from '@/lib/supabase/server'
import type { EvalConfig, EvalDeps } from './evalBundle'
import type { EntryLevelRow } from './proximity'

/**
 * Real side effects for the eval-task, wired to the service-role Supabase
 * client (mirrors lib/analyze/deps.ts). Extends the config read to the
 * `triage_model_id` column — the eval-task runs on the cheap triage tier,
 * never the full briefing model.
 */
export function realEvalDeps(): EvalDeps {
  const supabase = getServiceClient()
  return {
    // select('*'), not an explicit column list: naming a column that the
    // remote schema doesn't have yet (migration not applied) is a PostgREST
    // error, and the eval must degrade to code defaults instead of failing.
    fetchConfig: async () => {
      const { data, error } = await supabase
        .from('config')
        .select('*')
        .eq('id', 1)
        .maybeSingle()
      if (error) {
        throw error
      }
      return data ? (data as EvalConfig) : null
    },

    fetchLatestBundle: async () => {
      const { data, error } = await supabase
        .from('raw_bundles')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) {
        throw error
      }
      return data ? (data as BundleRow) : null
    },

    downloadObject: async (bucket, path) => {
      const { data, error } = await supabase.storage.from(bucket).download(path)
      if (error) {
        throw error
      }
      return new Uint8Array(await data.arrayBuffer())
    },

    // feat-024 lifecycle contract: the eval-task evaluates active=true rows
    // ONLY (persistBriefing deactivates the prior set on each new briefing).
    fetchActiveEntryLevels: async () => {
      const { data, error } = await supabase
        .from('entry_levels')
        .select('id, briefing_id, objective, label, price, direction, stop, targets')
        .eq('active', true)
      if (error) {
        throw error
      }
      return (data ?? []) as EntryLevelRow[]
    },

    insertEvalResult: async (row) => {
      const { data, error } = await supabase
        .from('eval_results')
        .insert(row)
        .select('id')
        .single()
      if (error) {
        // Same degradation contract as the config read above: a column the
        // remote schema doesn't have yet (absorption_stack migration not
        // applied) is a PostgREST PGRST204 — persist the verdict without the
        // stat-row stack rather than failing the whole eval.
        if (error.code === 'PGRST204') {
          const { absorption_stack: _absorptionStack, ...legacy } = row
          const retry = await supabase
            .from('eval_results')
            .insert(legacy)
            .select('id')
            .single()
          if (retry.error) {
            throw retry.error
          }
          return { id: retry.data.id as string }
        }
        throw error
      }
      return { id: data.id as string }
    },
  }
}
