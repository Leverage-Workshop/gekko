import { defineConfig } from "@trigger.dev/sdk";

// Gekko's trigger.dev project (org: leverage-workshop-c42c).
// projectRef is safe to commit — it is a public identifier, not a secret.
export default defineConfig({
  project: "proj_txmafkbausaizdmtsoiw",
  dirs: ["./trigger"],
  runtime: "node",
  logLevel: "info",
  maxDuration: 300,
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
