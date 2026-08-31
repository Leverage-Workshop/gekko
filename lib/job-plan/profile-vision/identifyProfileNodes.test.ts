import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { parseVbpProfile, type VbpProfile } from '@/lib/engine/parseProfile'
import {
  DEFAULT_CONCURRENCY,
  identifyProfileNodes,
  runWithConcurrency,
  withTimeout,
  type IdentifyProfileNodesInput,
  type VisionGenerate,
} from './identifyProfileNodes'
import { VISION_PROMPT_REVISION } from './prompt'
import type { ProfileNodesRead } from './schema'

const FIXTURE = join(process.cwd(), 'chart-data/four-hundred-rotation.vbp.md')
const fiveDay = () => parseVbpProfile(readFileSync(FIXTURE, 'utf8'))

/** A short 4h-style profile: 60 one-point rows. */
function fourHour(): VbpProfile {
  const rows = Array.from({ length: 60 }, (_, i) => ({
    price: 29960 - i,
    volume: 100 + Math.round(80 * Math.sin(i / 6) ** 2),
  }))
  return {
    rows,
    meta: {
      tickSize: 0.25,
      binSize: 4,
      step: 1,
      pocPrice: 29930,
      valueAreaHigh: 29950,
      valueAreaLow: 29910,
    },
  }
}

/** A cheap stand-in rasterizer: the PNG bytes are irrelevant to the orchestration under test. */
const fakeRasterize = (svg: string) => new Uint8Array(Buffer.from(svg.slice(0, 16)))

function goodRead(): ProfileNodesRead {
  return {
    nodes: [
      {
        kind: 'lvn',
        priceLow: 29400,
        priceHigh: 29404,
        prominence: 1,
        primary: true,
        position: 'mid',
        edgeBelow: 'taper', edgeAbove: 'flat',
        rationale: 'deepest',
      },
      {
        kind: 'hvn',
        priceLow: 29880,
        priceHigh: 29920,
        prominence: 1,
        primary: false,
        position: 'upper',
        edgeBelow: 'none', edgeAbove: 'none',
        rationale: 'poc',
      },
    ],
    thinZones: [{ low: 29380, high: 29420 }],
  }
}

function baseInput(
  generate: VisionGenerate,
  overrides: Partial<IdentifyProfileNodesInput> = {}
): IdentifyProfileNodesInput {
  return {
    instrument: 'NQ',
    currentPrice: 29945.75,
    profiles: { '5d': fiveDay() },
    samples: 3,
    modelId: 'test/model',
    effort: 'medium',
    generate,
    rasterize: fakeRasterize,
    ...overrides,
  }
}

const ok: VisionGenerate = async () => ({ object: goodRead(), cost: 0.01, latencyMs: 5 })

describe('identifyProfileNodes — calls', () => {
  it('makes S calls per tile per profile, passing the model, effort, schema, few-shot + target images', async () => {
    const generate = vi.fn(ok)
    const result = await identifyProfileNodes(
      baseInput(generate, { profiles: { '5d': fiveDay(), '4h': fourHour() } })
    )
    expect(generate).toHaveBeenCalledTimes(6)
    for (const [params] of generate.mock.calls) {
      expect(params.model).toBe('test/model')
      expect(params.effort).toBe('medium')
      // feat-141: no worked examples — exactly one image, the profile to read
      expect(params.images).toHaveLength(1)
      expect(params.schema.safeParse(goodRead()).success).toBe(true)
      expect(params.prompt).toContain('Profile to read')
    }
    const prompts = new Set(generate.mock.calls.map(([p]) => p.prompt))
    expect(prompts.size).toBe(2) // one prompt per profile, reused across samples
    expect([...prompts].some((p) => p.includes('5-day rolling'))).toBe(true)
    expect([...prompts].some((p) => p.includes('4-hour rolling'))).toBe(true)
    expect(result.profiles['5d']?.raw).toHaveLength(3)
    expect(result.profiles['4h']?.raw).toHaveLength(3)
  })

  it('reads only the profiles present', async () => {
    const generate = vi.fn(ok)
    const result = await identifyProfileNodes(
      baseInput(generate, { profiles: { '4h': fourHour() } })
    )
    expect(generate).toHaveBeenCalledTimes(3)
    expect(result.profiles['5d']).toBeUndefined()
    expect(result.profiles['4h']?.consensus).not.toBeNull()
  })

  it('carries provenance: model, effort, prompt revision, few-shot source, image hashes, render meta', async () => {
    const result = await identifyProfileNodes(baseInput(ok))
    expect(result.modelId).toBe('test/model')
    expect(result.effort).toBe('medium')
    expect(result.promptRevision).toBe(VISION_PROMPT_REVISION)
    expect(result.samples).toBe(3)
    const entry = result.profiles['5d']!
    expect(entry.imageHashes).toHaveLength(1)
    expect(entry.imageHashes[0]).toMatch(/^[0-9a-f]{64}$/)
    expect(entry.render.step).toBe(2)
    expect(entry.raw.every((r) => r.imageSha256 === entry.imageHashes[0])).toBe(true)
  })

  it('with two tiles: calls per tile, prompt names the tile, and consensus needs both tiles per sample', async () => {
    const generate = vi.fn(ok)
    const result = await identifyProfileNodes(
      baseInput(generate, { render: { tiles: 2 }, samples: 2 })
    )
    expect(generate).toHaveBeenCalledTimes(4)
    const tilePrompts = generate.mock.calls.map(([p]) => p.prompt)
    expect(tilePrompts.some((p) => p.includes('tile 1 of 2'))).toBe(true)
    expect(tilePrompts.some((p) => p.includes('tile 2 of 2'))).toBe(true)
    expect(result.profiles['5d']?.imageHashes).toHaveLength(2)
    expect(result.profiles['5d']?.consensus?.successfulSamples).toBe(2)
  })

  it('honours the concurrency cap', async () => {
    let inFlight = 0
    let peak = 0
    const generate: VisionGenerate = async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 5))
      inFlight -= 1
      return { object: goodRead(), cost: null, latencyMs: 5 }
    }
    await identifyProfileNodes(
      baseInput(generate, {
        samples: 5,
        concurrency: 2,
        profiles: { '5d': fiveDay(), '4h': fourHour() },
      })
    )
    expect(peak).toBe(2)
    expect(DEFAULT_CONCURRENCY).toBe(6)
  })

  it('rejects a non-positive sample count and a blank model id', async () => {
    await expect(identifyProfileNodes(baseInput(ok, { samples: 0 }))).rejects.toThrow(/samples/)
    await expect(identifyProfileNodes(baseInput(ok, { modelId: ' ' }))).rejects.toThrow(/modelId/)
  })
})

describe('identifyProfileNodes — failure tolerance (R14)', () => {
  it('tolerates one failing sample out of three and still reaches consensus', async () => {
    let n = 0
    const generate: VisionGenerate = async () => {
      n += 1
      if (n === 2) throw new Error('provider 500')
      return { object: goodRead(), cost: null, latencyMs: 1 }
    }
    const result = await identifyProfileNodes(baseInput(generate))
    const entry = result.profiles['5d']!
    expect(entry.raw.filter((r) => r.ok)).toHaveLength(2)
    expect(entry.raw.find((r) => !r.ok)?.error).toBe('provider 500')
    expect(entry.consensus?.successfulSamples).toBe(2)
    expect(result.warnings).toEqual([])
  })

  it('ceil(S/2) - 1 successes -> consensus null plus a profile_nodes_unavailable warning, never a throw', async () => {
    let n = 0
    const generate: VisionGenerate = async () => {
      n += 1
      if (n !== 1) throw new Error('boom')
      return { object: goodRead(), cost: null, latencyMs: 1 }
    }
    const result = await identifyProfileNodes(baseInput(generate, { samples: 3 }))
    expect(result.profiles['5d']?.consensus).toBeNull()
    expect(result.profiles['5d']?.raw).toHaveLength(3)
    expect(result.warnings).toEqual(['profile_nodes_unavailable:5d'])
  })

  it('counts a timed-out call as a failed sample AND aborts its signal so the provider request is cancelled', async () => {
    let n = 0
    const signals: AbortSignal[] = []
    const generate: VisionGenerate = async ({ abortSignal }) => {
      n += 1
      signals.push(abortSignal)
      if (n === 1) await new Promise((r) => setTimeout(r, 50))
      return { object: goodRead(), cost: null, latencyMs: 1 }
    }
    const result = await identifyProfileNodes(baseInput(generate, { timeoutMs: 10 }))
    const entry = result.profiles['5d']!
    expect(entry.raw.filter((r) => !r.ok)).toHaveLength(1)
    expect(entry.raw.find((r) => !r.ok)?.error).toMatch(/timed out after 10 ms/)
    expect(entry.consensus?.successfulSamples).toBe(2)
    expect(signals).toHaveLength(3)
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
    expect(signals[2].aborted).toBe(false)
  })

  it('passes a fresh, un-aborted signal to every call and never aborts a call that completed', async () => {
    const signals: AbortSignal[] = []
    const generate: VisionGenerate = async ({ abortSignal }) => {
      signals.push(abortSignal)
      return { object: goodRead(), cost: null, latencyMs: 1 }
    }
    await identifyProfileNodes(baseInput(generate))
    expect(new Set(signals).size).toBe(3)
    expect(signals.every((s) => !s.aborted)).toBe(true)
  })

  it('a non-Error rejection is captured as a string', async () => {
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the point is a non-Error rejection
    const generate: VisionGenerate = () => Promise.reject('string failure')
    const result = await identifyProfileNodes(baseInput(generate, { samples: 1 }))
    expect(result.profiles['5d']?.raw[0].error).toBe('string failure')
    expect(result.warnings).toEqual(['profile_nodes_unavailable:5d'])
  })

  it('warns per profile independently', async () => {
    const generate: VisionGenerate = async ({ prompt }) => {
      if (prompt.includes('4-hour rolling')) throw new Error('down')
      return { object: goodRead(), cost: null, latencyMs: 1 }
    }
    const result = await identifyProfileNodes(
      baseInput(generate, { profiles: { '5d': fiveDay(), '4h': fourHour() } })
    )
    expect(result.profiles['5d']?.consensus).not.toBeNull()
    expect(result.profiles['4h']?.consensus).toBeNull()
    expect(result.warnings).toEqual(['profile_nodes_unavailable:4h'])
  })
})

describe('runWithConcurrency / withTimeout', () => {
  it('preserves task order in the results', async () => {
    const out = await runWithConcurrency(
      [3, 1, 2].map((ms) => () => new Promise<number>((r) => setTimeout(() => r(ms), ms))),
      3
    )
    expect(out).toEqual([3, 1, 2])
  })

  it('withTimeout resolves before the deadline, rejects + aborts after it, and passes inner errors through', async () => {
    const fast = new AbortController()
    await expect(withTimeout(Promise.resolve('ok'), 10, fast)).resolves.toBe('ok')
    expect(fast.signal.aborted).toBe(false)
    const slow = new AbortController()
    await expect(withTimeout(new Promise((r) => setTimeout(r, 30)), 5, slow)).rejects.toThrow(
      /timed out/
    )
    expect(slow.signal.aborted).toBe(true)
    await expect(
      withTimeout(Promise.reject(new Error('inner')), 10, new AbortController())
    ).rejects.toThrow('inner')
  })
})
