import { AbortTaskRunError, logger, metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { AnalyzeInputError } from "@/lib/analyze";
import { EvalInputError, realEvalDeps, runEval } from "@/lib/eval";
import type { EvalRunResult } from "@/lib/eval";
import { sendGekkoPush } from "@/lib/push";
import { awaitFreshBundle } from "./freshBundle";

// eval-task — entry-eval triage (docs/agent-architecture-plan.md): wait for
// the fresh bundle the button press requested (awaitFreshBundle) → load the
// latest bundle (current price = raw_bundles.current_price) + ACTIVE
// entry_levels only → code-owned proximity gate → generateObject via
// OpenRouter with the triage model (config.triage_model_id; chart images +
// delta telemetry, EvalResult schema) implementing the instructions.md eval
// logic → enforce code-owned facts → persist eval_results. Triggered on
// demand from /api/eval/run: the "Eval" button (entry check) or the
// "Long" / "Short" buttons (payload.direction — a hold-or-exit read on the
// operator's open position at the current price).
// Notify: the eval_results INSERT itself broadcasts on Realtime via DB
// trigger (feat-026); Web Push is sent below after persistence (feat-027).
export const evalTask = schemaTask({
  id: "eval-task",
  // On-demand; the default keeps the payload optional for dashboard test runs.
  schema: z
    .object({
      // Pending bundle_requests row the route inserted; absent on runs
      // triggered outside the dashboard (no fresh-bundle wait then).
      bundleRequestId: z.string().uuid().optional(),
      // Position-eval direction (the dashboard's Long / Short buttons):
      // evaluate the operator's open position at the current price instead of
      // the active entry levels. Absent → the standard entry check.
      direction: z.enum(["long", "short"]).optional(),
    })
    .default({}),
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  run: async (payload) => {
    await awaitFreshBundle(payload.bundleRequestId);

    let result: EvalRunResult;
    try {
      result = await runEval(realEvalDeps(), { position: payload.direction ?? null });
    } catch (error) {
      // Input errors (no usable bundle / no current price — runEval loads the
      // bundle via loadLatestBundle, so both error types can surface here)
      // mean retrying cannot help: abort instead of burning retry attempts.
      if (error instanceof EvalInputError || error instanceof AnalyzeInputError) {
        logger.error("eval input unusable — aborting without retries", {
          message: error.message,
        });
        throw new AbortTaskRunError(error.message);
      }
      throw error;
    }

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
    metadata.set("position", result.position);

    logger.info("eval result persisted", {
      evalResultId: result.evalResultId,
      bundleId: result.bundleId,
      position: result.position,
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
