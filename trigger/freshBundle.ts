import { logger, metadata } from "@trigger.dev/sdk";
import { waitForFreshBundle } from "@/lib/bundleRequests";

// Shared task-side half of the fresh-bundle handshake: the API route inserted
// a pending bundle_requests row and put its id in the payload; the local
// uploader fulfils it by POSTing a bundle to /api/ingest. Poll until fulfilled
// (WAIT_TIMEOUT_MS cap), then let the task load the now-latest bundle.
//
// Degrades, never blocks: a timed-out wait (uploader offline) or a missing
// request row logs a warning and the task proceeds with the latest stored
// bundle — an advisory briefing on slightly-old data beats a bricked button.
// The outcome lands in run metadata ("bundleWait") for the dashboard.
export async function awaitFreshBundle(
  bundleRequestId: string | undefined,
): Promise<void> {
  if (!bundleRequestId) {
    // Triggered outside the dashboard buttons (e.g. trigger.dev test runs):
    // no request to wait on, run on whatever bundle is latest.
    metadata.set("bundleWait", "not-requested");
    return;
  }

  logger.info("waiting for fresh bundle", { bundleRequestId });
  const result = await waitForFreshBundle(bundleRequestId);
  metadata.set("bundleWait", result.outcome);

  if (result.outcome === "fulfilled") {
    logger.info("fresh bundle received", {
      bundleRequestId,
      bundleId: result.bundleId,
    });
  } else {
    logger.warn(
      "fresh bundle wait ended without fulfilment — proceeding with the latest stored bundle",
      { bundleRequestId, outcome: result.outcome },
    );
  }
}
