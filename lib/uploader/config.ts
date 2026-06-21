import { z } from 'zod'

/**
 * Validated configuration for the local uploader, sourced from environment
 * variables. `INGEST_BEARER_TOKEN` is shared with the server (see .env.example);
 * the rest are uploader-local with sane defaults.
 */

const intFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v == null || v === '' ? fallback : Number(v)))
    .pipe(z.number().int().positive())

const schema = z.object({
  INGEST_URL: z.string().url(),
  INGEST_BEARER_TOKEN: z.string().min(1),
  GEKKO_EXPORT_DIR: z.string().min(1),
  UPLOADER_DEBOUNCE_MS: intFromEnv(2000),
  UPLOADER_MAX_ATTEMPTS: intFromEnv(5),
  UPLOADER_BASE_DELAY_MS: intFromEnv(500),
  UPLOADER_MAX_DELAY_MS: intFromEnv(30000),
})

export type UploaderConfig = {
  readonly ingestUrl: string
  readonly bearerToken: string
  readonly exportDir: string
  readonly debounceMs: number
  readonly retry: {
    readonly maxAttempts: number
    readonly baseDelayMs: number
    readonly maxDelayMs: number
  }
}

/**
 * Parses and validates uploader config from `env`, throwing a readable error
 * (listing the offending variables) when anything is missing or malformed.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): UploaderConfig {
  const result = schema.safeParse(env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid uploader configuration:\n${issues}`)
  }

  const cfg = result.data
  return {
    ingestUrl: cfg.INGEST_URL,
    bearerToken: cfg.INGEST_BEARER_TOKEN,
    exportDir: cfg.GEKKO_EXPORT_DIR,
    debounceMs: cfg.UPLOADER_DEBOUNCE_MS,
    retry: {
      maxAttempts: cfg.UPLOADER_MAX_ATTEMPTS,
      baseDelayMs: cfg.UPLOADER_BASE_DELAY_MS,
      maxDelayMs: cfg.UPLOADER_MAX_DELAY_MS,
    },
  }
}
