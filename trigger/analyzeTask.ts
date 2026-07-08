import { logger, metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { realAnalyzeDeps, runAnalysis } from "@/lib/analyze";

// analyze-task — the full-briefing LLM task (docs/agent-architecture-plan.md):
// load latest bundle → deterministic engine → generateObject via OpenRouter
// (chart images + engine facts + raw MGI, Briefing schema, cached doctrine
// prefix) → enforce code-owned facts → persist briefing + refresh
// entry_levels. Triggered on demand from /api/briefings/run
// (`tasks.trigger("analyze-task", { triggerReason: "manual" })`).
export const analyzeTask = schemaTask({
  id: "analyze-task",
  schema: z.object({
    triggerReason: z.string().default("manual"),
  }),
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  run: async (payload) => {
    const result = await runAnalysis(realAnalyzeDeps(), {
      triggerReason: payload.triggerReason,
    });

    // Model/cost/latency/cache-hit metrics land in run metadata so every
    // briefing's spend is auditable from the trigger.dev dashboard without
    // opening the DB (feat-030 — this metadata IS the observability surface).
    metadata.set("model", result.model);
    metadata.set("costUsd", result.cost);
    metadata.set("latencyMs", result.latencyMs);
    metadata.set("cachedInputTokens", result.cachedInputTokens);
    metadata.set("usage", {
      inputTokens: result.usage.inputTokens ?? null,
      outputTokens: result.usage.outputTokens ?? null,
      totalTokens: result.usage.totalTokens ?? null,
      cachedInputTokens: result.cachedInputTokens,
    });
    metadata.set("briefingId", result.briefingId);
    metadata.set("stale", result.stale);

    logger.info("briefing persisted", {
      briefingId: result.briefingId,
      bundleId: result.bundleId,
      model: result.model,
      costUsd: result.cost,
      latencyMs: result.latencyMs,
      cachedInputTokens: result.cachedInputTokens,
      entryLevelCount: result.entryLevelCount,
      stale: result.stale,
      warnings: result.warnings,
    });

    return result;
  },
});
