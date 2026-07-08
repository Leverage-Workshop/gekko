import { logger, metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { realEvalDeps, runEval } from "@/lib/eval";
import { sendGekkoPush } from "@/lib/push";

// eval-task — entry-eval triage (docs/agent-architecture-plan.md): load the
// latest bundle (current price = raw_bundles.current_price) + ACTIVE
// entry_levels only → code-owned proximity gate → generateObject via
// OpenRouter with the triage model (config.triage_model_id; chart images +
// delta telemetry, EvalResult schema) implementing the instructions.md eval
// logic → enforce code-owned facts → persist eval_results. Triggered on
// demand from /api/eval/run (the "Check Entry at Current Price" button).
// Notify: the eval_results INSERT itself broadcasts on Realtime via DB
// trigger (feat-026); Web Push is sent below after persistence (feat-027).
export const evalTask = schemaTask({
  id: "eval-task",
  // On-demand with no inputs; the empty object keeps the payload optional.
  schema: z.object({}).default({}),
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  run: async () => {
    const result = await runEval(realEvalDeps());

    // Model/cost/latency/cache-hit metrics land in run metadata so every
    // eval's spend is auditable from the trigger.dev dashboard without
    // opening the DB (feat-030 — this metadata IS the observability surface).
    metadata.set("model", result.model);
    metadata.set("costUsd", result.cost);
    metadata.set("latencyMs", result.latencyMs);
    metadata.set("cachedInputTokens", result.cachedInputTokens);
    metadata.set(
      "usage",
      result.usage
        ? {
            inputTokens: result.usage.inputTokens ?? null,
            outputTokens: result.usage.outputTokens ?? null,
            totalTokens: result.usage.totalTokens ?? null,
            cachedInputTokens: result.cachedInputTokens,
          }
        : null,
    );
    metadata.set("evalResultId", result.evalResultId);
    metadata.set("stale", result.stale);

    logger.info("eval result persisted", {
      evalResultId: result.evalResultId,
      bundleId: result.bundleId,
      model: result.model,
      costUsd: result.cost,
      latencyMs: result.latencyMs,
      cachedInputTokens: result.cachedInputTokens,
      status: result.status,
      nearEntry: result.nearEntry,
      stale: result.stale,
      warnings: result.warnings,
    });

    // feat-027: Web Push AFTER successful persistence. Fire-and-forget —
    // sendGekkoPush never throws, is a no-op without VAPID keys, and logs
    // failures; a push problem must never fail the eval. Tab-open
    // notifications need nothing here: the DB trigger broadcasts on Realtime
    // when the eval_results row is inserted (feat-026).
    await sendGekkoPush(
      {
        type: "eval",
        id: result.evalResultId,
        status: result.status,
        createdAt: new Date().toISOString(),
      },
      { log: (message, extra) => logger.warn(message, extra) },
    );

    return result;
  },
});
