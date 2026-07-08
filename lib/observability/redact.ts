import type { ExportResult } from '@opentelemetry/core'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'

/**
 * Chart-image redaction for recorded LLM telemetry (feat-030).
 *
 * The AI SDK's `experimental_telemetry` records the full prompt on the span
 * (`ai.prompt` on the outer span, `ai.prompt.messages` on the doGenerate
 * span). Our prompts carry base64 PNG chart screenshots — several hundred KB
 * each — which would bloat every exported trace. The AI SDK offers no
 * built-in redaction (recordInputs is boolean-only), so we rewrite the
 * recorded attributes at export time: every image/file part's payload is
 * replaced with a small `[image: <mediaType>, ~N bytes]` placeholder while
 * the doctrine/system text and JSON output are kept verbatim.
 *
 * This only touches what gets RECORDED — the images sent to the model are
 * untouched (redaction happens in the span exporter, far downstream of the
 * actual LLM request).
 */

/** Span attribute keys that carry the recorded prompt (and its image parts). */
const PROMPT_ATTRIBUTE_PREFIX = 'ai.prompt'

/** Approximate decoded byte count of a base64 payload. */
function approxBase64Bytes(base64: string): number {
  return Math.floor((base64.length * 3) / 4)
}

function imagePlaceholder(mediaType: unknown, payload: string): string {
  const label = typeof mediaType === 'string' && mediaType ? mediaType : 'image'
  return `[image: ${label}, ~${approxBase64Bytes(payload)} bytes]`
}

/**
 * Deep-walk a JSON value and replace image payloads with placeholders.
 * Handles both shapes the AI SDK records:
 *   - `ModelMessage` image parts: `{ type: 'image', image: '<base64>', mediaType }`
 *     (the outer `ai.prompt` attribute), and
 *   - `LanguageModel` prompt file parts: `{ type: 'file', data: '<base64>', mediaType }`
 *     (the inner `ai.prompt.messages` attribute — the SDK converts images to
 *     file parts and stringifies binary data to base64 for telemetry).
 * Everything else (text parts, system strings, structure) passes through.
 */
export function redactImageParts(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactImageParts)
  }
  if (typeof value !== 'object' || value === null) {
    return value
  }

  const record = value as Record<string, unknown>

  if (record.type === 'image' && typeof record.image === 'string') {
    return { ...record, image: imagePlaceholder(record.mediaType, record.image) }
  }
  if (record.type === 'file' && typeof record.data === 'string') {
    return { ...record, data: imagePlaceholder(record.mediaType, record.data) }
  }

  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(record)) {
    out[key] = redactImageParts(entry)
  }
  return out
}

/**
 * Redact a recorded prompt attribute value (a JSON string). Non-JSON values
 * are returned unchanged — better to record something odd than to throw
 * inside an exporter.
 */
export function redactPromptAttribute(value: string): string {
  try {
    return JSON.stringify(redactImageParts(JSON.parse(value)))
  } catch {
    return value
  }
}

/**
 * Rewrite the prompt-carrying attributes of a span's attribute record in
 * place (span attribute records are plain mutable objects in the OTel SDK).
 */
export function redactSpanAttributes(
  attributes: Record<string, unknown>,
): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith(PROMPT_ATTRIBUTE_PREFIX) && typeof value === 'string') {
      attributes[key] = redactPromptAttribute(value)
    }
  }
}

/**
 * A `SpanExporter` decorator that strips base64 chart images out of the
 * recorded prompt attributes before handing spans to the real exporter
 * (the OTLP exporter pointed at LangSmith).
 */
export class RedactingSpanExporter implements SpanExporter {
  constructor(private readonly inner: SpanExporter) {}

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void,
  ): void {
    for (const span of spans) {
      redactSpanAttributes(span.attributes as Record<string, unknown>)
    }
    this.inner.export(spans, resultCallback)
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown()
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush?.() ?? Promise.resolve()
  }
}
