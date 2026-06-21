/**
 * Posts a bundle to /api/ingest with bearer auth and exponential backoff.
 *
 * Transient failures (network errors, 5xx, 408, 429) are retried; other 4xx
 * responses are treated as permanent (a malformed/unauthorized bundle won't fix
 * itself on retry) and returned immediately. All I/O is injected so the retry
 * logic is unit-testable without a real server or wall-clock waits.
 */

export type RetryConfig = {
  readonly maxAttempts: number
  readonly baseDelayMs: number
  readonly maxDelayMs: number
}

export type PostDeps = {
  readonly fetch: typeof fetch
  readonly sleep: (ms: number) => Promise<void>
}

export type PostResult =
  | { readonly ok: true; readonly bundleId: string | null; readonly attempts: number }
  | { readonly ok: false; readonly error: string; readonly status?: number; readonly attempts: number }

/** Exponential backoff (attempt is 1-based), capped at `maxDelayMs`. */
export function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429
}

async function readBundleId(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { data?: { bundleId?: unknown } }
    const id = body?.data?.bundleId
    return typeof id === 'string' ? id : null
  } catch {
    return null
  }
}

export async function postBundle(
  url: string,
  token: string,
  form: FormData,
  retry: RetryConfig,
  deps: PostDeps,
): Promise<PostResult> {
  let lastError = 'no attempts made'
  let lastStatus: number | undefined

  for (let attempt = 1; attempt <= retry.maxAttempts; attempt++) {
    try {
      // Do NOT set Content-Type: fetch derives the multipart boundary from `form`.
      const res = await deps.fetch(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: form,
      })

      if (res.ok) {
        return { ok: true, bundleId: await readBundleId(res), attempts: attempt }
      }

      lastStatus = res.status
      lastError = `ingest responded ${res.status}`
      if (!isRetryableStatus(res.status)) {
        return { ok: false, error: lastError, status: res.status, attempts: attempt }
      }
    } catch (error) {
      lastStatus = undefined
      lastError = error instanceof Error ? error.message : String(error)
    }

    if (attempt < retry.maxAttempts) {
      await deps.sleep(backoffDelay(attempt, retry.baseDelayMs, retry.maxDelayMs))
    }
  }

  return { ok: false, error: lastError, status: lastStatus, attempts: retry.maxAttempts }
}
