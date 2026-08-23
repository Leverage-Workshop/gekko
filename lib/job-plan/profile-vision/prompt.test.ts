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
    expect(set.map((s) => s.id)).toEqual(['double-distribution', 'trend-up'])
    expect(FEW_SHOT_SOURCE).toMatch(/fixture-5/)
    expect(FEW_SHOT_SOURCE).toMatch(/fixture-3/)
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

  it('carries every criterion canary phrase from the corpus, one per criterion', () => {
    expect(CRITERIA).toHaveLength(12)
    expect(CRITERIA_CANARIES).toHaveLength(12)
    for (const canary of CRITERIA_CANARIES) expect(prompt).toContain(canary)
    // the corpus rules the criteria distil (B1, B3, B4, B6, B11, B7, D)
    for (const phrase of [
      'deepest meaning primary',
      'We left an LVN',
      'high volume edge',
      'wide LVN',
      'bunch of sticks',
      'taper tail',
      'not an entry',
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
    for (const forbidden of ['JBA', 'MGI', 'pivot', 'Pivot', 'ONH', 'PDH', 'box']) {
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
    expect(prompt).toContain('"profileShape":"trend-up"')
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
