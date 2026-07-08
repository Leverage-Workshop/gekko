/**
 * Local uploader entrypoint (feat-009).
 *
 * Watches the Sierra Chart export folder, debounces the burst of writes Sierra
 * emits each ~30s cycle, bundles the present files, and POSTs them to
 * /api/ingest with bearer auth and retry/backoff. This file is the only place
 * that touches fragile local concerns (filesystem, chokidar, the network); all
 * bundling/posting/scheduling logic lives in `@/lib/uploader` and is unit-tested.
 *
 * Run with: `npm run uploader`. Config comes from the environment; `.env.local`
 * and `.env` in the working directory are loaded below via Node's built-in
 * `process.loadEnvFile` (requires Node >= 20.12) — tsx does NOT auto-load them.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import chokidar from 'chokidar'
import {
  BUNDLE_FILENAMES,
  createScheduler,
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

const scheduler = createScheduler({
  debounceMs: config.debounceMs,
  run: uploadBundle,
  onError: (error) => console.error('[uploader] unexpected error:', error),
})

const watchPaths = BUNDLE_FILENAMES.map((filename) => join(config.exportDir, filename))

chokidar
  .watch(watchPaths, { ignoreInitial: false })
  .on('add', scheduler.trigger)
  .on('change', scheduler.trigger)
  .on('error', (error) => console.error('[uploader] watch error:', error))

console.log(
  `[uploader] watching ${config.exportDir} (debounce ${config.debounceMs}ms) → POST ${config.ingestUrl}`,
)
