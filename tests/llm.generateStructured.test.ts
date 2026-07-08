import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  DEFAULT_MODEL_ID,
  assertModelMatch,
  extractCachedInputTokens,
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
  usage?: unknown
}) {
  return (async (args: unknown) => {
    opts.capture?.(args)
    return {
      object: opts.object,
      response: { id: 'resp_1', timestamp: new Date(), modelId: opts.modelId },
      usage: opts.usage ?? { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
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

  it('accepts the dated canonical variant of the requested model', () => {
    // OpenRouter serves anthropic aliases under dated canonical ids.
    expect(() =>
      assertModelMatch('anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-5-20260630'),
    ).not.toThrow()
  })

  it('accepts a reordered dotted-version canonical id (haiku alias)', () => {
    expect(() =>
      assertModelMatch(
        'anthropic/claude-haiku-4-5',
        'anthropic/claude-4.5-haiku-20251001',
      ),
    ).not.toThrow()
  })

  it('still rejects a same-provider different model or version', () => {
    expect(() =>
      assertModelMatch('anthropic/claude-sonnet-5', 'anthropic/claude-haiku-4-5'),
    ).toThrow(/Model mismatch/)
    expect(() =>
      assertModelMatch(
        'anthropic/claude-sonnet-4-6',
        'anthropic/claude-sonnet-4-5-20250929',
      ),
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

  it('surfaces cache-read tokens from the AI SDK usage shape', async () => {
    const result = await generateStructured({
      schema: Out,
      prompt: 'classify',
      resolveModel,
      generate: fakeGenerate({
        object: { bias: 'long', score: 0 },
        modelId: DEFAULT_MODEL_ID,
        usage: {
          inputTokens: 5000,
          outputTokens: 50,
          totalTokens: 5050,
          inputTokenDetails: {
            noCacheTokens: 800,
            cacheReadTokens: 4200,
            cacheWriteTokens: 0,
          },
        },
      }),
    })
    expect(result.cachedInputTokens).toBe(4200)
  })

  it('falls back to the OpenRouter usage-accounting shape for cached tokens', async () => {
    const result = await generateStructured({
      schema: Out,
      prompt: 'classify',
      resolveModel,
      generate: fakeGenerate({
        object: { bias: 'long', score: 0 },
        modelId: DEFAULT_MODEL_ID,
        providerMetadata: {
          openrouter: {
            usage: { cost: 0.01, promptTokensDetails: { cachedTokens: 3100 } },
          },
        },
      }),
    })
    expect(result.cachedInputTokens).toBe(3100)
  })

  it('reports null cached tokens when neither shape carries them', async () => {
    const result = await generateStructured({
      schema: Out,
      prompt: 'classify',
      resolveModel,
      generate: fakeGenerate({
        object: { bias: 'long', score: 0 },
        modelId: DEFAULT_MODEL_ID,
      }),
    })
    expect(result.cachedInputTokens).toBeNull()
  })

  it('measures the LLM call latency', async () => {
    const result = await generateStructured({
      schema: Out,
      prompt: 'classify',
      resolveModel,
      generate: fakeGenerate({
        object: { bias: 'long', score: 0 },
        modelId: DEFAULT_MODEL_ID,
      }),
    })
    expect(Number.isFinite(result.latencyMs)).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('passes experimental_telemetry when opted in and the runtime is enabled', async () => {
    let captured: Record<string, unknown> | undefined
    const tracer = { startActiveSpan: () => undefined }
    let flushed = 0
    await generateStructured({
      schema: Out,
      prompt: 'classify',
      telemetry: { functionId: 'analyze-task', metadata: { bundleId: 'b1' } },
      getTelemetry: () =>
        ({
          tracer,
          flush: async () => {
            flushed += 1
          },
        }) as never,
      resolveModel,
      generate: fakeGenerate({
        object: { bias: 'long', score: 0 },
        modelId: DEFAULT_MODEL_ID,
        capture: (a) => {
          captured = a as typeof captured
        },
      }),
    })

    expect(captured!.experimental_telemetry).toEqual({
      isEnabled: true,
      recordInputs: true,
      recordOutputs: true,
      functionId: 'analyze-task',
      metadata: { bundleId: 'b1' },
      tracer,
    })
    expect(flushed).toBe(1)
  })

  it('omits experimental_telemetry when the runtime is disabled (no env key)', async () => {
    let captured: Record<string, unknown> | undefined
    await generateStructured({
      schema: Out,
      prompt: 'classify',
      telemetry: { functionId: 'analyze-task' },
      getTelemetry: () => null,
      resolveModel,
      generate: fakeGenerate({
        object: { bias: 'long', score: 0 },
        modelId: DEFAULT_MODEL_ID,
        capture: (a) => {
          captured = a as typeof captured
        },
      }),
    })
    expect(captured!).not.toHaveProperty('experimental_telemetry')
  })

  it('omits experimental_telemetry when the caller does not opt in', async () => {
    let captured: Record<string, unknown> | undefined
    let consulted = 0
    await generateStructured({
      schema: Out,
      prompt: 'classify',
      getTelemetry: () => {
        consulted += 1
        return null
      },
      resolveModel,
      generate: fakeGenerate({
        object: { bias: 'long', score: 0 },
        modelId: DEFAULT_MODEL_ID,
        capture: (a) => {
          captured = a as typeof captured
        },
      }),
    })
    expect(captured!).not.toHaveProperty('experimental_telemetry')
    expect(consulted).toBe(0)
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

describe('extractCachedInputTokens', () => {
  it('prefers the AI SDK inputTokenDetails.cacheReadTokens', () => {
    expect(
      extractCachedInputTokens(
        { inputTokenDetails: { cacheReadTokens: 1200 }, cachedInputTokens: 999 },
        { openrouter: { usage: { promptTokensDetails: { cachedTokens: 1 } } } },
      ),
    ).toBe(1200)
  })

  it('accepts the deprecated usage.cachedInputTokens alias', () => {
    expect(extractCachedInputTokens({ cachedInputTokens: 777 }, undefined)).toBe(777)
  })

  it('falls back to OpenRouter camelCase usage accounting', () => {
    expect(
      extractCachedInputTokens(
        { inputTokens: 10 },
        { openrouter: { usage: { promptTokensDetails: { cachedTokens: 512 } } } },
      ),
    ).toBe(512)
  })

  it('falls back to the raw snake_case OpenRouter shape', () => {
    expect(
      extractCachedInputTokens(undefined, {
        openrouter: { usage: { prompt_tokens_details: { cached_tokens: 256 } } },
      }),
    ).toBe(256)
  })

  it('reports zero cached tokens as 0, not null', () => {
    expect(
      extractCachedInputTokens({ inputTokenDetails: { cacheReadTokens: 0 } }, undefined),
    ).toBe(0)
  })

  it.each([
    [undefined, undefined],
    [null, null],
    [{}, {}],
    [{ inputTokenDetails: {} }, { openrouter: {} }],
    [{ cachedInputTokens: 'many' }, { openrouter: { usage: {} } }],
    [
      { inputTokenDetails: { cacheReadTokens: Number.NaN } },
      { openrouter: { usage: { promptTokensDetails: {} } } },
    ],
  ])('returns null for usage=%j metadata=%j', (usage, metadata) => {
    expect(extractCachedInputTokens(usage, metadata)).toBeNull()
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
