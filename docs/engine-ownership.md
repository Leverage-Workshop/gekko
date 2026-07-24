# Engine Ownership Map (maintainer doc)

The markdown under `knowledge/` is **model-facing only**: it is concatenated per task by
`lib/analyze/doctrine.ts` (`loadDoctrine(task)`) into the cached system-prompt prefix. Everything
in those files must be written for the model — no repo file paths, no changelog notes, no
maintainer commentary (guarded by `tests/knowledge-restructure.test.ts`).

This file is the maintainer-facing half that used to be interleaved into the prompt: which engine
module owns each computable guardrail, and the pointers the drift guard
(`tests/doctrine-drift.test.ts`) checks so prose can't silently restate engine-owned numbers.

## Output contracts

The single source of truth for the output shapes is the Zod contract in
`knowledge/schema/briefing.schema.ts` — `analyze-task`, `update-task` and `eval-task` generate
objects against those schemas (`generateObject`), and the Next.js UI renders from the returned
object. The prose contracts in `knowledge/system/output-*.md` describe field *semantics* only; if
the two ever disagree, the Zod schema wins.

History: the Gem's free-text markdown templates are retired — the Morning Briefing became
`Briefing`, the Gem's "Update" prompt became `BriefingUpdate` (feat-038), and the CSV terrain map
is engine-owned. The model supplies perception and judgment; the engine supplies all computed
fields.

## Computable guardrails

Each deterministic rule is owned by an engine module; the model-facing prose states the rule
qualitatively and defers the numbers to the engine facts.

- **Minimum risk/reward.** Enforced by `lib/engine/riskReward.ts` (`evaluateRiskReward`, default
  from `config.rr_min`). Prose must never restate the ratio — the model reads the engine's
  `meetsGate` / `rr`, and the per-run gate value is injected into the user prompt by
  `lib/analyze/prompt.ts`.
- **Stops never widen.** The check lives in `lib/engine/riskReward.ts` (`stopWidened` against a
  prior stop), but the analyze pipeline does not currently feed it the prior briefing's stop — a
  known, deliberately unwired gap (see `docs/gem-alignment-audit.md`). Until it is wired, the
  model holds this rule itself; the model-facing statement is in
  `knowledge/system/constraints.md`.
- **Structural tiering (Leg VWAP is Tier 3).** The Tier 1/2/3 hierarchy, daily priority sort, and
  nearest Tier-1 borders are computed in `lib/engine/mgiPriority.ts`.
- **Rip / Vanguard Protocol thresholds.** Green/Yellow/Red is resolved by
  `lib/engine/ripStatus.ts` from price-vs-Rip and Delta Intensity.
- **Absorption candidates.** Stack detection thresholds are owned by `lib/engine/absorption.ts`.
- **Delta telemetry reduction.** The compact window the model receives is produced by
  `lib/engine/deltaTelemetry.ts`.
- **Staleness.** Budget owned by `lib/engine/staleness.ts`; the per-run verdict is injected into
  the user prompt.
- **Eval proximity + initiative gates.** The near/not-near gate is `lib/eval/proximity.ts`; the
  COUNT-only initiative demotion (ENTER → WAIT on counter-extreme out-printing, with the
  absorbed-flush exception) is code-enforced in `lib/eval/validateEval.ts`.

## Bundle exports (data ↔ prompt registry)

Every bundle export must have a declared consumer and a declared model surface. The
prompt–data sync gate (`tests/prompt-data-sync.test.ts`, feat-053) fails when a manifest
field (`FILE_FIELDS` / `MGI_FIELD` in `lib/ingest/manifest.ts`) has no row here, when a
listed module path does not exist, when a row names a manifest field that no longer
exists, or when the engine-facts payload (`factsPayload` in `lib/analyze/prompt.ts`)
carries a top-level key this table does not surface — or vice versa. Adding a new export
(feat-045…052) therefore requires deciding, in the same change, which module owns it and
where the model sees it.

| Field | Export file | Consumer | Surfaces to the model as |
| --- | --- | --- | --- |
| `htf_png` | `htf.png` | model vision (attached screenshot) | HTF trend read → meta.htfTrend (vision-only until a numeric HTF bars export lands) |
| `tpo_png` | `tpo.png` | model vision (attached screenshot) | TPO single prints / poor highs-lows (vision-only until a numeric TPO export lands) |
| `exec_png` | `exec.png` | model vision (attached screenshot) | pattern scan, absorption stall confirmation, delta clustering quality |
| `exec_csv` | `execution_bars.csv` | `lib/engine/parseExecBars.ts` → `lib/engine/deltaTelemetry.ts`, `lib/engine/ripStatus.ts` | `deltaTelemetry`, `ripStatus` |
| `rotation_vbp` | `four-hundred-rotation.vbp.md` | `lib/engine/parseProfile.ts` → `lib/engine/lvnDetection.ts`, `lib/engine/terrainZones.ts` | `lvnHvnNodes`, `profileSummary`, `terrain` |
| `balance_area_vbp` | `balance-area.vbp.md` | `lib/engine/parseProfile.ts` → `lib/engine/lvnDetection.ts`, `lib/engine/magnetCheck.ts`, `lib/engine/terrainZones.ts` | `lvnHvnNodes`, `profileSummary`, `magnetCheck`, `terrain` |
| `half_rotation_delta` | `half-rotation-delta.vbp.md` | `lib/engine/parseProfile.ts` → `lib/engine/absorption.ts` | `absorptionCandidates` |
| `full_rotation_delta` | `full-rotation-delta.vbp.md` | `lib/engine/parseProfile.ts` → `lib/engine/absorption.ts` | `absorptionCandidates` |
| `mgi` | inline `mgi_json` (jsonb) | `lib/engine/mgiPriority.ts`, `lib/engine/staleness.ts`, `lib/engine/ripStatus.ts` | `currentPrice`, `mgiPriority`, `staleness`, plus the raw MGI JSON block |
| (engine pass) | — cross-cutting | `lib/analyze/engineFacts.ts` | `warnings` |

## Per-task prompt assembly

`loadDoctrine(task)` concatenates, in order:

| Segment | analyze | update | eval |
| --- | --- | --- | --- |
| `system/persona.md` | ✓ | ✓ | ✓ |
| `system/constraints.md` | ✓ | ✓ | ✓ |
| `system/output-briefing.md` | ✓ | | |
| `system/output-update.md` | | ✓ | |
| `system/output-eval.md` | | | ✓ |
| `system/output-objective.md` | ✓ | ✓ | |
| `doctrine/chart-reading.md` | ✓ | ✓ | ✓ |
| `doctrine/glossary.md` | ✓ | ✓ | ✓ |
| `doctrine/patterns.md` | ✓ | ✓ | ✓ |

Each task's prefix is identical run-to-run, so prompt caching still hits (per task). Volatile
per-run data (engine facts, raw MGI, staleness, chart manifests) lives exclusively in the user
message builders (`lib/analyze/prompt.ts`, `lib/update/prompt.ts`, `lib/eval/prompt.ts`).
