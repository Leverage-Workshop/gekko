import { describe, expect, it } from 'vitest'
import { parseVbpProfile } from '@/lib/engine/parseProfile'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildVisionPrompt,
  CRITERIA,
  CRITERIA_CANARIES,
  FEW_SHOT_SOURCE,
  loadFewShot,
  MECHANISM,
  VISION_PROMPT_REVISION,
} from './prompt'
import { renderProfile } from './renderProfile'
import { profileNodesReadSchema } from './schema'

const FIXTURE = join(process.cwd(), 'chart-data/four-hundred-rotation.vbp.md')

function target() {
  const profile = parseVbpProfile(readFileSync(FIXTURE, 'utf8'))
  const { meta, tiles } = renderProfile(profile, { instrument: 'NQ', currentPrice: 29945.75 })
  return { meta, tile: tiles[0].tile }
}

function fewShotRendered() {
  return loadFewShot().map((example) => {
    const { meta, tiles } = renderProfile(example.profile, { instrument: example.instrument })
    return { example, meta, tile: tiles[0].tile }
  })
}

describe('few-shot set', () => {
  it('loads 2-3 examples whose expected reads pass the schema, and names its source', () => {
    const set = loadFewShot()
    expect(set.length).toBeGreaterThanOrEqual(2)
    expect(set.length).toBeLessThanOrEqual(3)
    for (const ex of set) {
      expect(profileNodesReadSchema.safeParse(ex.expected).success).toBe(true)
      expect(ex.profile.rows.length).toBeGreaterThan(100)
      // every expected band sits inside its profile's span
      const lo = Math.min(...ex.profile.rows.map((r) => r.price))
      const hi = Math.max(...ex.profile.rows.map((r) => r.price)) + ex.profile.meta.step
      for (const node of ex.expected.nodes) {
        expect(node.priceLow).toBeGreaterThanOrEqual(lo)
        expect(node.priceHigh).toBeLessThanOrEqual(hi)
      }
    }
    // feat-131: the fixture stand-ins are replaced by feat-119 golden replay exports.
    expect(set.map((s) => s.id)).toEqual(['nq-double-distribution', 'es-shelf-edge-exhaustion'])
    expect(set.map((s) => s.instrument)).toEqual(['NQ', 'ES'])
    expect(FEW_SHOT_SOURCE).toMatch(/2026-02-13/)
    expect(FEW_SHOT_SOURCE).toMatch(/2026-06-02/)
    // every example's primary LVN is a price the corpus actually names for that date
    const primaries = set.map((s) => s.expected.nodes.find((n) => n.primary))
    expect(primaries.every((n) => n !== undefined)).toBe(true)
  })

  it('throws on a missing directory (a packaging error must fail loudly)', () => {
    expect(() => loadFewShot('/nonexistent')).toThrow()
  })
})

describe('vision prompt', () => {
  const { meta, tile } = target()
  const prompt = buildVisionPrompt(
    {
      instrument: 'NQ',
      profileName: '5-day rolling volume profile',
      lookback: 'the last five trading sessions',
      meta,
      tile,
    },
    fewShotRendered()
  )

  it('matches the snapshot (bump VISION_PROMPT_REVISION when this changes)', () => {
    expect(prompt).toMatchSnapshot()
    expect(VISION_PROMPT_REVISION).toMatch(/^vision-\d{4}-\d{2}-\d{2}\.\d+$/)
  })

  /**
   * feat-137: the corpus-sourcing tests are retired. The rules are now the
   * OPERATOR's own statement of what he wants identified, not quotes mined from
   * docs/jba-research/lvn-corpus.md, so "every criterion quotes corpus section
   * A" no longer describes the contract. The corpus is still the evidence base
   * for the golden labels and the explainer — it is just not the prompt's
   * source any more. What IS worth pinning is that the set stays small: the
   * whole point of the rewrite was that 18 criteria buried the five that
   * mattered.
   */
  it('keeps the rule set small and every rule substantive', () => {
    expect(CRITERIA.length).toBeGreaterThanOrEqual(3)
    expect(CRITERIA.length).toBeLessThanOrEqual(6)
    for (const c of CRITERIA) {
      expect(c.title).toMatch(/^[A-Z][A-Z ,-]+$/)
      // rule 4 is deliberately terse — the operator's point was that HVNs are
      // self-explanatory and do not need re-teaching
      expect(c.text.split(/\s+/).length).toBeGreaterThan(10)
    }
  })

  it('leads with the mechanism, not a checklist', () => {
    expect(prompt).toContain(MECHANISM)
    expect(prompt.indexOf(MECHANISM)).toBeLessThan(prompt.indexOf(CRITERIA[0].title))
    expect(MECHANISM).toMatch(/participation dried up/)
    expect(MECHANISM).toMatch(/travel a long way/)
  })

  it('carries every rule title, one per rule', () => {
    expect(CRITERIA_CANARIES).toHaveLength(CRITERIA.length)
    for (const canary of CRITERIA_CANARIES) expect(prompt).toContain(canary)
    // the corpus rules the criteria distil (B1, B3, B4, B6, B11, B7, B13-16, D)
    // the substance of each rule, not corpus quotes (feat-137)
    for (const phrase of [
      'how large a change in volume it represents',
      'most prominent distributions',
      'drops off very quickly',
      'thinning gradually',
      'DOES NOT RANK IT',
      'peak of each significant distribution',
      'Three to five nodes is normal',
      'never a target',
    ]) {
      expect(prompt).toContain(phrase)
    }
  })

  it('states the per-call facts and NO structure', () => {
    expect(prompt).toContain('NQ, row step 2 pts, image spans 28910.00–30073.00')
    expect(prompt).toContain('POC 29900.00')
    expect(prompt).toContain('VAH 29995.00 / VAL 29361.00')
    expect(prompt).toContain('current price 29945.75')
    expect(prompt).toContain('5-day rolling volume profile over the last five trading sessions')
    for (const forbidden of ['JBA', 'MGI', 'pivot', 'Pivot', 'ONH', 'PDH', 'box', 'Autoplot']) {
      expect(prompt).not.toContain(forbidden)
    }
  })

  it('orders the images: few-shot first with their JSON, the target last', () => {
    expect(prompt.indexOf('Example 1 (image 1)')).toBeLessThan(
      prompt.indexOf('Example 2 (image 2)')
    )
    expect(prompt.indexOf('Example 2 (image 2)')).toBeLessThan(
      prompt.indexOf('Profile to read (image 3)')
    )
    expect(prompt).toContain('"profileShape":"double"')
    // both golden examples are double distributions; the primaries are Job's own prices
    expect(prompt).toContain('"priceLow":24948')
    expect(prompt).toContain('"priceLow":7568')
  })

  it('describes a tile by its index and the full span', () => {
    const profile = parseVbpProfile(readFileSync(FIXTURE, 'utf8'))
    const { meta: m2, tiles } = renderProfile(profile, { instrument: 'NQ', tiles: 2 })
    const p = buildVisionPrompt(
      { instrument: 'NQ', profileName: 'x', lookback: 'y', meta: m2, tile: tiles[1].tile },
      []
    )
    expect(p).toContain('tile 2 of 2')
    expect(p).toContain('the full profile spans 28910.00–30073.00')
    expect(p).toContain('Profile to read (image 1)')
    expect(p).not.toContain('WORKED EXAMPLES')
  })
})
