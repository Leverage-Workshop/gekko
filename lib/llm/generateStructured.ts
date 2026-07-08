import { generateObject } from 'ai'
import type {
  ImagePart,
  LanguageModel,
  ModelMessage,
  TextPart,
} from 'ai'
import type { z } from 'zod'
import {
  buildTelemetrySettings,
  getLlmTelemetry,
} from '@/lib/observability'
import type { LlmTelemetryRuntime, TelemetryOptions } from '@/lib/observability'
import { getOpenRouter } from './client'

/**
 * Default model id, mirroring the `config.model_id` column default.
 * anthropic/claude-sonnet-5 per the 2026-07-06 OpenRouter catalog review:
 * strictly dominates sonnet-4.6 (intelligence/coding/agentic) at ~2/3 the
 * price, with image input + structured outputs + prompt caching.
 */
export const DEFAULT_MODEL_ID = 'anthropic/claude-sonnet-5'

/** A chart image to attach to the prompt as a vision part (base64-encoded PNG). */
export interface ChartImage {
  /** Base64-encoded image data (no `data:` URI prefix). */
  base64: string
  /** IANA media type; defaults to `image/png`. */
  mediaType?: string
}

export interface GenerateStructuredParams<T> {
  /** OpenRouter model id, e.g. `config.model_id`. Defaults to {@link DEFAULT_MODEL_ID}. */
  model?: string
  /** Zod schema the model output is constrained to and validated against. */
  schema: z.ZodType<T>
  /** Instruction text (the "what to produce" prompt). */
  prompt: string
  /** Optional system / doctrine prefix. */
  system?: string
  /**
   * Prompt-cache the system prefix (Anthropic ephemeral cache via OpenRouter).
   * Only set when `system` is static across runs — volatile content in the
   * prefix would invalidate the cache every call.
   */
  cacheSystem?: boolean
  /** Chart images to attach as vision parts. */
  images?: readonly ChartImage[]
  /**
   * Opt-in LLM telemetry (feat-030): record this call's prompt + response as
   * an OTel trace exported to LangSmith. Only active when `LANGSMITH_API_KEY`
   * is configured — otherwise silently disabled. Image parts are redacted
   * from the recorded inputs (never from what is sent to the model).
   */
  telemetry?: TelemetryOptions
  /**
   * Resolve a model id to a `LanguageModel`. Defaults to the OpenRouter
   * provider. Injectable for tests.
   */
  resolveModel?: (modelId: string) => LanguageModel
  /** AI SDK `generateObject` implementation. Injectable for tests. */
  generate?: typeof generateObject
  /** Telemetry runtime accessor. Injectable for tests. */
  getTelemetry?: () => LlmTelemetryRuntime | null
}

export interface GenerateStructuredResult<T> {
  /** Schema-validated structured output. */
  object: T
  /** Model id the provider reported actually serving the request. */
  model: string
  /** Token usage for the call. */
  usage: Awaited<ReturnType<typeof generateObject>>['usage']
  /** OpenRouter-reported cost in USD (usage accounting), or null. */
  cost: number | null
  /**
   * Prompt-cache read tokens for the call (feat-023): input tokens served
   * from the Anthropic prompt cache, or null when the provider reported none.
   * > 0 on a repeat run proves the cached doctrine prefix is being hit.
   */
  cachedInputTokens: number | null
  /** Wall-clock latency of the LLM call in milliseconds (feat-030). */
  latencyMs: number
}

/**
 * Split a model id into its provider and a normalized token multiset.
 * OpenRouter serves Anthropic aliases under their dated canonical ids —
 * e.g. requesting `anthropic/claude-sonnet-5` returns
 * `anthropic/claude-sonnet-5-20260630`, and `anthropic/claude-haiku-4-5`
 * returns `anthropic/claude-4.5-haiku-20251001` (same tokens, reordered,
 * dotted version) — so equivalence is: same provider, same name tokens
 * (order-insensitive, `.`/`-`/`:` separated, ignoring an 8-digit date stamp).
 */
function modelIdentity(id: string): { provider: string; tokens: string } {
  const slash = id.indexOf('/')
  const provider = slash === -1 ? '' : id.slice(0, slash)
  const name = slash === -1 ? id : id.slice(slash + 1)
  const tokens = name
    .split(/[.:-]/)
    .filter((token) => token.length > 0 && !/^\d{8}$/.test(token))
    .sort()
    .join(' ')
  return { provider, tokens }
}

/**
 * Assert the model OpenRouter actually served matches what we asked for, so a
 * silently-substituted model can never produce a Briefing under a wrong label.
 * The served id may be the requested id's dated canonical variant (see
 * {@link modelIdentity}); anything else — different provider, different model
 * family, different version — throws.
 *
 * @throws if the returned model id is not the requested model.
 */
export function assertModelMatch(requested: string, returned: string): void {
  if (returned === requested) return

  const want = modelIdentity(requested)
  const got = modelIdentity(returned)
  if (want.provider === got.provider && want.tokens === got.tokens) return

  throw new Error(
    `Model mismatch: requested "${requested}" but provider served "${returned}"`,
  )
}

function buildUserContent(
  prompt: string,
  images: readonly ChartImage[],
): Array<TextPart | ImagePart> {
  const imageParts: ImagePart[] = images.map((img) => ({
    type: 'image',
    image: img.base64,
    mediaType: img.mediaType ?? 'image/png',
  }))

  return [{ type: 'text', text: prompt }, ...imageParts]
}

/**
 * Thin wrapper over the Vercel AI SDK `generateObject` for Gekko's single-shot,
 * vision-enabled, structured-output workload. Builds a multimodal user message
 * (instruction text + chart images), calls the model via OpenRouter, asserts the
 * served model matches the requested one, and re-validates the output against
 * the Zod schema before returning it.
 */
export async function generateStructured<T>(
  params: GenerateStructuredParams<T>,
): Promise<GenerateStructuredResult<T>> {
  const {
    model = DEFAULT_MODEL_ID,
    schema,
    prompt,
    system,
    cacheSystem = false,
    images = [],
    telemetry,
    resolveModel = (id) => getOpenRouter()(id, { usage: { include: true } }),
    generate = generateObject,
    getTelemetry = getLlmTelemetry,
  } = params

  const messages: ModelMessage[] = []
  if (system !== undefined) {
    messages.push({
      role: 'system',
      content: system,
      ...(cacheSystem
        ? {
            providerOptions: {
              openrouter: { cacheControl: { type: 'ephemeral' } },
            },
          }
        : {}),
    })
  }
  messages.push({ role: 'user', content: buildUserContent(prompt, images) })

  // Telemetry is doubly gated: the caller must opt in (`telemetry`) AND the
  // runtime must be configured (LANGSMITH_API_KEY) — otherwise nothing is
  // recorded and nothing is exported.
  const telemetryRuntime = telemetry ? getTelemetry() : null

  const startedAt = Date.now()
  const result = await generate({
    model: resolveModel(model),
    schema,
    messages,
    ...(telemetry && telemetryRuntime
      ? {
          experimental_telemetry: buildTelemetrySettings(
            telemetry,
            telemetryRuntime,
          ),
        }
      : {}),
  })
  const latencyMs = Date.now() - startedAt

  if (telemetryRuntime) {
    // Ship the buffered spans now; a LangSmith outage must never fail a run.
    try {
      await telemetryRuntime.flush()
    } catch {
      // best-effort export only
    }
  }

  assertModelMatch(model, result.response.modelId)

  return {
    object: schema.parse(result.object),
    model: result.response.modelId,
    usage: result.usage,
    cost: extractCost(result.providerMetadata),
    cachedInputTokens: extractCachedInputTokens(
      result.usage,
      result.providerMetadata,
    ),
    latencyMs,
  }
}

/**
 * Pull the USD cost out of OpenRouter's usage-accounting provider metadata
 * (`providerMetadata.openrouter.usage.cost`), tolerating absence.
 */
export function extractCost(providerMetadata: unknown): number | null {
  if (typeof providerMetadata !== 'object' || providerMetadata === null) {
    return null
  }
  const openrouter = (providerMetadata as Record<string, unknown>).openrouter
  if (typeof openrouter !== 'object' || openrouter === null) {
    return null
  }
  const usage = (openrouter as Record<string, unknown>).usage
  if (typeof usage !== 'object' || usage === null) {
    return null
  }
  const cost = (usage as Record<string, unknown>).cost
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Pull the prompt-cache read-token count out of the call result, tolerating
 * absence. Reads BOTH surfaces the current deps expose, in order:
 *
 *   1. AI SDK usage — `usage.inputTokenDetails.cacheReadTokens` (canonical in
 *      AI SDK v6) then the deprecated alias `usage.cachedInputTokens`;
 *   2. OpenRouter usage-accounting provider metadata —
 *      `providerMetadata.openrouter.usage.promptTokensDetails.cachedTokens`
 *      (the provider camelCases the raw `prompt_tokens_details.cached_tokens`;
 *      the raw snake_case shape is also accepted defensively).
 */
export function extractCachedInputTokens(
  usage: unknown,
  providerMetadata: unknown,
): number | null {
  const usageRecord = asRecord(usage)
  if (usageRecord) {
    const details = asRecord(usageRecord.inputTokenDetails)
    const fromDetails = finiteNumber(details?.cacheReadTokens)
    if (fromDetails !== null) return fromDetails

    const fromAlias = finiteNumber(usageRecord.cachedInputTokens)
    if (fromAlias !== null) return fromAlias
  }

  const openrouterUsage = asRecord(
    asRecord(asRecord(providerMetadata)?.openrouter)?.usage,
  )
  if (openrouterUsage) {
    const camel = finiteNumber(
      asRecord(openrouterUsage.promptTokensDetails)?.cachedTokens,
    )
    if (camel !== null) return camel

    const snake = finiteNumber(
      asRecord(openrouterUsage.prompt_tokens_details)?.cached_tokens,
    )
    if (snake !== null) return snake
  }

  return null
}
