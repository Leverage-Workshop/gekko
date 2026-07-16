import * as ai from 'ai'
import { Client } from 'langsmith'
import {
  createLangSmithProviderOptions,
  wrapAISDK,
} from 'langsmith/experimental/vercel'
import { redactImageParts } from './redact'

/**
 * LangSmith LLM-call telemetry (feat-030).
 *
 * Uses LangSmith's official Vercel AI SDK integration: `wrapAISDK` (the
 * documented wrapper for AI SDK v5/v6) wraps `generateObject` so every
 * analyze/eval/update LLM call is recorded as a LangSmith run — call inputs,
 * the provider-level prompt, and the model's JSON response — inspectable per
 * run. This replaced the original hand-rolled OTel pipeline (private
 * NodeTracerProvider + OTLP exporter + `experimental_telemetry`); the wrapper
 * is simpler and is what LangSmith maintains against AI SDK changes.
 *
 * Redaction: the multi-hundred-KB base64 chart images in our prompts are
 * stripped from what gets recorded via the wrapper's `processInputs` /
 * `processChildLLMRunInputs` hooks (see ./redact.ts) — never from what is
 * sent to the model.
 *
 * Env-gated: `LANGSMITH_API_KEY` set ⇒ tracing on (we pass
 * `tracingEnabled: true` explicitly, so `LANGSMITH_TRACING` is NOT also
 * required); unset ⇒ everything here is a no-op — no client, no network — so
 * offline tests and keyless runs are unaffected.
 */

/** The env vars the LangSmith runtime reads (process.env-compatible). */
export interface TelemetryEnv {
  LANGSMITH_API_KEY?: string
  /** LangSmith project to file traces under (defaults to "default"). */
  LANGSMITH_PROJECT?: string
  /** API base URL override, e.g. https://eu.api.smith.langchain.com */
  LANGSMITH_ENDPOINT?: string
  /** Workspace id, needed only when the API key spans multiple workspaces. */
  LANGSMITH_WORKSPACE_ID?: string
  [key: string]: string | undefined
}

/** What the LLM wrapper needs from the telemetry runtime. */
export interface LlmTelemetryRuntime {
  /**
   * LangSmith-wrapped `generateObject` — a drop-in replacement for the AI
   * SDK function that traces the call as a LangSmith run.
   */
  generateObject: typeof ai.generateObject
  /** Flush buffered trace batches to LangSmith (awaited after each LLM call). */
  flush(): Promise<void>
}

let runtimeSingleton: LlmTelemetryRuntime | null | undefined

/**
 * Lazily initialize the LangSmith telemetry runtime once per process
 * (worker). Returns null — and stays inert — when `LANGSMITH_API_KEY` is
 * unset.
 */
export function getLlmTelemetry(
  env: TelemetryEnv = process.env,
): LlmTelemetryRuntime | null {
  if (runtimeSingleton !== undefined) return runtimeSingleton

  const apiKey = env.LANGSMITH_API_KEY
  if (!apiKey) {
    runtimeSingleton = null
    return null
  }

  // The Client would read LANGSMITH_* from process.env on its own, but we
  // pass the values through explicitly so the gate above and the client
  // always agree (and so tests can inject a fake env).
  const client = new Client({
    apiKey,
    ...(env.LANGSMITH_ENDPOINT ? { apiUrl: env.LANGSMITH_ENDPOINT } : {}),
    ...(env.LANGSMITH_WORKSPACE_ID
      ? { workspaceId: env.LANGSMITH_WORKSPACE_ID }
      : {}),
  })

  const wrapped = wrapAISDK(ai, {
    client,
    // LANGSMITH_API_KEY presence is Gekko's single on/off switch (see
    // .env.example) — force tracing on rather than also requiring the
    // standard LANGSMITH_TRACING=true.
    tracingEnabled: true,
    ...(env.LANGSMITH_PROJECT ? { project_name: env.LANGSMITH_PROJECT } : {}),
  })

  runtimeSingleton = {
    generateObject: wrapped.generateObject,
    // Ship pending run batches now — trigger.dev workers can be recycled
    // between runs, so we never rely on process-exit flushing.
    flush: () => client.awaitPendingTraceBatches(),
  }
  return runtimeSingleton
}

/** Drop the cached runtime so tests can exercise both env gates. */
export function resetLlmTelemetryForTests(): void {
  runtimeSingleton = undefined
}

/** Per-call telemetry options the pipelines pass to `generateStructured`. */
export interface TelemetryOptions {
  /** LangSmith run name, grouping traces (e.g. 'analyze-task', 'eval-task'). */
  functionId: string
  /** Extra attributes recorded on the trace. */
  metadata?: Record<string, string | number | boolean>
}

/**
 * Build the per-call `providerOptions.langsmith` payload for a wrapped
 * `generateObject` call: run name + metadata, plus the image-redaction hooks
 * for both the parent run (`processInputs`, AI SDK call inputs) and the child
 * LLM run (`processChildLLMRunInputs`, provider prompt). The wrapper strips
 * the `langsmith` key before the provider sees the call, and the hooks only
 * shape what is recorded — never what is sent.
 */
export function buildLangsmithProviderOptions(
  options: TelemetryOptions,
): ReturnType<typeof createLangSmithProviderOptions> {
  return createLangSmithProviderOptions<typeof ai.generateObject>({
    name: options.functionId,
    ...(options.metadata ? { metadata: options.metadata } : {}),
    processInputs: (inputs) => {
      // Record only the prompt-bearing fields (system/prompt/messages), not
      // the model instance or Zod schema objects the call params also carry.
      const { system, prompt, messages } = inputs as Record<string, unknown>
      return redactImageParts({ system, prompt, messages }) as Record<
        string,
        unknown
      >
    },
    processChildLLMRunInputs: (inputs) =>
      redactImageParts({ prompt: inputs.prompt }) as Record<string, unknown>,
  })
}
