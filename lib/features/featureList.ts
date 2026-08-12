import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

/**
 * Reader for the harness's own `feature_list.json` — the work-breakdown file
 * CLAUDE.md treats as the source of truth for feature state. The dashboard's
 * Features tab renders it as a sortable/filterable table, so this module owns
 * parsing and the shape that crosses to the client.
 *
 * Deliberately permissive about `status`: the file is hand-edited by whoever
 * runs a session, and a status the UI has never seen ("blocked", "in-progress")
 * must render as a row rather than blank the whole tab. Unknown extra keys
 * (e.g. feat-005's `live`) are ignored, not rejected.
 *
 * `evidence` is not carried at all (operator call): nothing renders it, and it
 * is half the file's ~274 KB, so leaving it out halves what the server streams
 * to the client component.
 */

const FeatureRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  dependencies: z.array(z.string()).default([]),
  status: z.string().min(1),
})

const FeatureListSchema = z.object({
  features: z.array(FeatureRecordSchema),
})

/** One table row — the fields the Features tab renders in the grid or dialog. */
export type FeatureRow = {
  id: string
  name: string
  status: string
  dependencies: string[]
  description: string
}

/** Default location: the harness file at the repo root. */
export function featureListPath(): string {
  return path.join(process.cwd(), 'feature_list.json')
}

/**
 * Read and parse `feature_list.json`. Throws a message naming the file — the
 * page catches it and renders the failure in place of the table, since a
 * missing or malformed harness file is worth seeing, not swallowing.
 */
export async function loadFeatureList(filePath = featureListPath()): Promise<FeatureRow[]> {
  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not read ${filePath}: ${detail}`)
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`${filePath} is not valid JSON: ${detail}`)
  }

  const parsed = FeatureListSchema.safeParse(json)
  if (!parsed.success) {
    throw new Error(`${filePath} does not match the feature-list schema: ${parsed.error.message}`)
  }

  return parsed.data.features.map((feature) => ({
    id: feature.id,
    name: feature.name,
    status: feature.status,
    dependencies: feature.dependencies,
    description: feature.description,
  }))
}
