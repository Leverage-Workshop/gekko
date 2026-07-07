import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Static doctrine assembled into the model's system prompt. This prefix is
 * identical on every run so it is prompt-cached (see generateStructured's
 * `cacheSystem`); volatile per-run data (MGI JSON, engine facts, screenshots)
 * must go in the user message, never here.
 *
 * The files ship with the trigger.dev deploy via the `additionalFiles`
 * build extension in trigger.config.ts.
 */
const DOCTRINE_FILES = [
  'knowledge/system/persona.md',
  'knowledge/system/constraints.md',
  'knowledge/system/output-schema.md',
  'knowledge/doctrine/chart-reading.md',
  'knowledge/doctrine/glossary.md',
  'knowledge/doctrine/patterns.md',
] as const

/**
 * Concatenate the doctrine files into the system-prompt prefix.
 *
 * @throws when a doctrine file is missing — a deploy packaging error that must
 *   fail loudly rather than brief without guardrails.
 */
export function loadDoctrine(baseDir: string = process.cwd()): string {
  return DOCTRINE_FILES.map((file) =>
    readFileSync(join(baseDir, file), 'utf-8').trim(),
  ).join('\n\n---\n\n')
}
