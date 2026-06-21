import { generateObject } from 'ai'
import type {
  ImagePart,
  LanguageModel,
  ModelMessage,
  TextPart,
} from 'ai'
import type { z } from 'zod'
import { getOpenRouter } from './client'

/** Default model id, mirroring the `config.model_id` column default. */
export const DEFAULT_MODEL_ID = 'anthropic/claude-sonnet-4-6'

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
    images = [],
    resolveModel = (id) => getOpenRouter()(id),
    generate = generateObject,
  } = params

  const messages: ModelMessage[] = [
    { role: 'user', content: buildUserContent(prompt, images) },
  ]

  const result = await generate({
    model: resolveModel(model),
    schema,
    system,
    messages,
  })

  assertModelMatch(model, result.response.modelId)

  return {
    object: schema.parse(result.object),
    model: result.response.modelId,
    usage: result.usage,
  }
}
