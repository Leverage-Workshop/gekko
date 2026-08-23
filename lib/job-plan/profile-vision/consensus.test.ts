import { describe, expect, it } from 'vitest'
import {
  buildConsensus,
  familyOf,
  requiredSamples,
  snapToGrid,
  successfulSamples,
  type ConsensusInput,
  type SuccessfulRead,
} from './consensus'
import type { ProfileNode, ProfileNodesRead } from './schema'

/** NQ grid: 2-pt rows from 29000 to 29400. */
const GRID = { step: 2, priceLow: 29000, priceHigh: 29400 }

function n(overrides: Partial<ProfileNode>): ProfileNode {
  return {
    kind: 'lvn',
    priceLow: 29100,
    priceHigh: 29104,
    prominence: 2,
    primary: false,
    position: 'mid',
    shape: 'valley',
    rationale: 'x',
    ...overrides,
  }
}

function read(
  nodes: ProfileNode[],
  extra: Partial<Omit<ProfileNodesRead, 'nodes'>> = {}
): ProfileNodesRead {
  return { nodes, thinZones: [], profileShape: 'bell', unfinished: false, ...extra }
}

function sample(
  sample: number,
  nodes: ProfileNode[],
  extra?: Partial<Omit<ProfileNodesRead, 'nodes'>>
): SuccessfulRead {
  return { sample, tile: 0, read: read(nodes, extra) }
}

/** Two tiles over the NQ grid sharing 29180–29220. */
const TWO_TILES = [
  { index: 0, priceLow: 29180, priceHigh: 29400 },
  { index: 1, priceLow: 29000, priceHigh: 29220 },
]

function input(
  reads: SuccessfulRead[],
  samples = reads.length,
  tilesPerSample = 1
): ConsensusInput {
  const tiles =
    tilesPerSample === 2
      ? TWO_TILES
      : [{ index: 0, priceLow: GRID.priceLow, priceHigh: GRID.priceHigh }]
  return { instrument: 'NQ', grid: GRID, samples, tiles, reads }
}

/** The primary lvn every sample agrees on, so reads are schema-valid. */
const PRIMARY = n({ priceLow: 29200, priceHigh: 29204, prominence: 1, primary: true })

describe('consensus — helpers', () => {
  it('requiredSamples = ceil(S/2)', () => {
    expect([1, 2, 3, 4, 5].map(requiredSamples)).toEqual([1, 1, 2, 2, 3])
  })

  it('snapToGrid snaps to the row step from the span floor and clamps into the span', () => {
    expect(snapToGrid(29101, GRID)).toBe(29102)
    expect(snapToGrid(29100.9, GRID)).toBe(29100)
    expect(snapToGrid(28990, GRID)).toBe(29000)
    expect(snapToGrid(29999, GRID)).toBe(29400)
    expect(snapToGrid(6812.1, { step: 0.25, priceLow: 6800, priceHigh: 6820 })).toBe(6812)
    expect(snapToGrid(6812.13, { step: 0.25, priceLow: 6800, priceHigh: 6820 })).toBe(6812.25)
  })

  it('kind families: lvn alone, hvn-edge/core together, the two extreme anatomies APART', () => {
    expect(familyOf('lvn')).toBe('lvn')
    expect(familyOf('hvn-edge')).toBe('hvn')
    expect(familyOf('hvn-core')).toBe('hvn')
    expect(familyOf('taper-tail')).toBe('taper')
    expect(familyOf('exhaustive-node')).toBe('exhaustive')
  })

  it('successfulSamples requires every tile of a sample', () => {
    const reads: SuccessfulRead[] = [
      { sample: 0, tile: 0, read: read([]) },
      { sample: 0, tile: 1, read: read([]) },
      { sample: 1, tile: 0, read: read([]) },
    ]
    expect([...successfulSamples(reads, 2)]).toEqual([0])
    expect([...successfulSamples(reads, 1)].sort()).toEqual([0, 1])
  })
})

describe('consensus — thresholds', () => {
  it.each([
    [1, 1, true],
    [2, 1, true],
    [2, 0, false],
    [3, 2, true],
    [3, 1, false],
    [5, 3, true],
    [5, 2, false],
  ])('S=%i with %i successful samples -> consensus %s', (S, ok, expectConsensus) => {
    const reads = Array.from({ length: ok }, (_, i) => sample(i, [PRIMARY]))
    const c = buildConsensus(input(reads, S))
    expect(c !== null).toBe(expectConsensus)
    if (c) {
      expect(c.successfulSamples).toBe(ok)
      expect(c.samples).toBe(S)
    }
  })

  it('a sample with a failed tile does not count (partial failure -> null when below threshold)', () => {
    const reads: SuccessfulRead[] = [
      { sample: 0, tile: 0, read: read([PRIMARY]) },
      { sample: 0, tile: 1, read: read([]) },
      { sample: 1, tile: 0, read: read([PRIMARY]) }, // tile 1 failed
      { sample: 2, tile: 1, read: read([]) }, // tile 0 failed
    ]
    expect(buildConsensus(input(reads, 3, 2))).toBeNull()
    // with a 1-tile layout the same reads would be 3 successful samples
    expect(
      buildConsensus(
        input(
          reads.filter((r) => r.tile === 0),
          3,
          1
        )
      )
    ).not.toBeNull()
  })
})

describe('consensus — clustering', () => {
  it('keeps a node reported by >= ceil(S/2) samples and drops one reported by fewer', () => {
    const reads = [
      sample(0, [PRIMARY, n({ priceLow: 29300, priceHigh: 29304 })]),
      sample(1, [PRIMARY, n({ priceLow: 29302, priceHigh: 29306 })]),
      sample(2, [PRIMARY, n({ priceLow: 29050, priceHigh: 29052 })]),
    ]
    const c = buildConsensus(input(reads))!
    const prices = c.nodes.map((x) => [x.priceLow, x.priceHigh])
    // median of (29300, 29302) = 29301 -> snaps up to 29302; median of (29304, 29306) = 29305 -> 29306
    expect(prices).toContainEqual([29302, 29306])
    expect(prices).not.toContainEqual([29050, 29052])
    const kept = c.nodes.find((x) => x.priceLow === 29302)!
    expect(kept.agreement).toBe(2)
    expect(kept.samples).toBe(3)
  })

  it('merges reads exactly at the NQ tolerance (20 pts) and splits just beyond it', () => {
    const at = [
      sample(0, [PRIMARY, n({ priceLow: 29300, priceHigh: 29300 })]),
      sample(1, [PRIMARY, n({ priceLow: 29320, priceHigh: 29320 })]),
    ]
    expect(buildConsensus(input(at))!.nodes.filter((x) => x.priceLow >= 29300)).toHaveLength(1)
    const beyond = [
      sample(0, [PRIMARY, n({ priceLow: 29300, priceHigh: 29300 })]),
      sample(1, [PRIMARY, n({ priceLow: 29322, priceHigh: 29322 })]),
    ]
    // each is a 1-of-2 cluster -> both survive the ceil(2/2)=1 threshold, as two nodes
    expect(buildConsensus(input(beyond))!.nodes.filter((x) => x.priceLow >= 29300)).toHaveLength(2)
  })

  it('uses the ES tolerance (5 pts) on ES', () => {
    const grid = { step: 0.25, priceLow: 6800, priceHigh: 6900 }
    const p = n({ priceLow: 6850, priceHigh: 6851, prominence: 1, primary: true })
    const reads = [
      sample(0, [p, n({ priceLow: 6820, priceHigh: 6820 })]),
      sample(1, [p, n({ priceLow: 6826, priceHigh: 6826 })]),
    ]
    const c = buildConsensus({
      instrument: 'ES',
      grid,
      samples: 2,
      tiles: [{ index: 0, priceLow: 6800, priceHigh: 6900 }],
      reads,
    })!
    expect(c.nodes.filter((x) => x.priceLow < 6840)).toHaveLength(2)
  })

  it('never merges an lvn with the adjacent hvn-edge even inside the tolerance (corpus B4)', () => {
    const reads = [
      sample(0, [
        PRIMARY,
        n({ kind: 'hvn-edge', priceLow: 29206, priceHigh: 29210, primary: false }),
      ]),
      sample(1, [
        PRIMARY,
        n({ kind: 'hvn-edge', priceLow: 29206, priceHigh: 29210, primary: false }),
      ]),
    ]
    const c = buildConsensus(input(reads))!
    expect(c.nodes.map((x) => x.kind).sort()).toEqual(['hvn-edge', 'lvn'])
  })

  it('snaps the median band to the grid and drops nodes outside the profile span', () => {
    const reads = [
      sample(0, [
        PRIMARY,
        n({ priceLow: 29101, priceHigh: 29107 }),
        n({ priceLow: 29500, priceHigh: 29510 }),
      ]),
      sample(1, [
        PRIMARY,
        n({ priceLow: 29103, priceHigh: 29109 }),
        n({ priceLow: 28900, priceHigh: 28950 }),
      ]),
      sample(2, [PRIMARY, n({ priceLow: 29105, priceHigh: 29111 })]),
    ]
    const c = buildConsensus(input(reads))!
    const mid = c.nodes.find((x) => x.priceLow >= 29100 && x.priceLow < 29120)!
    expect(mid.priceLow).toBe(29104) // median of snapped lows 29102 / 29104 / 29106
    expect(mid.priceHigh).toBe(29110) // median of snapped highs 29108 / 29110 / 29112
    expect(c.nodes.every((x) => x.priceLow >= GRID.priceLow && x.priceHigh <= GRID.priceHigh)).toBe(
      true
    )
  })

  it('clips a band that straddles the span edge instead of dropping it', () => {
    const reads = [
      sample(0, [PRIMARY, n({ kind: 'taper-tail', priceLow: 29390, priceHigh: 29420 })]),
    ]
    const c = buildConsensus(input(reads))!
    const tail = c.nodes.find((x) => x.kind === 'taper-tail')!
    expect(tail.priceHigh).toBe(29400)
  })

  it('prominence is the best (lowest) across members; kind / position / shape by majority', () => {
    const reads = [
      sample(0, [
        PRIMARY,
        n({
          kind: 'hvn-edge',
          priceLow: 29300,
          priceHigh: 29304,
          prominence: 3,
          position: 'upper',
          shape: 'shelf-edge',
        }),
      ]),
      sample(1, [
        PRIMARY,
        n({
          kind: 'hvn-core',
          priceLow: 29300,
          priceHigh: 29304,
          prominence: 1,
          position: 'upper',
          shape: 'notch',
        }),
      ]),
      sample(2, [
        PRIMARY,
        n({
          kind: 'hvn-edge',
          priceLow: 29300,
          priceHigh: 29304,
          prominence: 4,
          position: 'top',
          shape: 'shelf-edge',
        }),
      ]),
    ]
    const c = buildConsensus(input(reads))!
    const fat = c.nodes.find((x) => x.priceLow === 29300)!
    expect(fat.kind).toBe('hvn-edge')
    expect(fat.prominence).toBe(1)
    expect(fat.position).toBe('upper')
    expect(fat.shape).toBe('shelf-edge')
    expect(fat.agreement).toBe(3)
  })

  it('breaks a kind tie deterministically on the enum order', () => {
    const reads = [
      sample(0, [PRIMARY, n({ kind: 'hvn-core', priceLow: 29300, priceHigh: 29304 })]),
      sample(1, [PRIMARY, n({ kind: 'hvn-edge', priceLow: 29300, priceHigh: 29304 })]),
    ]
    const c = buildConsensus(input(reads))!
    expect(c.nodes.find((x) => x.priceLow === 29300)!.kind).toBe('hvn-edge') // hvn-edge precedes hvn-core
  })
})

describe('consensus — primary', () => {
  it('the majority primary wins and every other lvn is demoted', () => {
    const a = n({ priceLow: 29100, priceHigh: 29104, prominence: 1, primary: true })
    const b = n({ priceLow: 29300, priceHigh: 29304, prominence: 1, primary: true })
    const reads = [
      sample(0, [a, { ...b, primary: false }]),
      sample(1, [a, { ...b, primary: false }]),
      sample(2, [{ ...a, primary: false }, b]),
    ]
    const c = buildConsensus(input(reads))!
    expect(c.nodes.filter((x) => x.primary)).toHaveLength(1)
    expect(c.nodes.find((x) => x.primary)!.priceLow).toBe(29100)
  })

  it('a primary vote tie resolves by agreement, then prominence, then price — one primary always', () => {
    const a = n({ priceLow: 29100, priceHigh: 29104, prominence: 2, primary: true })
    const b = n({ priceLow: 29300, priceHigh: 29304, prominence: 1, primary: true })
    const reads = [
      sample(0, [a, { ...b, primary: false }]),
      sample(1, [{ ...a, primary: false }, b]),
      sample(2, [a, { ...b, primary: false }]),
      sample(3, [{ ...a, primary: false }, b]),
    ]
    const c = buildConsensus(input(reads))!
    expect(c.nodes.filter((x) => x.primary)).toHaveLength(1)
    // 2 votes each, agreement 4 each, b has the better prominence
    expect(c.nodes.find((x) => x.primary)!.priceLow).toBe(29300)
  })

  it('when every primary vote fell below threshold, the strongest surviving lvn is promoted — never lvns without a primary', () => {
    const shared = n({ priceLow: 29250, priceHigh: 29254, prominence: 2, primary: false })
    const reads = [
      sample(0, [n({ priceLow: 29100, priceHigh: 29104, prominence: 1, primary: true }), shared]),
      sample(1, [n({ priceLow: 29300, priceHigh: 29304, prominence: 1, primary: true }), shared]),
      sample(2, [n({ priceLow: 29350, priceHigh: 29354, prominence: 1, primary: true }), shared]),
    ]
    const c = buildConsensus(input(reads))!
    expect(c.nodes).toHaveLength(1)
    expect(c.nodes[0]).toMatchObject({ priceLow: 29250, primary: true, agreement: 3 })
  })

  it('disjoint primaries with nothing shared yield no lvn at all (and therefore no primary)', () => {
    const reads = [
      sample(0, [n({ priceLow: 29100, priceHigh: 29104, prominence: 1, primary: true })]),
      sample(1, [n({ priceLow: 29300, priceHigh: 29304, prominence: 1, primary: true })]),
      sample(2, [n({ priceLow: 29350, priceHigh: 29354, prominence: 1, primary: true })]),
    ]
    expect(buildConsensus(input(reads))!.nodes).toHaveLength(0)
  })

  it('an exhaustive-node and a taper-tail at the same extreme never blend into a majority vote', () => {
    const reads = [
      sample(0, [
        PRIMARY,
        n({ kind: 'exhaustive-node', priceLow: 29390, priceHigh: 29400, primary: false }),
      ]),
      sample(1, [
        PRIMARY,
        n({ kind: 'taper-tail', priceLow: 29390, priceHigh: 29400, primary: false }),
      ]),
      sample(2, [
        PRIMARY,
        n({ kind: 'exhaustive-node', priceLow: 29392, priceHigh: 29400, primary: false }),
      ]),
    ]
    const c = buildConsensus(input(reads))!
    const top = c.nodes.filter((x) => x.priceHigh === 29400)
    // the 1-of-3 taper-tail misses the ceil(3/2)=2 threshold; the 2-of-3 exhaustive-node survives
    expect(top.map((x) => [x.kind, x.agreement])).toEqual([['exhaustive-node', 2]])
  })
})

describe('consensus — tiles, caps, zones, shape', () => {
  it("de-duplicates the same node seen in both tiles' SHARED span within one sample (one vote, not two)", () => {
    // PRIMARY (29200-29204) sits in the 29180-29220 overlap and is reported by both tiles.
    const reads: SuccessfulRead[] = [
      {
        sample: 0,
        tile: 0,
        read: read([
          PRIMARY,
          n({ kind: 'hvn-core', priceLow: 29300, priceHigh: 29304, primary: false }),
        ]),
      },
      {
        sample: 0,
        tile: 1,
        read: read([{ ...PRIMARY, priceLow: 29202, priceHigh: 29206, prominence: 2 }]),
      },
      { sample: 1, tile: 0, read: read([PRIMARY]) },
      { sample: 1, tile: 1, read: read([{ ...PRIMARY, prominence: 3 }]) },
    ]
    const c = buildConsensus(input(reads, 2, 2))!
    const lvns = c.nodes.filter((x) => x.kind === 'lvn')
    expect(lvns).toHaveLength(1)
    expect(lvns[0]).toMatchObject({ primary: true, agreement: 2, prominence: 1 })
  })

  it('does NOT collapse two distinct nodes within the tolerance when one lies outside the shared span', () => {
    // hvn-edge 29226-29228 is tile-0-only territory; hvn-edge 29210-29212 is in the overlap. 16 pts
    // apart (inside the 20-pt tolerance) but NOT both inside the shared span -> not tile duplicates.
    const tile0 = [
      PRIMARY,
      n({ kind: 'hvn-edge', priceLow: 29226, priceHigh: 29228, primary: false }),
    ]
    const tile1 = [n({ kind: 'hvn-edge', priceLow: 29210, priceHigh: 29212, primary: false })]
    const reads: SuccessfulRead[] = [
      { sample: 0, tile: 0, read: read(tile0) },
      { sample: 0, tile: 1, read: read(tile1) },
      { sample: 1, tile: 0, read: read(tile0) },
      { sample: 1, tile: 1, read: read(tile1) },
    ]
    const c = buildConsensus(input(reads, 2, 2))!
    const edges = c.nodes
      .filter((x) => x.kind === 'hvn-edge')
      .map((x) => x.priceLow)
      .sort()
    // each sample contributes BOTH edges; they cluster across samples into two 2-vote nodes
    expect(edges).toEqual([29210, 29226])
  })

  it('a true duplicate STRADDLING the seam is one node, with the union band (never counted twice)', () => {
    // overlap is 29180-29220; tile 0 reports 29214-29226 (crosses the seam), tile 1 reports it clipped 29214-29220
    const straddle = n({
      kind: 'hvn-edge',
      priceLow: 29214,
      priceHigh: 29226,
      primary: false,
      prominence: 2,
    })
    const clipped = n({
      kind: 'hvn-edge',
      priceLow: 29214,
      priceHigh: 29220,
      primary: false,
      prominence: 3,
    })
    const reads: SuccessfulRead[] = [
      { sample: 0, tile: 0, read: read([PRIMARY, straddle]) },
      { sample: 0, tile: 1, read: read([clipped]) },
      { sample: 1, tile: 0, read: read([PRIMARY, straddle]) },
      { sample: 1, tile: 1, read: read([clipped]) },
    ]
    const c = buildConsensus(input(reads, 2, 2))!
    const edges = c.nodes.filter((x) => x.kind === 'hvn-edge')
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      priceLow: 29214,
      priceHigh: 29226,
      agreement: 2,
      prominence: 2,
    })
  })

  it('the tile merge keeps the better prominence and OR-s the primary flag', () => {
    const reads: SuccessfulRead[] = [
      {
        sample: 0,
        tile: 0,
        read: read([
          { ...PRIMARY, primary: false, prominence: 3 },
          n({ kind: 'hvn-core', priceLow: 29300, priceHigh: 29304, primary: false }),
        ]),
      },
      { sample: 0, tile: 1, read: read([{ ...PRIMARY, prominence: 1 }]) },
    ]
    const c = buildConsensus(input(reads, 1, 2))!
    expect(c.nodes.find((x) => x.kind === 'lvn')).toMatchObject({
      primary: true,
      prominence: 1,
      agreement: 1,
    })
  })

  it('overlapping output zones merge with the UNION of their voters as agreement', () => {
    // samples 0,1: 29100-29140 (center 29120); samples 2,3: 29138-29220 (center 29179) — centers
    // 59 apart (> 2 x tolerance, so two clusters) but the bands overlap -> one zone, 4 voters.
    const reads = [
      sample(0, [PRIMARY], { thinZones: [{ low: 29100, high: 29140 }] }),
      sample(1, [PRIMARY], { thinZones: [{ low: 29100, high: 29140 }] }),
      sample(2, [PRIMARY], { thinZones: [{ low: 29138, high: 29220 }] }),
      sample(3, [PRIMARY], { thinZones: [{ low: 29138, high: 29220 }] }),
    ]
    const c = buildConsensus(input(reads))!
    expect(c.thinZones).toHaveLength(1)
    expect(c.thinZones[0]).toEqual({ low: 29100, high: 29220, agreement: 4, samples: 4 })
  })

  it('thin zones cut by the tile seam are unioned within a sample, and overlapping outputs merge', () => {
    const reads: SuccessfulRead[] = [
      { sample: 0, tile: 0, read: read([PRIMARY], { thinZones: [{ low: 29190, high: 29260 }] }) },
      { sample: 0, tile: 1, read: read([PRIMARY], { thinZones: [{ low: 29150, high: 29200 }] }) },
      { sample: 1, tile: 0, read: read([PRIMARY], { thinZones: [{ low: 29150, high: 29262 }] }) },
      { sample: 1, tile: 1, read: read([PRIMARY], { thinZones: [{ low: 29150, high: 29200 }] }) },
    ]
    const c = buildConsensus(input(reads, 2, 2))!
    expect(c.thinZones).toHaveLength(1)
    expect(c.thinZones[0]).toMatchObject({ low: 29150, agreement: 2 })
    expect(c.thinZones[0].high).toBeGreaterThanOrEqual(29260)
  })

  it('caps at 8 nodes by agreement then prominence, always keeping the primary, ordered top-down', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      n({
        kind: i % 2 ? 'hvn-edge' : 'taper-tail',
        priceLow: 29020 + i * 30,
        priceHigh: 29022 + i * 30,
        prominence: (i % 5) + 1,
        primary: false,
      })
    )
    const primary = n({ priceLow: 29010, priceHigh: 29012, prominence: 5, primary: true })
    const reads = [
      sample(0, [primary, ...many.slice(0, 7)]),
      sample(1, [primary, ...many.slice(0, 7)]),
      sample(2, [primary, ...many.slice(4)]),
    ]
    const c = buildConsensus(input(reads))!
    expect(c.nodes.length).toBeLessThanOrEqual(8)
    expect(c.nodes.filter((x) => x.primary)).toHaveLength(1)
    for (let i = 1; i < c.nodes.length; i++) {
      expect(c.nodes[i - 1].priceHigh).toBeGreaterThanOrEqual(c.nodes[i].priceHigh)
    }
    // the 3-vote nodes (indices 4..6) all survive
    for (const i of [4, 5, 6]) expect(c.nodes.map((x) => x.priceLow)).toContain(29020 + i * 30)
  })

  it('thin zones need the same agreement, take the median band, and cap at 3', () => {
    const reads = [
      sample(0, [PRIMARY], {
        thinZones: [
          { low: 29100, high: 29140 },
          { low: 29300, high: 29320 },
        ],
      }),
      sample(1, [PRIMARY], { thinZones: [{ low: 29104, high: 29144 }] }),
      sample(2, [PRIMARY], {
        thinZones: [
          { low: 29102, high: 29142 },
          { low: 29030, high: 29040 },
        ],
      }),
    ]
    const c = buildConsensus(input(reads))!
    expect(c.thinZones).toHaveLength(1)
    expect(c.thinZones[0]).toEqual({ low: 29102, high: 29142, agreement: 3, samples: 3 })
  })

  it('profileShape by majority (enum order on ties); unfinished needs a strict majority', () => {
    const reads = [
      sample(0, [PRIMARY], { profileShape: 'double', unfinished: true }),
      sample(1, [PRIMARY], { profileShape: 'double', unfinished: false }),
      sample(2, [PRIMARY], { profileShape: 'bell', unfinished: true }),
    ]
    const c = buildConsensus(input(reads))!
    expect(c.profileShape).toBe('double')
    expect(c.unfinished).toBe(true)
    const tie = buildConsensus(
      input([
        sample(0, [PRIMARY], { profileShape: 'multi', unfinished: true }),
        sample(1, [PRIMARY], { profileShape: 'bell' }),
      ])
    )!
    expect(tie.profileShape).toBe('bell')
    expect(tie.unfinished).toBe(false)
  })

  it('is permutation-invariant: the order of reads and of nodes within a read does not change the result', () => {
    const a = n({ priceLow: 29300, priceHigh: 29304, prominence: 2 })
    const b = n({ priceLow: 29310, priceHigh: 29314, prominence: 1 })
    const edge = n({ kind: 'hvn-edge', priceLow: 29120, priceHigh: 29124 })
    const reads = [
      sample(0, [PRIMARY, a, edge]),
      sample(1, [b, PRIMARY]),
      sample(2, [edge, PRIMARY, a]),
    ]
    const shuffled = [
      { ...reads[2], read: { ...reads[2].read, nodes: [...reads[2].read.nodes].reverse() } },
      reads[0],
      { ...reads[1], read: { ...reads[1].read, nodes: [...reads[1].read.nodes].reverse() } },
    ]
    expect(buildConsensus(input(shuffled))).toEqual(buildConsensus(input(reads)))
  })

  it('is pure: does not mutate its input and is deterministic across calls', () => {
    const reads = [
      sample(0, [PRIMARY, n({ priceLow: 29300, priceHigh: 29304 })]),
      sample(1, [PRIMARY]),
    ]
    const before = JSON.stringify(reads)
    const a = buildConsensus(input(reads))
    const b = buildConsensus(input(reads))
    expect(JSON.stringify(reads)).toBe(before)
    expect(a).toEqual(b)
  })
})
