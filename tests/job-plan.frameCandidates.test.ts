import { describe, expect, it } from 'vitest'
import {
  byFrameStrength,
  eligibleFrameCandidates,
  frameAnchors,
  frameCandidates,
  FRAME_CONFLUENCE_SOURCES,
  selectFrameCandidate,
} from '@/lib/job-plan/frameCandidates'
import { frameDirection, planFrame } from '@/lib/job-plan/planFrame'
import { synthContext, type SynthRef, type SynthSpec } from './helpers/jobPlanContext'

/**
 * feat-148 — the frame as a BIAS LINE (operator ratification 2026-09-07):
 * the anchor ladder (current daily pivot; weekly pivot / G line, reach-gated;
 * JBA borders; distribution boundary LVNs, balance before rotation), the
 * confluence-only members, the band shape, the strength order, and the
 * legal 'at' state. NQ: merge 20 / cap 40, reach 300 unless stated.
 */

const REFS: readonly SynthRef[] = [
  { id: 'onl', source: 'overnight-extreme', price: 29260, label: 'ONL' },
  { id: 'g-line', source: 'g-line', price: 29300, label: 'G line (week open)' },
  { id: 'daily-pivot', source: 'daily-job-pivot', price: 29393.5, label: 'Daily Job Pivot' },
  { id: 'rip', source: 'rip', price: 29420, label: 'Rip' },
  { id: 'onh', source: 'overnight-extreme', price: 29460, label: 'ONH' },
  { id: 'weekly-pivot', source: 'weekly-job-pivot', price: 29500, label: 'Weekly Job Pivot' },
  { id: 'pdh', source: 'previous-day-extreme', price: 29650, label: 'PDH' },
  { id: 'rung:weekly:1A', source: 'weekly-rung', price: 29700, label: 'Weekly Job Pivot 1A' },
]
const BASE: SynthSpec = { price: 29360, refs: REFS }
const without = (...sources: string[]) => REFS.filter((r) => !sources.includes(r.source))
const noTier01 = without('daily-job-pivot', 'weekly-job-pivot', 'g-line')

const pick = (spec: Partial<SynthSpec>) => selectFrameCandidate(synthContext({ ...BASE, ...spec }))
const cands = (spec: Partial<SynthSpec>) => frameCandidates(synthContext({ ...BASE, ...spec }))

describe('the anchor ladder', () => {
  it('the CURRENT daily pivot is tier 0 and frames first, even with the G line nearer and in reach', () => {
    const c = pick({ price: 29310 })!
    expect(c).toMatchObject({ anchorId: 'daily-pivot', tier: 0, side: 'below', distancePts: 83.5, low: 29393.5, high: 29393.5, stacked: false })
    expect(cands({ price: 29310 }).map((x) => x.anchorId)).toEqual(['daily-pivot', 'g-line', 'weekly-pivot'])
  })

  it('a historical daily pivot never anchors — and never counts toward confluence', () => {
    const refs = [...REFS, { id: 'daily-pivot:2026-08-20', source: 'daily-job-pivot' as const, price: 29380, label: 'Daily Job Pivot 2026-08-20', pivotRole: 'historical' as const }]
    const c = cands({ price: 29370, refs })
    expect(c.every((x) => x.anchors.every((a) => a.id !== 'daily-pivot:2026-08-20'))).toBe(true)
    // it shares the current pivot's band (13.5 pts apart) but does not make it "stacked"
    expect(c.find((x) => x.anchorId === 'daily-pivot')).toMatchObject({ stacked: false, confluenceLabels: ['Daily Job Pivot'] })
  })

  it('the weekly pivot and the G line are tier 1 at EQUAL rank, ordered by proximity, and reach is a wall', () => {
    const refs = without('daily-job-pivot')
    expect(pick({ price: 29450, reachPts: 100, refs })).toMatchObject({ anchorId: 'weekly-pivot', tier: 1, side: 'below', distancePts: 50 })
    expect(pick({ price: 29360, reachPts: 100, refs })).toMatchObject({ anchorId: 'g-line', tier: 1, side: 'above', distancePts: 60 })
    // both in reach: the nearer wins the tie
    expect(pick({ price: 29450, refs })).toMatchObject({ anchorId: 'weekly-pivot' })
    expect(pick({ price: 29360, refs })).toMatchObject({ anchorId: 'g-line' })
  })

  it('nothing in reach → every candidate stays eligible for the model, and the deterministic pick is the NEAREST, stated at its distance', () => {
    const refs = without('daily-job-pivot')
    const all = cands({ price: 29660, reachPts: 100, refs })
    expect(all.every((x) => !x.withinReach)).toBe(true)
    expect(eligibleFrameCandidates(all).map((x) => x.anchorId)).toEqual(['weekly-pivot', 'g-line'])
    expect(pick({ price: 29660, reachPts: 100, refs })).toMatchObject({ anchorId: 'weekly-pivot', distancePts: 160 })
    // a far tier-1 line does not beat a near tier-2 border just by tier (Codex P2)
    const boxed = [...refs, { id: 'jba:0:low', source: 'jba-edge' as const, price: 29000, label: 'JBA 1 low', boxIndex: 0 }, { id: 'jba:0:high', source: 'jba-edge' as const, price: 29640, label: 'JBA 1 high', boxIndex: 0 }]
    // (PDH 29650 stacks onto the 29640 border: the band is [29640, 29650], 150 pts away)
    expect(pick({ price: 29800, reachPts: 100, refs: boxed, boxes: [{ low: 29000, high: 29640 }] })).toMatchObject({ anchorId: 'jba:0:high', tier: 2, distancePts: 150, stacked: true })
    // the daily pivot is eligible even out of reach
    expect(pick({ price: 29660, reachPts: 100 })).toMatchObject({ anchorId: 'daily-pivot', withinReach: false })
  })

  it('weekly rungs, ONH/ONL and PDH/PDL NEVER anchor ("worked our way up to the 1A" is a destination, not a bias line)', () => {
    expect(FRAME_CONFLUENCE_SOURCES).toEqual(['weekly-rung', 'overnight-extreme', 'previous-day-extreme'])
    const anchors = frameAnchors(synthContext({ price: 29660, refs: noTier01 }))
    expect(anchors).toEqual([])
    expect(pick({ price: 29660, refs: noTier01 })).toBeNull()
  })

  it('JBA borders are tier 2: both borders of the box price is inside, nearest first', () => {
    const refs = [{ id: 'jba:0:low', source: 'jba-edge' as const, price: 29200, label: 'JBA 1 low', boxIndex: 0 }, ...noTier01, { id: 'jba:0:high', source: 'jba-edge' as const, price: 29600, label: 'JBA 1 high', boxIndex: 0 }]
    const c = cands({ price: 29350, refs, boxes: [{ low: 29200, high: 29600 }] })
    expect(c.map((x) => [x.anchorId, x.tier, x.side, x.distancePts])).toEqual([
      ['jba:0:low', 2, 'above', 150],
      ['jba:0:high', 2, 'below', 250],
    ])
    expect(c[0].anchors[0].reason).toBe('lower border of the JBA price is inside')
  })

  it('between boxes, the nearest border below and above are the candidates', () => {
    const refs = [
      { id: 'jba:0:low', source: 'jba-edge' as const, price: 29000, label: 'JBA 1 low', boxIndex: 0 },
      { id: 'jba:0:high', source: 'jba-edge' as const, price: 29100, label: 'JBA 1 high', boxIndex: 0 },
      ...noTier01,
      { id: 'jba:1:low', source: 'jba-edge' as const, price: 29500, label: 'JBA 2 low', boxIndex: 1 },
      { id: 'jba:1:high', source: 'jba-edge' as const, price: 29600, label: 'JBA 2 high', boxIndex: 1 },
    ]
    const c = cands({ price: 29360, refs, boxes: [{ low: 29000, high: 29100 }, { low: 29500, high: 29600 }] })
    expect(c.map((x) => x.anchorId)).toEqual(['jba:1:low', 'jba:0:high'])
    expect(c.map((x) => x.anchors[0].reason)).toEqual(['the nearest JBA border above price', 'the nearest JBA border below price'])
  })

  it('distribution boundary LVNs: the edges of the distribution price is inside; balance-area (tier 3) before rotation (tier 4)', () => {
    const refs = [
      ...noTier01,
      { id: 'node:balance:1', source: 'profile-balance' as const, price: 29330, label: 'balance-area lvn (primary) #1', node: { primary: true, prominence: 1, distributionEdges: [{ edge: 'lower' as const, rank: 1, low: 29330, high: 29400, peak: 29370 }] } },
      { id: 'node:balance:0', source: 'profile-balance' as const, price: 29400, label: 'balance-area lvn #2', node: { prominence: 2, distributionEdges: [{ edge: 'upper' as const, rank: 1, low: 29330, high: 29400, peak: 29370 }] } },
      { id: 'node:balance:x', source: 'profile-balance' as const, price: 29520, label: 'balance-area lvn #3', node: { prominence: 3, distributionEdges: [{ edge: 'lower' as const, rank: 2, low: 29520, high: 29600, peak: 29560 }] } },
      { id: 'node:rotation:0', source: 'profile-rotation' as const, price: 29350, label: '400-pt rotation lvn (primary) #1', node: { profile: 'rotation' as const, primary: true, prominence: 1, distributionEdges: [{ edge: 'lower' as const, rank: 1, low: 29350, high: 29440, peak: 29400 }] } },
    ]
    const c = cands({ refs })
    // the 29330 balance lvn and the 29350 rotation lvn share a band: one candidate, the balance anchor named, both anchors listed
    expect(c.map((x) => [x.anchorId, x.tier, x.side])).toEqual([
      ['node:balance:1', 3, 'at'],
      ['node:balance:0', 3, 'below'],
    ])
    expect(c[0].anchors.map((a) => [a.id, a.tier])).toEqual([['node:balance:1', 3], ['node:rotation:0', 4]])
    expect(c[0].anchors[0].reason).toBe('lower edge of the rank-1 distribution price is inside')
    // an edge of a distribution price is NOT inside is not a candidate
    expect(c.some((x) => x.anchorId === 'node:balance:x')).toBe(false)
  })

  it('in an LVN gap between distributions, the nearest distribution edge below and above are the candidates', () => {
    const refs = [
      ...noTier01,
      { id: 'node:balance:1', source: 'profile-balance' as const, price: 29320, label: 'balance-area lvn (primary) #1', node: { primary: true, prominence: 1, distributionEdges: [{ edge: 'upper' as const, rank: 2, low: 29200, high: 29320, peak: 29260 }] } },
      { id: 'node:balance:0', source: 'profile-balance' as const, price: 29410, label: 'balance-area lvn #2', node: { prominence: 2, distributionEdges: [{ edge: 'lower' as const, rank: 1, low: 29410, high: 29520, peak: 29470 }] } },
    ]
    const c = cands({ refs })
    expect(c.map((x) => [x.anchorId, x.side, x.anchors[0].reason])).toEqual([
      ['node:balance:1', 'above', 'the nearest distribution edge below price'],
      ['node:balance:0', 'below', 'the nearest distribution edge above price'],
    ])
  })

  it('an lvn with no distribution edge, and any hvn, never anchors', () => {
    const refs = [
      ...noTier01,
      { id: 'node:balance:0', source: 'profile-balance' as const, price: 29340, label: 'balance-area lvn #1', node: { prominence: 1 } },
      { id: 'node:balance:1', source: 'profile-balance' as const, price: 29380, label: 'balance-area hvn #1', node: { kind: 'hvn' as const, prominence: 1, distributionEdges: [{ edge: 'lower' as const, rank: 1, low: 29380, high: 29500, peak: 29400 }] } },
    ]
    expect(cands({ refs })).toEqual([])
  })
})

describe('confluence and strength', () => {
  it('a stacked band (anchor + confluence-only member) outranks a lone higher-tier line', () => {
    const refs = REFS.map((r) => (r.id === 'onh' ? { ...r, price: 29490 } : r))
    const c = cands({ refs })
    expect(c[0]).toMatchObject({ anchorId: 'weekly-pivot', tier: 1, stacked: true, low: 29490, high: 29500, confluenceLabels: ['Weekly Job Pivot', 'ONH'], side: 'below', distancePts: 130 })
    expect(c[1]).toMatchObject({ anchorId: 'daily-pivot', tier: 0, stacked: false })
    expect([...c].sort(byFrameStrength).map((x) => x.anchorId)).toEqual(['weekly-pivot', 'daily-pivot', 'g-line'])
  })

  it('a rung on a border makes the band stacked; a lone rung is nothing', () => {
    const refs = [...noTier01.filter((r) => r.source !== 'weekly-rung'), { id: 'jba:0:low', source: 'jba-edge' as const, price: 29200, label: 'JBA 1 low', boxIndex: 0 }, { id: 'rung:weekly:1B', source: 'weekly-rung' as const, price: 29210, label: 'Weekly Job Pivot 1B' }, { id: 'jba:0:high', source: 'jba-edge' as const, price: 29600, label: 'JBA 1 high', boxIndex: 0 }]
    const c = cands({ price: 29350, refs, boxes: [{ low: 29200, high: 29600 }] })
    expect(c[0]).toMatchObject({ anchorId: 'jba:0:low', stacked: true, confluenceLabels: ['JBA 1 low', 'Weekly Job Pivot 1B'], low: 29200, high: 29210 })
  })

  it('members outside the anchor and confluence sets (Rip, PW High, an hvn) sit in the band but do not count', () => {
    const refs = [...REFS, { id: 'mgi:weekly.pwHigh', source: 'mgi-other' as const, price: 29395, label: 'PW High' }]
    const dp = cands({ refs }).find((x) => x.anchorId === 'daily-pivot')!
    expect(dp).toMatchObject({ stacked: false, confluenceLabels: ['Daily Job Pivot'], low: 29393.5, high: 29395 })
  })

  it('an anchorable SOURCE that is not an eligible anchor (an lvn with no distribution edge, an unselected JBA border) does not stack the band (Codex P2)', () => {
    const refs = [
      ...REFS,
      { id: 'node:balance:0', source: 'profile-balance' as const, price: 29395, label: 'balance-area lvn #1', node: { prominence: 1 } },
      { id: 'jba:1:low', source: 'jba-edge' as const, price: 29500, label: 'JBA 2 low', boxIndex: 1 },
      { id: 'jba:1:high', source: 'jba-edge' as const, price: 29800, label: 'JBA 2 high', boxIndex: 1 },
      { id: 'jba:0:low', source: 'jba-edge' as const, price: 29000, label: 'JBA 1 low', boxIndex: 0 },
      { id: 'jba:0:high', source: 'jba-edge' as const, price: 29100, label: 'JBA 1 high', boxIndex: 0 },
    ]
    // price 29360 sits between the boxes: the nearest borders (29100 below, 29500 above) anchor; 29800 / 29000 do not
    const c = cands({ refs, boxes: [{ low: 29000, high: 29100 }, { low: 29500, high: 29800 }] })
    expect(c.find((x) => x.anchorId === 'daily-pivot')).toMatchObject({ stacked: false, confluenceLabels: ['Daily Job Pivot'] })
    // the selected border 29500 shares the weekly pivot's band and DOES count; the unselected 29800 / 29000 never appear
    expect(c.find((x) => x.anchorId === 'weekly-pivot')).toMatchObject({ stacked: true, confluenceLabels: ['Weekly Job Pivot', 'JBA 2 low'] })
    expect(c.flatMap((x) => x.confluenceLabels)).not.toContain('JBA 2 high')
    expect(c.flatMap((x) => x.confluenceLabels)).not.toContain('balance-area lvn #1')
  })
})

describe('planFrame — the persisted bias line', () => {
  it('is a BAND anchored on the candidate, with the members, tier and side; lone lines collapse to low = high', () => {
    const f = planFrame(synthContext(BASE))!
    expect(f).toMatchObject({ referenceId: 'daily-pivot', label: 'Daily Job Pivot', price: 29393.5, side: 'below', distancePts: 33.5, low: 29393.5, high: 29393.5, tier: 0, memberLabels: ['Daily Job Pivot'] })
    expect(f.bandId).toMatch(/^band-\d+$/)
    expect(f.text).toBe('Below the Daily Job Pivot 29393.5 (33.5 pts) — shorts only: look for reoffers at the areas below the line; longs come back only above it')
    expect(f.provenance).toEqual({ kind: 'reference', referenceIds: ['daily-pivot'], derivation: null })
    expect(frameDirection(f)).toBe('short')
  })

  it('above the band: longs only', () => {
    const f = planFrame(synthContext({ ...BASE, price: 29450 }))!
    expect(f).toMatchObject({ referenceId: 'daily-pivot', side: 'above', distancePts: 56.5 })
    expect(f.text).toContain('longs only: look for rebids at the areas above the line')
    expect(frameDirection(f)).toBe('long')
  })

  it("'at' the band is a legal state — the fork, never a reason to reach for a farther line", () => {
    const f = planFrame(synthContext({ ...BASE, price: 29390 }))!
    expect(f).toMatchObject({ referenceId: 'daily-pivot', side: 'at', distancePts: 3.5 })
    expect(f.text).toBe('At the Daily Job Pivot 29393.5 — no bias yet: holding above it, longs at the areas above; losing it, shorts at the areas below')
    expect(frameDirection(f)).toBeNull()
  })

  it('a stacked frame names the confluence and the range, and its provenance carries every member', () => {
    const refs = REFS.map((r) => (r.id === 'onh' ? { ...r, price: 29490 } : r))
    const f = planFrame(synthContext({ ...BASE, refs }))!
    expect(f).toMatchObject({ referenceId: 'weekly-pivot', low: 29490, high: 29500, memberLabels: ['Weekly Job Pivot', 'ONH'] })
    expect(f.text).toContain('Below the Weekly Job Pivot (+1) 29490–29500 (130 pts)')
    expect(f.provenance.referenceIds.sort()).toEqual(['onh', 'weekly-pivot'])
  })

  it('no anchor in the inventory → no frame', () => {
    expect(planFrame(synthContext({ price: 29360, refs: noTier01 }))).toBeNull()
  })
})
