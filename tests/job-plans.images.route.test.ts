import { describe, expect, it, vi } from 'vitest'
import {
  PROFILE_IMAGE_HASH,
  profileImageResponse,
  type ProfileImageDeps,
} from '@/lib/job-plan/dashboard/profileImage'

/**
 * GET /api/job-plans/images/[hash] — the local proxy that serves a rendered
 * profile PNG out of the PRIVATE `job-plan-images` bucket (feat-129). The
 * bucket stays private; the route is content-addressed (a sha256 hex, nothing
 * else reaches storage) and read-only.
 */

const HASH = 'a'.repeat(64)
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

const depsFor = (png: Uint8Array | null): ProfileImageDeps & { calls: string[] } => {
  const calls: string[] = []
  return {
    calls,
    downloadProfileImage: async (hash) => {
      calls.push(hash)
      return png
    },
  }
}

describe('profileImageResponse', () => {
  it('serves the PNG with an immutable private cache header (content-addressed)', async () => {
    const deps = depsFor(PNG)
    const res = await profileImageResponse(deps, HASH)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toMatch(/private/)
    expect(res.headers.get('cache-control')).toMatch(/immutable/)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG)
    expect(deps.calls).toEqual([HASH])
  })

  it('rejects anything but a sha256 hex before touching storage', async () => {
    const deps = depsFor(PNG)
    for (const bad of ['../../etc/passwd', 'A'.repeat(64), 'abc', `${HASH}.png`, '']) {
      const res = await profileImageResponse(deps, bad)
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ success: false })
    }
    expect(deps.calls).toEqual([])
    expect(PROFILE_IMAGE_HASH.test(HASH)).toBe(true)
  })

  it('404s when the object is not in the bucket', async () => {
    const res = await profileImageResponse(depsFor(null), HASH)
    expect(res.status).toBe(404)
  })

  it('500s cleanly on a storage failure', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const deps: ProfileImageDeps = {
      downloadProfileImage: async () => {
        throw new Error('storage down')
      },
    }
    const res = await profileImageResponse(deps, HASH)
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ success: false, error: 'storage down' })
    consoleError.mockRestore()
  })
})

describe('GET /api/job-plans/images/[hash] (route wiring)', () => {
  it('validates the segment and delegates to the deps', async () => {
    vi.doMock('@/lib/job-plan/dashboard/deps', () => ({
      realProfileImageDeps: () => depsFor(PNG),
    }))
    const { GET } = await import('@/app/api/job-plans/images/[hash]/route')
    const ok = await GET(new Request(`http://localhost/api/job-plans/images/${HASH}`), {
      params: Promise.resolve({ hash: HASH }),
    })
    expect(ok.status).toBe(200)
    const bad = await GET(new Request('http://localhost/api/job-plans/images/x'), {
      params: Promise.resolve({ hash: 'x' }),
    })
    expect(bad.status).toBe(400)
    vi.doUnmock('@/lib/job-plan/dashboard/deps')
  })
})
