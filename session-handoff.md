# Session Handoff

## Current Objective

- **Goal:** feat-035 — improve LVN (Low Volume Node) detection accuracy in
  `lib/engine/lvnDetection.ts`. HVN detection is already solid; LVN localization is weak and is
  the architecture's #1 engine risk.
- **Current status:** feat-014 (detector + eval harness) and feat-034 (tuning) are DONE and in
  **PR #27** (`feat-014-lvn-detection`). This handoff seeds the follow-up (feat-035). The user has
  their own ideas to fold in — treat the "candidate directions" below as seeds, not a fixed plan.
- **Branch / commit:** work from `main` after PR #27 merges. New branch: `feat-035-<slug>`.

## Where things stand (the numbers that matter)

`npm run lvn:eval` (absolute ±10pt tolerance), after fixture re-label + Config-B tuning:

| Split | LVN F1 | HVN F1 |
|---|---|---|
| TRAIN (5 fixtures, gate ≥ 0.40) | 0.46 | 0.69 |
| HOLDOUT (3 fixtures, never tuned against) | 0.36 | 0.61 |

- **HVN detection is usable.** **LVN localization is the weak spot**, worst on the taper-edge
  fixtures (fixture-3 train, fixture-7/8 holdout). fixture-8 holdout LVN is 0.00.
- The eval gate (`DEFAULT_THRESHOLD` in `scripts/lvn-eval.ts`) is currently a **0.40 regression
  floor, not a quality bar** — raising it to a real target is part of feat-035.

## Key facts / non-negotiables

- **Detection is code-owned and authoritative.** The LLM is NEVER asked to confirm or adjust node
  prices (feat-018). Whatever the detector outputs is what ships to feat-015 (magnetCheck) /
  feat-016 (terrainZones) / entry levels. No downstream correction. So accuracy matters.
- **Never tune against the holdout** (fixtures 6/7/8) and **never weaken the eval scorer** or the
  train/holdout split. Holdout is reported only. (This is why aggressive params that scored higher
  on train were rejected in feat-014 — they collapsed on holdout.)
- **Fixtures were just re-labeled to real structure** (they had been padded to a "~9 per type"
  target, putting LVN labels on high-volume bins). Don't re-introduce count-driven labels; the
  fixture README now says "label to structure, never pad to a count."

## The detector today (what to improve)

`detectLvnHvn(series, overrides?)` — dual-mechanism, relative (fraction-of-peak) thresholds,
moving-average smoothing, descending-price output. `DEFAULT_LVN_PARAMS` =
`{ smoothWindow: 13, peakProminenceFrac: 0.1, valleyDepthFrac: 0.1, plateauLevelFrac: 0.18,
plateauRun: 6, shoulderFrac: 0.45, mergeTolerance: 12 }`.
- **HVN + valley LVN**: topographic prominence — works reasonably.
- **Taper-edge LVN**: scans low-volume plateau runs gated on a distribution shoulder — this is the
  weak mechanism; it misses the knees on trend-elongated tails.

## Candidate directions (SEEDS — combine with the user's ideas)

1. Better **taper-edge** algorithm (gradient/derivative of smoothed volume; find the knee, not just
   plateau membership). This is likely the highest-leverage fix.
2. **Per-shape or adaptive params** instead of one global set (manifest already carries `shape` +
   `primaryLvnType`).
3. **Sub-bin valley localization** (centroid/parabolic-interpolation of the trough) so labels and
   detections align tighter within ±10pt, esp. on the wide fixtures.
4. **Re-bin** the 1-tick input to a coarser grid before detection.
5. **Expand the fixture set** beyond 8 — the train signal is thin (5 fixtures). More real Sierra
   VbP exports would help both tuning and holdout confidence.
6. Revisit the **±10pt tolerance** as a product decision (it's tight at NQ ~30000).

## Reproduce / measure

- `npm run lvn:eval` — per-fixture + aggregate P/R/F1, train vs holdout, exits nonzero if train < gate.
  Flags: `-- --tolerance=10 --threshold=0.40`.
- The feat-014 grid-sweep was a throwaway scratchpad script (not committed). Re-create a sweep in
  the scratchpad dir; do NOT commit tuning scripts. Select params for **generalization** (holdout
  as an overfit check), not train-max.

## Blockers / Risks

- Only 8 fixtures — improvements may overfit. Prefer more fixtures over more param fiddling.
- feat-018 (analyze-task) consumes LVN output but is **not blocked** on feat-035 — it can ship on
  the honest first cut; feat-035 hardens it.

## Next Session Startup

1. Read `CLAUDE.md`.
2. Read `feature_list.json` (feat-035) and the feat-014 block in `progress.md`.
3. Review this handoff.
4. Confirm PR #27 merged; branch `feat-035-<slug>` off `main`.
5. Run `./init.sh` and `npm run lvn:eval` to confirm the baseline before editing.

## Recommended Next Step

Start with the **taper-edge algorithm** (direction 1) — it's the clearest weakness and the
taper-edge fixtures are where LVN F1 is worst — after checking the user's ideas.
