import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeEngineFacts, engineAnchorPrices, engineZoneBorders } from '@/lib/analyze'
import type { MgiStaticLevels } from '@/lib/engine/mgiPriority'

const read = (name: string) => readFileSync(join(process.cwd(), 'chart-data', name), 'utf-8')

const rotationVbpContent = read('four-hundred-rotation.vbp.md')
const balanceAreaVbpContent = read('balance-area.vbp.md')
const halfRotationDeltaContent = read('half-rotation-delta.vbp.md')
const fullRotationDeltaContent = read('full-rotation-delta.vbp.md')
const execCsvContent = read('execution_bar_data.rolling.csv')
const mgi = JSON.parse(read('mgi_static_levels.json')) as MgiStaticLevels

const NOW = '2026-06-16T16:00:00Z'

function facts(overrides: Partial<Parameters<typeof computeEngineFacts>[0]> = {}) {
  return computeEngineFacts({
    rotationVbpContent,
    balanceAreaVbpContent,
    halfRotationDeltaContent,
    fullRotationDeltaContent,
    execCsvContent,
    mgi,
    receivedAt: NOW,
    now: NOW,
    ...overrides,
  })
}

describe('computeEngineFacts', () => {
  it('computes every engine fact from the real export fixtures', () => {
    const result = facts()

    expect(result.currentPrice).toBe(mgi.current!.price)
    expect(result.deltaTelemetry.barCount).toBeGreaterThan(0)
    expect(result.mgi.levels.length).toBeGreaterThan(0)
    expect(result.magnetCheck.magnets.length).toBeGreaterThan(0)
    expect(result.terrain.zones.length).toBeGreaterThan(0)
  })

  it('runs the fakeout-tail formation test against the rotation profile (feat-075)', () => {
    const result = facts()
    expect(Array.isArray(result.fakeoutTails)).toBe(true)
    // Any flagged extreme must name a real rotation-profile LVN node as its edge
    // and carry thin-tail evidence — the fixture itself may legitimately flag none.
    const rotationLvnPrices = result.lvn.rotation.lvn.map((n) => n.price)
    for (const tail of result.fakeoutTails) {
      expect(rotationLvnPrices).toContain(tail.acceptanceEdge.price)
      expect(tail.tailSpanPts).toBeGreaterThan(0)
      expect(tail.maxTailBinFrac).toBeLessThan(1)
    }
  })

  it('detects LVN/HVN nodes independently on both volume profiles', () => {
    const result = facts()
    for (const source of ['rotation', 'balanceArea'] as const) {
      const nodes = result.lvn[source]
      expect(nodes.hvn.length + nodes.lvn.length).toBeGreaterThan(0)
    }
    // Different profiles, different structure — the node sets must differ.
    expect(result.lvn.rotation).not.toEqual(result.lvn.balanceArea)
  })

  it('computes TPO facts from the numeric TPO export (feat-046)', () => {
    const result = facts({ tpoDataContent: read('tpo.data.md') })
    expect(result.tpo).not.toBeNull()
    expect(result.tpo!.poc).toEqual({ price: 29950, tpoCount: 7, prominence: 2.33, prominent: true })
    expect(result.tpo!.singlePrintZones).toEqual([{ top: 29986, bottom: 29964, letters: 'E' }])
    expect(result.tpo!.poorHigh).toEqual({ price: 30044, tpoCount: 2 })
    expect(result.warnings.some((w) => w.includes('TPO'))).toBe(false)
  })

  it('degrades to tpo:null with a warning when the TPO export is absent or malformed', () => {
    const absent = facts()
    expect(absent.tpo).toBeNull()
    expect(absent.warnings.some((w) => w.includes('no numeric TPO export'))).toBe(true)

    const malformed = facts({ tpoDataContent: 'not a tpo file' })
    expect(malformed.tpo).toBeNull()
    expect(malformed.warnings.some((w) => w.includes('tpo.data.md failed to parse'))).toBe(true)
  })

  it('computes value migration from the daily value-area history (feat-048)', () => {
    const result = facts({ dailyVaContent: read('daily-value-areas.csv') })
    expect(result.valueMigration).not.toBeNull()
    expect(result.valueMigration!.priorDay.date).toBe('2026-06-15')
    expect(result.valueMigration!.pocDrift).toEqual({
      direction: 'up',
      pointsPerDay: 20,
      windowSessions: 5,
    })
    // Fixture current price 29945.75 sits inside the prior day's 29800–29962 value area.
    expect(result.valueMigration!.currentPriceVsPriorValue).toEqual({
      position: 'inside',
      pointsOutside: 0,
    })
    expect(result.warnings.some((w) => w.includes('value migration'))).toBe(false)
  })

  it('degrades to valueMigration:null with a warning when the history is absent or malformed', () => {
    const absent = facts()
    expect(absent.valueMigration).toBeNull()
    expect(absent.warnings.some((w) => w.includes('no daily value-area history'))).toBe(true)

    const malformed = facts({ dailyVaContent: 'not a value-area csv' })
    expect(malformed.valueMigration).toBeNull()
    expect(
      malformed.warnings.some((w) => w.includes('daily-value-areas.csv failed to parse')),
    ).toBe(true)
  })

  it('computes daily ranges alongside value migration (feat-060)', () => {
    const result = facts({ dailyVaContent: read('daily-value-areas.csv') })
    expect(result.dailyRanges).not.toBeNull()
    expect(result.dailyRanges!.days[0]).toEqual({ date: '2026-06-15', rangePts: 379 })
    expect(result.dailyRanges!.days).toHaveLength(8)
    // Recent 3 (379/240/251 → 290) vs prior 5 (mean 234): expanding.
    expect(result.dailyRanges!.meanRecentPts).toBe(290)
    expect(result.dailyRanges!.meanPriorPts).toBe(234)
    expect(result.dailyRanges!.read).toBe('expanding')
    // The day-by-day value series rides along on valueMigration.
    expect(result.valueMigration!.recentSessions).toHaveLength(8)
    expect(result.valueMigration!.recentSessions[0].date).toBe('2026-06-15')
  })

  it('degrades to dailyRanges:null together with valueMigration when the history is missing', () => {
    const absent = facts()
    expect(absent.dailyRanges).toBeNull()
    const malformed = facts({ dailyVaContent: 'not a value-area csv' })
    expect(malformed.dailyRanges).toBeNull()
  })

  it('computes HTF structure from the 30-min bar export (feat-049)', () => {
    const result = facts({ htfCsvContent: read('htf_bar_data.rolling.csv') })
    expect(result.htfStructure).not.toBeNull()
    // The fixture reproduces the 2026-07-29 incident shape: the lagging swing
    // sequence says down while the MGI price (29945.75) is already above the
    // defining swing high — integrity flags it broken in real time (feat-064).
    expect(result.htfStructure!.trend).toEqual({
      state: 'down',
      basis: 'lower swing highs and lower swing lows',
      integrity: 'broken',
      integrityBasis: expect.stringMatching(/traded above the .* defining swing high/),
    })
    expect(result.htfStructure!.atrPoints).toBeGreaterThan(0)
    expect(result.htfStructure!.recentSwingHighs.length).toBeGreaterThan(0)
    expect(result.htfStructure!.rotation).not.toBeNull()
    // Distances are measured from the MGI current price (29945.75), not the last close.
    const lastSwingHigh = result.htfStructure!.recentSwingHighs[0]
    expect(result.htfStructure!.currentVsSwings.fromLastSwingHighPts).toBe(
      Math.round((mgi.current!.price! - lastSwingHigh.price) * 100) / 100,
    )
    expect(result.warnings.some((w) => w.includes('HTF structure'))).toBe(false)
  })

  it('degrades to htfStructure:null with a warning when the HTF export is absent or malformed', () => {
    const absent = facts()
    expect(absent.htfStructure).toBeNull()
    expect(absent.warnings.some((w) => w.includes('no HTF bar data'))).toBe(true)

    const malformed = facts({ htfCsvContent: 'not an htf csv' })
    expect(malformed.htfStructure).toBeNull()
    expect(
      malformed.warnings.some((w) => w.includes('htf_bar_data.rolling.csv failed to parse')),
    ).toBe(true)
  })

  it('computes the overnight session from the full-24h HTF bars (feat-060)', () => {
    const result = facts({ htfCsvContent: read('htf_bar_data.rolling.csv') })
    expect(result.overnightSession).not.toBeNull()
    expect(result.overnightSession!.sessionDate).toBe('2026-07-28')
    expect(result.overnightSession!.overnight.high).toBe(28228)
    expect(result.overnightSession!.overnight.low).toBe(27839.5)
    expect(result.overnightSession!.overnight.rangePts).toBe(388.5)
    expect(result.overnightSession!.rthSoFar).toMatchObject({ open: 27948.75, barCount: 10 })
    expect(result.warnings.some((w) => w.includes('overnight'))).toBe(false)
  })

  it('degrades to overnightSession:null with a warning on an RTH-only HTF export', () => {
    // Two RTH-hours bars only — parses fine, but carries no overnight session.
    const rthOnly = [
      'DateTime,Open,High,Low,Close,Volume,BidVolume,AskVolume',
      '2026-07-28 09:00:00,28000.00,28010.00,27990.00,28005.00,1000,500,500',
      '2026-07-28 09:30:00,28005.00,28015.00,27995.00,28010.00,1000,500,500',
    ].join('\n')
    const result = facts({ htfCsvContent: rthOnly })
    expect(result.htfStructure).not.toBeNull()
    expect(result.overnightSession).toBeNull()
    expect(result.warnings.some((w) => w.includes('no overnight bars'))).toBe(true)
  })

  it('computes relative volume from the HTF bars own history (feat-094)', () => {
    const result = facts({
      htfCsvContent: read('htf_bar_data.rolling.csv'),
      dailyVaContent: read('daily-value-areas.csv'),
    })
    const rv = result.relativeVolume
    expect(rv).not.toBeNull()
    expect(rv!.sessionDate).toBe('2026-07-28')

    // The headline scalar is the latest COMPLETED 30-min slot against the
    // median of that same clock slot over the export's prior sessions.
    expect(rv!.participation).not.toBeNull()
    expect(rv!.participation!.source).toBe('slot')
    expect(rv!.current!.slot).toBe('12:30')
    expect(rv!.current!.baselineSessions).toBeGreaterThanOrEqual(10)
    expect(rv!.current!.rvol).toBeCloseTo(rv!.current!.volume / rv!.current!.baselineVolume!, 2)
    expect(rv!.participation!.rvol).toBe(rv!.current!.rvol)

    // In-progress final bar is never measured; the series runs newest-first.
    expect(rv!.recentSlots[0].slot).toBe('12:30')
    expect(rv!.recentSlots.map((s) => s.slot)).not.toContain('13:00')
    expect(rv!.recentSlots.length).toBeLessThanOrEqual(6)

    // Session-so-far is measured against the time-of-day expectation, not a
    // whole-day median — the same seam feat-089's maturity qualifier reuses.
    expect(rv!.sessionSoFar!.throughSlot).toBe('12:30')
    expect(rv!.sessionSoFar!.expectedFraction).toBeGreaterThan(0)
    expect(rv!.sessionSoFar!.expectedFraction).toBeLessThanOrEqual(1)
    expect(rv!.sessionSoFar!.rvol).toBeCloseTo(
      rv!.sessionSoFar!.volume / rv!.sessionSoFar!.expectedVolume,
      2,
    )

    // The day-level companion comes from daily-value-areas.csv's SessionVolume.
    expect(rv!.daily).not.toBeNull()
    expect(rv!.daily!.medianSessionVolume).toBeGreaterThan(0)
    expect(result.warnings.some((w) => w.includes('relative-volume'))).toBe(false)
  })

  it('degrades to relativeVolume:null / a null participation when history is thin (feat-094)', () => {
    expect(facts().relativeVolume).toBeNull()

    // Parses fine and yields an HTF structure, but no slot has any history.
    const twoBars = [
      'DateTime,Open,High,Low,Close,Volume,BidVolume,AskVolume',
      '2026-07-28 09:00:00,28000.00,28010.00,27990.00,28005.00,1000,500,500',
      '2026-07-28 09:30:00,28005.00,28015.00,27995.00,28010.00,1000,500,500',
    ].join('\n')
    const thin = facts({ htfCsvContent: twoBars })
    expect(thin.relativeVolume).not.toBeNull()
    expect(thin.relativeVolume!.participation).toBeNull()
    expect(thin.relativeVolume!.recentSlots[0].rvol).toBeNull()
    expect(thin.warnings.some((w) => w.includes('relative-volume read'))).toBe(true)
  })

  it('reports POC/VAH/VAL per volume profile', () => {
    const result = facts()
    expect(result.profileSummary.rotation.pocPrice).toBe(29900)
    expect(result.profileSummary.balanceArea.pocPrice).toBe(29950)
    expect(result.profileSummary.balanceArea.valueAreaHigh).toBe(30310)
    expect(result.profileSummary.balanceArea.valueAreaLow).toBe(29496)
  })

  it('builds the magnet set once from the balance-area profile and shares it with terrain', () => {
    const result = facts()
    // POC/VAH/VAL magnets carry the balance-area summary, not the rotation's.
    const summaryPrices = result.magnetCheck.magnets
      .filter((m) => m.kind !== 'hvn')
      .map((m) => m.price)
      .sort((a, b) => a - b)
    expect(summaryPrices).toEqual([29496, 29950, 30310])
    // Same set — the canonical magnetCheck list additionally carries the
    // feat-050 build annotation; terrain embeds the lean objects.
    expect(result.terrain.magnets).toEqual(
      result.magnetCheck.magnets.map(({ build: _build, ...lean }) => lean),
    )
  })

  it('annotates nodes and magnets with build quality from the delta split (feat-050)', () => {
    const result = facts()
    for (const profile of [result.lvn.rotation, result.lvn.balanceArea]) {
      for (const node of [...profile.hvn, ...profile.lvn]) {
        expect(node.build).not.toBeNull()
        expect(['buyer-built', 'seller-built', 'balanced']).toContain(node.build!.classification)
        expect(Math.abs(node.build!.ratio)).toBeLessThanOrEqual(1)
      }
    }
    for (const magnet of result.magnetCheck.magnets) {
      expect(magnet.build).not.toBeNull()
    }
    expect(result.warnings.some(w => w.includes('no Delta column'))).toBe(false)
  })

  it('degrades to build: null + a warning on pre-delta profile exports', () => {
    const stripDelta = (content: string) =>
      content
        .replace('Price,Volume,Delta', 'Price,Volume')
        .replace(/^(\d+\.\d+,\d+),-?\d+$/gm, '$1')
    const result = facts({
      rotationVbpContent: stripDelta(read('four-hundred-rotation.vbp.md')),
      balanceAreaVbpContent: stripDelta(read('balance-area.vbp.md')),
    })
    for (const node of [...result.lvn.rotation.hvn, ...result.lvn.balanceArea.lvn]) {
      expect(node.build).toBeNull()
    }
    for (const magnet of result.magnetCheck.magnets) {
      expect(magnet.build).toBeNull()
    }
    expect(
      result.warnings.filter(w => w.includes('no Delta column — node build quality not computed')),
    ).toHaveLength(2)
  })

  it('scans both delta exports for absorption candidates (one in the real fixtures)', () => {
    // The full-rotation fixture carries a 3-of-4 buy stack, visible since the
    // qualifying fraction was loosened to 0.7 (operator doctrine, 2026-07-18).
    const result = facts()
    expect(result.absorption.candidates.map(c => [c.source, c.top, c.side])).toEqual([
      ['full-rotation', 29830.5, 'buy'],
    ])
  })

  it('surfaces absorption candidates when a delta export carries a qualifying stack', () => {
    // Turn three adjacent half-rotation bins into a one-sided stack at the
    // doctrine threshold; the real export has no such run.
    const stacked = halfRotationDeltaContent
      .replace('29949.75,7', '29949.75,80')
      .replace('29947.50,34', '29947.50,90')
      .replace('29945.25,30', '29945.25,75')
    const result = facts({ halfRotationDeltaContent: stacked })
    // Price-descending: the injected half-rotation stack tops the fixture's
    // resident full-rotation candidate.
    expect(result.absorption.candidates).toHaveLength(2)
    expect(result.absorption.candidates[0]).toMatchObject({
      source: 'half-rotation',
      side: 'buy',
      top: 29949.75,
      binCount: 3,
    })
  })

  it('resolves the Rip condition from mgi.daily.rip', () => {
    const result = facts()
    expect(result.ripStatus).not.toBeNull()
    expect(['green', 'yellow', 'red']).toContain(result.ripStatus!.condition)
    expect(result.ripStatus!.rip).toBe(mgi.daily!.rip)
  })

  it('degrades to a warning when the rip is absent', () => {
    const result = facts({ mgi: { ...mgi, daily: { ...mgi.daily, rip: undefined } } })
    expect(result.ripStatus).toBeNull()
    expect(result.warnings.some((w) => w.includes('rip'))).toBe(true)
  })

  it('flags a fresh bundle as fresh and an old one as stale', () => {
    expect(facts().staleness.isStale).toBe(false)

    const stale = facts({ receivedAt: '2026-06-16T15:00:00Z' })
    expect(stale.staleness.isStale).toBe(true)
    expect(stale.warnings.length).toBeGreaterThan(0)
  })

  it('throws on a malformed bundle rather than briefing from bad facts', () => {
    expect(() => facts({ rotationVbpContent: halfRotationDeltaContent })).toThrow()
    expect(() => facts({ fullRotationDeltaContent: balanceAreaVbpContent })).toThrow()
  })
})

describe('engineZoneBorders', () => {
  it('returns the deduped zone borders price-descending', () => {
    const result = facts()
    const borders = engineZoneBorders(result.terrain)

    expect(borders.length).toBeGreaterThan(1)
    expect([...borders].sort((a, b) => b - a)).toEqual(borders)
    expect(new Set(borders).size).toBe(borders.length)
    expect(borders).toContain(result.terrain.zones[0].top)
    expect(borders).toContain(result.terrain.zones.at(-1)!.bottom)
  })
})

describe('engineAnchorPrices', () => {
  it('includes detector LVN node prices from both profiles when node facts are supplied (feat-074)', () => {
    const result = facts()
    const anchors = engineAnchorPrices(result.terrain, result.lvn)

    for (const source of ['rotation', 'balanceArea'] as const) {
      for (const node of result.lvn[source].lvn) {
        if (result.terrain.dataEdges.includes(node.price)) continue
        expect(anchors).toContain(node.price)
      }
    }
    expect([...anchors].sort((a, b) => b - a)).toEqual(anchors)
    expect(new Set(anchors).size).toBe(anchors.length)
  })

  it('never admits HVN peaks that are not already terrain structure', () => {
    const result = facts()
    const withNodes = new Set(engineAnchorPrices(result.terrain, result.lvn))
    const withoutNodes = new Set(engineAnchorPrices(result.terrain))

    const added = [...withNodes].filter((price) => !withoutNodes.has(price))
    const lvnPrices = new Set(
      [...result.lvn.rotation.lvn, ...result.lvn.balanceArea.lvn].map((n) => n.price),
    )
    expect(added.length).toBeGreaterThan(0)
    for (const price of added) {
      expect(lvnPrices.has(price)).toBe(true)
    }
  })

  it('still filters profile data edges out of the anchor set', () => {
    const result = facts()
    const anchors = engineAnchorPrices(result.terrain, result.lvn)
    for (const edge of result.terrain.dataEdges) {
      expect(anchors).not.toContain(edge)
    }
  })
})
