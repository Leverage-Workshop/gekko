import { generateObject } from 'ai'
import type {
  ImagePart,
  LanguageModel,
  ModelMessage,
  TextPart,
} from 'ai'
import type { z } from 'zod'
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
   * Resolve a model id to a `LanguageModel`. Defaults to the OpenRouter
   * provider. Injectable for tests.
   */
  resolveModel?: (modelId: string) => LanguageModel
  /** AI SDK `generateObject` implementation. Injectable for tests. */
  generate?: typeof generateObject
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
}

/**
 * Assert the model OpenRouter actually served matches what we asked for, so a
 * silently-substituted model can never produce a Briefing under a wrong label.
 *
 * @throws if the returned model id differs from the requested one.
 */
export function assertModelMatch(requested: string, returned: string): void {
  if (returned !== requested) {
    throw new Error(
      `Model mismatch: requested "${requested}" but provider served "${returned}"`,
    )
  }
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
    resolveModel = (id) => getOpenRouter()(id, { usage: { include: true } }),
    generate = generateObject,
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

  const result = await generate({
    model: resolveModel(model),
    schema,
    messages,
  })

  assertModelMatch(model, result.response.modelId)

  return {
    object: schema.parse(result.object),
    model: result.response.modelId,
    usage: result.usage,
    cost: extractCost(result.providerMetadata),
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
