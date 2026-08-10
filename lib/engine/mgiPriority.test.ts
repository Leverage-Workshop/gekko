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

  it('classifies 18 Tier-1 campaign borders (4 weekly + 6 monthly + 6 vRange + ONH/ONL)', () => {
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

  it('keeps every VRange level Tier 1 — both 1x-zone edges included', () => {
    const r = computeMgiPriority(mgi)
    // NB: `code` is not unique across groups (atr also exports high/low), so
    // scope by group before keying on it.
    const vRange = new Map(r.levels.filter(l => l.group === 'vRange').map(l => [l.code, l]))
    expect([...vRange.values()].every(l => l.tier === 1)).toBe(true)
    // The two 1x-zone edges do not compete on tier; terrain merges them into one
    // composite border instead (see terrainZones' band rule).
    expect(vRange.get('extPlus2')?.tier).toBe(1)
    expect(vRange.get('extPlus3')?.tier).toBe(1)
  })

  it('is Implied Vol Ranges geometry: open ± 0.25 / 0.90 / 1.00 of the VIX-implied move', () => {
    const r = computeMgiPriority(mgi)
    const vRange = new Map(r.levels.filter(l => l.group === 'vRange').map(l => [l.code, l.price]))
    // Every level is symmetric about the session OPEN, so opposite pairs share a
    // midpoint — this is what proves they are open-anchored volatility
    // projections rather than a range-width construct.
    const open = (vRange.get('extPlus3')! + vRange.get('extMinus3')!) / 2
    expect((vRange.get('high')! + vRange.get('low')!) / 2).toBeCloseTo(open, 6)
    expect((vRange.get('extPlus2')! + vRange.get('extMinus2')!) / 2).toBeCloseTo(open, 6)
    // D = the full expected session move; the far edge IS 1.00x it by definition.
    const d = vRange.get('extPlus3')! - open
    expect((vRange.get('high')! - open) / d).toBeCloseTo(0.25, 3)
    expect((vRange.get('extPlus2')! - open) / d).toBeCloseTo(0.9, 3)
    // Sanity: D is a plausible VIX-implied daily move (1.45% here → VIX ~23).
    const impliedVix = (d / open) * Math.sqrt(252)
    expect(impliedVix).toBeGreaterThan(0.1)
    expect(impliedVix).toBeLessThan(0.6)
  })

  it('labels the mean-reversion lines Upper/Lower, not as range extremes', () => {
    const r = computeMgiPriority(mgi)
    const labels = new Map(r.levels.filter(l => l.group === 'vRange').map(l => [l.code, l.label]))
    // `high`/`low` sit at 0.25x the expected move, so "VRange High" read as the
    // session's expected extreme in briefing prose — wrong by a factor of four.
    // The 1x zone is the extreme.
    expect(labels.get('high')).toBe('VRange Upper')
    expect(labels.get('low')).toBe('VRange Lower')
    expect(labels.get('extPlus3')).toContain('1x Zone far')
    expect(labels.get('extPlus2')).toContain('1x Zone near')
  })

  it('finds the nearest DAILY level each side, which the Tier-1 read cannot reach', () => {
    const r = computeMgiPriority(mgi)
    // PDC 29948.75 sits 3.00 pts over price while the nearest Tier-1 border is
    // 100.25 pts away — and PDC is Tier 2 AND unranked, so it reaches the model
    // with a distance attached only through this fact. Proves the daily read
    // covers the WHOLE group, not just the Daily-MGI-ranked members.
    expect(r.nearestDailyAbove?.level.code).toBe('pdc')
    expect(r.nearestDailyAbove?.distance).toBe(3)
    expect(r.nearestDailyAbove?.level.dailyRank).toBeNull()
    expect(r.nearestDailyBelow?.level.code).toBe('vwap24')
    expect(r.nearestDailyBelow?.distance).toBe(60.67)
  })

  it('never returns an unset 0.00 placeholder as the nearest level', () => {
    // This fixture exports onh/onl/ibh/ibl as 0.00 (no overnight data). They are
    // finite, so they survive extraction — but 0 is not structure below price.
    const r = computeMgiPriority(mgi)
    expect(r.levels.filter(l => l.price === 0).map(l => l.code).sort()).toEqual([
      'ibh',
      'ibl',
      'onh',
      'onl',
    ])
    expect(r.nearestDailyBelow?.level.price).toBeGreaterThan(0)
    expect(r.nearestTier1Below?.level.price).toBeGreaterThan(0)
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
    // ...and the daily read is the complement that DOES see it (feat-109).
    expect(r.nearestDailyAbove?.level.price).toBe(510)
  })

  it('skips 0.00 placeholders even when nothing real sits below price', () => {
    // Gap-down open: price is under every real level, so an unset ONL would win
    // the "nearest below" contest on distance alone if it were not guarded.
    const mgi: MgiStaticLevels = {
      current: { price: 100 },
      daily: { onl: 0, onh: 0, pdh: 510 },
      weekly: { pwHigh: 600 },
    }
    const r = computeMgiPriority(mgi)
    expect(r.nearestDailyBelow).toBeNull()
    expect(r.nearestTier1Below).toBeNull()
    expect(r.nearestDailyAbove?.level.price).toBe(510)
    // The placeholders are still extracted — only the distance reads reject them.
    expect(r.levels.filter(l => l.price === 0)).toHaveLength(2)
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
    expect(r.nearestDailyAbove).toBeNull()
    expect(r.nearestDailyBelow).toBeNull()
  })
})

/**
 * feat-090 — Daily MGI Priority ranks 4–5. RVAH/RVAL/RPOC are exported in
 * `daily-value-areas.csv`, not `mgi_static_levels.json`, so the caller passes the prior
 * COMPLETED session's value area in and the classifier synthesizes the levels.
 */
describe('computeMgiPriority — prior-day value (RVAH/RVAL/RPOC)', () => {
  const base: MgiStaticLevels = {
    current: { price: 500 },
    daily: { rip: 505, pdh: 520, pdl: 480, ibh: 515, ibl: 490 },
    vRange: { high: 600, low: 400 },
  }

  it('promotes the prior value area to Tier-2 daily levels at ranks 4 and 5', () => {
    const r = computeMgiPriority(base, { priorDayValue: { poc: 502, vah: 512, val: 494 } })

    const byCode = new Map(r.levels.map(l => [l.code, l]))
    expect(byCode.get('rvah')).toEqual({
      code: 'rvah',
      label: 'RVAH',
      price: 512,
      group: 'daily',
      tier: 2,
      dailyRank: 4,
    })
    expect(byCode.get('rval')).toMatchObject({ label: 'RVAL', price: 494, dailyRank: 4 })
    expect(byCode.get('rpoc')).toMatchObject({ label: 'RPOC', price: 502, dailyRank: 5 })
    // Merged into the one price-descending list, not appended to the end.
    for (let i = 1; i < r.levels.length; i++) {
      expect(r.levels[i - 1].price).toBeGreaterThanOrEqual(r.levels[i].price)
    }
  })

  it('sorts them into the Daily MGI Priority Order between PDH/PDL and IBH/IBL', () => {
    const r = computeMgiPriority(base, { priorDayValue: { poc: 502, vah: 512, val: 494 } })
    expect(r.dailyPrioritySort.map(l => l.label)).toEqual([
      'Rip', // 1
      'PDH', // 3
      'PDL', // 3
      'RVAH', // 4 (price tie-break within the rank)
      'RVAL', // 4
      'RPOC', // 5
      'IBH', // 6
      'IBL', // 6
    ])
  })

  it('leaves the Tier-1 campaign borders alone — value is intraday, not a campaign border', () => {
    const r = computeMgiPriority(base, { priorDayValue: { poc: 502, vah: 512, val: 494 } })
    expect(r.tier1.map(l => l.code)).toEqual(['high', 'low'])
    expect(r.nearestTier1Above?.level.price).toBe(600)
    expect(r.nearestTier1Below?.level.price).toBe(400)
  })

  it('is a no-op when the prior value is absent (pre-feat-090 behaviour)', () => {
    const without = computeMgiPriority(base)
    expect(without.levels.some(l => l.dailyRank === 4 || l.dailyRank === 5)).toBe(false)
    expect(computeMgiPriority(base, { priorDayValue: null }).levels).toEqual(without.levels)
  })

  it('promotes each member independently, skipping non-finite ones', () => {
    const r = computeMgiPriority(base, {
      // @ts-expect-error — exercising a malformed/partial export row
      priorDayValue: { poc: 502, vah: Number.NaN, val: undefined },
    })
    expect(r.levels.map(l => l.code)).toContain('rpoc')
    expect(r.levels.map(l => l.code)).not.toContain('rvah')
    expect(r.levels.map(l => l.code)).not.toContain('rval')
  })
})

describe('computeMgiPriority — Job Pivots (feat-111)', () => {
  const base: MgiStaticLevels = {
    current: { price: 500 },
    daily: { rip: 505, pdh: 520, pdl: 480, jobPivot: 497 },
    weekly: { pwHigh: 560, pwLow: 440, jobPivot: 455 },
  }

  it('tiers the daily Job Pivot with the Rip: Tier 2, Daily MGI Priority rank 1', () => {
    const r = computeMgiPriority(base)
    expect(r.levels.find(l => l.group === 'daily' && l.code === 'jobPivot')).toEqual({
      code: 'jobPivot',
      label: 'Job Pivot',
      price: 497,
      group: 'daily',
      tier: 2,
      dailyRank: 1,
    })
  })

  it('tiers the Weekly Job Pivot as a Tier-1 campaign border like every weekly level', () => {
    const r = computeMgiPriority(base)
    expect(r.levels.find(l => l.group === 'weekly' && l.code === 'jobPivot')).toEqual({
      code: 'jobPivot',
      label: 'Weekly Job Pivot',
      price: 455,
      group: 'weekly',
      tier: 1,
      dailyRank: null,
    })
    expect(r.tier1.map(l => l.label)).toContain('Weekly Job Pivot')
  })

  it('shares rank 1 with the Rip — a price tie-break, not a demotion of either', () => {
    const r = computeMgiPriority(base)
    // Both rank-1 levels lead the sort, ordered by price alone (the Rip is higher here).
    expect(r.dailyPrioritySort.slice(0, 2).map(l => l.label)).toEqual(['Rip', 'Job Pivot'])
    expect(r.dailyPrioritySort.slice(0, 2).every(l => l.dailyRank === 1)).toBe(true)
    // Nothing below moved: PDH/PDL keep rank 3 behind them.
    expect(r.dailyPrioritySort.slice(2).map(l => l.label)).toEqual(['PDH', 'PDL'])
  })

  it('leaves the daily pivot out of the campaign-border set (Tier 2 is not a border)', () => {
    const r = computeMgiPriority(base)
    expect(r.tier1.map(l => l.label)).not.toContain('Job Pivot')
    // ...but it is live intraday structure, so the nearest-daily read can reach it.
    expect(r.nearestDailyBelow?.level.label).toBe('Job Pivot')
    expect(r.nearestDailyBelow?.distance).toBe(3)
  })

  it('carries the two pivots independently — the shared `jobPivot` code never collides', () => {
    const dailyOnly = computeMgiPriority({ ...base, weekly: { pwHigh: 560, pwLow: 440 } })
    expect(dailyOnly.levels.filter(l => l.code === 'jobPivot')).toHaveLength(1)
    expect(dailyOnly.levels.find(l => l.code === 'jobPivot')?.group).toBe('daily')

    const both = computeMgiPriority(base)
    expect(both.levels.filter(l => l.code === 'jobPivot')).toHaveLength(2)
  })

  it('is absent from an export that predates the study update (both optional)', () => {
    const r = computeMgiPriority({
      current: { price: 500 },
      daily: { rip: 505 },
      weekly: { pwHigh: 560 },
    })
    expect(r.levels.some(l => l.code === 'jobPivot')).toBe(false)
  })

  it('skips the UNSET 0.00 placeholder the exporter writes when the study is off the chart', () => {
    const r = computeMgiPriority({
      current: { price: 500 },
      daily: { rip: 505, jobPivot: 0 },
      weekly: { pwLow: 440, jobPivot: 0 },
    })
    // The level still parses (0 is finite), but it can never be the nearest anything.
    expect(r.nearestDailyBelow?.level.label).not.toBe('Job Pivot')
    expect(r.nearestTier1Below?.level.label).not.toBe('Weekly Job Pivot')
  })
})
