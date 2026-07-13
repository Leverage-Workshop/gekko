import { realAnalyzeDeps } from '@/lib/analyze'
import { getServiceClient } from '@/lib/supabase/server'
import type { ParentBriefingRow, UpdateDeps } from './updateBundle'

/**
 * Real side effects for the update-task: everything the analyze-task uses
 * (config, bundle load, Storage downloads, briefing/entry_levels writes) plus
 * the parent-briefing read. The parent is the latest briefing of ANY kind —
 * chained updates inherit overview/terrain transitively from the last
 * morning brief; the prompt labels the parent's kind and age.
 */
export function realUpdateDeps(): UpdateDeps {
  const supabase = getServiceClient()
  // Named fields rather than a spread: AnalyzeDeps carries an optional
  // `generate` typed to the Briefing schema, which must not leak into
  // UpdateDeps (whose generate takes the BriefingUpdate schema).
  const base = realAnalyzeDeps()
  return {
    fetchConfig: base.fetchConfig,
    fetchLatestBundle: base.fetchLatestBundle,
    downloadObject: base.downloadObject,
    insertBriefing: base.insertBriefing,
    deactivateEntryLevels: base.deactivateEntryLevels,
    insertEntryLevels: base.insertEntryLevels,

    fetchLatestBriefing: async (): Promise<ParentBriefingRow | null> => {
      const { data, error } = await supabase
        .from('briefings')
        .select('id, created_at, kind, raw_model_json')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) {
        throw error
      }
      return data ? (data as ParentBriefingRow) : null
    },
  }
}
