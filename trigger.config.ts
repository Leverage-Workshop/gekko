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
    // `@resvg/resvg-js` (feat-122 profile rasterizer) is a prebuilt native
    // module: esbuild cannot bundle its `.node` binary, so it must be external
    // and resolved from node_modules at runtime — trigger.dev docs,
    // deployment/overview "No loader is configured for .node files" →
    // `build.external` (verified via the trigger MCP docs search 2026-08-22).
    external: ["@resvg/resvg-js"],
    extensions: [
      // The analyze-task reads the doctrine markdown at runtime
      // (lib/analyze/doctrine.ts) — ship it with the deploy. The profile
      // rasterizer (lib/job-plan/profile-vision/rasterize.ts) loads its font
      // from `assets/fonts/` the same way (no system fonts in the worker);
      // additionalFiles copies both relative to the project root for BOTH dev
      // and deploy, so `join(process.cwd(), <relative path>)` resolves in each
      // — trigger.dev docs, config/extensions/additionalFiles.
      additionalFiles({ files: ["knowledge/**", "assets/fonts/**"] }),
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
