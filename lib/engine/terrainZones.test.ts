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
  it('keeps Tier-1 levels and the daily session structure, drops ATR and Tier-3 (F2)', () => {
    const mgi = makeMgi(30300, [
      { price: 30500, label: 'PW High', tier: 1 },
      { price: 30450, label: 'ATR High', tier: 2, code: 'high', group: 'atr' }, // dropped (A9)
      { price: 30400, label: 'Rip', tier: 2, code: 'rip', group: 'daily' },
      { price: 30300, label: 'PDH', tier: 2, code: 'pdh', group: 'daily' }, // kept (session structure)
      { price: 30250, label: 'IBL', tier: 2, code: 'ibl', group: 'daily' }, // kept (session structure)
      { price: 30200, label: 'Leg VWAP', tier: 3 }, // dropped
    ])
    const anchors = selectAnchorLevels(mgi)
    expect(anchors.map(a => a.label)).toEqual(['PW High', 'Rip', 'PDH', 'IBL'])
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

  it('extends the campaign ceiling to a Tier-1 level beyond the profile top (A8)', () => {
    const rExt = assembleTerrain({
      profile: MAIN_PROFILE,
      lvn: MAIN_LVN,
      magnets: collectMagnets({ summary: MAIN_SUMMARY, hvn: MAIN_LVN.hvn }),
      mgi: makeMgi(30250, [...MAIN_ANCHORS, { price: 30650, label: 'PW High', tier: 1 }]),
    })
    // Stratosphere top = the Tier-1 level, with the profile edge as a border below it.
    expect(rExt.zones[0].top).toBe(30650)
    expect(rExt.zones[0].bottom).toBe(30500)
    // The extension zone has no volume data → void.
    expect(rExt.zones[0].volumeClass).toBe('void')
    expect(rExt.zones[0].position).toBe('stratosphere')
    // No-Gap invariant survives the extension.
    expect(rExt.contiguityValid).toBe(true)
    expect(rExt.zones[rExt.zones.length - 1].bottom).toBe(30000)
  })

  it('ignores non-positive placeholder prices when anchoring the campaign floor (A8)', () => {
    const rZero = assembleTerrain({
      profile: MAIN_PROFILE,
      lvn: MAIN_LVN,
      magnets: collectMagnets({ summary: MAIN_SUMMARY, hvn: MAIN_LVN.hvn }),
      mgi: makeMgi(30250, [...MAIN_ANCHORS, { price: 0, label: 'ONL', tier: 1 }]),
    })
    // An unset 0.00 export value must not drag the Abyss floor to zero.
    expect(rZero.zones[rZero.zones.length - 1].bottom).toBe(30000)
    expect(rZero.contiguityValid).toBe(true)
  })
})

// --- composite borders + campaign envelope (gem-comparison F1/F3/F5) ---------

describe('assembleTerrain — composite borders (F1)', () => {
  it('merges hard partitions within mergeTolerancePts into one composite border', () => {
    const r = assembleTerrain({
      profile: MAIN_PROFILE,
      lvn: MAIN_LVN,
      magnets: collectMagnets({ summary: MAIN_SUMMARY, hvn: MAIN_LVN.hvn }),
      mgi: makeMgi(30250, [
        ...MAIN_ANCHORS,
        // 3 pts below the 30175 trench, inside the same valley → same border band.
        { price: 30172, label: 'Rip', tier: 2, code: 'rip', group: 'daily' },
      ]),
    })
    const composite = r.borders.find(b => b.members.length === 2)
    expect(composite).toBeDefined()
    expect(composite!.kind).toBe('trench')
    expect(composite!.label).toContain('Weekly VWAP')
    expect(composite!.label).toContain('Rip')
    // The zone stack splits ONCE in the 30172–30175 band, not twice.
    const bordersNear = r.zones
      .flatMap(z => [z.top, z.bottom])
      .filter(p => p >= 30170 && p <= 30180)
    expect(new Set(bordersNear).size).toBe(1)
    expect(r.contiguityValid).toBe(true)
    // Raw verdicts stay visible pre-merge.
    expect(r.partitions.filter(p => p.level.price >= 30170 && p.level.price <= 30180)).toHaveLength(2)
  })

  it('does not add a profile-edge border when a wall already marks that shelf (no sliver zones)', () => {
    // Block ends at 30490; wall anchor at 30498, 2 pts from the profile top 30500; the
    // campaign extends to a Tier-1 level at 30650. Pre-F1 this minted a 30650/30500/30498
    // stack with a 2-pt sliver.
    const profile = buildProfile([[30380, 30490, 1000]], 30000, 30500)
    const r = assembleTerrain({
      profile,
      lvn: { hvn: [], lvn: [], peakVolume: 1000 },
      magnets: collectMagnets({
        summary: { pocPrice: 30100, valueAreaHigh: 30110, valueAreaLow: 30090 },
        hvn: [],
      }),
      mgi: makeMgi(30100, [
        { price: 30498, label: 'ONH', tier: 1 },
        { price: 30650, label: 'PW High', tier: 1 },
      ]),
    })
    expect(r.zones.map(z => z.top)).toEqual([30650, 30498])
    expect(r.contiguityValid).toBe(true)
  })
})

describe('assembleTerrain — promotion volume floor (F5)', () => {
  it('does not promote trench-shaped structure whose flanking blocks are too thin', () => {
    // The real distribution sits far below; the anchor sees a "valley between blocks" in the
    // thin tail — perfect normalised ratios, negligible absolute volume.
    const profile = buildProfile(
      [
        [30050, 30150, 1000], // the real distribution
        [30350, 30370, 60], // thin tail bump
        [30371, 30409, 5], // dip between the bumps
        [30410, 30430, 60], // thin tail bump
      ],
      30000,
      30500,
    )
    const r = assembleTerrain({
      profile,
      lvn: { hvn: [], lvn: [], peakVolume: 1000 },
      magnets: collectMagnets({
        summary: { pocPrice: 30100, valueAreaHigh: 30110, valueAreaLow: 30090 },
        hvn: [],
      }),
      mgi: makeMgi(30100, [{ price: 30390, label: 'VRange +2', tier: 1 }]),
    })
    const verdict = r.levels.find(l => l.level.price === 30390)!
    expect(verdict.kind).toBe('mgi')
    expect(verdict.hard).toBe(false)
    expect(verdict.reason).toMatch(/too thin/)
  })
})

describe('assembleTerrain — campaign envelope (F3)', () => {
  const magnets = collectMagnets({ summary: MAIN_SUMMARY, hvn: MAIN_LVN.hvn })

  it('anchors the ceiling to the INNERMOST Tier-1 level beyond the extent, not the outermost', () => {
    const r = assembleTerrain({
      profile: MAIN_PROFILE,
      lvn: MAIN_LVN,
      magnets,
      mgi: makeMgi(30250, [
        ...MAIN_ANCHORS,
        { price: 30650, label: 'PW High', tier: 1 },
        { price: 31500, label: 'PM High', tier: 1 }, // pre-F3 this won and inflated the map
      ]),
    })
    expect(r.zones[0].top).toBe(30650)
    expect(r.contiguityValid).toBe(true)
  })

  it('honors an explicit campaignExtent when picking the envelope', () => {
    const r = assembleTerrain({
      profile: MAIN_PROFILE,
      lvn: MAIN_LVN,
      magnets,
      campaignExtent: { top: 30700, bottom: 29900 },
      mgi: makeMgi(30250, [
        ...MAIN_ANCHORS,
        { price: 30650, label: 'PW High', tier: 1 }, // inside the extent → cannot be the ceiling
        { price: 31500, label: 'PM High', tier: 1 },
      ]),
    })
    // Ceiling: innermost Tier-1 at-or-beyond the 30700 extent top.
    expect(r.zones[0].top).toBe(31500)
    // Floor: no Tier-1 at-or-below the 29900 extent bottom → the extent edge itself.
    expect(r.zones[r.zones.length - 1].bottom).toBe(29900)
    expect(r.contiguityValid).toBe(true)
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

  it('labels a void zone immediately above the Kill Box an Elevator Shaft (not Attic)', () => {
    // Doctrine: an Elevator Shaft sits immediately below support OR above resistance.
    // Block (killbox) at the bottom, a void zone above it, a block ceiling at the top.
    const profile = buildProfile(
      [
        [30450, 30550, 1000], // top block
        [30050, 30150, 1000], // bottom block (killbox, price 30100)
      ],
      30000,
      30600,
    )
    const r = assembleTerrain({
      profile,
      lvn: { hvn: [], lvn: [], peakVolume: 1000 },
      magnets: collectMagnets({
        summary: { pocPrice: 30100, valueAreaHigh: 30110, valueAreaLow: 30090 },
        hvn: [],
      }),
      mgi: makeMgi(30100, [
        { price: 30445, label: 'Wall Hi', tier: 1 }, // block above → void below = wall
        { price: 30160, label: 'Wall Lo', tier: 1 }, // block below → void above = wall
      ]),
    })
    const killboxIndex = r.zones.findIndex(z => z.position === 'killbox')
    expect(killboxIndex).toBeGreaterThan(0)
    const above = r.zones[killboxIndex - 1]
    expect(above.volumeClass).toBe('void')
    expect(above.position).toBe('elevator-shaft')
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

// --- dual-profile classification + bare-MGI exclusion + data edges -----------
// (operator doctrine 2026-07-22, superseding the feat-040 G1 void-splitters)

describe('assembleTerrain — balance-area seniority (dual-profile)', () => {
  // Rotation covers 30000–30500; the theater's floor structure lives below, covered only by
  // the balance-area profile: blocks flanking a valley at 29750.
  const BALANCE_AREA = buildProfile(
    [
      [29660, 29740, 1000],
      [29760, 29840, 1000],
    ],
    29500,
    30500,
  )

  function runWithBalanceArea() {
    return assembleTerrain({
      profile: MAIN_PROFILE,
      lvn: MAIN_LVN,
      balanceAreaProfile: BALANCE_AREA,
      balanceAreaLvn: {
        hvn: [],
        lvn: [{ price: 29750, volume: 40, type: 'valley', strength: 0.9 }],
        peakVolume: 1000,
      },
      magnets: collectMagnets({ summary: MAIN_SUMMARY, hvn: MAIN_LVN.hvn }),
      campaignExtent: { top: 30500, bottom: 29500 },
      mgi: makeMgi(30250, [
        ...MAIN_ANCHORS,
        { price: 29750, label: 'PDL', tier: 2, code: 'pdl', group: 'daily' },
        { price: 29400, label: 'PW Low', tier: 1 },
      ]),
    })
  }

  it('classifies an anchor below the rotation range against the balance-area profile', () => {
    const r = runWithBalanceArea()
    const verdict = r.levels.find(l => l.level.price === 29750)!
    expect(verdict.kind).toBe('trench')
    expect(verdict.hard).toBe(true)
    expect(verdict.source).toBe('balance-area')
    expect(verdict.reason).toContain('balance-area')
    expect(verdict.detectorNode?.kind).toBe('valley')
  })

  it('marks a balance-area promotion AAA and bookkeeps the no-data extension below it', () => {
    const r = runWithBalanceArea()
    const border = r.borders.find(b => b.price === 29750)!
    expect(border.significance).toBe('AAA')
    const borders = r.zones.flatMap(z => [z.top, z.bottom])
    expect(borders).toContain(29750)
    // No border at the rotation profile's bottom bin — the balance-area data continues below.
    expect(borders).not.toContain(30000)
    // The balance-area data ends at 29500 with the campaign floor at 29400: that no-data
    // extension is bookkept by a data edge (untradeable), never presented as structure.
    expect(r.dataEdges).toEqual([29500])
    expect(r.contiguityValid).toBe(true)
  })

  it('promotes an in-range anchor off the balance-area profile when rotation is indecisive (AAA)', () => {
    // 30250 region: on rotation it is mid-block; on this balance-area profile a valley at
    // 30250 flanked by blocks → the senior read decides, and the border classes AAA.
    const balance = buildProfile(
      [
        [30150, 30240, 1000],
        [30260, 30350, 1000],
      ],
      30000,
      30500,
    )
    const r = assembleTerrain({
      profile: buildProfile([[30150, 30350, 1000]], 30000, 30500), // one solid block on rotation
      lvn: { hvn: [], lvn: [], peakVolume: 1000 },
      balanceAreaProfile: balance,
      magnets: collectMagnets({
        summary: { pocPrice: 30600, valueAreaHigh: 30610, valueAreaLow: 30590 }, // far away
        hvn: [],
      }),
      mgi: makeMgi(30100, [{ price: 30250, label: 'Weekly VWAP', tier: 1 }]),
    })
    const verdict = r.levels.find(l => l.level.price === 30250)!
    expect(verdict.kind).toBe('trench')
    expect(verdict.source).toBe('balance-area')
    expect(r.borders.find(b => b.price === 30250)?.significance).toBe('AAA')
  })

  it('keeps rotation-promoted structure when the senior profile is indecisive (A class)', () => {
    const r = runWithBalanceArea()
    const trench = r.levels.find(l => l.level.price === 30175)!
    expect(trench.kind).toBe('trench')
    expect(trench.source).toBe('rotation')
    expect(r.borders.find(b => b.price === 30175)?.significance).toBe('A')
  })
})

describe('assembleTerrain — bare MGI is never a zone border', () => {
  it('leaves unpromoted out-of-range coordinates as waypoints, not void-splitters', () => {
    // No balance-area profile: PDL / VRange −2 stay plain-mgi ("outside the volume profile
    // range"). Under the 2026-07-22 doctrine they are waypoints inside the void — the zone
    // stack must NOT split there; the rotation data edge bookkeeps the extension instead.
    const r = assembleTerrain({
      profile: MAIN_PROFILE,
      lvn: MAIN_LVN,
      magnets: collectMagnets({ summary: MAIN_SUMMARY, hvn: MAIN_LVN.hvn }),
      campaignExtent: { top: 30500, bottom: 29500 },
      mgi: makeMgi(30250, [
        ...MAIN_ANCHORS,
        { price: 29752, label: 'PDL', tier: 2, code: 'pdl', group: 'daily' },
        { price: 29744, label: 'VRange -2', tier: 1 },
        { price: 29400, label: 'PW Low', tier: 1 },
      ]),
    })
    // The coordinates survive as levels…
    expect(r.levels.find(l => l.level.price === 29752)?.kind).toBe('mgi')
    expect(r.levels.find(l => l.level.price === 29744)?.kind).toBe('mgi')
    // …but never as borders.
    const borders = r.zones.flatMap(z => [z.top, z.bottom])
    expect(borders.filter(p => p >= 29744 && p <= 29752)).toHaveLength(0)
    expect(r.borders.every(b => b.kind === 'trench' || b.kind === 'wall')).toBe(true)
    // The extension below the rotation data is bookkept by the data edge.
    expect(r.dataEdges).toEqual([30000])
    expect(r.contiguityValid).toBe(true)
  })

  it('does not split at unpromoted levels INSIDE the profile data range', () => {
    // Week Open sits mid-block with no aligned magnet → plain mgi, in-range → no border.
    const profile = buildProfile([[30450, 30550, 1000]], 30400, 30600)
    const r = assembleTerrain({
      profile,
      lvn: { hvn: [], lvn: [], peakVolume: 1000 },
      magnets: collectMagnets({
        summary: { pocPrice: 30100, valueAreaHigh: 30110, valueAreaLow: 30090 },
        hvn: [],
      }),
      mgi: makeMgi(30500, [{ price: 30500, label: 'Week Open', tier: 1 }]),
    })
    expect(r.levels[0].kind).toBe('mgi')
    expect(r.zones.flatMap(z => [z.top, z.bottom])).not.toContain(30500)
  })
})

describe('assembleTerrain — class-aware spacing consolidation', () => {
  it('demotes the weaker of two A-class borders closer than aTierMinSpanPts', () => {
    // MAIN partitions: wall 30440, trench 30325 (gap 115), trench 30175 (gap 150). A span
    // floor of 140 catches only the wall/trench pair — the Trench outranks the Wall, so
    // 30440 demotes and the two trenches survive.
    const r = assembleTerrain({
      profile: MAIN_PROFILE,
      lvn: MAIN_LVN,
      magnets: collectMagnets({ summary: MAIN_SUMMARY, hvn: MAIN_LVN.hvn }),
      mgi: makeMgi(30250, MAIN_ANCHORS),
      params: { aTierMinSpanPts: 140 },
    })
    expect(r.borders.map(b => b.price)).toEqual([30325, 30175])
    expect(r.demoted).toHaveLength(1)
    expect(r.demoted[0].price).toBe(30440)
    expect(r.demoted[0].reason).toMatch(/pts of the stronger/)
    // The demoted border's verdict is untouched — still hard structure in levels.
    const demotedVerdict = r.levels.find(l => l.level.price === 30440)!
    expect(demotedVerdict.hard).toBe(true)
    expect(demotedVerdict.kind).toBe('wall')
    expect(r.contiguityValid).toBe(true)
  })

  it('an AAA border survives a nearby A border of the same tier', () => {
    // Balance-area valley at 30360 (AAA, tier 1) sits 35 pts from the tier-1 rotation trench
    // at 30325 — inside the span floor. Tiers tie, so significance decides: the A trench
    // demotes, the AAA border survives.
    const balance = buildProfile(
      [
        [30240, 30350, 1000],
        [30370, 30460, 1000],
      ],
      30000,
      30500,
    )
    const r = assembleTerrain({
      profile: MAIN_PROFILE,
      lvn: MAIN_LVN,
      balanceAreaProfile: balance,
      magnets: collectMagnets({ summary: MAIN_SUMMARY, hvn: MAIN_LVN.hvn }),
      mgi: makeMgi(30250, [
        ...MAIN_ANCHORS,
        { price: 30360, label: 'PW Low', tier: 1 },
      ]),
    })
    const aaa = r.borders.find(b => b.price === 30360)
    expect(aaa).toBeDefined()
    expect(aaa!.significance).toBe('AAA')
    expect(r.borders.map(b => b.price)).not.toContain(30325)
    expect(r.demoted.map(d => d.price)).toContain(30325)
  })

  it('a Tier-1 A border survives a Tier-2 AAA neighbor (tier outranks class)', () => {
    // Operator 2026-07-22: Week Open is a very important Tier-1 level — it must not lose its
    // border to a nearby Tier-2 balance-area promotion. Same geometry as above, but the
    // balance-area anchor is Tier-2 (PDH): the Tier-1 rotation trench at 30325 survives and
    // the AAA Tier-2 border demotes.
    const balance = buildProfile(
      [
        [30240, 30350, 1000],
        [30370, 30460, 1000],
      ],
      30000,
      30500,
    )
    const r = assembleTerrain({
      profile: MAIN_PROFILE,
      lvn: MAIN_LVN,
      balanceAreaProfile: balance,
      magnets: collectMagnets({ summary: MAIN_SUMMARY, hvn: MAIN_LVN.hvn }),
      mgi: makeMgi(30250, [
        ...MAIN_ANCHORS,
        { price: 30360, label: 'PDH', tier: 2, code: 'pdh', group: 'daily' },
      ]),
    })
    expect(r.borders.map(b => b.price)).toContain(30325)
    const demotedAAA = r.demoted.find(d => d.price === 30360)
    expect(demotedAAA).toBeDefined()
    expect(demotedAAA!.significance).toBe('AAA')
  })

  it('keeps AAA borders even when they sit closer than the span floor', () => {
    // Two balance-area valleys 55 pts apart, both below the rotation range: AAA structure
    // is exempt from the A-tier span floor (only the 16-pt merge applies).
    const balance = buildProfile(
      [
        [29600, 29690, 1000],
        [29710, 29740, 1000],
        [29760, 29850, 1000],
      ],
      29500,
      30500,
    )
    const r = assembleTerrain({
      profile: MAIN_PROFILE,
      lvn: MAIN_LVN,
      balanceAreaProfile: balance,
      magnets: collectMagnets({ summary: MAIN_SUMMARY, hvn: MAIN_LVN.hvn }),
      campaignExtent: { top: 30500, bottom: 29500 },
      mgi: makeMgi(30250, [
        ...MAIN_ANCHORS,
        { price: 29700, label: 'VRange -2', tier: 1 },
        { price: 29755, label: 'PW Low', tier: 1 },
      ]),
    })
    const prices = r.borders.map(b => b.price)
    expect(prices).toContain(29700)
    expect(prices).toContain(29755)
    expect(r.borders.filter(b => b.significance === 'AAA')).toHaveLength(2)
  })
})

describe('assembleTerrain — data-edge tagging (feat-040 G2)', () => {
  it('tags a profile-edge border as a data edge when nothing splits the extension', () => {
    const r = assembleTerrain({
      profile: MAIN_PROFILE,
      lvn: MAIN_LVN,
      magnets: collectMagnets({ summary: MAIN_SUMMARY, hvn: MAIN_LVN.hvn }),
      mgi: makeMgi(30250, [...MAIN_ANCHORS, { price: 30650, label: 'PW High', tier: 1 }]),
    })
    expect(r.dataEdges).toEqual([30500])
    expect(r.zones[0]).toMatchObject({ top: 30650, bottom: 30500, volumeClass: 'void' })
  })

  it('reports no data edges when the campaign stays inside the profile', () => {
    expect(runMain(30250).dataEdges).toEqual([])
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
