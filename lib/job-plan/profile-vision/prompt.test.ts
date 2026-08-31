import { describe, expect, it } from 'vitest'
import { parseVbpProfile } from '@/lib/engine/parseProfile'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildVisionPrompt,
  CRITERIA,
  CRITERIA_CANARIES,
  MECHANISM,
  VISION_PROMPT_REVISION,
} from './prompt'
import { renderProfile } from './renderProfile'

const FIXTURE = join(process.cwd(), 'chart-data/four-hundred-rotation.vbp.md')

function target() {
  const profile = parseVbpProfile(readFileSync(FIXTURE, 'utf8'))
  const { meta, tiles } = renderProfile(profile, { instrument: 'NQ', currentPrice: 29945.75 })
  return { meta, tile: tiles[0].tile }
}


describe('vision prompt', () => {
  const { meta, tile } = target()
  const prompt = buildVisionPrompt(
    {
      instrument: 'NQ',
      profileName: '5-day rolling volume profile',
      lookback: 'the last five trading sessions',
      meta,
      tile,
    }
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
      expect(c.title).toMatch(/^[A-Z][A-Z ,()s-]+$/)
      // rule 4 is deliberately terse — the operator's point was that HVNs are
      // self-explanatory and do not need re-teaching
      expect(c.text.split(/\s+/).length).toBeGreaterThan(10)
    }
  })

  /**
   * feat-138. The rewrite dropped the abbreviation LVN entirely — the prompt
   * said "low-volume node" but never "LVN", and the ROLE line lost its
   * "Identify the low-volume nodes (LVNs)" phrasing. LVN is the term of art a
   * vision model most strongly associates with this domain; losing it threw
   * away the prompt's best anchor for free.
   */
  it('uses the domain terms LVN and HVN, not just the spelled-out forms', () => {
    expect(prompt).toContain('LVN')
    expect(prompt).toContain('HVN')
    expect(prompt).toMatch(/low-volume node \(LVN\)/)
    expect(prompt).toMatch(/high-volume node \(HVN\)/)
    // and the mechanism ties the term to the thing it names
    expect(MECHANISM).toContain('LOW-VOLUME NODE, an LVN')
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
      'most prominent LVNs sit against the most prominent distributions',
      // rule 2 names both LVN types explicitly
      'A LEDGE:',
      'A TAPER:',
      'stops abruptly and drops off a cliff',
      'thins out gradually',
      // the two-sided model — the operator's correction
      'Report BOTH sides separately',
      'a ledge from below and a taper from above',
      'FLAT, LOW-VOLUME STRETCH',
      'THE START OF A NEW DISTRIBUTION',
      'that is rule 1 and rule 1 only',
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


})
