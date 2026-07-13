import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { computeMgiPriority } from './mgiPriority'
import type { MgiStaticLevels } from './mgiPriority'

const FIXTURE = join(process.cwd(), 'chart-data/mgi_static_levels.json')

function loadFixture(): MgiStaticLevels {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as MgiStaticLevels
}

describe('computeMgiPriority — fixture', () => {
  const mgi = loadFixture()

  it('uses current.price from the JSON as the current price', () => {
    const r = computeMgiPriority(mgi)
    expect(r.currentPrice).toBe(29945.75)
  })

  it('extracts every finite level (30: 12 daily + 4 weekly + 6 monthly + 6 vRange + 2 atr)', () => {
    const r = computeMgiPriority(mgi)
    expect(r.levels).toHaveLength(30)
    // Sorted price descending.
    for (let i = 1; i < r.levels.length; i++) {
      expect(r.levels[i - 1].price).toBeGreaterThanOrEqual(r.levels[i].price)
    }
  })

  it('classifies 18 Tier-1 campaign borders (weekly + monthly + vRange + ONH/ONL)', () => {
    const r = computeMgiPriority(mgi)
    expect(r.tier1).toHaveLength(18)
    expect(r.tier1.every(l => l.tier === 1)).toBe(true)
    // ONH/ONL are Tier 1; Rip/PDH/IB/OR are Tier 2.
    const onh = r.levels.find(l => l.code === 'onh')
    expect(onh?.tier).toBe(1)
    expect(r.levels.find(l => l.code === 'rip')?.tier).toBe(2)
    expect(r.levels.find(l => l.code === 'pdh')?.tier).toBe(2)
    // Doctrine's Tier-1 list has no ATR — the projections are Tier-2 context,
    // never campaign borders or partition anchors (audit finding A9).
    expect(r.levels.filter(l => l.group === 'atr').map(l => l.tier)).toEqual([2, 2])
  })

  it('finds nearest Tier-1 border above = VRange High (30046.00), distance 100.25', () => {
    const r = computeMgiPriority(mgi)
    expect(r.nearestTier1Above?.level.code).toBe('high')
    expect(r.nearestTier1Above?.level.price).toBe(30046.0)
    expect(r.nearestTier1Above?.distance).toBe(100.25)
  })

  it('finds nearest Tier-1 border below = Week Open (29930.25), distance 15.50', () => {
    const r = computeMgiPriority(mgi)
    expect(r.nearestTier1Below?.level.code).toBe('wkOpen')
    expect(r.nearestTier1Below?.level.price).toBe(29930.25)
    expect(r.nearestTier1Below?.distance).toBe(15.5)
  })

  it('sorts the daily group by Daily MGI Priority Order (Rip first, then ONH/ONL)', () => {
    const r = computeMgiPriority(mgi)
    expect(r.dailyPrioritySort).toHaveLength(12)
    expect(r.dailyPrioritySort[0].code).toBe('rip')
    // Rank 2 pair (ONH/ONL) comes next, ordered by price descending.
    expect(r.dailyPrioritySort[1].code).toBe('onh')
    expect(r.dailyPrioritySort[2].code).toBe('onl')
    // Unranked daily levels (PDC, OR*) sort to the end.
    expect(r.dailyPrioritySort.at(-1)?.dailyRank).toBeNull()
  })

  it('does not mutate the caller input', () => {
    const snapshot = JSON.stringify(mgi)
    computeMgiPriority(mgi)
    expect(JSON.stringify(mgi)).toBe(snapshot)
  })
})

describe('computeMgiPriority — current price source', () => {
  it('prefers an explicit currentPrice override over current.price', () => {
    const mgi: MgiStaticLevels = {
      current: { price: 100 },
      vRange: { high: 200, low: 50 },
    }
    const r = computeMgiPriority(mgi, { currentPrice: 150 })
    expect(r.currentPrice).toBe(150)
    expect(r.nearestTier1Above?.level.price).toBe(200)
    expect(r.nearestTier1Below?.level.price).toBe(50)
  })

  it('throws when no finite current price is available', () => {
    expect(() => computeMgiPriority({ vRange: { high: 200 } })).toThrow(/no finite current price/)
    expect(() => computeMgiPriority({ current: { price: Number.NaN } })).toThrow(
      /no finite current price/,
    )
  })
})

describe('computeMgiPriority — borders and edge cases', () => {
  it('returns null for a border above when no Tier-1 level is above price', () => {
    const mgi: MgiStaticLevels = {
      current: { price: 1000 },
      weekly: { pwHigh: 900, pwLow: 800 },
    }
    const r = computeMgiPriority(mgi)
    expect(r.nearestTier1Above).toBeNull()
    expect(r.nearestTier1Below?.level.price).toBe(900)
  })

  it('treats a Tier-1 level exactly at price as neither above nor below', () => {
    const mgi: MgiStaticLevels = {
      current: { price: 500 },
      vRange: { high: 600, low: 400 },
      weekly: { wkOpen: 500 }, // exactly at price
    }
    const r = computeMgiPriority(mgi)
    expect(r.nearestTier1Above?.level.price).toBe(600)
    expect(r.nearestTier1Below?.level.price).toBe(400)
  })

  it('only Tier-1 levels are border candidates (Tier-2 daily levels are skipped)', () => {
    const mgi: MgiStaticLevels = {
      current: { price: 500 },
      daily: { pdh: 510 }, // Tier 2, closer above — must be ignored
      vRange: { high: 600 },
    }
    const r = computeMgiPriority(mgi)
    expect(r.nearestTier1Above?.level.price).toBe(600)
  })

  it('ignores non-finite level values in the export', () => {
    const mgi: MgiStaticLevels = {
      current: { price: 100 },
      // @ts-expect-error — exercising a malformed export value
      vRange: { high: 'oops', low: 50 },
    }
    const r = computeMgiPriority(mgi)
    expect(r.levels).toHaveLength(1)
    expect(r.levels[0].code).toBe('low')
  })

  it('returns empty structures when only the current price is present', () => {
    const r = computeMgiPriority({ current: { price: 100 } })
    expect(r.levels).toEqual([])
    expect(r.tier1).toEqual([])
    expect(r.dailyPrioritySort).toEqual([])
    expect(r.nearestTier1Above).toBeNull()
    expect(r.nearestTier1Below).toBeNull()
  })
})
