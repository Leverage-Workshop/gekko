/**
 * Chart-image redaction for recorded LLM telemetry (feat-030).
 *
 * LangSmith's `wrapAISDK` records the call inputs on the parent run and the
 * provider-level prompt on the child LLM run. Our prompts carry base64 PNG
 * chart screenshots — several hundred KB each — which would bloat every
 * recorded trace. The wrapper's `processInputs` / `processChildLLMRunInputs`
 * hooks (built in ./telemetry.ts) run this redaction so every image/file
 * part's payload is replaced with a small `[image: <mediaType>, ~N bytes]`
 * placeholder while the doctrine/system text and JSON output are kept
 * verbatim.
 *
 * This only touches what gets RECORDED — the hooks never mutate their inputs
 * (a redacted copy is returned), so the images sent to the model are
 * untouched.
 */

/** Approximate decoded byte count of an image payload. */
function approxPayloadBytes(payload: string | Uint8Array): number {
  // Strings are base64 at this layer (that's how Gekko attaches charts and
  // how the AI SDK stringifies binary data); binary payloads count directly.
  return typeof payload === 'string'
    ? Math.floor((payload.length * 3) / 4)
    : payload.byteLength
}

function imagePlaceholder(
  mediaType: unknown,
  payload: string | Uint8Array,
): string {
  const label = typeof mediaType === 'string' && mediaType ? mediaType : 'image'
  return `[image: ${label}, ~${approxPayloadBytes(payload)} bytes]`
}

function isPayload(value: unknown): value is string | Uint8Array {
  return typeof value === 'string' || value instanceof Uint8Array
}

/**
 * Deep-walk a JSON-ish value and replace image payloads with placeholders.
 * Handles both shapes the LangSmith hooks receive:
 *   - `ModelMessage` image parts: `{ type: 'image', image: <base64>, mediaType }`
 *     (the `generateObject` call inputs on the parent run), and
 *   - `LanguageModelV2` prompt file parts: `{ type: 'file', data: <base64 |
 *     Uint8Array>, mediaType }` (the child LLM run — the SDK converts image
 *     parts to file parts for the provider call).
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

  if (record.type === 'image' && isPayload(record.image)) {
    return { ...record, image: imagePlaceholder(record.mediaType, record.image) }
  }
  if (record.type === 'file' && isPayload(record.data)) {
    return { ...record, data: imagePlaceholder(record.mediaType, record.data) }
  }

  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(record)) {
    out[key] = redactImageParts(entry)
  }
  return out
}
