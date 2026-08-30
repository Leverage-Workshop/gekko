import { describe, expect, it } from 'vitest'
import {
  addFamilyScores,
  consensusToScored,
  detectorToScored,
  emptyFamilyScores,
  FAMILY_OF_KIND,
  labelToScored,
  overall,
  precision,
  recall,
  nearest,
  scoreCaseNodes,
  scorePrimary,
  scoreRead,
  selfAgreement,
  toleranceFor,
  type ScoredNode,
} from './bench'
import type { GoldenLabel } from './goldenSet'
import type { ConsensusNode } from './types'

const nq = (price: number, family: ScoredNode['family']): ScoredNode => ({ price, family })

describe('bench — conversions', () => {
  it('maps kinds to coarse families (detector knows only lvn vs hvn)', () => {
    expect(FAMILY_OF_KIND.lvn).toBe('lvn')
    expect(FAMILY_OF_KIND['hvn-edge']).toBe('hvn')
    expect(FAMILY_OF_KIND['hvn-core']).toBe('hvn')
    expect(FAMILY_OF_KIND['exhaustive-node']).toBe('extreme')
    expect(FAMILY_OF_KIND['taper-tail']).toBe('extreme')
  })

  it('a band becomes its midpoint', () => {
    const label: GoldenLabel = {
      instrument: 'ES',
      profile: 'any',
      kind: 'lvn',
      priceLow: 6800,
      priceHigh: 6810,
      primary: true,
      corpusRef: 1,
      verbatim: 'x',
      source: 'corpus',
    }
    expect(labelToScored(label)).toEqual({ price: 6805, family: 'lvn' })
    const node: ConsensusNode = {
      kind: 'hvn-edge',
      priceLow: 29300,
      priceHigh: 29304,
      prominence: 2,
      primary: false,
      position: 'upper',
      shape: 'shelf-edge',
      agreement: 3,
      samples: 3,
    }
    expect(consensusToScored(node)).toEqual({ price: 29302, family: 'hvn' })
  })

  it('detector prices split into lvn / hvn families', () => {
    expect(detectorToScored([100, 200], [150])).toEqual([
      { price: 100, family: 'lvn' },
      { price: 200, family: 'lvn' },
      { price: 150, family: 'hvn' },
    ])
  })

  it('toleranceFor is the R1 merge tolerance', () => {
    expect(toleranceFor('NQ')).toBe(20)
    expect(toleranceFor('ES')).toBe(5)
  })
})

describe('bench — scoring', () => {
  it('greedy-matches within family and within tolerance', () => {
    const predicted = [nq(29100, 'lvn'), nq(29305, 'hvn'), nq(29500, 'lvn')]
    const labeled = [nq(29110, 'lvn'), nq(29300, 'hvn')]
    const s = scoreRead(predicted, labeled, 20)
    expect(s.lvn).toMatchObject({ tp: 1, fp: 1, fn: 0 }) // 29100~29110 hit; 29500 unmatched
    expect(s.hvn).toMatchObject({ tp: 1, fp: 0, fn: 0 }) // 29305~29300 hit
    expect(recall(overall(s))).toBe(1) // both labels matched
    expect(precision(overall(s))).toBeCloseTo(2 / 3, 6)
  })

  it('never lets an lvn label be satisfied by an hvn prediction (corpus B4)', () => {
    const predicted = [nq(29300, 'hvn')]
    const labeled = [nq(29300, 'lvn')]
    const s = scoreRead(predicted, labeled, 20)
    expect(s.lvn).toMatchObject({ tp: 0, fn: 1 })
    expect(s.hvn).toMatchObject({ tp: 0, fp: 1 })
    expect(recall(overall(s))).toBe(0)
  })

  it('a miss outside the tolerance is a false negative + false positive', () => {
    const s = scoreRead([nq(29100, 'lvn')], [nq(29130, 'lvn')], 20)
    expect(s.lvn).toMatchObject({ tp: 0, fp: 1, fn: 1 })
  })

  it('extreme-family labels (exhaustive/taper) the detector cannot produce are pure misses', () => {
    const detector = detectorToScored([29100], [29300]) // no extreme family
    const labeled = [nq(29900, 'extreme'), nq(29100, 'lvn')]
    const s = scoreRead(detector, labeled, 20)
    expect(s.extreme).toMatchObject({ tp: 0, fn: 1 })
    expect(s.lvn).toMatchObject({ tp: 1 })
  })

  it('aggregates family scores across reads', () => {
    const a = scoreRead([nq(1, 'lvn')], [nq(1, 'lvn')], 5)
    const b = scoreRead([nq(10, 'hvn')], [nq(10, 'hvn'), nq(50, 'hvn')], 5)
    const total = addFamilyScores(addFamilyScores(emptyFamilyScores(), a), b)
    expect(total.lvn).toMatchObject({ tp: 1 })
    expect(total.hvn).toMatchObject({ tp: 1, fn: 1 })
    expect(overall(total)).toMatchObject({ tp: 2, fn: 1 })
  })
})

describe('bench — primary agreement', () => {
  it('hit when the predicted primary is within tolerance of the labeled primary', () => {
    expect(scorePrimary(nq(29100, 'lvn'), nq(29115, 'lvn'), 20)).toBe('hit')
    expect(scorePrimary(nq(29100, 'lvn'), nq(29130, 'lvn'), 20)).toBe('miss')
  })

  it('distinguishes no-labeled-primary from no-predicted-primary', () => {
    expect(scorePrimary(nq(29100, 'lvn'), null, 20)).toBe('not_applicable')
    expect(scorePrimary(null, nq(29100, 'lvn'), 20)).toBe('no_primary_predicted')
  })
})

describe('bench — self-agreement', () => {
  it('is 1 when every sample reads the same nodes', () => {
    const s = [nq(100, 'lvn'), nq(200, 'hvn')]
    expect(selfAgreement([s, s, s], 5)).toBe(1)
  })

  it('is 1 when every sample is empty, and null under two samples', () => {
    expect(selfAgreement([[], []], 5)).toBe(1)
    expect(selfAgreement([[nq(1, 'lvn')]], 5)).toBeNull()
    expect(selfAgreement([], 5)).toBeNull()
  })

  it('drops below 1 when samples disagree, averaged over all pairs', () => {
    const a = [nq(100, 'lvn')]
    const b = [nq(100, 'lvn'), nq(500, 'lvn')]
    // pair (a,b): tp1 fp1 fn0 -> P .5 R 1 F1 .667
    expect(selfAgreement([a, b], 5)).toBeCloseTo(2 / 3, 3)
    // three samples all mutually identical to `a` except b -> two 0.667 pairs + one 1.0 pair
    const avg = selfAgreement([a, a, b], 5)!
    expect(avg).toBeCloseTo((1 + 2 / 3 + 2 / 3) / 3, 3)
  })

  it('is symmetric in the sample order', () => {
    const a = [nq(100, 'lvn')]
    const b = [nq(103, 'lvn'), nq(500, 'hvn')]
    expect(selfAgreement([a, b], 5)).toBeCloseTo(selfAgreement([b, a], 5)!, 9)
  })
})

describe('bench — case-level one-to-one matching (no double-count)', () => {
  const named = (key: string, ...nodes: ScoredNode[]) => ({ key, labels: nodes })

  it('does not let one prediction satisfy both a named and an any label', () => {
    // one lvn prediction at 29100; a named lvn AND an any lvn both near it.
    const preds = [{ key: '5d', nodes: [nq(29100, 'lvn')] }]
    const s = scoreCaseNodes(preds, [named('5d', nq(29105, 'lvn'))], [nq(29108, 'lvn')], 20)
    // the prediction is claimed once (by the named label); the any label misses.
    expect(s.lvn).toMatchObject({ tp: 1, fp: 0, fn: 1, detected: 1, labeled: 2 })
  })

  it('binds a named label to ITS profile — a prediction on another profile cannot satisfy it', () => {
    const preds = [
      { key: '5d', nodes: [] as ScoredNode[] },
      { key: '4h', nodes: [nq(29100, 'lvn')] },
    ]
    const s = scoreCaseNodes(preds, [named('5d', nq(29100, 'lvn'))], [], 20)
    expect(s.lvn).toMatchObject({ tp: 0, fn: 1, fp: 1 })
  })

  it('lets an any label match a prediction from EITHER profile (union), once', () => {
    const preds = [
      { key: '5d', nodes: [nq(29100, 'lvn')] },
      { key: '4h', nodes: [nq(29100, 'lvn')] },
    ]
    // one any label near both — claims exactly one prediction.
    const s = scoreCaseNodes(preds, [], [nq(29100, 'lvn')], 20)
    expect(s.lvn).toMatchObject({ tp: 1, fp: 1, fn: 0, detected: 2, labeled: 1 })
  })

  it('named labels get priority on their profile before any labels claim the union', () => {
    const preds = [{ key: '5d', nodes: [nq(29100, 'lvn'), nq(29500, 'lvn')] }]
    const s = scoreCaseNodes(preds, [named('5d', nq(29100, 'lvn'))], [nq(29500, 'lvn')], 20)
    expect(s.lvn).toMatchObject({ tp: 2, fp: 0, fn: 0 })
  })

  it('keeps families independent (an lvn label never claims an hvn prediction)', () => {
    const preds = [{ key: '5d', nodes: [nq(29300, 'hvn')] }]
    const s = scoreCaseNodes(preds, [], [nq(29300, 'lvn')], 20)
    expect(s.lvn).toMatchObject({ tp: 0, fn: 1 })
    expect(s.hvn).toMatchObject({ tp: 0, fp: 1 })
  })

  it('an empty prediction set (failed read) makes every label a false negative', () => {
    const preds = [{ key: '5d', nodes: [] as ScoredNode[] }]
    const s = scoreCaseNodes(preds, [named('5d', nq(1, 'lvn'))], [nq(2, 'hvn')], 20)
    expect(s.lvn).toMatchObject({ tp: 0, fn: 1, detected: 0 })
    expect(s.hvn).toMatchObject({ tp: 0, fn: 1, detected: 0 })
  })
})

describe('bench — nearest', () => {
  it('picks the closest node across the set, so an any-primary hits if ANY profile is near', () => {
    const nodes = [nq(29500, 'lvn'), nq(29105, 'lvn')]
    expect(nearest(nodes, 29100)).toEqual(nq(29105, 'lvn'))
    // reversed order — still the 29105 node
    expect(nearest([nq(29105, 'lvn'), nq(29500, 'lvn')], 29100)).toEqual(nq(29105, 'lvn'))
    expect(nearest([], 29100)).toBeNull()
  })

  it('feeds a within-tolerance any-primary to scorePrimary as a hit even when another profile misses', () => {
    const nodes = [nq(29500, 'lvn'), nq(29105, 'lvn')]
    expect(scorePrimary(nearest(nodes, 29100), nq(29100, 'lvn'), 20)).toBe('hit')
  })
})
