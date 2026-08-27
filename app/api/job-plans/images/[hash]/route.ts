import { realProfileImageDeps } from '@/lib/job-plan/dashboard/deps'
import { profileImageResponse } from '@/lib/job-plan/dashboard/profileImage'

/**
 * GET /api/job-plans/images/[hash] — a rendered profile PNG from the PRIVATE
 * `job-plan-images` bucket (feat-129). Content-addressed: `hash` is the
 * sha256 the vision read stamped in `job_plans.profile_nodes…imageHashes`,
 * validated before storage is touched (lib/job-plan/dashboard/profileImage.ts).
 *
 * Auth decision: unauthenticated, read-only, the same local-only posture as
 * the dashboard page that embeds it (the app runs on the operator's trading
 * machine; the images are profile renders with no secrets). The bucket
 * itself stays private — nothing outside this process can list or fetch it.
 */

// Node runtime: the service-role Supabase client runs server-side only.
export const runtime = 'nodejs'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ hash: string }> },
): Promise<Response> {
  const { hash } = await params
  return profileImageResponse(realProfileImageDeps(), hash)
}
