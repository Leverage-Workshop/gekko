import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/supabase/server'
import {
  createBundleRequest,
  waitForBundleRequest,
  type BundleRequestDeps,
  type BundleRequestStatus,
  type BundleWaitResult,
} from './bundleRequests'

/**
 * Real side effects for lib/bundleRequests, wired to the service-role
 * Supabase client (mirrors realAnalyzeDeps / realDeps in the ingest route).
 */
export function realBundleRequestDeps(
  client: SupabaseClient = getServiceClient(),
): BundleRequestDeps {
  return {
    insertRequest: async (reason) => {
      const { data, error } = await client
        .from('bundle_requests')
        .insert({ reason })
        .select('id')
        .single()
      if (error) {
        throw error
      }
      return { id: data.id as string }
    },

    countPendingSince: async (cutoffIso) => {
      const { count, error } = await client
        .from('bundle_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('requested_at', cutoffIso)
      if (error) {
        throw error
      }
      return count ?? 0
    },

    fulfillPending: async (bundleId) => {
      const { error } = await client
        .from('bundle_requests')
        .update({
          status: 'fulfilled',
          fulfilled_at: new Date().toISOString(),
          bundle_id: bundleId,
        })
        .eq('status', 'pending')
      if (error) {
        throw error
      }
    },

    fetchRequestStatus: async (id) => {
      const { data, error } = await client
        .from('bundle_requests')
        .select('status, bundle_id')
        .eq('id', id)
        .maybeSingle()
      if (error) {
        throw error
      }
      return data
        ? {
            status: data.status as BundleRequestStatus,
            bundle_id: (data.bundle_id as string | null) ?? null,
          }
        : null
    },
  }
}

/**
 * Route-facing convenience: record that a fresh bundle is required and return
 * the request id for the task payload. Kept as a named module export so route
 * tests can fake the whole module instead of the Supabase client.
 */
export async function requestFreshBundle(reason: string): Promise<string> {
  return createBundleRequest(realBundleRequestDeps(), reason)
}

/**
 * Task-facing convenience: block until the request is fulfilled (or the wait
 * times out / the row is missing) using real timers.
 */
export async function waitForFreshBundle(
  requestId: string,
): Promise<BundleWaitResult> {
  return waitForBundleRequest(realBundleRequestDeps(), requestId, {
    sleep: (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  })
}
