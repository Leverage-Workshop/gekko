import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  DEFAULT_MODEL_ID,
  assertModelMatch,
  extractCost,
  generateStructured,
  getOpenRouter,
} from '@/lib/llm'

const Out = z.object({ bias: z.enum(['long', 'short']), score: z.number() })

/** A fake `generateObject` that records its args and returns a canned result. */
function fakeGenerate(opts: {
  object: unknown
  modelId: string
  capture?: (args: unknown) => void
  providerMetadata?: unknown
}) {
  return (async (args: unknown) => {
    opts.capture?.(args)
    return {
      object: opts.object,
      response: { id: 'resp_1', timestamp: new Date(), modelId: opts.modelId },
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      providerMetadata: opts.providerMetadata,
    }
  }) as unknown as Parameters<typeof generateStructured>[0]['generate']
}

const resolveModel = ((id: string) => ({ modelId: id })) as never

describe('assertModelMatch', () => {
  it('passes when the served model equals the requested one', () => {
    expect(() => assertModelMatch(DEFAULT_MODEL_ID, DEFAULT_MODEL_ID)).not.toThrow()
  })

  it('throws when the provider serves a different model', () => {
    expect(() =>
      assertModelMatch('anthropic/claude-sonnet-4-6', 'openai/gpt-5.5'),
    ).toThrow(/Model mismatch/)
  })
})

describe('generateStructured', () => {
  it('returns the schema-validated object and served model', async () => {
    const result = await generateStructured({
      model: 'anthropic/claude-haiku-4-5',
      schema: Out,
      prompt: 'classify',
      resolveModel,
      generate: fakeGenerate({
        object: { bias: 'long', score: 0.7 },
        modelId: 'anthropic/claude-haiku-4-5',
      }),
    })

    expect(result.object).toEqual({ bias: 'long', score: 0.7 })
    expect(result.model).toBe('anthropic/claude-haiku-4-5')
    expect(result.usage.totalTokens).toBe(15)
  })

  it('defaults to the config default model id', async () => {
    let requestedModel = ''
    const result = await generateStructured({
      schema: Out,
      prompt: 'classify',
      resolveModel: ((id: string) => {
        requestedModel = id
        return { modelId: id }
      }) as never,
      generate: fakeGenerate({
        object: { bias: 'short', score: 1 },
        modelId: DEFAULT_MODEL_ID,
      }),
    })

    expect(requestedModel).toBe(DEFAULT_MODEL_ID)
    expect(result.model).toBe(DEFAULT_MODEL_ID)
  })

  it('attaches chart images as vision parts with default media type', async () => {
    let captured: { messages: { content: unknown[] }[] } | undefined
    await generateStructured({
      schema: Out,
      prompt: 'read the chart',
      images: [{ base64: 'AAAA' }, { base64: 'BBBB', mediaType: 'image/jpeg' }],
      resolveModel,
      generate: fakeGenerate({
        object: { bias: 'long', score: 0 },
        modelId: DEFAULT_MODEL_ID,
        capture: (a) => {
          captured = a as typeof captured
        },
      }),
    })

    const content = captured!.messages[0].content
    expect(content[0]).toEqual({ type: 'text', text: 'read the chart' })
    expect(content[1]).toEqual({ type: 'image', image: 'AAAA', mediaType: 'image/png' })
    expect(content[2]).toEqual({ type: 'image', image: 'BBBB', mediaType: 'image/jpeg' })
  })

  it('throws when the provider serves a substituted model', async () => {
    await expect(
      generateStructured({
        model: 'anthropic/claude-sonnet-4-6',
        schema: Out,
        prompt: 'classify',
        resolveModel,
        generate: fakeGenerate({
          object: { bias: 'long', score: 0 },
          modelId: 'meta-llama/llama-3-70b',
        }),
      }),
    ).rejects.toThrow(/Model mismatch/)
  })

  it('sends the system prefix as a cache-controlled message when cacheSystem is set', async () => {
    let captured: { messages: Record<string, unknown>[] } | undefined
    await generateStructured({
      schema: Out,
      prompt: 'classify',
      system: 'DOCTRINE',
      cacheSystem: true,
      resolveModel,
      generate: fakeGenerate({
        object: { bias: 'long', score: 0 },
        modelId: DEFAULT_MODEL_ID,
        capture: (a) => {
          captured = a as typeof captured
        },
      }),
    })

    expect(captured!.messages).toHaveLength(2)
    expect(captured!.messages[0]).toEqual({
      role: 'system',
      content: 'DOCTRINE',
      providerOptions: {
        openrouter: { cacheControl: { type: 'ephemeral' } },
      },
    })
    expect(captured!.messages[1].role).toBe('user')
  })

  it('sends a plain system message when cacheSystem is not set', async () => {
    let captured: { messages: Record<string, unknown>[] } | undefined
    await generateStructured({
      schema: Out,
      prompt: 'classify',
      system: 'DOCTRINE',
      resolveModel,
      generate: fakeGenerate({
        object: { bias: 'long', score: 0 },
        modelId: DEFAULT_MODEL_ID,
        capture: (a) => {
          captured = a as typeof captured
        },
      }),
    })

    expect(captured!.messages[0]).toEqual({ role: 'system', content: 'DOCTRINE' })
  })

  it('surfaces the OpenRouter usage-accounting cost', async () => {
    const result = await generateStructured({
      schema: Out,
      prompt: 'classify',
      resolveModel,
      generate: fakeGenerate({
        object: { bias: 'long', score: 0 },
        modelId: DEFAULT_MODEL_ID,
        providerMetadata: { openrouter: { usage: { cost: 0.0123 } } },
      }),
    })
    expect(result.cost).toBe(0.0123)
  })

  it('returns null cost when the provider reports none', async () => {
    const result = await generateStructured({
      schema: Out,
      prompt: 'classify',
      resolveModel,
      generate: fakeGenerate({
        object: { bias: 'long', score: 0 },
        modelId: DEFAULT_MODEL_ID,
      }),
    })
    expect(result.cost).toBeNull()
  })

  it('rejects output that violates the schema', async () => {
    await expect(
      generateStructured({
        schema: Out,
        prompt: 'classify',
        resolveModel,
        generate: fakeGenerate({
          object: { bias: 'sideways', score: 'high' },
          modelId: DEFAULT_MODEL_ID,
        }),
      }),
    ).rejects.toThrow()
  })
})

describe('extractCost', () => {
  it('pulls the USD cost from openrouter usage metadata', () => {
    expect(extractCost({ openrouter: { usage: { cost: 0.42 } } })).toBe(0.42)
  })

  it.each([
    [undefined],
    [null],
    [{}],
    [{ openrouter: {} }],
    [{ openrouter: { usage: {} } }],
    [{ openrouter: { usage: { cost: 'a lot' } } }],
    [{ openrouter: { usage: { cost: Number.NaN } } }],
  ])('returns null for %j', (metadata) => {
    expect(extractCost(metadata)).toBeNull()
  })
})

describe('getOpenRouter', () => {
  it('throws when OPENROUTER_API_KEY is missing', () => {
    const prev = process.env.OPENROUTER_API_KEY
    delete process.env.OPENROUTER_API_KEY
    try {
      expect(() => getOpenRouter()).toThrow(/OPENROUTER_API_KEY not configured/)
    } finally {
      if (prev !== undefined) process.env.OPENROUTER_API_KEY = prev
    }
  })

  it('builds a provider when the key is present', () => {
    const prev = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = 'sk-or-test'
    try {
      expect(typeof getOpenRouter()).toBe('function')
    } finally {
      if (prev === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = prev
    }
  })
})
