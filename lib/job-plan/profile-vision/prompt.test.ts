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

  it('every criterion quotes the corpus VERBATIM and names the sections it distils', () => {
    const corpus = readFileSync(join(process.cwd(), 'docs/jba-research/lvn-corpus.md'), 'utf8')
    expect(CRITERIA).toHaveLength(18)
    for (const c of CRITERIA) {
      expect(corpus, `not a corpus quote: ${c.example}`).toContain(c.example)
      expect(c.corpus).toMatch(/^[BD]\d+(, [BD]\d+)*$/)
    }
    // perception-side coverage: B1-4, B6-8, B11-16, D3, D7, D10, D11
    const covered = new Set(CRITERIA.flatMap((c) => c.corpus.split(', ')))
    for (const id of [
      'B1',
      'B2',
      'B3',
      'B4',
      'B6',
      'B7',
      'B8',
      'B11',
      'B12',
      'B13',
      'B14',
      'B15',
      'B16',
      'D3',
      'D7',
      'D10',
      'D11',
    ]) {
      expect(covered.has(id), `criterion for ${id} missing`).toBe(true)
    }
  })

  it('carries every criterion canary phrase, one per criterion', () => {
    expect(CRITERIA_CANARIES).toHaveLength(CRITERIA.length)
    for (const canary of CRITERIA_CANARIES) expect(prompt).toContain(canary)
    // the corpus rules the criteria distil (B1, B3, B4, B6, B11, B7, B13-16, D)
    for (const phrase of [
      'deepest meaning primary',
      'We left an LVN',
      'high volume edge',
      'wide LVN',
      'HPNs that are tiny',
      'not an entry',
      // B13-B16, from reference/volume_profile_101.txt (corpus A4)
      'look all the way to the right',
      "that's a secondary LVN",
      'we have a distribution of volume',
      'flat line let it smack you in the face',
      '45-degree ramp',
      'shape ledge',
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
