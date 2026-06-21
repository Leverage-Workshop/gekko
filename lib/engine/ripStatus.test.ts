import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { computeRipStatus } from './ripStatus'

const FIXTURE = join(process.cwd(), 'chart-data/mgi_static_levels.json')

type MgiShape = { current?: { price?: number }; daily?: { rip?: number } }

function loadFixture(): MgiShape {
  return JSON.parse(readFileSync(FIXTURE, 'utf8')) as MgiShape
}

describe('computeRipStatus — fixture', () => {
  const mgi = loadFixture()
  const currentPrice = mgi.current!.price!
  const rip = mgi.daily!.rip!

  it('fixture price (30436.25) is below the Rip (30632.53)', () => {
    expect(currentPrice).toBe(30436.25)
    expect(rip).toBe(30632.53)
    const r = computeRipStatus({ currentPrice, rip, deltaIntensity: 0 })
    expect(r.position).toBe('below')
    expect(r.distance).toBe(round2(currentPrice - rip)) // negative
    expect(r.distance).toBeLessThan(0)
  })

  it('below the Rip without extreme red → Yellow (breach, not flipped)', () => {
    const r = computeRipStatus({ currentPrice, rip, deltaIntensity: -2 })
    expect(r.condition).toBe('yellow')
    expect(r.redInitiative).toBe(false)
    expect(r.headline).toMatch(/Yellow/)
  })

  it('below the Rip with extreme red (-3/-4) → Red (control flipped)', () => {
    const r3 = computeRipStatus({ currentPrice, rip, deltaIntensity: -3 })
    const r4 = computeRipStatus({ currentPrice, rip, deltaIntensity: -4 })
    expect(r3.condition).toBe('red')
    expect(r4.condition).toBe('red')
    expect(r3.redInitiative).toBe(true)
    expect(r3.headline).toMatch(/Red/)
  })
})

describe('computeRipStatus — conditions', () => {
  it('price above the Rip → Green regardless of delta', () => {
    const green = computeRipStatus({ currentPrice: 30700, rip: 30632.53, deltaIntensity: -4 })
    expect(green.condition).toBe('green')
    expect(green.position).toBe('above')
    expect(green.distance).toBeGreaterThan(0)
    expect(green.headline).toMatch(/Green/)
    // DO NOT FADE doctrine survives in the action even with extreme red present.
    expect(green.action).toMatch(/DO NOT FADE/)
  })

  it('price within one tick of the Rip → at → Green (defensive line holds)', () => {
    const onTick = computeRipStatus({ currentPrice: 30632.53 - 0.25, rip: 30632.53, deltaIntensity: -4 })
    expect(onTick.position).toBe('at')
    expect(onTick.condition).toBe('green')
    const exact = computeRipStatus({ currentPrice: 30632.53, rip: 30632.53, deltaIntensity: -4 })
    expect(exact.position).toBe('at')
    expect(exact.condition).toBe('green')
  })

  it('just over one tick below the Rip → below (breach)', () => {
    const r = computeRipStatus({ currentPrice: 30632.53 - 0.5, rip: 30632.53, deltaIntensity: 0 })
    expect(r.position).toBe('below')
    expect(r.condition).toBe('yellow')
  })

  it('just over one tick above the Rip → above (Green)', () => {
    const r = computeRipStatus({ currentPrice: 30632.53 + 0.5, rip: 30632.53, deltaIntensity: -4 })
    expect(r.position).toBe('above')
    expect(r.condition).toBe('green')
  })

  it('red threshold is exactly -3 (a -2.99 breach stays Yellow)', () => {
    const r = computeRipStatus({ currentPrice: 30000, rip: 30100, deltaIntensity: -2.99 })
    expect(r.redInitiative).toBe(false)
    expect(r.condition).toBe('yellow')
  })

  it('extreme red above the Rip is still Green (Red requires being below)', () => {
    const r = computeRipStatus({ currentPrice: 30200, rip: 30100, deltaIntensity: -4 })
    expect(r.redInitiative).toBe(true)
    expect(r.condition).toBe('green')
  })

  it('signed distance and round2 are correct', () => {
    const r = computeRipStatus({ currentPrice: 30100.005, rip: 30000, deltaIntensity: 0 })
    expect(r.distance).toBe(100.01)
  })
})

describe('computeRipStatus — validation', () => {
  it('throws on non-finite current price', () => {
    expect(() => computeRipStatus({ currentPrice: NaN, rip: 30000, deltaIntensity: 0 })).toThrow(
      /current price/,
    )
  })

  it('throws on non-finite Rip', () => {
    expect(() => computeRipStatus({ currentPrice: 30000, rip: NaN, deltaIntensity: 0 })).toThrow(
      /Rip/,
    )
  })

  it('throws on non-finite deltaIntensity', () => {
    expect(() =>
      computeRipStatus({ currentPrice: 30000, rip: 30100, deltaIntensity: NaN }),
    ).toThrow(/deltaIntensity/)
  })
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
