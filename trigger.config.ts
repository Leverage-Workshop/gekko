import { defineConfig } from "@trigger.dev/sdk";
import { additionalFiles } from "@trigger.dev/build/extensions/core";

// Gekko's trigger.dev project (org: leverage-workshop-c42c).
// projectRef is safe to commit — it is a public identifier, not a secret.
export default defineConfig({
  project: "proj_txmafkbausaizdmtsoiw",
  dirs: ["./trigger"],
  runtime: "node",
  logLevel: "info",
  maxDuration: 300,
  build: {
    extensions: [
      // The analyze-task reads the doctrine markdown at runtime
      // (lib/analyze/doctrine.ts) — ship it with the deploy.
      additionalFiles({ files: ["knowledge/**"] }),
    ],
  },
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
});
