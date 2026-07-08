import type { Tracer } from '@opentelemetry/api'
import { ExportResultCode } from '@opentelemetry/core'
import type { ExportResult } from '@opentelemetry/core'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_LANGSMITH_OTLP_ENDPOINT,
  RedactingSpanExporter,
  buildLangsmithOtlpConfig,
  buildTelemetrySettings,
  getLlmTelemetry,
  redactImageParts,
  redactPromptAttribute,
  redactSpanAttributes,
  resetLlmTelemetryForTests,
} from '@/lib/observability'

// feat-030: LangSmith LLM telemetry — env gating, exporter config, and the
// image-redaction path that keeps base64 chart PNGs out of recorded traces.

const BASE64_PNG = 'A'.repeat(4000) // ~3000 bytes decoded

describe('buildLangsmithOtlpConfig', () => {
  it('is null (telemetry disabled) without LANGSMITH_API_KEY', () => {
    expect(buildLangsmithOtlpConfig({})).toBeNull()
    expect(buildLangsmithOtlpConfig({ LANGSMITH_PROJECT: 'gekko' })).toBeNull()
  })

  it('points at the LangSmith OTLP endpoint with the x-api-key header', () => {
    const config = buildLangsmithOtlpConfig({ LANGSMITH_API_KEY: 'ls-key' })
    expect(config).toEqual({
      url: DEFAULT_LANGSMITH_OTLP_ENDPOINT,
      headers: { 'x-api-key': 'ls-key' },
    })
    expect(DEFAULT_LANGSMITH_OTLP_ENDPOINT).toBe(
      'https://api.smith.langchain.com/otel/v1/traces',
    )
  })

  it('adds the Langsmith-Project header and honors the endpoint override', () => {
    const config = buildLangsmithOtlpConfig({
      LANGSMITH_API_KEY: 'ls-key',
      LANGSMITH_PROJECT: 'gekko-prod',
      LANGSMITH_OTEL_ENDPOINT: 'https://eu.api.smith.langchain.com/otel/v1/traces',
    })
    expect(config).toEqual({
      url: 'https://eu.api.smith.langchain.com/otel/v1/traces',
      headers: { 'x-api-key': 'ls-key', 'Langsmith-Project': 'gekko-prod' },
    })
  })
})

describe('getLlmTelemetry', () => {
  afterEach(() => {
    resetLlmTelemetryForTests()
  })

  it('is null — cleanly disabled — without LANGSMITH_API_KEY', () => {
    resetLlmTelemetryForTests()
    expect(getLlmTelemetry({})).toBeNull()
  })

  it('caches the disabled state (still null on a second call)', () => {
    resetLlmTelemetryForTests()
    getLlmTelemetry({})
    // Even with a key on the second call, the per-process decision is cached.
    expect(getLlmTelemetry({ LANGSMITH_API_KEY: 'late' })).toBeNull()
  })

  it('builds a tracer + flush runtime when the key is present', () => {
    resetLlmTelemetryForTests()
    const runtime = getLlmTelemetry({ LANGSMITH_API_KEY: 'ls-key' })
    expect(runtime).not.toBeNull()
    expect(typeof runtime!.tracer.startActiveSpan).toBe('function')
    expect(typeof runtime!.flush).toBe('function')
    // Singleton: same runtime on repeat calls.
    expect(getLlmTelemetry({ LANGSMITH_API_KEY: 'ls-key' })).toBe(runtime)
  })
})

describe('buildTelemetrySettings', () => {
  const tracer = { startActiveSpan: () => undefined } as unknown as Tracer
  const runtime = { tracer, flush: async () => {} }

  it('enables recording of inputs and outputs under the functionId', () => {
    const settings = buildTelemetrySettings({ functionId: 'analyze-task' }, runtime)
    expect(settings).toEqual({
      isEnabled: true,
      recordInputs: true,
      recordOutputs: true,
      functionId: 'analyze-task',
      tracer,
    })
  })

  it('threads optional metadata through', () => {
    const settings = buildTelemetrySettings(
      { functionId: 'eval-task', metadata: { bundleId: 'b1' } },
      runtime,
    )
    expect(settings.metadata).toEqual({ bundleId: 'b1' })
  })
})

describe('image redaction', () => {
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

  it('replaces LanguageModel file parts (the ai.prompt.messages shape)', () => {
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

  it('does not mutate its input', () => {
    const part = { type: 'image', image: BASE64_PNG }
    redactImageParts([part])
    expect(part.image).toBe(BASE64_PNG)
  })

  it('passes non-JSON attribute values through unchanged', () => {
    expect(redactPromptAttribute('not json {')).toBe('not json {')
  })

  it('redacts only the ai.prompt* span attributes', () => {
    const attributes: Record<string, unknown> = {
      'ai.prompt': JSON.stringify({
        system: 'DOCTRINE',
        messages: [
          {
            role: 'user',
            content: [{ type: 'image', image: BASE64_PNG, mediaType: 'image/png' }],
          },
        ],
      }),
      'ai.prompt.messages': JSON.stringify([
        {
          role: 'user',
          content: [{ type: 'file', data: BASE64_PNG, mediaType: 'image/png' }],
        },
      ]),
      'ai.response.object': '{"status":"WAIT"}',
      'gen_ai.request.model': 'anthropic/claude-sonnet-5',
    }

    redactSpanAttributes(attributes)

    expect(attributes['ai.prompt']).toContain('DOCTRINE')
    expect(attributes['ai.prompt']).toContain('[image: image/png, ~3000 bytes]')
    expect(attributes['ai.prompt']).not.toContain(BASE64_PNG)
    expect(attributes['ai.prompt.messages']).toContain(
      '[image: image/png, ~3000 bytes]',
    )
    expect(attributes['ai.prompt.messages']).not.toContain(BASE64_PNG)
    // Non-prompt attributes untouched.
    expect(attributes['ai.response.object']).toBe('{"status":"WAIT"}')
    expect(attributes['gen_ai.request.model']).toBe('anthropic/claude-sonnet-5')
  })
})

describe('RedactingSpanExporter', () => {
  function fakeSpan(attributes: Record<string, unknown>): ReadableSpan {
    return { attributes } as unknown as ReadableSpan
  }

  it('strips image payloads before forwarding spans to the inner exporter', () => {
    const exported: ReadableSpan[][] = []
    const inner: SpanExporter = {
      export: (spans, cb) => {
        exported.push(spans as ReadableSpan[])
        cb({ code: ExportResultCode.SUCCESS })
      },
      shutdown: async () => {},
    }
    const exporter = new RedactingSpanExporter(inner)

    const span = fakeSpan({
      'ai.prompt.messages': JSON.stringify([
        {
          role: 'user',
          content: [{ type: 'file', data: BASE64_PNG, mediaType: 'image/png' }],
        },
      ]),
      'ai.usage.inputTokens': 100,
    })

    let result: ExportResult | undefined
    exporter.export([span], (r) => {
      result = r
    })

    expect(result?.code).toBe(ExportResultCode.SUCCESS)
    expect(exported).toHaveLength(1)
    const attrs = exported[0][0].attributes as Record<string, unknown>
    expect(attrs['ai.prompt.messages']).not.toContain(BASE64_PNG)
    expect(attrs['ai.prompt.messages']).toContain('[image: image/png, ~3000 bytes]')
    expect(attrs['ai.usage.inputTokens']).toBe(100)
  })

  it('delegates shutdown and forceFlush to the inner exporter', async () => {
    const calls: string[] = []
    const inner: SpanExporter = {
      export: () => {},
      shutdown: async () => {
        calls.push('shutdown')
      },
      forceFlush: async () => {
        calls.push('forceFlush')
      },
    }
    const exporter = new RedactingSpanExporter(inner)
    await exporter.forceFlush()
    await exporter.shutdown()
    expect(calls).toEqual(['forceFlush', 'shutdown'])
  })
})
