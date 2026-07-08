import { AbortTaskRunError, logger, metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { AnalyzeInputError, realAnalyzeDeps, runAnalysis } from "@/lib/analyze";
import type { AnalyzeResult } from "@/lib/analyze";
import { sendGekkoPush } from "@/lib/push";

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
    let result: AnalyzeResult;
    try {
      result = await runAnalysis(realAnalyzeDeps(), {
        triggerReason: payload.triggerReason,
      });
    } catch (error) {
      // AnalyzeInputError means no usable bundle exists — retrying cannot
      // help, so abort the run instead of burning the retry attempts.
      if (error instanceof AnalyzeInputError) {
        logger.error("analyze input unusable — aborting without retries", {
          message: error.message,
        });
        throw new AbortTaskRunError(error.message);
      }
      throw error;
    }

    // Model/cost/latency/cache-hit metrics land in run metadata so every
    // briefing's spend is auditable from the trigger.dev dashboard without
    // opening the DB (feat-030 — this metadata IS the observability surface).
    metadata.set("model", result.model);
    // feat-031: which tier served the briefing — model is the id that ran,
    // highConviction says whether the Opus flag routed it there.
    metadata.set("highConviction", result.highConviction);
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
      highConviction: result.highConviction,
      costUsd: result.cost,
      latencyMs: result.latencyMs,
      cachedInputTokens: result.cachedInputTokens,
      entryLevelCount: result.entryLevelCount,
      stale: result.stale,
      warnings: result.warnings,
    });

    // feat-027: Web Push AFTER successful persistence. Fire-and-forget —
    // sendGekkoPush never throws, is a no-op without VAPID keys, and logs
    // failures; a push problem must never fail the briefing. Tab-open
    // notifications need nothing here: the DB trigger broadcasts on Realtime
    // when the briefings row is inserted (feat-026).
    await sendGekkoPush(
      { type: "briefing", id: result.briefingId, createdAt: new Date().toISOString() },
      { log: (message, extra) => logger.warn(message, extra) },
    );

    return result;
  },
});
