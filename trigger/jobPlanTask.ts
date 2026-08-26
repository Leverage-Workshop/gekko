import { AbortTaskRunError, logger, metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { realJobPlanDeps } from "@/lib/job-plan/deps";
import {
  describeJobPlanError,
  isNonRetryableJobPlanError,
} from "@/lib/job-plan/jobPlanErrors";
import { runJobPlan } from "@/lib/job-plan/runJobPlan";
import type { JobPlanRunResult } from "@/lib/job-plan/runJobPlan";
import { awaitBoundBundle } from "./freshBundle";

// job-plan-task — the deterministic Job planner (docs/job-planning-task-plan.md
// step 6, feat-128): wait for the fresh bundle the button press requested and
// BIND to it by id (awaitBoundBundle — never "latest") → download the exact
// bytes → pre-flight parse → profile vision read (feat-123, model from config,
// R14: off/partial degrades with a warning) → fingerprint → runPlanner →
// persist ONE job_plans row (upsert on this run id; insufficient never
// overwrites ready). No other LLM use, never touches briefings/entry_levels,
// no push. Triggered on demand (feat-129's /api/job-plans/run).
export const jobPlanTask = schemaTask({
  id: "job-plan-task",
  schema: z.object({
    triggerReason: z.string().default("manual"),
    // Pending bundle_requests row the route inserted. Absent only on runs
    // triggered outside the dashboard (trigger.dev test runs): those plan on
    // the latest stored bundle and carry a prominent warning.
    bundleRequestId: z.string().uuid().optional(),
  }),
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
    randomize: true,
  },
  maxDuration: 300,
  run: async (payload, { ctx }) => {
    let result: JobPlanRunResult;
    try {
      result = await runJobPlan(
        { ...realJobPlanDeps(), waitForBundle: awaitBoundBundle },
        {
          runId: ctx.run.id,
          triggerReason: payload.triggerReason,
          bundleRequestId: payload.bundleRequestId,
        },
      );
    } catch (error) {
      // The taxonomy (lib/job-plan/jobPlanErrors.ts): missing refs, unsupported
      // exports, an unfulfilled bundle wait — retrying cannot help, and the
      // message tells the operator what to fix.
      if (isNonRetryableJobPlanError(error)) {
        const message = describeJobPlanError(error);
        logger.error("job-plan input unusable — aborting without retries", { message });
        throw new AbortTaskRunError(message);
      }
      throw error;
    }

    if (!payload.bundleRequestId) {
      metadata.set("bundleWait", "not-requested");
    }
    metadata.set("status", result.status);
    metadata.set("outcome", result.outcome);
    metadata.set("jobPlanId", result.jobPlanId);
    metadata.set("bundleId", result.bundleId);
    metadata.set("tradingDay", result.tradingDay);
    metadata.set("plannerRevision", result.plannerRevision);
    metadata.set("inputFingerprint", result.inputFingerprint);
    metadata.set("warnings", [...result.warnings]);
    // Vision spend is auditable from the dashboard like the briefing tasks (feat-030).
    metadata.set("vision", result.vision);

    logger.info("job plan persisted", {
      jobPlanId: result.jobPlanId,
      outcome: result.outcome,
      status: result.status,
      bundleId: result.bundleId,
      bundleWait: result.bundleWait,
      tradingDay: result.tradingDay,
      plannerRevision: result.plannerRevision,
      inputFingerprint: result.inputFingerprint,
      plays: result.plan.plays.length,
      vision: result.vision,
      warnings: result.warnings,
    });

    // The plan itself lives in job_plans; the run output stays a summary.
    const { plan: _plan, ...summary } = result;
    return summary;
  },
});
