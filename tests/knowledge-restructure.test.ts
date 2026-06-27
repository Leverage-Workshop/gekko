import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Guard the /knowledge restructure (feat-022). The doctrine prose is the cached
// prompt prefix for analyze-task/eval-task; these offline checks assert the
// deduped layout exists and that *computable* doctrine stays out of prose (it is
// owned by the engine), so a stray edit fails CI rather than drifting silently.
// (Deep constraints<->engine sync is the dedicated feat-032 drift guard.)

const ROOT = join(__dirname, '..')
const KNOWLEDGE = join(ROOT, 'knowledge')

const KNOWLEDGE_FILES = [
  'system/persona.md',
  'system/constraints.md',
  'system/output-schema.md',
  'doctrine/patterns.md',
  'doctrine/chart-reading.md',
  'doctrine/glossary.md',
  'schema/briefing.schema.ts',
]

const read = (rel: string) => readFileSync(join(KNOWLEDGE, rel), 'utf8')

describe('knowledge restructure (feat-022)', () => {
  it.each(KNOWLEDGE_FILES)('has a non-empty %s', (rel) => {
    const path = join(KNOWLEDGE, rel)
    expect(existsSync(path), `${rel} should exist`).toBe(true)
    expect(read(rel).trim().length, `${rel} should be non-empty`).toBeGreaterThan(0)
  })

  // Computable doctrine removed from prose: the 3:1 R/R ratio is owned by
  // riskReward.ts, so the literal ratio must not be restated in the doctrine.
  it.each(['doctrine/patterns.md', 'doctrine/chart-reading.md'])(
    'does not restate the computed R/R ratio in %s',
    (rel) => {
      expect(read(rel)).not.toMatch(/3:1/)
    },
  )

  // Engine deferral: constraints.md must point computable guardrails at the
  // authoritative engine modules rather than hardcoding their thresholds.
  it.each(['riskReward.ts', 'ripStatus.ts', 'mgiPriority.ts'])(
    'constraints.md defers to the %s engine module',
    (mod) => {
      expect(read('system/constraints.md')).toContain(mod)
    },
  )
})
