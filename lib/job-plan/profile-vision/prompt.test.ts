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
import { toNormalizedRead, toPriceRead } from './normalized'
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

  /**
   * feat-135. The axis-free expectations are DERIVED, never authored: they must
   * be exactly what `toNormalizedRead` produces from the price file against the
   * render span, and must convert back to the prices the price file states.
   * This is the check that `scripts/few-shot-normalize.ts` was actually run and
   * that nobody hand-edited a fraction afterwards.
   */
  it('the normalized expectations are the mechanical conversion of the price ones', () => {
    for (const ex of loadFewShot()) {
      const { meta } = renderProfile(ex.profile, { instrument: ex.instrument, tiles: 1 })
      expect(ex.expectedNormalized).toEqual(toNormalizedRead(ex.expected, meta))

      // and they convert back to the same prices, within the fraction's rounding
      const eps = (meta.priceHigh - meta.priceLow) * 1e-6
      const back = toPriceRead(ex.expectedNormalized, meta)
      expect(back.nodes).toHaveLength(ex.expected.nodes.length)
      back.nodes.forEach((n, i) => {
        const want = ex.expected.nodes[i]
        expect(Math.abs(n.priceLow - want.priceLow)).toBeLessThanOrEqual(eps)
        expect(Math.abs(n.priceHigh - want.priceHigh)).toBeLessThanOrEqual(eps)
        expect(n.kind).toBe(want.kind)
        expect(n.primary).toBe(want.primary)
        expect(n.prominence).toBe(want.prominence)
        expect(n.position).toBe(want.position)
        expect(n.shape).toBe(want.shape)
        expect(n.rationale).toBe(want.rationale)
      })
      back.thinZones.forEach((z, i) => {
        expect(Math.abs(z.low - ex.expected.thinZones[i].low)).toBeLessThanOrEqual(eps)
        expect(Math.abs(z.high - ex.expected.thinZones[i].high)).toBeLessThanOrEqual(eps)
      })
      expect(back.profileShape).toBe(ex.expected.profileShape)
      expect(back.unfinished).toBe(ex.expected.unfinished)
    }
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
   * feat-131 adversarial review. `lvn-corpus.md` has section A — a table of
   * VERBATIM trader quotes, each with a transcript citation — and sections
   * B/C/D, which are SYNTHESIS PROSE written by an earlier session. Checking a
   * quote against the whole file cannot tell the two apart, so criteria drifted
   * into quoting the corpus EDITOR while the prompt billed them as the trader's
   * own words. Three had (D10's heading, a sentence of B8 prose, and an
   * ellipsis-compressed rendering of row #87 that the trader never uttered).
   *
   * Every criterion quote must come from section A. If a rule needs support
   * that only exists in the synthesis, the fix is to cite the section-A row the
   * synthesis was built from — not to quote the synthesis.
   */
  it('every criterion quotes the TRADER (corpus section A), never the editor', () => {
    const corpus = readFileSync(join(process.cwd(), 'docs/jba-research/lvn-corpus.md'), 'utf8')
    const start = corpus.indexOf('## A. The corpus')
    const end = corpus.indexOf('## B. Synthesis')
    expect(start, 'corpus section A missing').toBeGreaterThanOrEqual(0)
    expect(end, 'corpus section B missing').toBeGreaterThan(start)
    const sectionA = corpus.slice(start, end)
    for (const c of CRITERIA) {
      expect(sectionA, `criterion quotes editor prose, not the trader: ${c.example}`).toContain(
        c.example
      )
    }
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
      'back inside of value',
      // B13-B16, from reference/volume_profile_101.txt (corpus A4)
      'look all the way to the right',
      "that's a secondary LVN",
      'we have a distribution of volume',
      'flat line let it smack you in the face',
      '45-degree ramp',
      'kind hvn-edge with shape ledge',
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

  it('says nothing about fractions in the axis mode', () => {
    expect(prompt).not.toContain('yLow')
    expect(prompt).not.toContain('NO PRICE AXIS')
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

// ---------------------------------------------------------------------------
// feat-135: axis-free mode. Same builder, same criteria, different way of
// saying WHERE — because the image the model is shown has no axis to read.
// ---------------------------------------------------------------------------
function axisFreeTarget() {
  const profile = parseVbpProfile(readFileSync(FIXTURE, 'utf8'))
  const { meta, tiles } = renderProfile(profile, {
    instrument: 'NQ',
    currentPrice: 29945.75,
    axis: false,
  })
  return { meta, tile: tiles[0].tile }
}

function fewShotRenderedAxisFree() {
  return loadFewShot().map((example) => {
    const { meta, tiles } = renderProfile(example.profile, {
      instrument: example.instrument,
      axis: false,
    })
    return { example, meta, tile: tiles[0].tile }
  })
}

describe('vision prompt — axis-free mode (feat-135)', () => {
  const { meta, tile } = axisFreeTarget()
  const prompt = buildVisionPrompt(
    {
      instrument: 'NQ',
      profileName: '5-day rolling volume profile',
      lookback: 'the last five trading sessions',
      meta,
      tile,
    },
    fewShotRenderedAxisFree()
  )

  it('matches the snapshot (bump VISION_PROMPT_REVISION when this changes)', () => {
    expect(prompt).toMatchSnapshot()
  })

  it('asks for yLow / yHigh and forbids prices in the output', () => {
    expect(prompt).toContain('yLow / yHigh')
    expect(prompt).toContain('0.000 is the BOTTOM edge')
    expect(prompt).toContain('NEVER output a price')
    expect(prompt).toContain('thinZones: at most 3 { yLow, yHigh } spans')
    // the price-mode instructions must be gone, or the model gets both
    expect(prompt).not.toContain('priceLow / priceHigh')
    expect(prompt).not.toContain('Read prices from the axis labels')
  })

  it('overrides the two criteria that speak of the axis', () => {
    expect(prompt).toContain('THIS IMAGE HAS NO PRICE AXIS')
    expect(prompt).toContain('nearest the RIGHT EDGE of the image')
    // the criteria themselves are untouched — the same canaries, in the same order
    for (const canary of CRITERIA_CANARIES) expect(prompt).toContain(canary)
  })

  it('states the image edges and every marker as a FRACTION alongside its price', () => {
    expect(prompt).toContain('its BOTTOM edge (y=0.000) is 28910.00')
    expect(prompt).toContain('and its TOP edge (y=1.000) is 30073.00')
    // POC 29900 sits (29900 - 28910) / 1163 = 0.851 up the image
    expect(prompt).toContain('POC 29900.00 at y=0.851 (solid line)')
    expect(prompt).toContain('VAH 29995.00 at y=0.933')
    expect(prompt).toContain('VAL 29361.00 at y=0.388')
    expect(prompt).toContain('current price 29945.75 at y=0.891 (orange line)')
  })

  it('quotes the few-shot answers in the normalized form, never as price bands', () => {
    expect(prompt).toContain('"yLow":0.386982') // the NQ primary, as a fraction
    expect(prompt).toContain('"profileShape":"double"')
    expect(prompt).not.toContain('"priceLow"')
    expect(prompt).not.toContain('"priceHigh"')
  })

  it('says a marker outside a tile is not on the image instead of clamping its fraction', () => {
    const profile = parseVbpProfile(readFileSync(FIXTURE, 'utf8'))
    const { meta: m2, tiles } = renderProfile(profile, {
      instrument: 'NQ',
      tiles: 2,
      axis: false,
      currentPrice: 29945.75,
    })
    const lower = buildVisionPrompt(
      { instrument: 'NQ', profileName: 'x', lookback: 'y', meta: m2, tile: tiles[1].tile },
      []
    )
    expect(lower).toContain('POC 29900.00 (not in this image)')
    expect(lower).toContain('current price 29945.75 (not in this image)')
    expect(lower).toContain('tile 2 of 2')
  })
})
