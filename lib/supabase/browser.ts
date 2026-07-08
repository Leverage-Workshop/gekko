import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Browser-side Supabase client using the PUBLIC anon key (feat-026 — the
 * first and only client-side Supabase usage in Gekko).
 *
 * RLS is enabled with no table policies, so this client can read/write
 * NOTHING through the Data API. Its single capability is receiving private
 * Realtime broadcasts on the gekko:alerts topic, granted by the
 * realtime.messages SELECT policy in
 * supabase/migrations/20260708120000_realtime_notifications.sql.
 *
 * Never import this from server code — server code uses the service-role
 * client in lib/supabase/server.ts. Degrades gracefully: returns null when
 * the NEXT_PUBLIC_* env vars are absent (e.g. a build machine), so callers
 * show a "not configured" status instead of crashing.
 */

let cached: SupabaseClient | null | undefined

export function getBrowserClient(): SupabaseClient | null {
  if (cached !== undefined) return cached
  // NEXT_PUBLIC_* values are inlined at build time by Next.js.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  cached =
    url && key
      ? createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null
  return cached
}
