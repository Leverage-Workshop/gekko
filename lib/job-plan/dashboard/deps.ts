import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/supabase/server'
import { JOB_PLAN_IMAGES_BUCKET } from '../jobPlanImages'
import type { JobPlanDashboardDeps } from './dashboardData'
import type { ProfileImageDeps } from './profileImage'
import { JobPlanRowSchema } from './schema'

/**
 * Real side effects for the Job plan surface (feat-129), wired to the
 * service-role Supabase client (mirrors lib/briefing/deps.ts). Server-only:
 * the page is a server component and the image route runs on the Node
 * runtime; the service-role key never reaches the client. Read-only — the
 * surface never writes `job_plans`, `briefings` or `entry_levels`.
 */

const JOB_PLAN_COLUMNS =
  'id, created_at, bundle_id, trading_day, trigger_reason, status, planner_revision, input_fingerprint, run_id, plan, warnings, profile_nodes'

export function realJobPlanDashboardDeps(
  client: SupabaseClient = getServiceClient()
): JobPlanDashboardDeps {
  return {
    fetchLatestJobPlan: async () => {
      const { data, error } = await client
        .from('job_plans')
        .select(JOB_PLAN_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      // The row shape is validated here so a column drift fails loudly at the boundary.
      return JobPlanRowSchema.parse(data)
    },
  }
}

export function realProfileImageDeps(
  client: SupabaseClient = getServiceClient()
): ProfileImageDeps {
  return {
    downloadProfileImage: async (hash) => {
      const { data, error } = await client.storage
        .from(JOB_PLAN_IMAGES_BUCKET)
        .download(`${hash}.png`)
      if (error) {
        // Storage reports a missing object as an error; the route answers 404 for null.
        if (/not found|does not exist|404/i.test(error.message)) return null
        throw error
      }
      if (!data) return null
      return new Uint8Array(await data.arrayBuffer())
    },
  }
}
