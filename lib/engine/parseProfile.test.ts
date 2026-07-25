import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parseDeltaProfile, parseVbpProfile } from './parseProfile'

const read = (name: string) => readFileSync(join(process.cwd(), 'chart-data', name), 'utf-8')

const rotationVbp = read('four-hundred-rotation.vbp.md')
const balanceAreaVbp = read('balance-area.vbp.md')
const halfRotationDelta = read('half-rotation-delta.vbp.md')
const fullRotationDelta = read('full-rotation-delta.vbp.md')

describe('parseVbpProfile', () => {
  it('parses the 400-pt rotation export (bin 4 → 1.0-pt step)', () => {
    const { rows, meta } = parseVbpProfile(rotationVbp)
    expect(meta.tickSize).toBe(0.25)
    expect(meta.binSize).toBe(4)
    expect(meta.step).toBe(1)
    expect(meta.pocPrice).toBe(29900)
    expect(meta.valueAreaHigh).toBe(29995)
    expect(meta.valueAreaLow).toBe(29361)
    expect(rows).toHaveLength(1163)
    expect(rows[0]).toEqual({ price: 30072, volume: 17, delta: 6 })
    expect(rows[rows.length - 1]).toEqual({ price: 28910, volume: 5, delta: 1 })
  })

  it('parses the balance-area export (bin 8 → 2.0-pt step)', () => {
    const { rows, meta } = parseVbpProfile(balanceAreaVbp)
    expect(meta.step).toBe(2)
    expect(meta.pocPrice).toBe(29950)
    expect(rows).toHaveLength(823)
    expect(rows[0]).toEqual({ price: 30554, volume: 3, delta: 1 })
    expect(rows[rows.length - 1]).toEqual({ price: 28910, volume: 8, delta: 2 })
  })

  it('still parses a pre-delta Price,Volume export (deploy-window compatibility)', () => {
    const twoCol = rotationVbp.replace('Price,Volume,Delta', 'Price,Volume').replace(
      /^(\d+\.\d+,\d+),-?\d+$/gm,
      '$1',
    )
    const { rows } = parseVbpProfile(twoCol)
    expect(rows).toHaveLength(1163)
    expect(rows[0]).toEqual({ price: 30072, volume: 17 })
    expect(rows[0]).not.toHaveProperty('delta')
  })

  it('rejects an unknown 3rd column header', () => {
    const bad = rotationVbp.replace('Price,Volume,Delta', 'Price,Volume,Trades')
    expect(() => parseVbpProfile(bad)).toThrow('Unknown 3rd CSV column header "Trades"')
  })

  it('rejects a delta-header profile with a missing delta cell', () => {
    const bad = rotationVbp.replace('30072.00,17,6', '30072.00,17')
    expect(() => parseVbpProfile(bad)).toThrow('fewer than 3 columns')
  })

  it('throws when handed a Delta profile', () => {
    expect(() => parseVbpProfile(halfRotationDelta)).toThrow(
      'Expected a Volume (VbP) profile, got a Delta profile',
    )
  })
})

describe('parseDeltaProfile', () => {
  it('parses the half-rotation export (bin 9 → 2.25-pt step)', () => {
    const { rows, meta } = parseDeltaProfile(halfRotationDelta)
    expect(meta.tickSize).toBe(0.25)
    expect(meta.binSize).toBe(9)
    expect(meta.step).toBe(2.25)
    expect(meta.pocPrice).toBe(29877.75)
    expect(rows).toHaveLength(43)
    expect(rows[0]).toEqual({ price: 29949.75, delta: 7 })
    expect(rows[rows.length - 1]).toEqual({ price: 29855.25, delta: -8 })
  })

  it('parses the full-rotation export, preserving negative deltas', () => {
    const { rows } = parseDeltaProfile(fullRotationDelta)
    expect(rows).toHaveLength(66)
    expect(rows.find(r => r.price === 29943)).toEqual({ price: 29943, delta: -70 })
    expect(rows[rows.length - 1]).toEqual({ price: 29803.5, delta: -3 })
  })

  it('throws when handed a Volume profile', () => {
    expect(() => parseDeltaProfile(balanceAreaVbp)).toThrow(
      'Expected a Delta profile, got a Volume (VbP) profile',
    )
  })
})

describe('shared profile-file validation', () => {
  it('still rejects a row-spacing violation', () => {
    const broken = halfRotationDelta.replace('29947.50,34', '29947.25,34')
    expect(() => parseDeltaProfile(broken)).toThrow('Row spacing violation')
  })

  it('still rejects a missing csv block', () => {
    const noCsv = balanceAreaVbp.replace(/```csv[\s\S]*```/, '')
    expect(() => parseVbpProfile(noCsv)).toThrow('No fenced ```csv block')
  })
})
