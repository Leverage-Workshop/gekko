import { AbortTaskRunError, logger, metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { AnalyzeInputError } from "@/lib/analyze";
import { UpdateInputError, realUpdateDeps, runUpdate } from "@/lib/update";
import type { UpdateResult } from "@/lib/update";
import { sendGekkoPush } from "@/lib/push";
import { awaitFreshBundle } from "./freshBundle";

// update-task — the Gem's "Update" prompt as a task (feat-038): wait for the
// fresh bundle the button press requested (awaitFreshBundle) → load the
// latest bundle AND the latest briefing → deterministic engine →
// generateObject with the smaller BriefingUpdate schema (previous briefing
// embedded as context) → compose a full Briefing (overview/terrain inherited
// from the parent) → enforce code-owned facts → persist as a new briefings
// row (kind='update') + refresh entry_levels. Triggered on demand from
// /api/briefings/update (`tasks.trigger("update-task", { triggerReason: "manual" })`).
export const updateTask = schemaTask({
  id: "update-task",
  schema: z.object({
    triggerReason: z.string().default("manual"),
    // Pending bundle_requests row the route inserted; absent on runs
    // triggered outside the dashboard (no fresh-bundle wait then).
    bundleRequestId: z.string().uuid().optional(),
  }),
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  run: async (payload) => {
    await awaitFreshBundle(payload.bundleRequestId);

    let result: UpdateResult;
    try {
      result = await runUpdate(realUpdateDeps(), {
        triggerReason: payload.triggerReason,
      });
    } catch (error) {
      // AnalyzeInputError: no usable bundle. UpdateInputError: no (or an
      // unparseable) previous briefing. Neither can be fixed by retrying, so
      // abort the run instead of burning the retry attempts.
      if (error instanceof AnalyzeInputError || error instanceof UpdateInputError) {
        logger.error("update input unusable — aborting without retries", {
          message: error.message,
        });
        throw new AbortTaskRunError(error.message);
      }
      throw error;
    }

    // Same observability surface as the analyze-task (feat-030/031), plus
    // the parent briefing this update revised.
    metadata.set("model", result.model);
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
    metadata.set("parentBriefingId", result.parentBriefingId);
    metadata.set("stale", result.stale);

    logger.info("update briefing persisted", {
      briefingId: result.briefingId,
      parentBriefingId: result.parentBriefingId,
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

    // feat-027: Web Push AFTER successful persistence. Fire-and-forget — a
    // push problem must never fail the update. The Realtime insert-trigger on
    // briefings (feat-026) broadcasts to open tabs automatically.
    await sendGekkoPush(
      { type: "briefing", id: result.briefingId, createdAt: new Date().toISOString() },
      { log: (message, extra) => logger.warn(message, extra) },
    );

    return result;
  },
});
