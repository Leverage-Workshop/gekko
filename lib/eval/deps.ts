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
    fetchConfig: async () => {
      const { data, error } = await supabase
        .from('config')
        .select('triage_model_id')
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
        throw error
      }
      return { id: data.id as string }
    },
  }
}
