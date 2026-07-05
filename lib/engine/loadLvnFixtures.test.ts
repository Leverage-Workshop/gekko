import { describe, it, expect } from 'vitest'
import {
  loadLvnFixtures,
  loadManifest,
  validateLabels,
  type LvnLabels,
} from './loadLvnFixtures'

describe('loadLvnFixtures — manifest + fixtures', () => {
  it('loads every fixture named in the manifest', () => {
    const manifest = loadManifest()
    const { fixtures } = loadLvnFixtures()
    expect(fixtures).toHaveLength(manifest.length)
    expect(fixtures.map(f => f.id)).toEqual(manifest.map(m => m.id))
  })

  it('splits into 5 train / 3 holdout', () => {
    const { fixtures } = loadLvnFixtures()
    expect(fixtures.filter(f => f.split === 'train')).toHaveLength(5)
    expect(fixtures.filter(f => f.split === 'holdout')).toHaveLength(3)
  })

  it('has both LVN types in both splits (guards silent overfitting)', () => {
    const { fixtures } = loadLvnFixtures()
    for (const split of ['train', 'holdout'] as const) {
      const types = new Set(
        fixtures.filter(f => f.split === split).map(f => f.primaryLvnType),
      )
      expect(types.has('valley')).toBe(true)
      expect(types.has('taper-edge')).toBe(true)
    }
  })

  it('every fixture parses with a non-empty descending profile and labels', () => {
    const { fixtures } = loadLvnFixtures()
    for (const f of fixtures) {
      expect(f.rows.length).toBeGreaterThan(0)
      expect(f.priceRange.max).toBeGreaterThan(f.priceRange.min)
      expect(f.labels.lvn.length + f.labels.hvn.length).toBeGreaterThan(0)
    }
  })
})

describe('loadLvnFixtures — label validation (feat-033 guard)', () => {
  it('reports zero issues across the whole fixture set', () => {
    const { issues } = loadLvnFixtures()
    expect(issues).toEqual([])
  })

  it('strict mode does not throw on the clean set', () => {
    expect(() => loadLvnFixtures({ strict: true })).not.toThrow()
  })

  it('flags an out-of-range label (the fixture-8 copy-paste class of bug)', () => {
    const rows = [{ price: 30070 }, { price: 30069 }, { price: 30068 }]
    const labels: LvnLabels = { lvn: [29576], hvn: [] }
    const issues = validateLabels('synthetic', rows, labels)
    expect(issues).toHaveLength(1)
    expect(issues[0].problem).toBe('out-of-range')
    expect(issues[0].nearestBin).toBe(30068)
  })

  it('flags an off-bin label that is within range but not an actual bin', () => {
    const rows = [{ price: 30070 }, { price: 30069 }, { price: 30068 }]
    const labels: LvnLabels = { lvn: [30069.5], hvn: [] }
    const issues = validateLabels('synthetic', rows, labels)
    expect(issues).toHaveLength(1)
    expect(issues[0].problem).toBe('off-bin')
  })

  it('accepts labels that snap exactly to bins', () => {
    const rows = [{ price: 30070 }, { price: 30069 }, { price: 30068 }]
    const labels: LvnLabels = { lvn: [30069], hvn: [30070] }
    expect(validateLabels('synthetic', rows, labels)).toEqual([])
  })
})
