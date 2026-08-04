/**
 * OpenRouter `reasoning.effort` levels, mirroring the union the OpenRouter
 * API accepts. Kept in a dependency-free leaf module so the client-side
 * settings form can import the option list without pulling the server-side
 * provider into the browser bundle.
 *
 * Stored per model slot in the `config` row (NULL = provider default);
 * providers reject efforts they don't support, which fails the run loudly
 * rather than silently running at a wrong effort.
 *
 * 'max' (~95% of max_tokens, same allocation as 'xhigh') is documented by the
 * OpenRouter API but missing from @openrouter/ai-sdk-provider's effort union
 * as of 3.0.0 — openrouterModelSettings casts it through at that boundary.
 */
export const REASONING_EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]
