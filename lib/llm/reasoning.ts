/**
 * OpenRouter `reasoning.effort` levels, mirroring the union the
 * @openrouter/ai-sdk-provider accepts. Kept in a dependency-free leaf module
 * so the client-side settings form can import the option list without pulling
 * the server-side provider into the browser bundle.
 *
 * Stored per model slot in the `config` row (NULL = provider default);
 * providers reject efforts they don't support, which fails the run loudly
 * rather than silently running at a wrong effort.
 */
export const REASONING_EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
] as const

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]
