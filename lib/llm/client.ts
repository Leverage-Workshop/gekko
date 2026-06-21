import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { OpenRouterProvider } from '@openrouter/ai-sdk-provider'

/**
 * OpenRouter is the single LLM gateway for Gekko (Vercel AI SDK → OpenRouter).
 * The concrete model id is never hardcoded here — callers pass it in from the
 * `config` row (default `anthropic/claude-sonnet-4-6`). This module only owns
 * the authenticated provider instance.
 */

/**
 * Build an OpenRouter provider from the environment.
 *
 * @throws if `OPENROUTER_API_KEY` is not configured — we fail loud rather than
 *   let the AI SDK make an unauthenticated request that 401s deep in a job.
 */
export function getOpenRouter(): OpenRouterProvider {
  const apiKey = process.env.OPENROUTER_API_KEY

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured')
  }

  return createOpenRouter({ apiKey })
}
