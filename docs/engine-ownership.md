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
prompt–data sync gate (`tests/prompt-data-sync.test.ts`, feat-054) fails when a manifest
field (`FILE_FIELDS` / `MGI_FIELD` in `lib/ingest/manifest.ts`) has no row here, when a
listed module path does not exist, when a row names a manifest field that no longer
exists, or when the engine-facts payload (`factsPayload` in `lib/analyze/prompt.ts`)
carries a top-level key this table does not surface — or vice versa. Adding a new export
(feat-046…053) therefore requires deciding, in the same change, which module owns it and
where the model sees it.

| Field | Export file | Consumer | Surfaces to the model as |
| --- | --- | --- | --- |
| `htf_png` | `htf.png` | model vision (attached screenshot) | HTF distribution shape only — trend state, swings, rotation extent and ATR are code-owned by the numeric HTF bar export (feat-049) |
| `tpo_png` | `tpo.png` | model vision (attached screenshot) | intraday distribution shape only — day structure (single prints, poor extremes, POC, IB) is code-owned by the numeric TPO export (feat-046); value migration is code-owned by the daily value-area history (feat-048) |
| `exec_png` | `exec.png` | model vision (attached screenshot) | pattern scan, absorption vs exhaustion shape, delta clustering quality (stall confirmation is code-owned by the enriched bars, feat-047) |
| `exec_csv` | `execution_bars.csv` | `lib/engine/parseExecBars.ts` → `lib/engine/deltaTelemetry.ts` (incl. `lib/engine/barFlow.ts` raw-flow reduction), `lib/engine/ripStatus.ts`, `lib/engine/stallConfirmation.ts` (absorption stall annotation); eval: `lib/eval/proximity.ts` (bar-range gate) | `deltaTelemetry` (incl. flow: cumulative delta, divergence, climax), `ripStatus`, stall blocks on `absorptionCandidates`; eval prompt: telemetry + enriched recent-bars table |
| `rotation_vbp` | `four-hundred-rotation.vbp.md` | `lib/engine/parseProfile.ts` → `lib/engine/lvnDetection.ts`, `lib/engine/nodeBuild.ts`, `lib/engine/terrainZones.ts` | `lvnHvnNodes`, `profileSummary`, `terrain` |
| `balance_area_vbp` | `balance-area.vbp.md` | `lib/engine/parseProfile.ts` → `lib/engine/lvnDetection.ts`, `lib/engine/nodeBuild.ts`, `lib/engine/magnetCheck.ts`, `lib/engine/terrainZones.ts` | `lvnHvnNodes`, `profileSummary`, `magnetCheck`, `terrain` |
| `half_rotation_delta` | `half-rotation-delta.vbp.md` | `lib/engine/parseProfile.ts` → `lib/engine/absorption.ts`; eval: `lib/eval/evalBundle.ts` (best-effort scan) | `absorptionCandidates`; eval prompt: absorption-candidates section |
| `full_rotation_delta` | `full-rotation-delta.vbp.md` | `lib/engine/parseProfile.ts` → `lib/engine/absorption.ts`; eval: `lib/eval/evalBundle.ts` (best-effort scan) | `absorptionCandidates`; eval prompt: absorption-candidates section |
| `tpo_data` | `tpo.data.md` | `lib/engine/parseTpo.ts` → `lib/engine/tpoFacts.ts` (best-effort: null + warning when absent) | `tpo` (single-print zones, poor high/low, POC prominence, value area, Initial Balance) |
| `daily_va` | `daily-value-areas.csv` | `lib/engine/parseDailyValueAreas.ts` → `lib/engine/valueMigration.ts`, `lib/engine/dailyRanges.ts` (best-effort: null + warning when absent); eval: `lib/eval/evalBundle.ts` (best-effort context) | `valueMigration` (prior-day POC/VAH/VAL, the day-by-day recentSessions series, POC drift, value-day streaks, prior-day overlap, price vs prior-day value), `dailyRanges` (per-session range series + contraction/expansion read, in plain points — the overview never cites ATR); eval prompt: prior-day value context line |
| `htf_csv` | `htf_bars.csv` | `lib/engine/parseHtfBars.ts` → `lib/engine/htfStructure.ts`, `lib/engine/overnightSession.ts` (best-effort: null + warning when absent); eval: `lib/eval/evalBundle.ts` (best-effort context) | `htfStructure` (trend state from the swing sequence, recent swing highs/lows, rotation extent, 30-min ATR, ATR-normalized swing distances) → grounds meta.htfTrend, `overnightSession` (overnight high/low/range + RTH-so-far extremes; null on RTH-only exports); eval prompt: HTF structure context line |
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
