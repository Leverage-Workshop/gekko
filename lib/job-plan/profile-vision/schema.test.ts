import { describe, expect, it } from 'vitest'
import {
  MAX_NODES,
  profileNodesReadEitherSchema,
  profileNodesReadNormalizedSchema,
  profileNodesReadSchema,
  type ProfileNode,
  type ProfileNodeNormalized,
} from './schema'

function node(overrides: Partial<ProfileNode> = {}): ProfileNode {
  return {
    kind: 'lvn',
    priceLow: 100,
    priceHigh: 102,
    prominence: 1,
    primary: true,
    position: 'mid',
    shape: 'valley',
    rationale: 'deepest trough',
    ...overrides,
  }
}

const base = { thinZones: [], profileShape: 'bell' as const, unfinished: false }

describe('profileNodesReadSchema', () => {
  it('accepts a minimal valid read', () => {
    expect(profileNodesReadSchema.safeParse({ ...base, nodes: [node()] }).success).toBe(true)
  })

  it('rejects an empty read — a profile always has at least one node', () => {
    expect(profileNodesReadSchema.safeParse({ ...base, nodes: [] }).success).toBe(false)
  })

  it('accepts an lvn-free image (a tile that is one fat node) without a primary', () => {
    const r = profileNodesReadSchema.safeParse({
      ...base,
      nodes: [node({ kind: 'hvn-core', primary: false, shape: 'notch' })],
    })
    expect(r.success).toBe(true)
  })

  it('rejects more than 8 nodes', () => {
    const nodes = Array.from({ length: MAX_NODES + 1 }, (_, i) =>
      node({ primary: i === 0, priceLow: 100 + i * 5, priceHigh: 101 + i * 5 })
    )
    const r = profileNodesReadSchema.safeParse({ ...base, nodes })
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.error?.issues)).toMatch(/at most 8 nodes/)
  })

  it('rejects two primaries', () => {
    const r = profileNodesReadSchema.safeParse({
      ...base,
      nodes: [node(), node({ priceLow: 120, priceHigh: 122 })],
    })
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.error?.issues)).toMatch(/exactly one primary/)
  })

  it('rejects an lvn set without any primary', () => {
    const r = profileNodesReadSchema.safeParse({ ...base, nodes: [node({ primary: false })] })
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.error?.issues)).toMatch(/must be marked primary/)
  })

  it('rejects a primary that is not an lvn', () => {
    const r = profileNodesReadSchema.safeParse({
      ...base,
      nodes: [node({ kind: 'hvn-edge', primary: true })],
    })
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.error?.issues)).toMatch(/only an lvn can be primary/)
  })

  it('rejects low > high on nodes and thin zones', () => {
    expect(
      profileNodesReadSchema.safeParse({
        ...base,
        nodes: [node({ priceLow: 105, priceHigh: 100 })],
      }).success
    ).toBe(false)
    expect(
      profileNodesReadSchema.safeParse({
        ...base,
        nodes: [node()],
        thinZones: [{ low: 9, high: 1 }],
      }).success
    ).toBe(false)
  })

  it('rejects more than 3 thin zones, a rationale over 20 words, and out-of-range prominence', () => {
    const zones = Array.from({ length: 4 }, (_, i) => ({ low: i * 10, high: i * 10 + 5 }))
    expect(
      profileNodesReadSchema.safeParse({ ...base, nodes: [node()], thinZones: zones }).success
    ).toBe(false)
    const wordy = Array.from({ length: 21 }, () => 'word').join(' ')
    expect(
      profileNodesReadSchema.safeParse({ ...base, nodes: [node({ rationale: wordy })] }).success
    ).toBe(false)
    expect(
      profileNodesReadSchema.safeParse({ ...base, nodes: [node({ prominence: 6 })] }).success
    ).toBe(false)
    expect(
      profileNodesReadSchema.safeParse({ ...base, nodes: [node({ prominence: 0 })] }).success
    ).toBe(false)
  })

  it('rejects unknown enum members and non-finite prices', () => {
    expect(
      profileNodesReadSchema.safeParse({ ...base, nodes: [node({ kind: 'poc' as never })] }).success
    ).toBe(false)
    expect(
      profileNodesReadSchema.safeParse({ ...base, nodes: [node({ priceLow: NaN })] }).success
    ).toBe(false)
    expect(
      profileNodesReadSchema.safeParse({ ...base, profileShape: 'p-shape', nodes: [node()] })
        .success
    ).toBe(false)
  })

  it('is a flat object at the root (no unions — OpenAI rejects them)', () => {
    // The schema's root type is an object; every field is a primitive, enum, array or object.
    const r = profileNodesReadSchema.safeParse({ ...base, nodes: [node()] })
    expect(r.success).toBe(true)
    expect(Object.keys(r.data!).sort()).toEqual([
      'nodes',
      'profileShape',
      'thinZones',
      'unfinished',
    ])
  })
})

// ---------------------------------------------------------------------------
// feat-135: the same read, positioned by fraction instead of by price.
// ---------------------------------------------------------------------------

function normalizedNode(overrides: Partial<ProfileNodeNormalized> = {}): ProfileNodeNormalized {
  return {
    kind: 'lvn',
    yLow: 0.4,
    yHigh: 0.42,
    prominence: 1,
    primary: true,
    position: 'mid',
    shape: 'valley',
    rationale: 'deepest trough',
    ...overrides,
  }
}

describe('profileNodesReadNormalizedSchema (axis-free wire contract)', () => {
  it('accepts a normalized read and applies the same cross-field rules', () => {
    expect(
      profileNodesReadNormalizedSchema.safeParse({ ...base, nodes: [normalizedNode()] }).success
    ).toBe(true)
    // two primaries, an lvn with no primary, a non-lvn primary: identical rules
    const two = profileNodesReadNormalizedSchema.safeParse({
      ...base,
      nodes: [normalizedNode(), normalizedNode({ yLow: 0.6, yHigh: 0.62 })],
    })
    expect(two.success).toBe(false)
    expect(JSON.stringify(two.error?.issues)).toMatch(/exactly one primary/)
    expect(
      profileNodesReadNormalizedSchema.safeParse({
        ...base,
        nodes: [normalizedNode({ primary: false })],
      }).success
    ).toBe(false)
  })

  it('rejects a fraction outside [0,1], an inverted band and a non-number', () => {
    for (const bad of [{ yLow: -0.01 }, { yHigh: 1.01 }, { yLow: NaN }]) {
      expect(
        profileNodesReadNormalizedSchema.safeParse({ ...base, nodes: [normalizedNode(bad)] })
          .success
      ).toBe(false)
    }
    const inverted = profileNodesReadNormalizedSchema.safeParse({
      ...base,
      nodes: [normalizedNode({ yLow: 0.8, yHigh: 0.2 })],
    })
    expect(inverted.success).toBe(false)
    expect(JSON.stringify(inverted.error?.issues)).toMatch(/yLow 0.8 > yHigh 0.2/)
  })

  it('rejects a normalized read that carries prices instead of fractions', () => {
    expect(profileNodesReadNormalizedSchema.safeParse({ ...base, nodes: [node()] }).success).toBe(
      false
    )
    expect(
      profileNodesReadNormalizedSchema.safeParse({
        ...base,
        nodes: [normalizedNode()],
        thinZones: [{ low: 1, high: 2 }],
      }).success
    ).toBe(false)
  })

  it('is a flat object at the root, like the price contract', () => {
    const r = profileNodesReadNormalizedSchema.safeParse({ ...base, nodes: [normalizedNode()] })
    expect(Object.keys(r.data!).sort()).toEqual([
      'nodes',
      'profileShape',
      'thinZones',
      'unfinished',
    ])
  })
})

describe('profileNodesReadEitherSchema — exactly one pair of bounds', () => {
  const bounds = (n: Record<string, unknown>) => ({
    ...base,
    nodes: [{ ...normalizedNode(), ...n }],
  })

  it('accepts price bounds alone', () => {
    const r = profileNodesReadEitherSchema.safeParse(
      bounds({ yLow: undefined, yHigh: undefined, priceLow: 100, priceHigh: 102 })
    )
    expect(r.success).toBe(true)
  })

  it('accepts normalized bounds alone', () => {
    expect(profileNodesReadEitherSchema.safeParse(bounds({})).success).toBe(true)
  })

  it('REJECTS a node carrying both price and normalized bounds', () => {
    const r = profileNodesReadEitherSchema.safeParse(bounds({ priceLow: 100, priceHigh: 102 }))
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.error?.issues)).toMatch(/EITHER price bounds or normalized bounds/)
  })

  it('REJECTS a node carrying neither', () => {
    const r = profileNodesReadEitherSchema.safeParse(bounds({ yLow: undefined, yHigh: undefined }))
    expect(r.success).toBe(false)
    expect(JSON.stringify(r.error?.issues)).toMatch(/needs either price bounds/)
  })

  it('REJECTS a half pair (one edge without the other)', () => {
    expect(profileNodesReadEitherSchema.safeParse(bounds({ yHigh: undefined })).success).toBe(false)
    expect(
      profileNodesReadEitherSchema.safeParse(
        bounds({ yLow: undefined, yHigh: undefined, priceLow: 100 })
      ).success
    ).toBe(false)
  })

  /**
   * A complete pair plus a stray half of the other pair is a band whose two
   * halves disagree. Accepting it would let an arm-specific `z.object` parse
   * strip the stray field and replay the band as if it had been clean — a
   * cached read silently changing meaning. (Codex P2, feat-135.)
   */
  it('REJECTS a complete pair plus a stray half of the other', () => {
    const withStrayY = profileNodesReadEitherSchema.safeParse(
      bounds({ yLow: undefined, yHigh: 0.5, priceLow: 100, priceHigh: 102 })
    )
    expect(withStrayY.success).toBe(false)
    expect(JSON.stringify(withStrayY.error?.issues)).toMatch(/never both/)

    const withStrayPrice = profileNodesReadEitherSchema.safeParse(bounds({ priceHigh: 102 }))
    expect(withStrayPrice.success).toBe(false)
    expect(JSON.stringify(withStrayPrice.error?.issues)).toMatch(/never both/)

    const zoneWithStray = profileNodesReadEitherSchema.safeParse({
      ...base,
      nodes: [normalizedNode()],
      thinZones: [{ low: 1, high: 2, yLow: 0.1 }],
    })
    expect(zoneWithStray.success).toBe(false)
  })

  it('applies the same both/neither rule to thin zones', () => {
    const zones = (thinZones: unknown[]) =>
      profileNodesReadEitherSchema.safeParse({ ...base, nodes: [normalizedNode()], thinZones })
    expect(zones([{ low: 1, high: 2 }]).success).toBe(true)
    expect(zones([{ yLow: 0.1, yHigh: 0.2 }]).success).toBe(true)
    expect(zones([{ low: 1, high: 2, yLow: 0.1, yHigh: 0.2 }]).success).toBe(false)
    expect(zones([{}]).success).toBe(false)
  })

  it('keeps every other rule (node ceiling, primary, rationale length)', () => {
    const many = Array.from({ length: MAX_NODES + 1 }, (_, i) =>
      normalizedNode({ primary: i === 0, yLow: i / 20, yHigh: i / 20 + 0.01 })
    )
    expect(profileNodesReadEitherSchema.safeParse({ ...base, nodes: many }).success).toBe(false)
    const wordy = Array.from({ length: 21 }, () => 'word').join(' ')
    expect(profileNodesReadEitherSchema.safeParse(bounds({ rationale: wordy })).success).toBe(false)
  })
})
