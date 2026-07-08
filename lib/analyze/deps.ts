import { fetchConfigRow } from '@/lib/config'
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
    // feat-031: fetchConfigRow selects the high-conviction columns but
    // degrades gracefully (42703 → legacy column set + flag=false) while the
    // live DB predates the high_conviction_flag migration.
    fetchConfig: async (): Promise<AnalyzeConfig | null> => {
      const { row } = await fetchConfigRow(supabase)
      if (!row) {
        return null
      }
      return {
        model_id: row.model_id,
        rr_min: row.rr_min,
        high_conviction_enabled: row.high_conviction_enabled,
        high_conviction_model_id: row.high_conviction_model_id,
      }
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
