import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Guard the /knowledge layout (feat-022, restructured 2026-07-22). The doctrine
// prose is the cached per-task prompt prefix (lib/analyze/doctrine.ts); these
// offline checks assert the layout exists, that *computable* doctrine stays out
// of prose (it is owned by the engine), and that the model-facing files stay
// model-facing — no repo paths, no changelog refs, no maintainer commentary.
// The maintainer half lives in docs/engine-ownership.md.
// (Deep constants<->engine sync is the dedicated feat-032 drift guard.)

const ROOT = join(__dirname, '..')
const KNOWLEDGE = join(ROOT, 'knowledge')

const KNOWLEDGE_FILES = [
  'system/persona.md',
  'system/constraints.md',
  'system/output-briefing.md',
  'system/output-objective.md',
  'system/output-update.md',
  'system/output-eval.md',
  'doctrine/patterns.md',
  'doctrine/chart-reading.md',
  'doctrine/glossary.md',
  'schema/briefing.schema.ts',
]

const MODEL_FACING_PROSE = KNOWLEDGE_FILES.filter((rel) => rel.endsWith('.md'))

const read = (rel: string) => readFileSync(join(KNOWLEDGE, rel), 'utf8')

describe('knowledge restructure', () => {
  it.each(KNOWLEDGE_FILES)('has a non-empty %s', (rel) => {
    const path = join(KNOWLEDGE, rel)
    expect(existsSync(path), `${rel} should exist`).toBe(true)
    expect(read(rel).trim().length, `${rel} should be non-empty`).toBeGreaterThan(0)
  })

  it('has retired the combined output-schema.md', () => {
    expect(existsSync(join(KNOWLEDGE, 'system/output-schema.md'))).toBe(false)
  })

  // Computable doctrine removed from prose: the R/R ratio is owned by
  // riskReward.ts, so the literal ratio must not be restated in the doctrine.
  it.each(['doctrine/patterns.md', 'doctrine/chart-reading.md'])(
    'does not restate the computed R/R ratio in %s',
    (rel) => {
      expect(read(rel)).not.toMatch(/3:1/)
    },
  )

  // The model cannot read the repository: file paths, code identifiers and
  // feature-log references in the prompt are maintainer commentary that
  // belongs in docs/engine-ownership.md, not in the cached prefix.
  it.each(MODEL_FACING_PROSE)('%s contains no repo paths or changelog refs', (rel) => {
    const prose = read(rel)
    expect(prose, `${rel} references a TypeScript module`).not.toMatch(/\.tsx?\b/)
    expect(prose, `${rel} references a repo directory`).not.toMatch(
      /\b(?:lib|docs|tests|app|knowledge)\//,
    )
    expect(prose, `${rel} references a markdown file path`).not.toMatch(
      /\b(?:system|doctrine|schema)\/[\w-]+\.md\b/,
    )
    expect(prose, `${rel} carries a feature-log reference`).not.toMatch(/\bfeat-\d/)
  })

  // Engine deferral: the maintainer ownership map must point every computable
  // guardrail at its authoritative engine module.
  it.each(['riskReward.ts', 'ripStatus.ts', 'mgiPriority.ts'])(
    'docs/engine-ownership.md defers to the %s engine module',
    (mod) => {
      expect(readFileSync(join(ROOT, 'docs/engine-ownership.md'), 'utf8')).toContain(mod)
    },
  )
})
