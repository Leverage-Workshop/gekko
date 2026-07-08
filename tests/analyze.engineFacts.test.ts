import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { computeEngineFacts, engineZoneBorders } from '@/lib/analyze'
import type { MgiStaticLevels } from '@/lib/engine/mgiPriority'

const vbpContent = readFileSync(join(process.cwd(), 'chart-data/vbp_export.md'), 'utf-8')
const deltaContent = readFileSync(
  join(process.cwd(), 'chart-data/delta_vbp_export.md'),
  'utf-8',
)
const execCsvContent = readFileSync(
  join(process.cwd(), 'chart-data/execution_bar_data.rolling.csv'),
  'utf-8',
)
const mgi = JSON.parse(
  readFileSync(join(process.cwd(), 'chart-data/mgi_static_levels.json'), 'utf-8'),
) as MgiStaticLevels

const NOW = '2026-06-16T16:00:00Z'

function facts(overrides: Partial<Parameters<typeof computeEngineFacts>[0]> = {}) {
  return computeEngineFacts({
    vbpContent,
    deltaContent,
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
    expect(result.lvn.hvn.length + result.lvn.lvn.length).toBeGreaterThan(0)
    expect(result.magnetCheck.magnets.length).toBeGreaterThan(0)
    expect(result.terrain.zones.length).toBeGreaterThan(0)
    expect(result.profileSummary.pocPrice).toBe(30236.25)
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
    expect(() => facts({ vbpContent: deltaContent })).toThrow()
  })

  it('warns when the VbP/Delta bin grids do not join (delta null on every row)', () => {
    // Shift every delta CSV bin price by half a bin: spacing stays valid, but
    // no price matches the VbP grid, so the join yields delta:null throughout.
    const shifted = deltaContent.replace(
      /^(\d+\.\d{2}),/gm,
      (_line, price: string) => `${(Number(price) + 0.5).toFixed(2)},`,
    )
    const result = facts({ deltaContent: shifted })

    expect(result.warnings.some((w) => w.includes('bin-grid'))).toBe(true)
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
