import { describe, expect, it } from 'vitest'
import type { HvnNode, LvnNode } from './lvnDetection'
import {
  DEFAULT_BUILD_WINDOW_PTS,
  ONE_SIDED_RATIO,
  annotateNodeBuilds,
  buildAt,
  withBuild,
} from './nodeBuild'
import type { VbpRow } from './parseProfile'

/** Rows at 1-pt spacing around `center`, constant volume, per-row delta from `deltaFn`. */
function rowsAround(
  center: number,
  span: number,
  volume: number,
  deltaFn: (price: number) => number | undefined,
): VbpRow[] {
  const rows: VbpRow[] = []
  for (let price = center + span; price >= center - span; price--) {
    const delta = deltaFn(price)
    rows.push(delta === undefined ? { price, volume } : { price, volume, delta })
  }
  return rows
}

describe('buildAt', () => {
  it('classifies a heavy positive one-sided window as buyer-built', () => {
    const rows = rowsAround(29900, 10, 100, () => 40) // ratio 0.4
    const build = buildAt(rows, 29900)
    expect(build).not.toBeNull()
    expect(build!.volume).toBe(100 * (2 * DEFAULT_BUILD_WINDOW_PTS + 1))
    expect(build!.delta).toBe(40 * (2 * DEFAULT_BUILD_WINDOW_PTS + 1))
    expect(build!.ratio).toBe(0.4)
    expect(build!.classification).toBe('buyer-built')
  })

  it('classifies a heavy negative window as seller-built', () => {
    const rows = rowsAround(29900, 10, 100, () => -25)
    expect(buildAt(rows, 29900)!.classification).toBe('seller-built')
  })

  it('classifies near-zero net delta as balanced', () => {
    const rows = rowsAround(29900, 10, 100, price => (price % 2 === 0 ? 10 : -10))
    const build = buildAt(rows, 29900)
    expect(Math.abs(build!.ratio)).toBeLessThan(ONE_SIDED_RATIO)
    expect(build!.classification).toBe('balanced')
  })

  it('sits exactly at the one-sided threshold → one-sided', () => {
    const rows = rowsAround(29900, 10, 100, () => 20) // ratio exactly 0.2
    expect(buildAt(rows, 29900)!.classification).toBe('buyer-built')
  })

  it('only sums bins inside the window', () => {
    // Positive delta at the node, a huge negative slab just outside the window.
    const rows: VbpRow[] = [
      ...rowsAround(29900, DEFAULT_BUILD_WINDOW_PTS, 100, () => 30),
      { price: 29900 + DEFAULT_BUILD_WINDOW_PTS + 1, volume: 100000, delta: -90000 },
    ]
    expect(buildAt(rows, 29900)!.classification).toBe('buyer-built')
  })

  it('returns null when the export has no Delta column', () => {
    const rows = rowsAround(29900, 10, 100, () => undefined)
    expect(buildAt(rows, 29900)).toBeNull()
  })

  it('returns null when the windowed volume is zero', () => {
    const rows: VbpRow[] = [{ price: 29900, volume: 0, delta: 0 }]
    expect(buildAt(rows, 29900)).toBeNull()
  })

  it('returns null when no bins fall inside the window', () => {
    const rows: VbpRow[] = [{ price: 30100, volume: 500, delta: 100 }]
    expect(buildAt(rows, 29900)).toBeNull()
  })
})

describe('withBuild / annotateNodeBuilds', () => {
  const hvn: HvnNode[] = [{ price: 29910, volume: 500, prominence: 0.5 }]
  const lvn: LvnNode[] = [{ price: 29880, volume: 40, type: 'valley', strength: 0.3 }]

  it('annotates nodes without mutating the inputs', () => {
    const rows = rowsAround(29895, 30, 100, () => 30)
    const result = annotateNodeBuilds({ hvn, lvn, peakVolume: 500 }, rows)
    expect(result.hvn[0].build!.classification).toBe('buyer-built')
    expect(result.lvn[0].build!.classification).toBe('buyer-built')
    expect(result.peakVolume).toBe(500)
    expect(hvn[0]).not.toHaveProperty('build')
    expect(lvn[0]).not.toHaveProperty('build')
  })

  it('annotates build: null for every node on a pre-delta profile', () => {
    const rows = rowsAround(29895, 30, 100, () => undefined)
    const result = annotateNodeBuilds({ hvn, lvn, peakVolume: 500 }, rows)
    expect(result.hvn[0].build).toBeNull()
    expect(result.lvn[0].build).toBeNull()
  })

  it('withBuild preserves the annotated items own fields (magnet shape)', () => {
    const rows = rowsAround(29900, 10, 100, () => -30)
    const magnets = [{ price: 29900, label: 'POC', kind: 'poc' as const, volume: null }]
    const built = withBuild(magnets, rows)
    expect(built[0].label).toBe('POC')
    expect(built[0].build!.classification).toBe('seller-built')
  })
})
