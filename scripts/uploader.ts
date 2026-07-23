/**
 * Local uploader entrypoint (feat-009, reworked to on-demand polling).
 *
 * No more continuous uploads: instead of shipping a bundle on every ~15s
 * Sierra Chart rewrite, the uploader polls GET /api/ingest every `pollMs`
 * (default 7s) asking whether a fresh bundle is REQUIRED — i.e. a dashboard
 * run button was pressed and a pending `bundle_requests` row exists. Only
 * then does it bundle the export folder and POST it (bearer auth +
 * retry/backoff); ingest marks the request fulfilled, which releases the
 * waiting task. A settle check (skip while any export file changed within
 * `debounceMs`) avoids reading a half-written Sierra export — the flag stays
 * pending, so the next poll simply retries.
 *
 * This file is the only place that touches fragile local concerns (the
 * filesystem, the wall clock, the network loop); all bundling/posting/
 * pending-check logic lives in `@/lib/uploader` and is unit-tested.
 *
 * Run with: `npm run uploader`. Config comes from the environment; `.env.local`
 * and `.env` in the working directory are loaded below via Node's built-in
 * `process.loadEnvFile` (requires Node >= 20.12) — tsx does NOT auto-load them.
 */
import { existsSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import {
  BUNDLE_FILENAMES,
  checkPendingRequest,
  isEmptyBundle,
  loadConfig,
  postBundle,
  readBundle,
  toFormData,
  type FileReader,
} from '@/lib/uploader'

// `loadEnvFile` never overrides vars that are already set, so precedence is:
// real environment > .env.local > .env (load .env.local first).
for (const envFile of ['.env.local', '.env']) {
  const envPath = join(process.cwd(), envFile)
  if (existsSync(envPath)) {
    process.loadEnvFile(envPath)
  }
}

const config = loadConfig()
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const readExportFile: FileReader = async (filename) => {
  try {
    return new Uint8Array(await readFile(join(config.exportDir, filename)))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

/**
 * True when no export file was modified within the settle window — Sierra
 * rewrites the whole folder in a burst, and uploading mid-burst would ship a
 * torn bundle. Missing files don't count; readBundle handles absence.
 */
async function exportFolderSettled(): Promise<boolean> {
  const cutoff = Date.now() - config.debounceMs
  for (const filename of BUNDLE_FILENAMES) {
    try {
      const { mtimeMs } = await stat(join(config.exportDir, filename))
      if (mtimeMs > cutoff) {
        return false
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }
  return true
}

async function uploadBundle(): Promise<void> {
  const bundle = await readBundle(readExportFile)
  if (isEmptyBundle(bundle)) {
    console.warn('[uploader] export folder produced an empty bundle — skipping')
    return
  }

  // One id per bundle, minted before the retry loop: every retry inside
  // postBundle reuses it, so a retried POST can't create a duplicate server-side.
  const result = await postBundle(
    config.ingestUrl,
    config.bearerToken,
    toFormData(bundle, crypto.randomUUID()),
    config.retry,
    { fetch, sleep },
  )

  if (result.ok) {
    console.log(`[uploader] ingested bundle ${result.bundleId ?? '(unknown id)'} (attempt ${result.attempts})`)
  } else {
    console.error(
      `[uploader] ingest failed after ${result.attempts} attempt(s): ${result.error}`,
    )
  }
}

/** One poll tick: check the flag, and upload only when a bundle is required. */
async function pollOnce(): Promise<void> {
  const check = await checkPendingRequest(config.ingestUrl, config.bearerToken, { fetch })
  if (!check.ok) {
    console.error(`[uploader] pending check failed: ${check.error}`)
    return
  }
  if (!check.pending) {
    return
  }

  if (!(await exportFolderSettled())) {
    console.log('[uploader] bundle requested but export folder is mid-write — retrying next poll')
    return
  }

  console.log('[uploader] fresh bundle requested — uploading')
  await uploadBundle()
}

async function main(): Promise<never> {
  console.log(
    `[uploader] polling ${config.ingestUrl} every ${config.pollMs}ms for bundle requests (export dir ${config.exportDir}, settle ${config.debounceMs}ms)`,
  )
  for (;;) {
    try {
      await pollOnce()
    } catch (error) {
      console.error('[uploader] unexpected error:', error)
    }
    await sleep(config.pollMs)
  }
}

void main()
