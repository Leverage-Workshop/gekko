import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeEngineFacts, engineZoneBorders } from '@/lib/analyze'
import { buildAnalysisPrompt, campaignBoundaryRule } from '@/lib/analyze/prompt'
import type { MgiStaticLevels } from '@/lib/engine/mgiPriority'

/**
 * Terrain regression harness against the two preserved Gem comparison bundles
 * (docs/gem-comparison-2026-07-14.md and docs/gem-comparison-2026-07-18.md).
 * Each fixture folder holds the exact export bundle a Gem briefing was compared
 * against; after any terrain change the engine map must stay aligned with the
 * Gem's structural read of the same data.
 */

const NOW = '2026-07-18T16:12:02Z'

function loadFacts(dir: string) {
  const read = (name: string) => readFileSync(join(process.cwd(), dir, name), 'utf-8')
  return computeEngineFacts({
    rotationVbpContent: read('four-hundred-rotation.vbp.md'),
    balanceAreaVbpContent: read('balance-area.vbp.md'),
    halfRotationDeltaContent: read('half-rotation-delta.vbp.md'),
    fullRotationDeltaContent: read('full-rotation-delta.vbp.md'),
    execCsvContent: read('execution_bar_data.rolling.csv'),
    mgi: JSON.parse(read('mgi_static_levels.json')) as MgiStaticLevels,
    receivedAt: NOW,
    now: NOW,
  })
}

describe('2026-07-18 bundle — price at the session low (G1/G2/G4)', () => {
  const facts = loadFacts('chart-data/comparison-examples/example2/data')
  const borders = engineZoneBorders(facts.terrain)

  it('keeps the IBL working border', () => {
    expect(borders).toContain(29639.25)
  })

  it('partitions the floor at the PDL / VRange −2 band (the Gem foundation shelf)', () => {
    expect(borders.some(p => p >= 29565.25 && p <= 29567.5)).toBe(true)
  })

  it('mints NO tradeable border at the session low (the rotation profile data edge)', () => {
    expect(borders.some(p => p >= 29586 && p <= 29588)).toBe(false)
    expect(facts.terrain.dataEdges).not.toContain(29587)
  })

  it('leaves no undivided void spanning from the session low to PW Low', () => {
    const abyssward = facts.terrain.zones.find(z => z.bottom === 28909.75)
    expect(abyssward).toBeDefined()
    expect(abyssward!.top).toBeLessThan(29587)
  })

  it('keeps the stack contiguous', () => {
    expect(facts.terrain.contiguityValid).toBe(true)
    expect(facts.terrain.issues).toEqual([])
  })

  it('prompts the Campaign Boundary Override check near the Tier-1 floor', () => {
    expect(campaignBoundaryRule(facts)).toContain('CAMPAIGN BOUNDARY CHECK')
    const prompt = buildAnalysisPrompt({
      triggerReason: 'test',
      now: NOW,
      facts,
      rawMgi: {},
      charts: [],
      rrMin: 3,
    })
    expect(prompt).toContain('CAMPAIGN BOUNDARY CHECK')
  })
})

describe('2026-07-14 bundle — mid-range session (F1–F5 must not regress)', () => {
  const facts = loadFacts('chart-data/comparison-examples/2026-07-14/09-45/data')
  const borders = engineZoneBorders(facts.terrain)

  it('keeps the IBH/IBL working walls of the post-F1–F6 map', () => {
    expect(borders).toContain(29815.75)
    expect(borders).toContain(29567.5)
  })

  it('stays contiguous with no sliver zones', () => {
    expect(facts.terrain.contiguityValid).toBe(true)
    for (const zone of facts.terrain.zones) {
      expect(zone.top - zone.bottom).toBeGreaterThan(4)
    }
  })

  it('keeps at least the 8-zone resolution of the tuned map', () => {
    expect(facts.terrain.zones.length).toBeGreaterThanOrEqual(8)
  })
})
