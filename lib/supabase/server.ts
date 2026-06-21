import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase client using the service-role key.
 *
 * All Gekko writes happen server-side (API routes + trigger.dev tasks); the
 * service role bypasses RLS, which is enabled-with-no-policies on every table.
 * Never import this from client components — the service-role key must stay on
 * the server.
 *
 * @throws if the URL or service-role key is not configured — we fail loud
 *   rather than build an unauthenticated client that errors deep in a request.
 */
export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL not configured')
  }
  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
