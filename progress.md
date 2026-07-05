# Session Progress Log

## Current State

**Last Updated:** 2026-07-05
**Active Feature:** `feat-014` **DONE** (with `feat-034` **folded in** — see below). Next
unblocked items: **feat-015** (`magnetCheck.ts`) and **feat-016** (`terrainZones.ts`), which are
independent of each other and now unblocked since the LVN/HVN detector output contract has landed.
Per the approved PR-sequencing plan, feat-014(+034) ships as PR1; feat-015 and feat-016 follow as
separate PRs. feat-018 (analyze-task) remains blocked until 015/016 land. All feat numbers use the
**post-renumber** scheme.

**feat-014 (2026-07-05) — lvnDetection.ts + LVN/HVN eval harness (Phase B); feat-034 tuning
folded in.** NEW `lib/engine/lvnDetection.ts`: pure, immutable `detectLvnHvn(series, overrides?)`
over a VbP `{price,volume}[]` series (no paired delta). Returns HVN peaks (topographic prominence)
and BOTH LVN types via a **dual mechanism**: (a) VALLEY LVNs = prominent troughs between
distributions (inverse topographic prominence / depth), (b) TAPER-EDGE LVNs = the knee where a
distribution falls into a sustained low-volume plateau, detected by scanning maximal runs of
"low" bins (`<= plateauLevelFrac × peak`) at least `plateauRun` long and emitting a run boundary
only when the bin just outside it rises to a real distribution shoulder (`>= shoulderFrac × peak`)
— that asymmetry is what separates a taper edge from the two walls of an ordinary valley. DESIGN:
thresholds are **relative** (fractions of peak/POC volume) so one param set generalizes across
fixtures whose raw magnitudes differ ~10x; a centered moving-average (`smoothWindow`) de-noises
the 1-point bins before detection; detected prices snap back to real bins; output is
descending-price. Plain TS types + exported `DEFAULT_LVN_PARAMS`; no Zod, no file I/O (mirrors
ripStatus/riskReward/staleness). NEW `scripts/lvn-eval.ts` + `npm run lvn:eval`: greedy nearest
match of detected↔labeled per type within an **absolute** ±10pt tolerance (`--tolerance`),
precision/recall + count-delta per type per fixture, TRAIN and HOLDOUT aggregated **separately**,
exits nonzero only when TRAIN F1 < `--threshold` (default 0.55). NEW
`lib/engine/lvnDetection.test.ts`: 10 synthetic mechanics tests (single-peak hill, double-
distribution valley, flat, <3-bin guard, shoulder-noise robustness, taper-edge knee, no-plateau
negative, descending-order + peakVolume, no-mutate, tuned-defaults).

**DECISION (feat-034 folded in — param tuning):** feat-034's own description says it "may fold
entirely into feat-014's eval harness"; the detector is a fixed dual mechanism, so tuning is
parameter selection, not an algorithm search — no reason to split it into a second PR. Tuned
TRAIN-only via a grid sweep (throwaway scratchpad script, not committed) over
smoothWindow/peakProminenceFrac/valleyDepthFrac/plateauLevelFrac/plateauRun/shoulderFrac/
mergeTolerance. **Selection favored generalization over train-max:** aggressive params (high
prominence + big smoothing) beat the chosen config on TRAIN but **collapsed on HOLDOUT** (overfit
the holdout set exists to catch), so moderate settings (Config B) were kept. Final
`DEFAULT_LVN_PARAMS`: `{ smoothWindow: 13, peakProminenceFrac: 0.1, valleyDepthFrac: 0.1,
plateauLevelFrac: 0.18, plateauRun: 6, shoulderFrac: 0.45, mergeTolerance: 12 }`. **Result:**
TRAIN LVN F1 **0.46** / HVN F1 **0.69** (gate PASS at 0.40); HOLDOUT LVN **0.36** / HVN **0.61**
(reported, never tuned against).

**CORRECTION + FIXTURE RE-LABEL (follow-up in the same PR):** an earlier version of this block
justified a 0.55 gate by claiming the detector is a "candidate proposer" the LLM confirms/adjusts
downstream. That was **wrong** — it leaned on a stale `agent-architecture-plan.md` line that
predated the July-3 code-owned reconciliation. Per feat-014/feat-018, LVN/HVN detection is
**authoritative with no vision round-trip; the model never confirms or adjusts node prices**. So
accuracy is what ships, and the gate is now a **regression floor (0.40)**, not a quality claim.
Investigating the low LVN score surfaced the real culprit: the feat-033 labels had been padded
toward a "~9 per type" target (per the old fixture README), landing many LVN labels on
high-volume bins — e.g. fixture-1's `30200` was in **both** the LVN and HVN lists and is the POC;
fixture-4/6/7 had "LVN" labels at 40–70% of peak. All 8 fixtures were **re-labeled to genuine
structure** (HVN peaks; LVN troughs + taper knees), then snapped to the nearest real extrema;
counts dropped (e.g. fixture-4 8→3 LVN, fixture-8 4→2). The fixture README's "~9 labels per type"
guidance — the root cause — was rewritten to "label to structure, never pad to a count." Params
were then re-tuned against the cleaned labels (numbers above). **Honest status:** HVN detection is
solid (~0.61–0.69); **LVN localization remains weak (~0.36 holdout)** and is the architecture's
acknowledged #1 engine risk — this is an honest first cut, and materially improving LVN accuracy
(better taper algorithm and/or more fixtures) is real follow-up work, not "done-and-great."
Verified: `./init.sh` green — typecheck 0, lint 0 errors (3 pre-existing warnings untouched),
196 tests pass (19 files), `next build` OK; `npm run lvn:eval` exits 0.

**feat-033 (2026-07-05) — LVN/HVN validation fixtures + labels (Phase A).** Closed out the
ground-truth set in `chart-data/lvn-fixtures/`: 8 fixtures (`fixture-1..8`), each with
`.vbp.md` + `.labels.json` + `.image.png`, spanning all 5 shape categories, with taper-edge and
valley LVNs present in **both** train (1–5) and holdout (6–8). NEW `manifest.json` is the
**authoritative** train/holdout designation (plus `shape`, `primaryLvnType`) — the eval harness
reads it, not README prose. NEW `lib/engine/loadLvnFixtures.ts`: a VbP-only loader (no paired
delta) built on a new `parseVbpProfile` export in `parseProfile.ts`; it joins each fixture to its
labels and **validates** every label is in range + snapped to an actual bin. `loadLvnFixtures({
strict: true })` throws on any out-of-range/off-bin label. This guard caught (and we corrected) a
real defect: `fixture-8` carried 3 LVN labels (`30052/29920/29576`) copy-pasted from fixture-2,
all below its `30070` floor. Also sorted all label arrays ascending and refreshed the README
status column. `lib/engine/loadLvnFixtures.test.ts`: 9 guards (manifest load, 5/3 split, both LVN
types per split, non-empty profiles, zero label issues across the set, strict-mode pass, plus
synthetic out-of-range + off-bin + on-bin cases). Verified: `./init.sh` green — new tests 9/9,
typecheck 0, lint 0 errors (3 pre-existing warnings untouched), full vitest suite pass,
`next build` OK. (A stray uncommitted edit to `chart-data/delta_vbp_export.md` had briefly
red-lined `parseProfile.test.ts` mid-session; it was reverted, restoring a clean baseline.)

**feat-029 (2026-06-27) — Staleness detection.** NEW `lib/engine/staleness.ts`: pure,
serializable `assessStaleness({receivedAt, now?, marginMs?})` → `StalenessAssessment`
(`isStale`, `hasData`, `ageMs`, `ageSeconds`, `marginMs`, `receivedAt`, `evaluatedAt`,
`warning`). Compares the latest `raw_bundles.received_at` against a freshness margin
(`DEFAULT_STALENESS_MARGIN_MS = 180s`, ~6 missed 30s exports; overridable per call). `age >
margin` ⇒ stale; **no bundle at all** (null/unparseable `receivedAt`, i.e. uploader/Sierra never
started or DB empty) ⇒ maximally stale (`hasData=false`, `ageMs=Infinity`). Boundary is
strictly-greater (`age == margin` is fresh); future-dated bundles clamp to age 0 (cross-machine
clock skew never reads as stale). Stale results carry a human `warning` ("do not treat as the
live market picture") for the UI to surface; fresh ⇒ `warning=null` — **never serve stale as
fresh** (Top Risk #3, single-machine availability). `now` is injected (defaults to wall clock) so
it's deterministic/unit-testable, and the output is plain JSON meant to be embedded in a
Briefing/EvalResult payload. DECISION: built as a **pure engine primitive** (like
`ripStatus`/`riskReward`) with no DB coupling — its consumers don't exist yet (analyze-task
feat-018, eval-task feat-025, render pages feat-019/025 will call it at button-press time and pass
the latest bundle's `received_at`); margin kept as a param (default constant) rather than a new
`config` column to avoid scope creep into feat-028. No Zod (engine fact, not model-facing output).
`lib/engine/staleness.test.ts`: 16 guards (freshness boundary incl. exact-margin/±1ms, default &
override margin, no-data null/undefined/bad-string, ISO/epoch/Date inputs, skew clamp, ISO
normalisation, invalid `now`/`marginMs` throws). Verified: `./init.sh` green — typecheck 0, lint 0
errors (3 pre-existing warnings in `tests/briefing.schema.test.ts`, untouched), vitest **177/177**
(16 new), `next build` OK.

**feat-022 (2026-06-27) — Knowledge restructure.** Deduped the two Gem-export prose files
(`gem-files/instructions.md`, `gem-files/tactical-companion-playbook.md`) into `knowledge/` per
`docs/agent-architecture-plan.md` (151–189). NEW `knowledge/system/`: `persona.md` (Gekko
persona+tone, ADHD UX, discipline + quick-ref templates), `constraints.md` (8 non-negotiables
split into qualitative guardrails vs **engine-owned computable** ones + warnings/edge-cases),
`output-schema.md` (prose mirror of the Zod `Briefing`+`EvalResult` contract, names
`briefing.schema.ts` as source of truth). NEW `knowledge/doctrine/`: `chart-reading.md`
(consolidated `<chart_interpretation>`; merged the **two duplicate** Data-Ingestion-Hierarchy +
Tactical-Fusion copies into one; Terrain Model / Internal Partitioning / Campaign Map / Entry
Decision Tree / Vanguard Protocol), `patterns.md` (absorption/exhaustion + rebid/reoffer, Three-
Push Exhaustion Trap, Controlled Flush & Reload, failed-breakout reload), `glossary.md`
(Daily/Weekly/Monthly MGI tables verbatim). `knowledge/schema/briefing.schema.ts` unchanged
(feat-006). **Computable doctrine removed from prose**: 3:1 R/R + stops-never-widen →
`riskReward.ts`, Rip Green/Yellow/Red → `ripStatus.ts`, MGI Tier 1/2/3 + daily priority →
`mgiPriority.ts`, delta scale → `deltaTelemetry.ts` (prose names the module, not the threshold).
DECISIONS: `gem-files/*.md` kept as **untouched historical originals** (not deleted); engine
comment citations still point at them so no engine edits. `tests/knowledge-restructure.test.ts`:
12 guards (file existence/non-empty, no-`3:1` in doctrine prose, constraints.md defers to the
three engine modules). `./init.sh` green: typecheck 0, lint 0 errors, 161 tests (16 files, +12),
build OK.

**feat-017 (2026-06-26) — `riskReward.ts`.** Added `lib/engine/riskReward.ts`: pure/immutable
`evaluateRiskReward({direction,entry,stop,targets,rrMin?,priorStop?})` — direction-aware risk
(long: `entry-stop`; short: `stop-entry`) + per-target reward/rr, headline `rr` to the nearest
target (T1), **3:1 gate** (`DEFAULT_RR_MIN=3.0`, mirrors seeded `config.rr_min`), and **stops
never widen** vs the prior briefing (long: a lower stop = farther = invalid; short: higher;
0.25-tick tolerance). Returns `RiskReward{risk, targets[], rr, rrMin, meetsGate, priorStop,
stopWidened, valid, reasons[]}` with human-readable invalidation reasons. `objectiveRiskReward`
adapts a schema `Objective` (type-only import → no runtime Zod coupling): entry = Entry A, stop
= farthest protective-side stop (most conservative R/R). Doctrine basis: `instructions.md` #5
(3:1 min) + playbook Stop Management ("Never Allow movement farther from entry"). Scalar/array
inputs by design (depends only on feat-001 scaffold). `riskReward.test.ts`: 23 tests (long/short
geometry, gate pass/fail + custom rrMin, wrong-side stop/target, missing targets, stops-never-
widen long/short + sub-tick tolerance + null skip, finite-input guards, objective adapter).
`./init.sh` green: typecheck 0, lint 0 errors (3 pre-existing warnings), 149 tests (15 files),
build OK.

**feat-013 (2026-06-21) — `ripStatus.ts`.** Added `lib/engine/ripStatus.ts`: pure/immutable
`computeRipStatus({currentPrice, rip, deltaIntensity})` resolving the playbook's **Vanguard
Protocol** — **Green** (price at/above the Rip, trend intact, DO NOT FADE), **Yellow** (below
the Rip with sub-extreme red = breach/stress test), **Red** (below the Rip AND `DeltaIntensity
<= -3` = control flipped). One-tick (0.25) tolerance: price within a tick of the Rip reads
`at` → Green (defensive line holds). Returns `condition`, signed `distance`, `position`,
`redInitiative`, and doctrine `headline`/`action` lines. **Scalar inputs by design** — depends
only on feat-001 scaffold, decoupled from `deltaTelemetry`/`mgiPriority` (caller passes
`mgi.daily.rip`, `mgi.current.price`, and a representative recent `DeltaIntensity`). Plain TS
types (engine fact → no Zod), no file I/O. `ripStatus.test.ts`: 13 tests (fixture Yellow/Red
against `chart-data/mgi_static_levels.json` price 30436.25 vs Rip 30632.53, Green/at/above/below
boundaries, -3 red threshold, signed round2 distance, finite-input validation). `./init.sh`
green: typecheck 0, lint 0 errors, 126 tests (14 files), build OK.

**feat-012 (2026-06-21) — `mgiPriority.ts`.** Added `lib/engine/mgiPriority.ts`:
pure/immutable `computeMgiPriority(mgi: MgiStaticLevels, {currentPrice?})` over the parsed
`mgi_static_levels.json`. Classifies every static level into the playbook `<mgi_reference>`
Structural Hierarchy: **Tier 1** (campaign borders) = Weekly/Monthly levels + VRange extremes
+ ONH/ONL + ATR hi/lo; **Tier 2** (intraday) = Rip + 24 VWAP + PDH/PDL/PDC + IBH/IBL + OR
hi/mid/lo; **Tier 3** = Leg VWAP (lives in the exec CSV, so never appears here). Emits all
`levels` (price-desc), `tier1`, a `dailyPrioritySort` (Daily MGI Priority Order rank then
price), and `nearestTier1Above`/`Below` borders relative to current price. Tiering + daily
ranks are a declarative `LEVEL_SPECS` table (auditable). Current price defaults to
`mgi.current.price` (override via opts), throws if neither is finite; non-finite/missing
levels skipped; border candidates strictly above/below (a level *at* price is neither). Plain
TS type (engine fact → no Zod), no file I/O (caller passes parsed JSON). `mgiPriority.test.ts`:
14 tests (7 fixture against `chart-data/mgi_static_levels.json` — current 30436.25, 30 levels,
20 Tier-1, nearestAbove PM High 30536.00 / nearestBelow Month Open 30415.50 — + 7 synthetic).
`./init.sh` green: typecheck 0, lint 0 errors (3 pre-existing warnings), 113 tests (13 files),
build OK.

**feat-011 (2026-06-21) — `deltaTelemetry.ts`.** Added `lib/engine/deltaTelemetry.ts`:
pure/immutable `computeDeltaTelemetry(bars: ExecBar[], {recentWindow=20})` that reduces the
~250-row parsed exec bars (feat-004) to a compact `DeltaTelemetry` for the prompt — recent
delta mean + trend (rising/falling/flat via first-half vs second-half mean, ±0.25 tick
epsilon), sign, whole-series ±3/±4 extreme counts + most-recent extreme, and Leg-VWAP
position (latest non-zero legVWAP, ignoring pre-leg zeros; above/below/at/unknown + distance).
Plain TS type (engine fact, not a Briefing output → no Zod), no file I/O. Timezone-invariant
(uses only bar ordering + tail; the CSV DateTime is US Central but isn't parsed here).
`lib/engine/deltaTelemetry.test.ts`: 14 tests (5 fixture against
`chart-data/execution_bar_data.rolling.csv` + 9 synthetic branch tests). **Baseline repair:**
added `.trigger/**` to `eslint.config.mjs` globalIgnores — leftover trigger.dev dev-server
build output under `.trigger/tmp/build-*` (gitignored) was throwing 46 spurious lint errors.
`./init.sh` green: typecheck 0, lint 0 errors (3 pre-existing warnings), 99 tests pass, build OK.

**feat-003 (2026-06-21) — Sierra chart-image auto-export PoC, closed with no repo code.** This is
a Phase 0 proof-of-concept that lives on the Sierra Chart / Windows side. Both deliverables are
satisfied: (1) **sample outputs captured** — `chart-data/htf_clean.png`, `tpo.png`,
`execution_clean.png` (the consistently-cropped HTF/TPO/exec PNGs) are committed alongside the
JSON/CSV exports; (2) **timer auto-export to `C:\gekko\export\` proven empirically downstream** —
feat-008 (`/api/ingest`) + feat-009 (chokidar uploader watching the export dir) ingest these exact
filenames from real ~30s Sierra exports and the bundle pipeline runs against them. The Sierra
study/config doc was intentionally skipped per user decision (that knowledge lives on the user's
Windows machine and is not a repo artifact). Edit is to `feature_list.json` only — no branch/PR.

**feat-010 (2026-06-21):** trigger.dev wired into the repo. Installed `@trigger.dev/sdk` 4.4.6;
added `trigger.config.ts` (project `proj_txmafkbausaizdmtsoiw`, org `leverage-workshop-c42c`,
`dirs: ["./trigger"]`, `runtime: node`, `maxDuration: 300`) and a dependency-free smoke task
`trigger/hello.ts` (`id: "hello"`). Verified **locally** via `trigger.dev dev` (local worker
built, triggered run returned `{greeting:"Hello, feat-010"}`) and **on deploy** via
`trigger.dev deploy` to prod (version `20260621.1`, deployment `fll4v5bq`, 1 task detected; prod
run `run_cmqnzrdd84kf80hoj6892j1yv` returned `{greeting:"Hello, prod-deploy"}`). `./init.sh`
green. **No env vars required** for setup/dev/deploy — those use the trigger.dev CLI login
(`~/.config/trigger`). `TRIGGER_SECRET_KEY` is documented as commented-out in `.env.example` and
only becomes necessary when app server code triggers tasks (a later feature). `.trigger/` is
already gitignored.

**fix (2026-06-20) — real export filenames + MGI-derived price:** Corrected two errors from the
initial feat-009 build (see the real sample files in `chart-data/`):
- **Filenames** — the uploader had invented local filenames (`htf.png`, `exec.csv`, `mgi.json`,
  …). Sierra actually writes `htf_clean.png`, `tpo.png`, `execution_clean.png`,
  `execution_bar_data.rolling.csv`, `vbp_export.md`, `delta_vbp_export.md`,
  `mgi_static_levels.json`. Fixed `LOCAL_FILENAME_BY_FIELD` + `MGI_FILENAME` in
  `lib/uploader/bundle.ts`. A new test reads the real `chart-data/` folder so `BUNDLE_FILENAMES`
  can't drift from reality again.
- **Current price/time** — these are NOT separate upload fields; they live inside
  `mgi_static_levels.json` at `current.price` / `current.time`. Removed the invented
  `current_price.txt` sidecar from the uploader and the `current_price` form field from the
  ingest contract. `lib/ingest/ingestBundle.ts` now extracts `current_price` from
  `mgi_json.current.price` (zod-validated); the full MGI is still stored inline as jsonb, so
  `current.time` is preserved. Removed `CURRENT_PRICE_FIELD` from `lib/ingest/manifest.ts`.
- Also corrected the export-folder filenames in `docs/agent-architecture-plan.md` (the original
  source of the wrong names).

**feat-009 (2026-06-20):** Local uploader for the Windows trading machine. `scripts/uploader.ts`
is a thin entry (the only place touching the filesystem, `chokidar`, and the network) wired to
pure, unit-tested modules in `lib/uploader/`: `bundle.ts` (reads the export folder into a bundle
and builds the multipart body — ingest *field* + *content-type* single-sourced from `lib/ingest`'s
manifest, *local* filenames from Sierra per `chart-data/`), `post.ts` (bearer POST to `/api/ingest`
with exponential backoff — retries 5xx/408/429 + network errors, treats other 4xx as permanent),
`scheduler.ts` (debounces Sierra's ~30s write burst, coalesces triggers, never overlaps runs),
`config.ts` (zod-validated env). Run via `npm run uploader` (tsx). Added `chokidar` (dep) + `tsx`
(devDep), `INGEST_URL`/`GEKKO_EXPORT_DIR`/`UPLOADER_*` to `.env.example`.
`./init.sh` green (87 tests; typecheck/lint/build clean).

**feat-008 (2026-06-20):** `app/api/ingest/route.ts` — bearer-authed multipart ingest. Stores
PNGs to the `chart-images` bucket and CSV/MD exports to `bundle-csvs` (under a `<bundleId>/`
prefix), the MGI JSON inline as `jsonb`, derives `current_price` from `mgi.current.price` (see the
later fix entry — was originally a separate form field), and inserts one `raw_bundles`
row holding the object refs. Auth is timing-safe (`lib/ingest/auth.ts`, `node:crypto`
`timingSafeEqual`); orchestration is pure + dependency-injected (`lib/ingest/ingestBundle.ts`
— `uploadObject`/`insertBundle`/`newId` injected, `IngestValidationError`→400), with the
multipart field contract in `lib/ingest/manifest.ts`. Real deps wire to a service-role Supabase
client (`lib/supabase/server.ts`, `@supabase/supabase-js@2.108.2`). **Scope deviation:** the
feature_list line says "enqueue analyze-task", but `docs/agent-architecture-plan.md` line 62
specifies ingest is `[no auto-analyze]` (analysis runs via `/api/briefings/run`), and
trigger.dev (feat-010) + analyze-task (feat-018) are not yet built — so ingest only persists the
bundle. Added `INGEST_BEARER_TOKEN` to `.env.example`. 13 new tests (`tests/ingest.auth.test.ts`,
`tests/ingest.bundle.test.ts`). `./init.sh` green (67 tests, 8 files).

**feat-007 (2026-06-20):** `lib/llm/` — thin wrapper over the Vercel AI SDK `generateObject`
using OpenRouter (`@openrouter/ai-sdk-provider`) as the gateway. `client.ts#getOpenRouter()`
reads `OPENROUTER_API_KEY` and throws if unset. `generateStructured.ts#generateStructured()`
defaults the model to `anthropic/claude-sonnet-4-6` (callers pass `config.model_id` — no DB
coupling here, dep stays feat-001), attaches base64 chart images as AI SDK vision parts,
asserts `result.response.modelId` equals the requested model (`assertModelMatch`), and
re-validates output against the caller's Zod schema. 9 tests in
`tests/llm.generateStructured.test.ts` (DI'd fake `generateObject` — no network). Added
`ai` + `@openrouter/ai-sdk-provider` deps and `.env.example`. `./init.sh` green (54 tests, 6 files).

**feat-006 (2026-06-20):** `knowledge/schema/briefing.schema.ts` — Zod 4.4.3 schemas as the
source of truth for analyze-task (`Briefing`/`Objective`) and eval-task (`EvalResult`) output,
mirroring the docs/agent-architecture-plan.md Output contract. Exports inferred TS types +
standalone enums (Direction, LevelKind, TargetLabel, EvalStatus). 16 tests in
`tests/briefing.schema.test.ts`. Added `@` path alias + `knowledge/**/*.test.ts` glob to
`vitest.config.ts`. Added `zod` dependency. `./init.sh` green (45 tests, 5 files).

**Note:** Most recent commit (`c518fc9`) was a housekeeping rename, not feature work — project
renamed from "Ulysses" to "Gekko" throughout docs/harness/persona; no `feature_list.json` status
changed as a result.

**Scope change (2026-06-18):** Triggering switched from automatic to **on-demand UI buttons**.
The cron `scheduled-briefing` became a "Run Briefing" button (feat-012); the live-price
proximity pipeline became a "Check Entry" button running the `instructions.md` eval logic
(feat-028, repurposed). Current price now comes from the latest bundle (Sierra exports ~every
30s), so the ACSIL price heartbeat / `/api/price` / `latest_price` are gone. Removed feat-004,
feat-027, feat-032, feat-034; added an `eval_results` table + `EvalResult` Zod schema; updated
feat-005/006/013/026/029/030/031/033 accordingly. Both `docs/agent-architecture-plan.md` and
`feature_list.json` updated. Feature count: 38 → 34. (Planning/spec only — no app code yet.)

**Scope change (2026-06-20):** Added **feat-004 "Execution bars CSV parser + tests"**
(`lib/engine/parseExecBars.ts`) — the exec CSV (`chart-data/execution_bar_data.rolling.csv`,
~250 rows, `DateTime,Open,High,Low,Close,LegVWAP,DeltaIntensity`) previously had no typed
parser; feat-015 `deltaTelemetry` summarized raw CSV directly, an asymmetry with feat-002's
profile parser. feat-004 produces typed `ExecBar[]`; feat-015's dependency moved from feat-001
→ feat-004 to consume it. Reuses the feat-004 id freed by the 2026-06-18 removal. Feature
count: 34 → 35. (Planning/spec only — no app code yet.)

**Scope change (2026-06-20) — no intermediate "v1" features:** Per product direction (full
functionality from the start, no v0/v1 stepping stones), collapsed the thin-then-thick pairs:
- **feat-011** is now "analyze-task (engine-integrated)" — absorbed feat-023 (engine wiring)
  and the hybrid-LVN behavior of feat-025; depends on the full engine
  (feat-015–021) + feat-006/007/008/010.
- **feat-013** is now "Briefing + terrain render page" — absorbed feat-026 (real terrain map,
  EvalResult render).
- **Deleted feat-023, feat-025, feat-026.** Repointed their dependents (feat-024/036/037/038)
  to feat-011.
Trade-off accepted: the analyze-task is no longer parallelizable ahead of the engine — the full
engine must land before the end-to-end pipeline. Validated: 32 features, no dup ids, no dangling
deps, no dependency cycles. Feature count: 35 → 32. (Planning/spec only — no app code yet.)

**Renumber (2026-06-20) — sequential, dependency-ordered:** Reordered `feature_list.json` so the
list reads top-to-bottom (every dependency now points to an earlier feature) and renumbered the ids
sequentially `feat-001..feat-032`, closing the gaps left by past deletions. The engine modules now
precede the analyze-task that consumes them. **All scope-change entries ABOVE this line use the
pre-renumber id scheme.** Old → new id map for the items that moved:
- engine modules: feat-015→011 (deltaTelemetry), 016→012 (mgiPriority), 017→013 (ripStatus),
  018→014 (lvnDetection), 019→015 (magnetCheck), 020→016 (terrainZones), 021→017 (riskReward)
- pipeline/UI: feat-011→018 (analyze-task), 013→019 (render page), 012→020 (manual trigger),
  014→021 (Vercel)
- back half: feat-024→023 (prompt caching), 029→024 (entry_levels lifecycle), 028→025 (eval task),
  030→026 (web notifications), 035→027 (web push), 031→028 (config UI), 033→029 (staleness),
  036→030 (observability), 037→031 (opus flag), 038→032 (doctrine guard)
- unchanged: feat-001..010, feat-022 (knowledge restructure)
Validated: 32 sequential ids, no dangling deps, no forward (backward-reading) deps, no cycles.

## Status

### What's Done

- [x] **feat-014 (lvnDetection.ts + LVN/HVN eval harness, Phase B) + feat-034 (tuning, folded
  in)** — `lib/engine/lvnDetection.ts` dual-mechanism detector (prominence valleys/peaks +
  taper-edge plateau knees) over a VbP `{price,volume}[]` series, relative thresholds, smoothed;
  `scripts/lvn-eval.ts` + `npm run lvn:eval` (±10pt greedy match, train/holdout separate, gate at
  TRAIN F1 0.55). Tuned TRAIN-only with an anti-overfit regularization on smoothing → TRAIN LVN
  0.58 / HVN 0.65 (PASS), HOLDOUT 0.44 / 0.60. 10 synthetic unit tests. See the dated narrative
  block above for full rationale. `./init.sh` green (196 tests, +10; typecheck 0, lint 0 errors).

- [x] **feat-005 (Supabase schema, migrations & storage)** — `supabase/` scaffolded
  (`supabase init`) + 3 timestamped migrations checked in: **init_core_schema** (`config`
  singleton `id=1`; `raw_bundles`; `briefings`; `entry_levels` w/ `direction in (long,short)`;
  `eval_results` w/ `status in (ENTER|WAIT|NOT_VALID|NO_ENTRY_NEAR)` + `near_entry` /
  `evaluated_level_id` fk / `direction` / `trigger` / `stop` / `targets` / `reason` /
  `raw_model_json` / `current_price` — **no `latest_price` table**, current price comes from the
  latest bundle; indexes on `received_at`/`created_at`/`active`/fks; **RLS enabled on all 5
  tables with no policies** → service-role-only until per-feature read policies land),
  **storage_buckets** (private `chart-images` for PNGs + `bundle-csvs` for CSVs), **seed_config**
  (idempotent singleton: `anthropic/claude-sonnet-4-6`, triage `anthropic/claude-haiku-4-5`,
  `rr_min 3.0`). **Applied live** to project `qvhkqilizwozikpomxob` via the Supabase MCP and
  verified: 5 tables, 2 buckets, 1 config row with the documented defaults, RLS on all 5;
  `get_advisors(security)` returns only 5 INFO `rls_enabled_no_policy` notices (intentional —
  not WARN/ERROR). `tests/migrations.test.ts` adds 15 offline schema guards. `./init.sh` green
  (29 tests / 4 files / typecheck / lint / build).

- [x] Architecture plan written: `docs/agent-architecture-plan.md`
- [x] Sample profile exports confirmed and parsing spec locked: `chart-data/vbp_export.md`, `chart-data/delta_vbp_export.md`
- [x] Agent harness created (`harness-creator` skill): `CLAUDE.md`, `feature_list.json`, `progress.md`, `session-handoff.md`, `init.sh` — validator reports 100/100
- [x] `feature_list.json` populated from the plan: 34 features (feat-001..feat-038 minus removed feat-004/027/032/034), dependency-ordered, validated (no cycles, all deps resolve)
- [x] Tooling installed: Vercel Claude Code plugin; Trigger.dev MCP server (`trigger`, in `~/.claude.json`); Trigger.dev agent rules (`CLAUDE.md` + `.claude/agents/trigger-dev-task-writer.md`)

- [x] **feat-004 (execution bars CSV parser + tests)** — `lib/engine/parseExecBars.ts`: pure TS
  parser for `chart-data/execution_bar_data.rolling.csv` (250 rows,
  `DateTime,Open,High,Low,Close,LegVWAP,DeltaIntensity`). Validates header column order and
  throws on mismatch; tolerates zero `LegVWAP` (pre-leg rows); parses `DateTime` to `Date`,
  all price/indicator columns to `number` → `ExecBar[]`. 6 tests: row count (250), first/last
  spot-checks, ascending-time ordering, pre-leg tolerance, header-mismatch throw. `./init.sh`
  green (14 tests / typecheck / lint / build all pass).

- [x] **feat-002 (profile export parser + tests)** — `lib/engine/parseProfile.ts`: pure TS
  parser for Sierra Chart Markdown VbP/Delta exports. Reads `tickSize`/`binSize` from Metadata,
  `POC`/`VAH`/`VAL` from Summary, extracts fenced CSV block, detects file type by 2nd column
  header (`Volume` vs `Delta`), validates row spacing against `step = tickSize × binSize`,
  left-joins delta rows onto VbP price series → `ProfileRow[]{ price, volume, delta|null }`.
  7 tests against real `chart-data/` samples; `./init.sh` green (8 tests / typecheck / lint /
  build all pass).

- [x] **feat-001 (scaffold & verification baseline)** — Next.js 16.2.9 + React 19.2.4 (App
  Router, TypeScript, Tailwind v4, **no `src/`**) scaffolded at repo root via `create-next-app`.
  Scripts: `typecheck` (`tsc --noEmit`), `lint` (`eslint`), `test` (`vitest run`), `build`
  (`next build`), plus Prettier (`eslint-config-prettier` in the flat config). Tailwind `@theme`
  in `app/globals.css` seeded with DESIGN.md color/radius/font tokens; minimal placeholder page
  renders the near-black canvas. `./init.sh` green from a clean checkout (typecheck/lint/test/build);
  prod server renders the GEKKO page.

### What's In Progress

- [ ] Nothing in progress.

### What's Next

1. Pick up **feat-008** (`/api/ingest`, now unblocked by feat-005), **feat-006** (Zod output
   contracts), **feat-007** (AI SDK + OpenRouter), **feat-014** (lvnDetection) / **feat-015**
   (magnetCheck), or any item whose deps are all done. (Post-renumber ids.)

## Blockers / Risks

- [ ] Trigger.dev MCP server loads on MCP client restart; it authenticates with Trigger.dev at runtime (login needed before using deploy/run tools).
- [ ] Engine LVN/Magnet detection quality is the main edge — validate against a hand-labeled chart (see plan, Phase 0).

## Decisions Made

- **Harness file = `CLAUDE.md`** (single source of routing for Claude Code). Trigger.dev rules moved out to `docs/trigger-dev-rules.md`. `AGENTS.md` removed to avoid duplication.
- **`.claude/settings.local.json` is gitignored** (machine/session-local); the `harness-creator` skill and `skills-lock.json` are committed so the harness is reproducible.
- **Repo layout has no `src/`** (feat-001): `app/` and (future) `lib/`, `knowledge/` live at the
  repo root to match the architecture plan's paths (`/lib/engine/...`).
- **Prettier is scoped to app code only** (feat-001): `format` runs on `{app,lib,tests}` and a
  `.prettierignore` excludes docs/knowledge/skills/JSON/Markdown. (A naive `prettier --write .`
  reflows the entire harness — docs, DESIGN.md, feature_list.json — which is out of scope.)
- **Display font is Inter** (feat-001): the DESIGN.md source site uses Inter (not the proprietary
  BMW Type Next), so it's loaded via `next/font/google` in `app/layout.tsx` as `--font-inter`;
  the Tailwind `--font-display` token resolves to it with a `sans-serif` fallback. Per the
  `vercel:nextjs` skill, fonts go through `next/font`, never `<link>`/`@import`.

## Files Modified This Session

- `docs/agent-architecture-plan.md` — architecture plan (committed earlier)
- `CLAUDE.md`, `feature_list.json`, `progress.md`, `session-handoff.md`, `init.sh` — harness
- `docs/trigger-dev-rules.md` — Trigger.dev integration rules (moved out of `CLAUDE.md`)
- `CLAUDE.md`, `.claude/agents/trigger-dev-task-writer.md` — Trigger.dev rules + subagent
- `.gitignore`, `skills-lock.json`, `.agents/skills/harness-creator/**` — tooling

### Rename session (2026-06-18, commit `c518fc9`)

Renamed all "Ulysses" references to "Gekko" (project now named after Gordon Gekko, not Ulysses
S. Grant):

- `CLAUDE.md` — harness intro line
- `docs/agent-architecture-plan.md` — title, intro, `C:\gekko\export\` paths, knowledge-base comment
- `feature_list.json` — `feat-003` description path (`C:\gekko\export\`)
- `gem-files/instructions.md` — title, intro persona line, and the `PERSONA` section rewritten
  from Ulysses S. Grant (military-general tone) to Gordon Gekko (cold, ruthless-conviction
  trader tone); the underlying military-terrain trading vocabulary (Campaign, Stratosphere/Abyss,
  infantry aggression, etc.) was deliberately left unchanged — out of scope for this rename
- `scripts/auto-implement.sh` — header comment

## Notes for Next Session

Read `CLAUDE.md` → `docs/agent-architecture-plan.md` → `feature_list.json`, then run `./init.sh`
(it will report "no package.json yet" until feat-001 lands). Work one feature at a time; only pick
a feature whose dependencies are all `done`. Record evidence in `feature_list.json` when marking done.
