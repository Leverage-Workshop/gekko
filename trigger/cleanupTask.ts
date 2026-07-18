import { logger, metadata, schedules } from "@trigger.dev/sdk";
import { cleanupBundles, realCleanupDeps, RETENTION_HOURS } from "@/lib/cleanup";

// cleanup-bundles (feat-039) — daily janitor for the 15s-cadence ingest
// stream. Deletes raw_bundles older than 24h that no briefings/eval_results
// row references (selection lives in the SQL function unused_bundles_before;
// both FKs are ON DELETE CASCADE, so referenced bundles must never be
// bulk-deleted), removing their Storage objects before the rows so a partial
// failure is retried on the next run. 18:00 America/Los_Angeles = after the
// trading session, when nothing else is touching the bundle stream.
export const cleanupTask = schedules.task({
  id: "cleanup-bundles",
  cron: { pattern: "0 18 * * *", timezone: "America/Los_Angeles" },
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
    factor: 2,
    randomize: true,
  },
  run: async () => {
    const result = await cleanupBundles(realCleanupDeps())

    metadata.set("deletedBundles", result.deletedBundles)
    metadata.set("deletedObjects", result.deletedObjects)
    metadata.set("batches", result.batches)
    metadata.set("truncated", result.truncated)

    logger.info("bundle cleanup complete", {
      retentionHours: RETENTION_HOURS,
      cutoffIso: result.cutoffIso,
      deletedBundles: result.deletedBundles,
      deletedObjects: result.deletedObjects,
      batches: result.batches,
      truncated: result.truncated,
    })

    return result
  },
});
