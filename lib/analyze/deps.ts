import { getServiceClient } from '@/lib/supabase/server'
import type { AnalyzeConfig, AnalyzeDeps } from './analyzeBundle'
import type { BundleRow } from './loadBundle'

/**
 * Real side effects for the analyze-task, wired to the service-role Supabase
 * client (mirrors app/api/ingest/route.ts's realDeps pattern).
 */
export function realAnalyzeDeps(): AnalyzeDeps {
  const supabase = getServiceClient()
  return {
    fetchConfig: async () => {
      const { data, error } = await supabase
        .from('config')
        .select('model_id, rr_min')
        .eq('id', 1)
        .maybeSingle()
      if (error) {
        throw error
      }
      return data ? (data as AnalyzeConfig) : null
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

    insertBriefing: async (row) => {
      const { data, error } = await supabase
        .from('briefings')
        .insert(row)
        .select('id')
        .single()
      if (error) {
        throw error
      }
      return { id: data.id as string }
    },

    deactivateEntryLevels: async () => {
      const { error } = await supabase
        .from('entry_levels')
        .update({ active: false })
        .eq('active', true)
      if (error) {
        throw error
      }
    },

    insertEntryLevels: async (rows) => {
      if (rows.length === 0) {
        return
      }
      const { error } = await supabase.from('entry_levels').insert(rows)
      if (error) {
        throw error
      }
    },
  }
}
