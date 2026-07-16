import { afterEach, describe, expect, it } from 'vitest'
import {
  buildLangsmithProviderOptions,
  getLlmTelemetry,
  redactImageParts,
  resetLlmTelemetryForTests,
} from '@/lib/observability'

// feat-030: LangSmith LLM telemetry via the official wrapAISDK integration —
// env gating, per-call provider options, and the image-redaction hooks that
// keep base64 chart PNGs out of recorded traces.

const BASE64_PNG = 'A'.repeat(4000) // ~3000 bytes decoded

describe('getLlmTelemetry', () => {
  afterEach(() => {
    resetLlmTelemetryForTests()
  })

  it('is null — cleanly disabled — without LANGSMITH_API_KEY', () => {
    resetLlmTelemetryForTests()
    expect(getLlmTelemetry({})).toBeNull()
    expect(getLlmTelemetry({ LANGSMITH_PROJECT: 'gekko' })).toBeNull()
  })

  it('caches the disabled state (still null on a second call)', () => {
    resetLlmTelemetryForTests()
    getLlmTelemetry({})
    // Even with a key on the second call, the per-process decision is cached.
    expect(getLlmTelemetry({ LANGSMITH_API_KEY: 'late' })).toBeNull()
  })

  it('builds a wrapped generateObject + flush runtime when the key is present', () => {
    resetLlmTelemetryForTests()
    const runtime = getLlmTelemetry({
      LANGSMITH_API_KEY: 'ls-key',
      LANGSMITH_PROJECT: 'gekko-prod',
    })
    expect(runtime).not.toBeNull()
    expect(typeof runtime!.generateObject).toBe('function')
    expect(typeof runtime!.flush).toBe('function')
    // Singleton: same runtime on repeat calls.
    expect(getLlmTelemetry({ LANGSMITH_API_KEY: 'ls-key' })).toBe(runtime)
  })
})

describe('buildLangsmithProviderOptions', () => {
  it('names the run after the functionId', () => {
    const options = buildLangsmithProviderOptions({ functionId: 'analyze-task' })
    expect(options.name).toBe('analyze-task')
    expect(options).not.toHaveProperty('metadata')
  })

  it('threads optional metadata through', () => {
    const options = buildLangsmithProviderOptions({
      functionId: 'eval-task',
      metadata: { bundleId: 'b1' },
    })
    expect(options.name).toBe('eval-task')
    expect(options.metadata).toEqual({ bundleId: 'b1' })
  })

  it('processInputs records prompt fields with images redacted, dropping model/schema', () => {
    const options = buildLangsmithProviderOptions({ functionId: 'analyze-task' })
    const processInputs = options.processInputs as unknown as (
      inputs: Record<string, unknown>,
    ) => Record<string, unknown>

    const messages = [
      { role: 'system', content: 'DOCTRINE' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'engine facts' },
          { type: 'image', image: BASE64_PNG, mediaType: 'image/png' },
        ],
      },
    ]
    const recorded = processInputs({
      model: { modelId: 'anthropic/claude-sonnet-5', huge: 'not-json' },
      schema: { parse: () => undefined },
      messages,
    })

    expect(recorded).not.toHaveProperty('model')
    expect(recorded).not.toHaveProperty('schema')
    const out = recorded.messages as typeof messages
    expect(out[0]).toEqual({ role: 'system', content: 'DOCTRINE' })
    expect(out[1].content[0]).toEqual({ type: 'text', text: 'engine facts' })
    expect(out[1].content[1]).toEqual({
      type: 'image',
      image: '[image: image/png, ~3000 bytes]',
      mediaType: 'image/png',
    })
    // Never mutates the real call inputs.
    expect((messages[1].content[1] as { image: string }).image).toBe(BASE64_PNG)
  })

  it('processChildLLMRunInputs redacts provider-level file parts', () => {
    const options = buildLangsmithProviderOptions({ functionId: 'eval-task' })
    const processChild = options.processChildLLMRunInputs as unknown as (
      inputs: Record<string, unknown>,
    ) => Record<string, unknown>

    const recorded = processChild({
      prompt: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'read the chart' },
            { type: 'file', data: BASE64_PNG, mediaType: 'image/png' },
          ],
        },
      ],
      maxOutputTokens: 4096,
    })

    const prompt = recorded.prompt as {
      content: Record<string, unknown>[]
    }[]
    expect(prompt[0].content[0]).toEqual({ type: 'text', text: 'read the chart' })
    expect(prompt[0].content[1]).toEqual({
      type: 'file',
      data: '[image: image/png, ~3000 bytes]',
      mediaType: 'image/png',
    })
  })
})

describe('redactImageParts', () => {
  it('replaces ModelMessage image parts with a placeholder, keeping text', () => {
    const prompt = {
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'DOCTRINE + engine facts' },
            { type: 'image', image: BASE64_PNG, mediaType: 'image/png' },
          ],
        },
      ],
    }
    const redacted = redactImageParts(prompt) as typeof prompt
    expect(redacted.messages[0].content[0]).toEqual({
      type: 'text',
      text: 'DOCTRINE + engine facts',
    })
    expect(redacted.messages[0].content[1]).toEqual({
      type: 'image',
      image: '[image: image/png, ~3000 bytes]',
      mediaType: 'image/png',
    })
  })

  it('replaces LanguageModel file parts (the child-run prompt shape)', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'read the chart' },
          { type: 'file', data: BASE64_PNG, mediaType: 'image/png' },
        ],
      },
    ]
    const redacted = redactImageParts(messages) as typeof messages
    expect(redacted[0].content[1]).toEqual({
      type: 'file',
      data: '[image: image/png, ~3000 bytes]',
      mediaType: 'image/png',
    })
  })

  it('replaces binary (Uint8Array) file payloads', () => {
    const part = {
      type: 'file',
      data: new Uint8Array(3000),
      mediaType: 'image/png',
    }
    expect(redactImageParts(part)).toEqual({
      type: 'file',
      data: '[image: image/png, ~3000 bytes]',
      mediaType: 'image/png',
    })
  })

  it('does not mutate its input', () => {
    const part = { type: 'image', image: BASE64_PNG }
    redactImageParts([part])
    expect(part.image).toBe(BASE64_PNG)
  })

  it('passes primitives and non-image structures through unchanged', () => {
    expect(redactImageParts('DOCTRINE')).toBe('DOCTRINE')
    expect(redactImageParts(42)).toBe(42)
    expect(redactImageParts({ type: 'text', text: 'hi' })).toEqual({
      type: 'text',
      text: 'hi',
    })
  })
})
