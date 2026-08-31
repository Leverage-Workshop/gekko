import { describe, expect, it } from 'vitest'
import { MAX_NODES, profileNodesReadSchema, type ProfileNode } from './schema'

function node(overrides: Partial<ProfileNode> = {}): ProfileNode {
  return {
    kind: 'lvn',
    priceLow: 100,
    priceHigh: 102,
    prominence: 1,
    primary: true,
    position: 'mid',
    edgeBelow: 'taper', edgeAbove: 'flat',
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
      nodes: [node({ kind: 'hvn', primary: false, edgeBelow: 'none', edgeAbove: 'none' })],
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
      nodes: [node({ kind: 'hvn', primary: true })],
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
    // feat-139 retired these; they must now be rejected, not silently accepted
    for (const retired of ['taper-tail']) {
      expect(
        profileNodesReadSchema.safeParse({ ...base, nodes: [node({ kind: retired as never })] })
          .success,
        `retired kind still accepted: ${retired}`
      ).toBe(false)
    }
    // feat-140: an LVN has two sides, so a single `shape` is gone entirely and
    // each side carries its own edge form.
    for (const retired of ['valley', 'shelf-edge', 'wide-gap', 'notch', 'peak']) {
      expect(
        profileNodesReadSchema.safeParse({ ...base, nodes: [node({ edgeBelow: retired as never })] })
          .success,
        `retired edge still accepted: ${retired}`
      ).toBe(false)
    }
    // The retired single `shape` cannot stand in for the two sides: zod strips
    // unknown keys, so what matters is that BOTH edges are required.
    for (const missing of ['edgeBelow', 'edgeAbove']) {
      const n = node()
      delete (n as Record<string, unknown>)[missing]
      expect(
        profileNodesReadSchema.safeParse({ ...base, nodes: [n] }).success,
        `${missing} must be required — an LVN has two sides`
      ).toBe(false)
    }
  })

  it('is a flat object at the root (no unions — OpenAI rejects them)', () => {
    // The schema's root type is an object; every field is a primitive, enum, array or object.
    const r = profileNodesReadSchema.safeParse({ ...base, nodes: [node()] })
    expect(r.success).toBe(true)
    expect(Object.keys(r.data!).sort()).toEqual([
      'nodes',
      'thinZones',
    ])
  })
})
