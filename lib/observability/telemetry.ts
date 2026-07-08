import type { Tracer } from '@opentelemetry/api'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { RedactingSpanExporter } from './redact'

/**
 * LangSmith LLM-call telemetry (feat-030).
 *
 * The AI SDK's `experimental_telemetry` emits OpenTelemetry spans carrying
 * the exact prompt sent and the model's JSON response. We export those spans
 * to LangSmith's OTLP ingestion endpoint so every analyze/eval LLM call is
 * inspectable per run.
 *
 * Wiring decision: we deliberately run a PRIVATE `NodeTracerProvider` here
 * (never `provider.register()`d as the global one) and hand its tracer to the
 * AI SDK via `experimental_telemetry.tracer`, instead of using trigger.dev
 * v4's `telemetry.exporters` hook in trigger.config.ts. Reasons:
 *   - trigger.dev's `telemetry.exporters` receives EVERY span of the worker's
 *     global provider (all internal run spans) — noise LangSmith doesn't need;
 *   - more importantly, if AI SDK spans went through the global provider,
 *     the multi-MB base64 chart images recorded in `ai.prompt.messages` would
 *     also be shipped to trigger.dev's own exporter. The private provider
 *     guarantees the only consumer is our redacting LangSmith exporter (see
 *     ./redact.ts), which strips image payloads before export.
 * Spans still start under the active trigger.dev run context, so they carry
 * the run's trace id (correlating LangSmith traces with trigger.dev runs).
 *
 * Env-gated: without `LANGSMITH_API_KEY` everything here is a no-op — no
 * provider, no exporter, no network — so offline tests and keyless runs are
 * unaffected.
 */

/** LangSmith's OpenTelemetry trace-ingestion endpoint (overridable via env). */
export const DEFAULT_LANGSMITH_OTLP_ENDPOINT =
  'https://api.smith.langchain.com/otel/v1/traces'

export interface LangsmithOtlpConfig {
  url: string
  headers: Record<string, string>
}

/** The env vars the LangSmith exporter reads (process.env-compatible). */
export interface TelemetryEnv {
  LANGSMITH_API_KEY?: string
  LANGSMITH_PROJECT?: string
  LANGSMITH_OTEL_ENDPOINT?: string
  [key: string]: string | undefined
}

/**
 * Build the OTLP exporter config for LangSmith from the environment, or null
 * when telemetry is disabled (no `LANGSMITH_API_KEY`).
 */
export function buildLangsmithOtlpConfig(
  env: TelemetryEnv = process.env,
): LangsmithOtlpConfig | null {
  const apiKey = env.LANGSMITH_API_KEY
  if (!apiKey) return null

  const headers: Record<string, string> = { 'x-api-key': apiKey }
  if (env.LANGSMITH_PROJECT) {
    headers['Langsmith-Project'] = env.LANGSMITH_PROJECT
  }
  return {
    url: env.LANGSMITH_OTEL_ENDPOINT || DEFAULT_LANGSMITH_OTLP_ENDPOINT,
    headers,
  }
}

/** What the LLM wrapper needs from the telemetry runtime. */
export interface LlmTelemetryRuntime {
  tracer: Tracer
  /** Flush buffered spans to LangSmith (awaited after each LLM call). */
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

  const config = buildLangsmithOtlpConfig(env)
  if (!config) {
    runtimeSingleton = null
    return null
  }

  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'gekko-llm' }),
    spanProcessors: [
      new BatchSpanProcessor(
        new RedactingSpanExporter(new OTLPTraceExporter(config)),
      ),
    ],
  })

  runtimeSingleton = {
    tracer: provider.getTracer('gekko-llm'),
    flush: () => provider.forceFlush(),
  }
  return runtimeSingleton
}

/** Drop the cached runtime so tests can exercise both env gates. */
export function resetLlmTelemetryForTests(): void {
  runtimeSingleton = undefined
}

/** Per-call telemetry options the pipelines pass to `generateStructured`. */
export interface TelemetryOptions {
  /** Groups traces in LangSmith (e.g. 'analyze-task', 'eval-task'). */
  functionId: string
  /** Extra attributes recorded on the trace. */
  metadata?: Record<string, string | number | boolean>
}

/**
 * The AI SDK `experimental_telemetry` settings for one call: inputs and
 * outputs are recorded (image parts are redacted downstream by the
 * exporter — see ./redact.ts), grouped under `functionId`, on our private
 * tracer.
 */
export function buildTelemetrySettings(
  options: TelemetryOptions,
  runtime: LlmTelemetryRuntime,
): {
  isEnabled: true
  recordInputs: true
  recordOutputs: true
  functionId: string
  metadata?: Record<string, string | number | boolean>
  tracer: Tracer
} {
  return {
    isEnabled: true,
    recordInputs: true,
    recordOutputs: true,
    functionId: options.functionId,
    ...(options.metadata ? { metadata: options.metadata } : {}),
    tracer: runtime.tracer,
  }
}
