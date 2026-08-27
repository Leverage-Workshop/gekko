import { json } from '@/lib/api/respond'

/**
 * Serving a rendered profile PNG out of the PRIVATE `job-plan-images` bucket
 * (feat-129). The bucket never becomes public: the page embeds
 * `/api/job-plans/images/<sha256>`, and this local, read-only proxy downloads
 * the object with the service-role client. Objects are content-addressed
 * (`<sha256>.png`), so the hash is validated before anything reaches storage
 * and the response is cacheable forever.
 */

export const PROFILE_IMAGE_HASH = /^[0-9a-f]{64}$/

/** A year, private (the operator's browser), immutable (content-addressed). */
const CACHE_CONTROL = 'private, max-age=31536000, immutable'

export interface ProfileImageDeps {
  /** The PNG bytes for `<hash>.png`, or null when the object is not in the bucket. */
  downloadProfileImage(hash: string): Promise<Uint8Array | null>
}

/** A standalone ArrayBuffer for the Response body (the view may sit inside a larger buffer). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

export async function profileImageResponse(
  deps: ProfileImageDeps,
  hash: string
): Promise<Response> {
  if (!PROFILE_IMAGE_HASH.test(hash)) {
    return json({ success: false, error: 'image id must be a sha256 hex' }, 400)
  }
  try {
    const png = await deps.downloadProfileImage(hash)
    if (png === null) {
      return json({ success: false, error: `no profile image ${hash}` }, 404)
    }
    return new Response(toArrayBuffer(png), {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': CACHE_CONTROL },
    })
  } catch (error) {
    console.error('Failed to serve job-plan profile image:', error)
    const message = error instanceof Error ? error.message : 'Failed to load profile image'
    return json({ success: false, error: message }, 500)
  }
}
