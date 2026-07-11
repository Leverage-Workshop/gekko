import { describe, it, expect } from 'vitest'
import { assembleTerrain, selectAnchorLevels, type TerrainProfileRow } from './terrainZones'
import { collectMagnets } from './magnetCheck'
import type { LvnDetectionResult } from './lvnDetection'
import type { MgiLevel, MgiPriority, MgiGroup, MgiTier } from './mgiPriority'

// --- fixture builders -------------------------------------------------------

/** Build a 1-point VbP profile over [lo, hi]; ranges [from, to, volume] override a 40 floor. */
function buildProfile(
  ranges: [number, number, number][],
  lo: number,
  hi: number,
): TerrainProfileRow[] {
  const rows: TerrainProfileRow[] = []
  for (let p = lo; p <= hi; p++) {
    let v = 40
    for (const [a, b, vol] of ranges) {
      if (p >= a && p <= b) {
        v = vol
      }
    }
    rows.push({ price: p, volume: v })
  }
  return rows
}

type AnchorSpec = { price: number; label: string; tier: MgiTier; code?: string; group?: MgiGroup }

function makeMgi(currentPrice: number, specs: AnchorSpec[]): MgiPriority {
  const levels: MgiLevel[] = specs.map(s => ({
    code: s.code ?? s.label,
    label: s.label,
    price: s.price,
    group: s.group ?? 'weekly',
    tier: s.tier,
    dailyRank: null,
  }))
  const sorted = [...levels].sort((a, b) => b.price - a.price)
  return {
    currentPrice,
    levels: sorted,
    tier1: sorted.filter(l => l.tier === 1),
    dailyPrioritySort: [],
    nearestTier1Above: null,
    nearestTier1Below: null,
  }
}

// Three volume blocks over a low floor → valleys between them, a shelf edge into the top void.
const MAIN_PROFILE = buildProfile(
  [
    [30050, 30150, 1000], // block A (center 30100)
    [30210, 30290, 1000], // block B (center 30250)
    [30360, 30430, 1000], // block C (center 30400), edge → void above 30430
  ],
  30000,
  30500,
)

const MAIN_LVN: LvnDetectionResult = {
  hvn: [
    { price: 30400, volume: 1000, prominence: 0.9 },
    { price: 30250, volume: 1000, prominence: 0.9 },
    { price: 30100, volume: 1000, prominence: 0.9 },
  ],
  lvn: [
    { price: 30325, volume: 40, type: 'valley', strength: 0.9 },
    { price: 30175, volume: 40, type: 'valley', strength: 0.9 },
  ],
  peakVolume: 1000,
}

const MAIN_SUMMARY = { pocPrice: 30100, valueAreaHigh: 30110, valueAreaLow: 30090 }

const MAIN_ANCHORS: AnchorSpec[] = [
  { price: 30100, label: 'PM High', tier: 1 }, // block center + POC/HVN → magnet
  { price: 30175, label: 'Weekly VWAP', tier: 1 }, // valley between A and B → trench
  { price: 30250, label: 'Monthly VWAP', tier: 1 }, // block center + HVN → magnet
  { price: 30325, label: 'VRange Mid', tier: 1 }, // valley between B and C → trench
  { price: 30440, label: 'VRange High', tier: 1 }, // shelf edge of C into void → wall
]

function runMain(currentPrice: number) {
  return assembleTerrain({
    profile: MAIN_PROFILE,
    lvn: MAIN_LVN,
    magnets: collectMagnets({ summary: MAIN_SUMMARY, hvn: MAIN_LVN.hvn }),
    mgi: makeMgi(currentPrice, MAIN_ANCHORS),
  })
}

// --- selectAnchorLevels -----------------------------------------------------

describe('selectAnchorLevels', () => {
  it('keeps Tier-1 levels and the Rip (Tier-2), drops other Tier-2/3', () => {
    const mgi = makeMgi(30300, [
      { price: 30500, label: 'PW High', tier: 1 },
      { price: 30400, label: 'Rip', tier: 2, code: 'rip' },
      { price: 30300, label: 'PDH', tier: 2, code: 'pdh' }, // dropped (Tier-2, not Rip)
      { price: 30200, label: 'Leg VWAP', tier: 3 }, // dropped
    ])
    const anchors = selectAnchorLevels(mgi)
    expect(anchors.map(a => a.label)).toEqual(['PW High', 'Rip'])
  })

  it('dedups anchors that share a price and returns them price-descending', () => {
    const mgi = makeMgi(30000, [
      { price: 30100, label: 'PW Low', tier: 1 },
      { price: 30100, label: 'Month Open', tier: 1 }, // same price → deduped
      { price: 30300, label: 'PW High', tier: 1 },
    ])
    const prices = selectAnchorLevels(mgi).map(a => a.price)
    expect(prices).toEqual([30300, 30100])
  })
})

// --- border classification --------------------------------------------------

describe('assembleTerrain — border classification', () => {
  const r = runMain(30250)
  const kindOf = (price: number) => r.levels.find(l => l.level.price === price)?.kind

  it('promotes a valley-between-blocks + MGI to a Trench', () => {
    expect(kindOf(30175)).toBe('trench')
    expect(kindOf(30325)).toBe('trench')
  })

  it('promotes a block-edge-into-void + MGI to a Wall (hard-ledge detection)', () => {
    expect(kindOf(30440)).toBe('wall')
  })

  it('classifies a block-center MGI aligned with a POC/HVN as a Magnet (invalidation)', () => {
    const magnet = r.levels.find(l => l.level.price === 30100)!
    expect(magnet.kind).toBe('magnet')
    expect(magnet.hard).toBe(false)
    expect(magnet.magnet?.magnet.label).toMatch(/POC|HVN/)
  })

  it('marks only Trenches and Walls as hard partitions', () => {
    expect(r.partitions.map(p => p.level.price).sort((a, b) => a - b)).toEqual([30175, 30325, 30440])
  })

  it('corroborates promoted borders with the nearest detector node', () => {
    const trench = r.levels.find(l => l.level.price === 30175)!
    expect(trench.detectorNode?.kind).toBe('valley')
    expect(trench.detectorNode?.distance).toBe(0)
  })

  it('leaves an MGI outside the profile range as a plain mgi coordinate', () => {
    const out = assembleTerrain({
      profile: MAIN_PROFILE,
      lvn: MAIN_LVN,
      magnets: collectMagnets({ summary: MAIN_SUMMARY, hvn: MAIN_LVN.hvn }),
      mgi: makeMgi(30250, [{ price: 30700, label: 'ATR High', tier: 1 }]),
    })
    expect(out.levels[0].kind).toBe('mgi')
    expect(out.levels[0].local).toBeNull()
    expect(out.levels[0].reason).toMatch(/outside/)
  })

  it('does NOT call a thick-both-sides level a Magnet unless it aligns with a magnet (single-sourced)', () => {
    // A block whose center has no POC/VAH/VAL/HVN nearby stays a plain mgi.
    const profile = buildProfile([[30450, 30550, 1000]], 30400, 30600)
    const out = assembleTerrain({
      profile,
      lvn: { hvn: [], lvn: [], peakVolume: 1000 },
      // all magnets far from 30500
      magnets: collectMagnets({
        summary: { pocPrice: 30100, valueAreaHigh: 30110, valueAreaLow: 30090 },
        hvn: [],
      }),
      mgi: makeMgi(30500, [{ price: 30500, label: 'Week Open', tier: 1 }]),
    })
    expect(out.levels[0].kind).toBe('mgi')
  })
})

// --- zone assembly + No-Gap invariant ---------------------------------------

describe('assembleTerrain — zone stack', () => {
  const r = runMain(30250)

  it('assembles a contiguous stack with the No-Gap invariant (bottom[N] === top[N+1])', () => {
    expect(r.contiguityValid).toBe(true)
    expect(r.issues).toEqual([])
    for (let i = 1; i < r.zones.length; i++) {
      expect(r.zones[i - 1].bottom).toBe(r.zones[i].top)
    }
  })

  it('spans the full profile range from the top extreme to the bottom extreme', () => {
    expect(r.zones[0].top).toBe(30500)
    expect(r.zones[r.zones.length - 1].bottom).toBe(30000)
  })

  it('splits the range at each hard partition', () => {
    // partitions at 30175, 30325, 30440 → 4 zones
    expect(r.zones.length).toBe(4)
    expect(r.zones.map(z => z.top)).toEqual([30500, 30440, 30325, 30175])
  })

  it('classifies a block-bearing zone as acceptance and a thin top zone as void', () => {
    expect(r.zones[0].volumeClass).toBe('void') // 30500–30440, above the shelf
    expect(r.zones[1].volumeClass).toBe('acceptance') // 30440–30325, holds block C
  })
})

// --- vertical-map positions -------------------------------------------------

describe('assembleTerrain — vertical positions', () => {
  it('labels the price zone Kill Box, the extremes Stratosphere/Abyss, the zone above Attic', () => {
    const positions = runMain(30250).zones.map(z => z.position)
    expect(positions).toEqual(['stratosphere', 'attic', 'killbox', 'abyss'])
  })

  it('labels the acceptance zone just below the Kill Box a Foundation', () => {
    const positions = runMain(30400).zones.map(z => z.position)
    expect(positions).toEqual(['stratosphere', 'killbox', 'foundation', 'abyss'])
  })

  it('labels a void zone immediately below the Kill Box an Elevator Shaft', () => {
    // Block (killbox) on top, a void zone below it, a block foundation at the bottom.
    const profile = buildProfile(
      [
        [30450, 30550, 1000], // top block (killbox, price 30500)
        [30050, 30150, 1000], // bottom block
      ],
      30000,
      30600,
    )
    const r = assembleTerrain({
      profile,
      lvn: { hvn: [], lvn: [], peakVolume: 1000 },
      magnets: collectMagnets({
        summary: { pocPrice: 30500, valueAreaHigh: 30510, valueAreaLow: 30490 },
        hvn: [],
      }),
      mgi: makeMgi(30500, [
        { price: 30445, label: 'Wall Hi', tier: 1 }, // block above → void below = wall
        { price: 30160, label: 'Wall Lo', tier: 1 }, // block below → void above = wall
      ]),
    })
    const shaft = r.zones.find(z => z.position === 'elevator-shaft')
    expect(shaft).toBeDefined()
    expect(shaft?.volumeClass).toBe('void')
  })
})

// --- volume-only zone facts ---------------------------------------------------

describe('assembleTerrain — volume-only zone facts', () => {
  it('labels zones as position (volumeClass) with no order-flow character read', () => {
    // Order-flow character was removed with the VbP/delta join (feat-036):
    // absorption is detected from the delta exports (lib/engine/absorption.ts)
    // and confirmed by the model, never by terrain assembly.
    const r = runMain(30250)
    for (const zone of r.zones) {
      expect(zone.label).toMatch(/^[\w ]+ \((acceptance|void)\)$/)
      expect(zone).not.toHaveProperty('deltaClass')
      expect(zone).not.toHaveProperty('character')
      expect(zone).not.toHaveProperty('netDelta')
    }
  })
})

// --- degenerate inputs ------------------------------------------------------

describe('assembleTerrain — degenerate inputs', () => {
  it('returns no zones for a profile with fewer than two bins but still classifies anchors', () => {
    const r = assembleTerrain({
      profile: [{ price: 30100, volume: 500 }],
      lvn: { hvn: [], lvn: [], peakVolume: 500 },
      magnets: collectMagnets({
        summary: { pocPrice: 30100, valueAreaHigh: 30110, valueAreaLow: 30090 },
        hvn: [],
      }),
      mgi: makeMgi(30100, [{ price: 30100, label: 'PW High', tier: 1 }]),
    })
    expect(r.zones).toEqual([])
    expect(r.contiguityValid).toBe(true)
    expect(r.levels.length).toBe(1)
  })

  it('does not throw on an empty profile and degrades like the <2-bins path', () => {
    const r = assembleTerrain({
      profile: [],
      lvn: { hvn: [], lvn: [], peakVolume: 0 },
      magnets: collectMagnets({
        summary: { pocPrice: 30100, valueAreaHigh: 30110, valueAreaLow: 30090 },
        hvn: [],
      }),
      mgi: makeMgi(30100, [{ price: 30100, label: 'PW High', tier: 1 }]),
    })
    expect(r.zones).toEqual([])
    expect(r.contiguityValid).toBe(true)
    expect(r.levels.length).toBe(1)
    expect(r.levels[0].kind).toBe('mgi')
    expect(r.levels[0].local).toBeNull()
  })

  it('carries the current price through from the MGI input', () => {
    expect(runMain(30333).currentPrice).toBe(30333)
  })
})
