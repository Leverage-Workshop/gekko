/**
 * The uploader's poll: ask GET /api/ingest whether a fresh bundle has been
 * requested (a dashboard run button was pressed). Failures never throw — the
 * poll loop logs and tries again next interval, so a flaky network or a
 * sleeping app server can't kill the uploader process.
 */

export type PendingCheckDeps = {
  readonly fetch: typeof fetch
}

export type PendingCheckResult =
  | { readonly ok: true; readonly pending: boolean }
  | { readonly ok: false; readonly error: string }

export async function checkPendingRequest(
  url: string,
  token: string,
  deps: PendingCheckDeps,
): Promise<PendingCheckResult> {
  try {
    const res = await deps.fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      return { ok: false, error: `pending check responded ${res.status}` }
    }
    const body = (await res.json()) as { data?: { pending?: unknown } } | null
    const pending = body?.data?.pending
    if (typeof pending !== 'boolean') {
      return { ok: false, error: 'pending check returned a malformed body' }
    }
    return { ok: true, pending }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
