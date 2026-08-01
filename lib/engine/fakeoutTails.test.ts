import { describe, expect, it } from 'vitest'
import { DEFAULT_FAKEOUT_TAIL_PARAMS, detectFakeoutTails } from './fakeoutTails'
import type { LvnDetectionResult, PriceVolume } from './lvnDetection'
import type { MgiLevel } from './mgiPriority'

/** Contiguous 2-pt bins from `from` to `to` inclusive, all at `volume`. */
function bins(from: number, to: number, volume: number): PriceVolume[] {
  const rows: PriceVolume[] = []
  for (let price = from; price <= to; price += 2) rows.push({ price, volume })
  return rows
}

function level(code: string, price: number, group: MgiLevel['group'] = 'daily'): MgiLevel {
  return { code, label: code.toUpperCase(), price, group, tier: 2, dailyRank: null }
}

function nodesAt(...lvns: Array<{ price: number; type?: 'valley' | 'taper-edge' }>): LvnDetectionResult {
  return {
    hvn: [],
    lvn: lvns.map((n) => ({ price: n.price, volume: 30, type: n.type ?? 'taper-edge', strength: 0.2 })),
    peakVolume: 100,
  }
}

// A fakeout-low geometry: fat acceptance 130..200, a 30-pt thin tail 100..128,
// the extreme printing at the tail's far (low) end.
const FAKEOUT_LOW_SERIES = [...bins(100, 128, 5), ...bins(130, 200, 100)]

describe('detectFakeoutTails', () => {
  it('flags a Low extreme at the far end of a thin tail below the acceptance edge', () => {
    const facts = detectFakeoutTails([level('ibl', 100)], FAKEOUT_LOW_SERIES, nodesAt({ price: 130 }))

    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({
      code: 'ibl',
      side: 'low',
      price: 100,
      acceptanceEdge: { price: 130, type: 'taper-edge' },
      tailSpanPts: 30,
      maxTailBinFrac: 0.05,
    })
  })

  it('flags the mirrored High-side geometry', () => {
    const series = [...bins(100, 170, 100), ...bins(172, 200, 5)]
    const facts = detectFakeoutTails([level('ibh', 200)], series, nodesAt({ price: 170, type: 'valley' }))

    expect(facts).toHaveLength(1)
    expect(facts[0]).toMatchObject({ side: 'high', acceptanceEdge: { price: 170, type: 'valley' }, tailSpanPts: 30 })
  })

  it('does not flag when the acceptance edge sits closer than minTailPts', () => {
    const series = [...bins(100, 108, 5), ...bins(110, 200, 100)]
    expect(detectFakeoutTails([level('ibl', 100)], series, nodesAt({ price: 110 }))).toEqual([])
  })

  it('does not flag when a loud bin sits inside the tail (real acceptance near the print)', () => {
    const series = FAKEOUT_LOW_SERIES.map((row) => (row.price === 114 ? { ...row, volume: 60 } : row))
    expect(detectFakeoutTails([level('ibl', 100)], series, nodesAt({ price: 130 }))).toEqual([])
  })

  it('does not flag when loud bins extend beyond the extreme (the print is not terminal)', () => {
    const series = [...bins(80, 98, 60), ...FAKEOUT_LOW_SERIES]
    expect(detectFakeoutTails([level('ibl', 100)], series, nodesAt({ price: 130 }))).toEqual([])
  })

  it('does not flag an extreme outside the profile range', () => {
    expect(detectFakeoutTails([level('ibl', 60)], FAKEOUT_LOW_SERIES, nodesAt({ price: 130 }))).toEqual([])
  })

  it('does not flag when no LVN node terminates the tail within maxTailPts', () => {
    expect(detectFakeoutTails([level('ibl', 100)], FAKEOUT_LOW_SERIES, nodesAt({ price: 300 }))).toEqual([])
  })

  it('anchors the edge at the NEAREST qualifying node', () => {
    const facts = detectFakeoutTails(
      [level('ibl', 100)],
      FAKEOUT_LOW_SERIES,
      nodesAt({ price: 160 }, { price: 130 }),
    )
    expect(facts[0]?.acceptanceEdge.price).toBe(130)
  })

  it('ignores non-print MGI levels — projections, averages, opens, VRange and ATR extremes', () => {
    const impostors: MgiLevel[] = [
      level('vwap24', 100),
      level('wkOpen', 100, 'weekly'),
      level('low', 100, 'vRange'),
      level('low', 100, 'atr'),
      level('rip', 100),
      level('pdc', 100),
    ]
    expect(detectFakeoutTails(impostors, FAKEOUT_LOW_SERIES, nodesAt({ price: 130 }))).toEqual([])
  })

  it('flags print-type extremes across daily, weekly and monthly groups', () => {
    const prints: MgiLevel[] = [
      level('onl', 100),
      level('pwLow', 100, 'weekly'),
      level('pmLow', 100, 'monthly'),
    ]
    const facts = detectFakeoutTails(prints, FAKEOUT_LOW_SERIES, nodesAt({ price: 130 }))
    expect(facts.map((f) => f.code).sort()).toEqual(['onl', 'pmLow', 'pwLow'])
  })

  it('returns nothing on degenerate inputs', () => {
    expect(detectFakeoutTails([level('ibl', 100)], [], nodesAt({ price: 130 }))).toEqual([])
    expect(
      detectFakeoutTails([level('ibl', 100)], FAKEOUT_LOW_SERIES, { hvn: [], lvn: [], peakVolume: 0 }),
    ).toEqual([])
  })

  it('ships coherent default params', () => {
    const { minTailPts, maxTailPts, tailThinFrac } = DEFAULT_FAKEOUT_TAIL_PARAMS
    expect(minTailPts).toBeGreaterThan(0)
    expect(maxTailPts).toBeGreaterThan(minTailPts)
    expect(tailThinFrac).toBeGreaterThan(0)
    expect(tailThinFrac).toBeLessThan(1)
  })
})
