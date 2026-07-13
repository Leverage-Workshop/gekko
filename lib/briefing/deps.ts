import { getServiceClient } from '@/lib/supabase/server'
import type {
  DashboardBriefingRow,
  DashboardDeps,
  DashboardEvalRow,
} from './dashboardData'

/**
 * Real side effects for the dashboard loader, wired to the service-role
 * Supabase client (mirrors lib/analyze/deps.ts). Server-only — the page is a
 * server component and the service-role key never reaches the client.
 */
export function realDashboardDeps(): DashboardDeps {
  const supabase = getServiceClient()
  return {
    fetchLatestBriefing: async () => {
      const { data, error } = await supabase
        .from('briefings')
        .select('id, created_at, trigger_reason, model_id, raw_model_json')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) {
        throw error
      }
      return data ? (data as DashboardBriefingRow) : null
    },

    fetchLatestEvalResult: async () => {
      const { data, error } = await supabase
        .from('eval_results')
        .select(
          'id, created_at, model_id, near_entry, status, direction, trigger, stop, targets, reason, current_price',
        )
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) {
        throw error
      }
      return data ? (data as DashboardEvalRow) : null
    },

    fetchLatestBundleReceivedAt: async () => {
      const { data, error } = await supabase
        .from('raw_bundles')
        .select('received_at')
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) {
        throw error
      }
      return (data?.received_at as string | undefined) ?? null
    },

    fetchLatestExecCsv: async () => {
      const { data, error } = await supabase
        .from('raw_bundles')
        .select('exec_csv_ref')
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) {
        throw error
      }
      const ref = (data?.exec_csv_ref as string | undefined | null) ?? null
      if (!ref) return null
      const { data: blob, error: downloadError } = await supabase.storage
        .from('bundle-csvs')
        .download(ref)
      if (downloadError || !blob) {
        throw downloadError ?? new Error(`Empty download for ${ref}`)
      }
      return blob.text()
    },
  }
}
