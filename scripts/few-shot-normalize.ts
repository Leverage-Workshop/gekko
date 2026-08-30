/**
 * Derive the AXIS-FREE few-shot expectations from the price ones (feat-135).
 *
 *   npx tsx scripts/few-shot-normalize.ts [--check]
 *
 * Each example in knowledge/job-plan/few-shot/manifest.json has an `expected`
 * read in PRICES and an `expectedNormalized` read in fractions. The fractions
 * are never hand-written: they are this script's mechanical conversion of the
 * price file against the span the renderer gives that profile
 * (`meta.priceLow`..`meta.priceHigh`, i.e. the lowest bin's low to the highest
 * bin's high — independent of theme, size and row budget, so the fractions
 * survive a render change).
 *
 * `--check` writes nothing and exits non-zero if a file on disk differs from
 * what the conversion produces. prompt.test.ts asserts the same property, so
 * this script is a convenience for regenerating, not the guard.
 *
 * Makes no LLM calls and touches no network.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { parseVbpProfile } from '../lib/engine/parseProfile'
import { toNormalizedRead } from '../lib/job-plan/profile-vision/normalized'
import { FEW_SHOT_DIR } from '../lib/job-plan/profile-vision/prompt'
import { renderProfile } from '../lib/job-plan/profile-vision/renderProfile'
import { profileNodesReadSchema } from '../lib/job-plan/profile-vision/schema'

const manifestSchema = z.object({
  examples: z.array(
    z.object({
      id: z.string().min(1),
      instrument: z.enum(['NQ', 'ES']),
      profile: z.string().min(1),
      expected: z.string().min(1),
      expectedNormalized: z.string().min(1),
    })
  ),
})

function main(): void {
  const check = process.argv.includes('--check')
  const dir = join(process.cwd(), FEW_SHOT_DIR)
  const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
  )
  let failures = 0
  for (const ex of manifest.examples) {
    const profile = parseVbpProfile(readFileSync(join(dir, ex.profile), 'utf8'), {
      fillMissingRows: true,
    })
    // The few-shot images are always rendered as one tile, so the tile span is
    // the profile span.
    const { meta } = renderProfile(profile, { instrument: ex.instrument, tiles: 1 })
    const expected = profileNodesReadSchema.parse(
      JSON.parse(readFileSync(join(dir, ex.expected), 'utf8'))
    )
    const normalized = toNormalizedRead(expected, meta)
    const text = `${JSON.stringify(normalized, null, 2)}\n`
    const path = join(dir, ex.expectedNormalized)
    if (check) {
      const onDisk = readFileSync(path, 'utf8')
      if (onDisk !== text) {
        failures += 1
        console.error(`STALE ${ex.expectedNormalized} — re-run without --check`)
      } else {
        console.log(`ok    ${ex.expectedNormalized}`)
      }
      continue
    }
    writeFileSync(path, text)
    console.log(
      `wrote ${ex.expectedNormalized} (${ex.instrument} span ${meta.priceLow}..${meta.priceHigh})`
    )
  }
  if (failures > 0) process.exit(1)
}

main()
