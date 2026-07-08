import { logger, metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { realEvalDeps, runEval } from "@/lib/eval";

// eval-task — entry-eval triage (docs/agent-architecture-plan.md): load the
// latest bundle (current price = raw_bundles.current_price) + ACTIVE
// entry_levels only → code-owned proximity gate → generateObject via
// OpenRouter with the triage model (config.triage_model_id; chart images +
// delta telemetry, EvalResult schema) implementing the instructions.md eval
// logic → enforce code-owned facts → persist eval_results. Triggered on
// demand from /api/eval/run (the "Check Entry at Current Price" button).
// NOTE: does not trigger notify yet — notify-task lands in feat-026/027.
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

    // Model/cost land in run metadata so every eval's spend is auditable
    // from the trigger.dev dashboard without opening the DB.
    metadata.set("model", result.model);
    metadata.set("costUsd", result.cost);
    metadata.set(
      "usage",
      result.usage
        ? {
            inputTokens: result.usage.inputTokens ?? null,
            outputTokens: result.usage.outputTokens ?? null,
            totalTokens: result.usage.totalTokens ?? null,
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
      status: result.status,
      nearEntry: result.nearEntry,
      stale: result.stale,
      warnings: result.warnings,
    });

    return result;
  },
});
