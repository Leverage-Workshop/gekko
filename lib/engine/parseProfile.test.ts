import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { parseProfiles } from './parseProfile'

const vbpContent = readFileSync(join(process.cwd(), 'chart-data/vbp_export.md'), 'utf-8')
const deltaContent = readFileSync(join(process.cwd(), 'chart-data/delta_vbp_export.md'), 'utf-8')

describe('parseProfiles', () => {
  it('extracts VbP metadata correctly', () => {
    const { vbpMeta } = parseProfiles(vbpContent, deltaContent)
    expect(vbpMeta.tickSize).toBe(0.25)
    expect(vbpMeta.binSize).toBe(5)
    expect(vbpMeta.step).toBe(1.25)
    expect(vbpMeta.pocPrice).toBe(30236.25)
    expect(vbpMeta.valueAreaHigh).toBe(30246.25)
    expect(vbpMeta.valueAreaLow).toBe(30226.25)
  })

  it('extracts delta metadata correctly', () => {
    const { deltaMeta } = parseProfiles(vbpContent, deltaContent)
    expect(deltaMeta.pocPrice).toBe(30293.75)
    expect(deltaMeta.valueAreaHigh).toBe(30300.0)
    expect(deltaMeta.valueAreaLow).toBe(30245.0)
  })

  it('sets row count from VbP (left-join)', () => {
    const { rows } = parseProfiles(vbpContent, deltaContent)
    expect(rows).toHaveLength(33)
  })

  it('produces descending prices matching VbP', () => {
    const { rows } = parseProfiles(vbpContent, deltaContent)
    expect(rows[0].price).toBe(30258.75)
    expect(rows[rows.length - 1].price).toBe(30218.75)
  })

  it('populates delta for overlapping prices (spot check)', () => {
    const { rows } = parseProfiles(vbpContent, deltaContent)
    const row = rows.find(r => r.price === 30258.75)
    expect(row).toBeDefined()
    expect(row!.volume).toBe(19)
    expect(row!.delta).toBe(13)
  })

  it('sets delta to null for prices absent in delta profile', () => {
    const { rows } = parseProfiles(vbpContent, deltaContent)
    const row = rows.find(r => r.price === 30218.75)
    expect(row).toBeDefined()
    expect(row!.volume).toBe(42)
    expect(row!.delta).toBeNull()
  })

  it('throws when arguments are supplied in wrong order', () => {
    expect(() => parseProfiles(deltaContent, vbpContent)).toThrow(
      'First argument must be the Volume (VbP) profile',
    )
  })
})
