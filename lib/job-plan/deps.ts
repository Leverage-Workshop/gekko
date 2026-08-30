import type { SupabaseClient } from '@supabase/supabase-js'
import type { BundleRow } from '@/lib/analyze/loadBundle'
import { waitForFreshBundle } from '@/lib/bundleRequests'
import { fetchConfigRow } from '@/lib/config'
import { generateStructured } from '@/lib/llm'
import { getServiceClient } from '@/lib/supabase/server'
import type { JobPlanConfig, JobPlanDeps } from './runJobPlan'
import { JOB_PLAN_IMAGES_BUCKET } from './visionRead'

/**
 * Real side effects for the job-plan task, wired to the service-role Supabase
 * client (mirrors lib/analyze/deps.ts). Nothing here reaches `briefings` or
 * `entry_levels`.
 */
export function realJobPlanDeps(client: SupabaseClient = getServiceClient()): JobPlanDeps {
  return {
    waitForBundle: waitForFreshBundle,

    fetchConfig: async (): Promise<JobPlanConfig | null> => {
      const { row } = await fetchConfigRow(client)
      if (!row) return null
      return {
        profile_vision_model_id: row.profile_vision_model_id,
        profile_vision_model_effort: row.profile_vision_model_effort,
        profile_vision_samples: row.profile_vision_samples,
      }
    },

    fetchBundleById: async (id) => {
      const { data, error } = await client.from('raw_bundles').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data ? (data as BundleRow) : null
    },

    fetchLatestBundle: async () => {
      const { data, error } = await client
        .from('raw_bundles')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data ? (data as BundleRow) : null
    },

    downloadObject: async (bucket, path) => {
      const { data, error } = await client.storage.from(bucket).download(path)
      if (error) throw error
      return new Uint8Array(await data.arrayBuffer())
    },

    uploadImage: async (path, png) => {
      // Keyed by content hash: a re-upload of the same tile is a no-op, never a conflict.
      const { error } = await client.storage
        .from(JOB_PLAN_IMAGES_BUCKET)
        .upload(path, png, { contentType: 'image/png', upsert: true })
      if (error) throw error
    },

    fetchJobPlanByRunId: async (runId) => {
      const { data, error } = await client.from('job_plans').select('id, status').eq('run_id', runId).maybeSingle()
      if (error) throw error
      return data ? { id: data.id as string, status: data.status } : null
    },

    insertJobPlan: async (row) => {
      // RETURNING reflects the row after the keep-ready trigger, not the values sent.
      const { data, error } = await client
        .from('job_plans')
        .upsert(row, { onConflict: 'run_id' })
        .select('id, status')
        .single()
      if (error) throw error
      return { id: data.id as string, status: data.status }
    },

    generate: async (params) => {
      const result = await generateStructured({
        model: params.model,
        effort: params.effort,
        schema: params.schema,
        prompt: params.prompt,
        images: params.images,
        abortSignal: params.abortSignal,
        // The profile read is structured-output-only: an endpoint that ignores
        // the schema returns prose the caller cannot use. Restrict routing to
        // endpoints supporting every parameter we send, so a mis-route surfaces
        // as a routing error instead of a confusing parse failure (feat-131).
        requireParameters: true,
        ...(params.telemetry ? { telemetry: params.telemetry } : {}),
      })
      return {
        object: result.object,
        cost: result.cost,
        latencyMs: result.latencyMs,
        usage: {
          inputTokens: result.usage.inputTokens ?? null,
          outputTokens: result.usage.outputTokens ?? null,
          totalTokens: result.usage.totalTokens ?? null,
        },
      }
    },
  }
}
