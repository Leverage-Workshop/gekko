import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { loadDoctrine } from '@/lib/analyze'
import { DEFAULT_MODEL_ID, generateStructured } from '@/lib/llm'

/**
 * feat-023 — GATED prompt-cache integration check (the "assert
 * usage.cache_read_input_tokens > 0 on repeat runs" requirement).
 *
 * SKIPPED unless OPENROUTER_API_KEY is set (offline CI is unaffected). With a
 * key it makes two identical, real, small LLM calls through OpenRouter with
 * `cacheSystem: true` and asserts the SECOND call reports cached input
 * tokens > 0 — proving the ephemeral cache-control write on run 1 is read
 * back on run 2.
 *
 * Run it explicitly with:
 *   OPENROUTER_API_KEY=sk-or-... npx vitest run tests/llm.cacheHit.integration.test.ts
 *
 * Notes:
 * - Anthropic prompt caching needs a >= ~1024-token cacheable prefix, so the
 *   check uses the REAL doctrine prefix (loadDoctrine — thousands of tokens),
 *   exactly what analyze-task/eval-task cache in production.
 * - The default ephemeral TTL is 5 minutes; the two back-to-back calls are
 *   well inside it.
 * - Uses DEFAULT_MODEL_ID (the analyze-task tier): OpenRouter echoes that id
 *   verbatim, whereas the haiku triage alias is served under its dated
 *   canonical id ("anthropic/claude-4.5-haiku-20251001"), which trips the
 *   strict assertModelMatch guard.
 */

const Out = z.object({
  bias: z.enum(['long', 'short']),
  confidence: z.number(),
})

const hasKey = Boolean(process.env.OPENROUTER_API_KEY)

describe.skipIf(!hasKey)('prompt cache read-back (live OpenRouter)', () => {
  it(
    'reports cachedInputTokens > 0 on the second identical call',
    { timeout: 180_000 },
    async () => {
      const system = loadDoctrine('analyze')
      const params = {
        model: DEFAULT_MODEL_ID,
        schema: Out,
        system,
        cacheSystem: true,
        prompt:
          'Cache probe: ignore the market context and answer with bias "long" ' +
          'and confidence 1.',
      }

      // Call 1 writes the cache (its own reads may be 0 or >0 if a recent run
      // already primed the prefix — either is fine). Don't assert on the
      // model's semantic answer — the full doctrine may override the toy
      // instruction; schema validity + the cache metric are the test.
      const first = await generateStructured(params)
      expect(['long', 'short']).toContain(first.object.bias)

      // Call 2 must be served (partially) from the cache.
      const second = await generateStructured(params)
      expect(['long', 'short']).toContain(second.object.bias)
      expect(second.cachedInputTokens).not.toBeNull()
      expect(second.cachedInputTokens!).toBeGreaterThan(0)
    },
  )
})
