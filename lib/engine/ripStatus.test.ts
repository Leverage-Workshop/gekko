import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { computeRipStatus, RED_BUILDING_MIN_BARS } from './ripStatus'

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
    const r = computeRipStatus({ currentPrice, rip, deltaIntensity: 0, redExtremeCount: 0 })
    expect(r.position).toBe('below')
    expect(r.distance).toBe(round2(currentPrice - rip)) // negative
    expect(r.distance).toBeLessThan(0)
  })

  it('below the Rip without red extremes building → Yellow (breach, not flipped)', () => {
    const r = computeRipStatus({ currentPrice, rip, deltaIntensity: -2, redExtremeCount: 0 })
    expect(r.condition).toBe('yellow')
    expect(r.redInitiative).toBe(false)
    expect(r.headline).toMatch(/Yellow/)
  })

  it('below the Rip with red extremes building (count >= min bars) → Red (control flipped)', () => {
    const r = computeRipStatus({
      currentPrice,
      rip,
      deltaIntensity: -2.5,
      redExtremeCount: RED_BUILDING_MIN_BARS,
    })
    expect(r.condition).toBe('red')
    expect(r.redInitiative).toBe(true)
    expect(r.headline).toMatch(/Red/)
  })
})

describe('computeRipStatus — conditions', () => {
  it('price above the Rip → Green regardless of delta', () => {
    const green = computeRipStatus({
      currentPrice: 30700,
      rip: 30632.53,
      deltaIntensity: -4,
      redExtremeCount: 10,
    })
    expect(green.condition).toBe('green')
    expect(green.position).toBe('above')
    expect(green.distance).toBeGreaterThan(0)
    expect(green.headline).toMatch(/Green/)
    // DO NOT FADE doctrine survives in the action even with extreme red present.
    expect(green.action).toMatch(/DO NOT FADE/)
  })

  it('price within one tick of the Rip → at → Green (defensive line holds)', () => {
    const onTick = computeRipStatus({
      currentPrice: 30632.53 - 0.25,
      rip: 30632.53,
      deltaIntensity: -4,
      redExtremeCount: 10,
    })
    expect(onTick.position).toBe('at')
    expect(onTick.condition).toBe('green')
    const exact = computeRipStatus({
      currentPrice: 30632.53,
      rip: 30632.53,
      deltaIntensity: -4,
      redExtremeCount: 10,
    })
    expect(exact.position).toBe('at')
    expect(exact.condition).toBe('green')
  })

  it('just over one tick below the Rip → below (breach)', () => {
    const r = computeRipStatus({
      currentPrice: 30632.53 - 0.5,
      rip: 30632.53,
      deltaIntensity: 0,
      redExtremeCount: 0,
    })
    expect(r.position).toBe('below')
    expect(r.condition).toBe('yellow')
  })

  it('just over one tick above the Rip → above (Green)', () => {
    const r = computeRipStatus({
      currentPrice: 30632.53 + 0.5,
      rip: 30632.53,
      deltaIntensity: -4,
      redExtremeCount: 10,
    })
    expect(r.position).toBe('above')
    expect(r.condition).toBe('green')
  })

  it('the Red flip is exactly at RED_BUILDING_MIN_BARS extremes (one fewer stays Yellow)', () => {
    // A single rogue -4 print on a 750-volume bar must NOT flip the condition: even with the
    // most extreme representative reading, count below the minimum reads Yellow.
    const rogue = computeRipStatus({
      currentPrice: 30000,
      rip: 30100,
      deltaIntensity: -4,
      redExtremeCount: RED_BUILDING_MIN_BARS - 1,
    })
    expect(rogue.redInitiative).toBe(false)
    expect(rogue.condition).toBe('yellow')

    const flipped = computeRipStatus({
      currentPrice: 30000,
      rip: 30100,
      deltaIntensity: -1.5,
      redExtremeCount: RED_BUILDING_MIN_BARS,
    })
    expect(flipped.redInitiative).toBe(true)
    expect(flipped.condition).toBe('red')
  })

  it('a saturated mean without clustered extremes no longer decides the flip', () => {
    // The mean is display context only — Red is decided by the count.
    const r = computeRipStatus({
      currentPrice: 30000,
      rip: 30100,
      deltaIntensity: -3.5,
      redExtremeCount: 0,
    })
    expect(r.redInitiative).toBe(false)
    expect(r.condition).toBe('yellow')
    expect(r.deltaIntensity).toBe(-3.5) // still carried through for display
  })

  it('extremes building above the Rip is still Green (Red requires being below)', () => {
    const r = computeRipStatus({
      currentPrice: 30200,
      rip: 30100,
      deltaIntensity: -4,
      redExtremeCount: 10,
    })
    expect(r.redInitiative).toBe(true)
    expect(r.condition).toBe('green')
  })

  it('signed distance and round2 are correct', () => {
    const r = computeRipStatus({
      currentPrice: 30100.005,
      rip: 30000,
      deltaIntensity: 0,
      redExtremeCount: 0,
    })
    expect(r.distance).toBe(100.01)
  })

  it('redExtremeCount is echoed in the result', () => {
    const r = computeRipStatus({
      currentPrice: 30000,
      rip: 30100,
      deltaIntensity: -2,
      redExtremeCount: 5,
    })
    expect(r.redExtremeCount).toBe(5)
  })
})

describe('computeRipStatus — validation', () => {
  it('throws on non-finite current price', () => {
    expect(() =>
      computeRipStatus({ currentPrice: NaN, rip: 30000, deltaIntensity: 0, redExtremeCount: 0 }),
    ).toThrow(/current price/)
  })

  it('throws on non-finite Rip', () => {
    expect(() =>
      computeRipStatus({ currentPrice: 30000, rip: NaN, deltaIntensity: 0, redExtremeCount: 0 }),
    ).toThrow(/Rip/)
  })

  it('throws on non-finite deltaIntensity', () => {
    expect(() =>
      computeRipStatus({ currentPrice: 30000, rip: 30100, deltaIntensity: NaN, redExtremeCount: 0 }),
    ).toThrow(/deltaIntensity/)
  })

  it('throws on negative or non-finite redExtremeCount', () => {
    expect(() =>
      computeRipStatus({ currentPrice: 30000, rip: 30100, deltaIntensity: 0, redExtremeCount: -1 }),
    ).toThrow(/redExtremeCount/)
    expect(() =>
      computeRipStatus({ currentPrice: 30000, rip: 30100, deltaIntensity: 0, redExtremeCount: NaN }),
    ).toThrow(/redExtremeCount/)
  })
})

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
