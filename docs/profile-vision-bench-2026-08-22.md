# Profile-vision bench — 2026-08-22

Scaffold report for feat-124. **No live bench run has been performed yet** — this file
records the harness, the proposed R15 exit criterion, and how to produce the numbers once
the two prerequisites are met.

## Status: not yet run

Two things gate the first real run:

1. **feat-119 golden profiles have not landed.** `chart-data/job-lvn-golden/<date>/` currently
   holds only `labels.json` (feat-120); the `five-day-rolling.vbp.md` / `four-hour-rolling.vbp.md`
   Sierra replay exports are operator-side and not yet checked in. Until they do, the golden
   source has zero scorable cases and the bench falls back to the 8 `lvn-fixtures`.
2. **Live LLM spend requires the operator.** The bench makes paid OpenRouter calls and is gated
   on `RUN_LLM_INTEGRATION=1` (never on key presence — the 2026-07-25/26 `.env`-injection
   incidents). It is not run in CI or unattended.

The pure scoring the bench relies on **is** in place and unit-tested
(`lib/job-plan/profile-vision/bench.test.ts`), so the numbers below are reproducible the
moment those two gates clear.

## How to run

```bash
# fixtures only (works today — the 8 lvn-fixtures have profiles + labels):
RUN_LLM_INTEGRATION=1 npx tsx scripts/profile-vision-bench.ts \
  --model <image-input-model> --variant base --samples 3 --source fixtures --report

# once feat-119's golden profiles land, add the golden source and sweep variants:
RUN_LLM_INTEGRATION=1 npx tsx scripts/profile-vision-bench.ts \
  --model <id> --variant dark-envelope --samples 3 --source both --report
```

Candidate models come from the OpenRouter models API **at bench time** (not from memory),
filtered to image-input models with flash-tier excluded (they game validation floors —
`docs/briefing-audit-2026-07-25.md`). Responses cache under the scratchpad keyed by
`(image sha256, VISION_PROMPT_REVISION, model, effort)`, so sweeping variants and re-scoring
is cheap. Bake-off variants: `base`, `dark`, `envelope`, `tiles`, `left-anchor`,
`dark-envelope`.

## What the bench measures (per model × variant)

Scored against the golden / fixture labels within the R1 tolerance (ES 5 / NQ 20), side by
side with the code-owned detector (`lib/engine/lvnDetection.ts`) on the **same** sources:

| metric | meaning |
| --- | --- |
| recall | fraction of Job-named nodes the read found (per family: lvn / hvn / extreme) |
| precision | fraction of read nodes that matched a label |
| primary agreement | on dates Job names a primary, did the read's primary land within tolerance |
| self-agreement | mean pairwise F1 across the S samples of one image (stability) |
| count Δ | predicted − labeled (over/under-detection) |
| cost / latency | per run, from OpenRouter usage accounting |

The detector cannot produce `exhaustive-node` / `taper-tail` (extreme family) at all, so those
labels are pure recall wins for the vision read — a key reason the operator chose vision over
tuning the detector (its holdout LVN F1 tops out ≈ 0.44 at ±10 pts).

## R15 — proposed exit criterion (operator confirms or raises)

Enable the vision read (set `config.profile_vision_model_id`) only when a model × variant
clears **all** of:

- recall ≥ **0.80** (Job-named nodes within R1 tolerance)
- primary agreement ≥ **0.70**
- self-agreement ≥ **0.80** across samples
- beats `lvnDetection` on both the golden set and the fixtures

These numbers are proposed here and are **not yet observed**. The operator ratifies or raises
them from the first real run, and feat-126's `rules.ts` records the ratified R15 with its
numbers. Until a model is set, the read stays OFF and the planner degrades with a
`profile_nodes_unavailable` warning (R14).
