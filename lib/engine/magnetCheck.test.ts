import { describe, it, expect } from 'vitest'
import {
  collectMagnets,
  nearestMagnet,
  classifyMagnet,
  evaluateMagnetCheck,
  DEFAULT_MAGNET_TOLERANCE,
  type Magnet,
} from './magnetCheck'
import type { HvnNode } from './lvnDetection'

const summary = { pocPrice: 30236.25, valueAreaHigh: 30246.25, valueAreaLow: 30226.25 }

const hvn: HvnNode[] = [
  { price: 30400, volume: 900, prominence: 0.6 },
  { price: 30100, volume: 700, prominence: 0.4 },
]

describe('collectMagnets', () => {
  it('builds POC/VAH/VAL + HVN peaks, price descending', () => {
    const magnets = collectMagnets({ summary, hvn })
    expect(magnets.map(m => m.label)).toEqual(['HVN', 'VAH', 'POC', 'VAL', 'HVN'])
    // descending by price
    const prices = magnets.map(m => m.price)
    expect(prices).toEqual([...prices].sort((a, b) => b - a))
  })

  it('carries HVN volume but leaves Summary volume null', () => {
    const magnets = collectMagnets({ summary, hvn })
    const poc = magnets.find(m => m.kind === 'poc')!
    const hvnMag = magnets.find(m => m.kind === 'hvn')!
    expect(poc.volume).toBeNull()
    expect(hvnMag.volume).toBe(900)
  })

  it('skips non-finite Summary values and works with no HVNs', () => {
    const magnets = collectMagnets({
      summary: { pocPrice: NaN, valueAreaHigh: 30246.25, valueAreaLow: Infinity },
      hvn: [],
    })
    expect(magnets.map(m => m.label)).toEqual(['VAH'])
  })
})

describe('nearestMagnet', () => {
  const magnets = collectMagnets({ summary, hvn })

  it('returns the closest magnet and its rounded absolute distance', () => {
    const hit = nearestMagnet(30402, magnets)
    expect(hit?.magnet.price).toBe(30400)
    expect(hit?.distance).toBe(2)
  })

  it('is symmetric — distance is absolute regardless of side', () => {
    expect(nearestMagnet(30398, magnets)?.distance).toBe(2)
    expect(nearestMagnet(30402, magnets)?.distance).toBe(2)
  })

  it('returns null for an empty magnet set or non-finite price', () => {
    expect(nearestMagnet(30400, [])).toBeNull()
    expect(nearestMagnet(NaN, magnets)).toBeNull()
  })
})

describe('classifyMagnet', () => {
  const magnets = collectMagnets({ summary, hvn })

  it('flags a price within tolerance of a magnet', () => {
    const r = classifyMagnet(30405, magnets, 10)
    expect(r.isMagnet).toBe(true)
    expect(r.nearest?.magnet.price).toBe(30400)
  })

  it('does not flag a price outside tolerance but still reports the near-miss', () => {
    const r = classifyMagnet(30420, magnets, 10)
    expect(r.isMagnet).toBe(false)
    expect(r.nearest?.magnet.price).toBe(30400)
    expect(r.nearest?.distance).toBe(20)
  })

  it('treats the tolerance boundary as inclusive', () => {
    expect(classifyMagnet(30410, magnets, 10).isMagnet).toBe(true)
    expect(classifyMagnet(30410.25, magnets, 10).isMagnet).toBe(false)
  })

  it('defaults to DEFAULT_MAGNET_TOLERANCE', () => {
    const within = classifyMagnet(30236.25 + DEFAULT_MAGNET_TOLERANCE, magnets)
    expect(within.isMagnet).toBe(true)
  })
})

describe('evaluateMagnetCheck', () => {
  const magnets = collectMagnets({ summary, hvn })

  it('classifies each MGI level and preserves input order', () => {
    const levels = [
      { price: 30401, label: 'Weekly VWAP' }, // ~on the 30400 HVN → magnet
      { price: 30500, label: 'PW High' }, // far from any magnet
      { price: 30236, label: 'Rip' }, // ~on POC → magnet
    ]
    const check = evaluateMagnetCheck({ magnets, levels, tolerance: 10 })
    expect(check.verdicts.map(v => v.level.label)).toEqual(['Weekly VWAP', 'PW High', 'Rip'])
    expect(check.verdicts.map(v => v.isMagnet)).toEqual([true, false, true])
  })

  it('collects the flagged levels into magnetLevels', () => {
    const levels = [
      { price: 30401, label: 'Weekly VWAP' },
      { price: 30500, label: 'PW High' },
    ]
    const check = evaluateMagnetCheck({ magnets, levels, tolerance: 10 })
    expect(check.magnetLevels.map(l => l.label)).toEqual(['Weekly VWAP'])
  })

  it('exposes the magnet set and tolerance used', () => {
    const check = evaluateMagnetCheck({ magnets, levels: [], tolerance: 7 })
    expect(check.tolerance).toBe(7)
    expect(check.magnets.length).toBe(5)
    expect(check.magnetLevels).toEqual([])
  })

  it('throws on a negative or non-finite tolerance', () => {
    expect(() => evaluateMagnetCheck({ magnets, levels: [], tolerance: -1 })).toThrow()
    expect(() => evaluateMagnetCheck({ magnets, levels: [], tolerance: NaN })).toThrow()
  })

  it('flags nothing when there are no magnets', () => {
    const check = evaluateMagnetCheck({
      magnets: [] as Magnet[],
      levels: [{ price: 30400, label: 'x' }],
    })
    expect(check.magnets).toEqual([] as Magnet[])
    expect(check.verdicts[0].isMagnet).toBe(false)
    expect(check.verdicts[0].nearest).toBeNull()
  })
})
