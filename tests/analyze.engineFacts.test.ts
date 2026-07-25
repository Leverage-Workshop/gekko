import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeEngineFacts, engineZoneBorders } from '@/lib/analyze'
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
    expect(result.terrain.magnets).toEqual(result.magnetCheck.magnets)
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
