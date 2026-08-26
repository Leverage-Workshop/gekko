# Session Progress Log

## Current State

**Last Updated:** 2026-08-26

**Latest change (branch `feat-125-parse-job-study`): feat-125 — parseJobStudy, the strict
parser + normalizer for feat-118's two Job-study exports.** `lib/job-plan/parseJobStudy.ts`
(+ `types.ts`, `jobStudySchema.ts`, `jobStudyMeta.ts`, `jobStudyRows.ts`, `pivotLadder.ts`,
`priceChecks.ts`, `exchangeTime.ts`, `contractSymbol.ts`) takes the raw text of
`job-study-daily.json` + `job-study-weekly.json` and returns ONE `JobStudy` geometry or throws
`JobStudyParseError` carrying every issue found — fail closed, nothing filled in. Pure, no I/O.
The invariants were calibrated to the real sample pair in `chart-data/` (byte-identical copies
are the fixtures, test-asserted) and feat-118's recorded evidence; the module comment lists
which are errors (observed on every real row / structural: size caps, strict shape, schema
version, same contract in both files + supported NQ/ES root, same TZ / tick / tradingDay /
weekOf, the operator's Globex template, DST-safe timestamps, `tradingDay` == the 17:00 CT roll
of `lastBarTime` — the real sample is Sunday 22:20 CT folding into Monday — every price
positive and on the tick grid, `valueLow <= pivot <= valueHigh`, unique + monotonic + right-side
ladders, no future/weekend/duplicate sessions, a current daily row and a current weekly row,
box/autoplot low < high) and which are warnings (unobserved or the caller's per R13: the 18-min
export skew between the two manual first exports — reported as `exportSkewSeconds`, R13's
`insufficient` spans MGI/bars too — weekly history rows dropped as feat-118's back-read, ladder
depth/symmetry, collapsed zone, non-Monday weekOf, empty/duplicate boxes, null autoplot,
extras). The output separates `daily.current` from `daily.history` (kept in full, newest first
— untested-relevance is feat-126's), trusts only the current weekly row, and carries per-file
provenance. `crossCheckWithMgi(study, mgi, toleranceTicks = 1)` compares the current daily /
weekly pivots against MGI `daily.jobPivot` / `weekly.jobPivot` (0.00 placeholder = missing, not
a match) and the contract identity (`NQU6.CME` vs `NQU26` compare equal on root+month+year
digit); it returns a structured result — fatality is the feat-128 task's call. Decisions worth
knowing: strict objects mean an additive exporter field is a schema error until
`schemaVersion` bumps (deliberate); the session template is pinned to the operator's string
because the 17:00 roll assumes it; the weekly `weekOf` window check is [weekOf, weekOf+6] so
a holiday-Monday week only warns. 110 tests (`tests/job-plan.*.test.ts`, helpers in
`tests/helpers/jobStudy.ts`, fixtures in `tests/fixtures/job-study/`). ./init.sh green —
typecheck, lint, 1721/1722 tests (1 pre-existing skip), build. Codex gate round 1: PASS with
two P2s, both real and both fixed — (1) `parseFile` threw on the first bad file so a broken
weekly file's issues were dropped from the "every issue" error: both files now parse to
non-throwing results and their issues are combined; (2) any valid IANA `exchangeTz` was
accepted while the trading-day roll is 17:00 CENTRAL wall time, so a New_York export would
fold bars into the wrong day: `exchangeTz` is now pinned to `America/Chicago`
(`JOB_STUDY_EXCHANGE_TZ`, an unsupported-setting error like the session template). Round 2:
see the gate verdict below. Next in the chain: feat-126 (classifyContext + rules).

**Latest change (branch `feat-118-job-exporter-split`): the Job-study exporter split into two
per-chart studies.** Operator decision 2026-08-23: the source studies live on TWO charts (Daily
Job Pivot + JBA boxes on the 5-min chart; Weekly Job Pivot + Autoplot Balance Area on the 30-min
chart), so the single `JobStudyExporter.cpp` study became two studies in the same DLL — "Gekko
Job Daily Exporter" → `job-study-daily.json` (meta + dailyPivots + balanceAreas) and "Gekko Job
Weekly Exporter" → `job-study-weekly.json` (meta + weeklyPivots + autoplot). Deployed and
verified live in Sierra: daily exports 5 sessions + 2 boxes; the weekly first exported **0
weeks** because the weekly study names its pivot subgraph **"W Pivot"** (not "Pivot" — fixed,
exact-name match extended), and the Autoplot read was empty because the OFL "Balance Areas"
study exposes **no named subgraphs** and the rectangle fallback's orange color filter didn't
match the operator's `#0C4A8F` rectangle — color filtering is now opt-in (default off, most
recent rectangle wins; the new toggle input is appended after the existing inputs so saved
per-index settings don't shift). Observed ladders: daily ±6 rungs (1A..6B), weekly ±3 (1A..3B)
— the plan's ±3-vs-±7 open question is settled. Repo side: `job_study_ref` renamed
`job_study_daily_ref` + new `job_study_weekly_ref` (migration `20260823210000_job_study_split_refs.sql`,
applied live via the claude.ai Supabase MCP — first attempt was blocked by the permission
classifier, operator authorized the retry), manifest/uploader/ingest/loadBundle/tests updated to
the two-field contract, task-plan + engine-ownership + feature-list (feat-118/125/128) + gekko-db
skill updated. The rename is contract-safe: the old column was all-NULL and unread (parser is
feat-125). Chart-defaults baked in per operator screenshot: session template
`Globex 17:00:00-16:59:59 CT`, exchange TZ `America/Chicago`. Samples from the live exporters are
checked in (`chart-data/job-study-daily.json`, `job-study-weekly.json`, `five-day-rolling.vbp.md`,
`four-hour-rolling.vbp.md`) and live MGI confirmed carrying `symbol` + `pwVAH`/`pwVAL` —
**feat-118 marked done** (observed invariants for the feat-125 parser recorded in its evidence,
including: weekly HISTORY is not real — the weekly study back-reads current-week values at prior
weeks' last bars, so only the current-week row is trustworthy; JBA box anchorTimes are degenerate,
begin == end). Remaining non-blocking: the per-day snapshot archive (`C:\gekko\snapshots\`) isn't
set up, and `chart-data/mgi_static_levels.json` was deliberately NOT regenerated (tests pin values
from the old sample). Deploy note: the Windows uploader checkout must pull + restart before the
new files upload (known gotcha).

**Latest change (branch `chore-codex-review-gate`): Codex code review is part of the check-in
gate.** `npm run codex:gate` (`scripts/codex-gate.ts`, `lib/codex-gate/`) runs Codex's native
code reviewer (the one behind `/codex:review`) over `origin/main...HEAD`, fails on any `[P0]`/`[P1]`
finding, prints P2/P3 for triage, and records the run in a gitignored `.codex-gate/last.json`.
CLAUDE.md's Definition of Done and End of Session now require it before the PR. Design note:
the first cut used the plugin's *adversarial* review with a hard "no critical/high" bar plus a
PreToolUse hook that classified git/gh commands — the adversarial reviewer then produced an
unbounded stream of "do not ship" classifier-evasion findings against the hook itself (13
rounds). Operator decision 2026-08-23: plain review, P1-only bar, no hook — enforcement is the
CLAUDE.md rule, like the rest of the harness. The gate's first run on itself returned one P1
— the parser dropped `[P0]` findings, a silent pass — fixed; a second P1 (a missing
`codex.status` was treated as success) — fixed. Final gate: PASS on the PR head; one P2
dismissed (registry with several Codex plugin installs where the first is stale — single
installation here; revisit if the plugin is ever reinstalled at another scope). 17 tests (review-text parsing, payload
fail-closed, git helpers against a temp repo).

**Latest change (branch `feat-124-profile-vision-config`): feat-124 — profile-vision config +
/settings + bench.** `config` gains `profile_vision_model_id` (NULL = read OFF, R14),
`profile_vision_model_effort` and `profile_vision_samples` (migration applied live); fetchConfig
degrades cleanly on a pre-migration DB and /settings exposes all three under a new Job-Planner
section. The bench is `scripts/profile-vision-bench.ts` (gated on `RUN_LLM_INTEGRATION=1`) over
pure, unit-tested scoring in `lib/job-plan/profile-vision/bench.ts` (recall / primary agreement /
self-agreement / precision vs the code-owned detector, via a shared `lib/engine/nodeMatch.ts`
greedy matcher extracted from lvn-eval). **The bench has NOT been run** — feat-119's golden
profiles have not landed and a live run needs the operator (paid calls). `docs/profile-vision-
bench-2026-08-22.md` scaffolds the harness + proposed R15 numbers. The read stays OFF until the
operator sets a model after ratifying R15. This is the last of the requested feat-121..124 set;
the planner chain (feat-125+) waits on feat-118's real job-study.json sample.

**Latest change (branch `feat-120-golden-labels`): feat-120 — the golden-set labels + loader.**
`chart-data/job-lvn-golden/<date>/labels.json` (20 dates, 28 labels) transcribes every
lvn-corpus.md A1 row that names a price; `split.json` fixes the three few-shot dates and holds
out the rest. `lib/job-plan/profile-vision/goldenSet.ts` is the strict-Zod loader — one
instrument per date (feat-119 exports one chartbook profile per folder), `scorable` once a
profile file lands, and a throw if `replay.json`'s instrument contradicts the labels. The
tests pin each `verbatim` to its exact A1 row and each `priceLow` to the full price, so a
wrong-row citation or a wrong thousands digit fails CI. Codex caught two transcription errors
(the 07-10 span, the 07-20 split-zone mislabeled as an LVN) — both corrected. This is the last
prerequisite for feat-124 (config + /settings + bench), which pairs it with the feat-119
operator exports once those land.

**Latest change (branch `feat-123-profile-vision-read`): feat-123 — the profile vision read.**
`lib/job-plan/profile-vision/` now has the module that turns feat-122's images into planner
input: a flat `ProfileNodesRead` schema, a prompt whose 14 criteria each quote
`docs/jba-research/lvn-corpus.md` verbatim (a test asserts it) and carry NO structure, a
stand-in few-shot set under `knowledge/job-plan/few-shot/` (lvn-fixtures 5 and 3 until the
golden exports exist — swap them and bump `VISION_PROMPT_REVISION`), `identifyProfileNodes`
(P × S × T calls through an injected `generate`, concurrency 6, 60 s timeout that ABORTS the
provider request — `generateStructured` gained an `abortSignal` passthrough for it) and a pure
`consensus` (grid snap, seam-aware tile de-dup, kind-family clustering at the R1 tolerance,
one vote per sample, ≥ ⌈S/2⌉, exactly one primary lvn, R14 null + warning). Not wired to any
task. Codex caught real defects on the first pass (timed-out calls leaking past the cap,
tile de-dup collapsing distinct nodes, exhaustive/taper blended by majority vote) — all fixed.
Next: feat-124 (config + /settings + bench) — which also depends on feat-120 (golden labels).

**Latest change (branch `feat-122-profile-renderer`): feat-122 — profile renderer + rasterizer.**
`lib/job-plan/profile-vision/` now turns any `.vbp.md` export into a deterministic SVG (pure
function of rows + meta + options; sha256 per tile for feat-128's fingerprint) and a PNG via
`@resvg/resvg-js` with DejaVu Sans Bold shipped in `assets/fonts/` (system fonts never loaded).
Layout mirrors the Sierra screenshots the operator reads: bars left off a right-hand axis,
900x1400, <= 660 rows, 20-pt NQ / 5-pt ES labels, POC/VAH/VAL/current markers and nothing
else. Bake-off variables are plain options (theme, envelope, tiles, bar anchor) for feat-124's
bench. `scripts/render-profile.ts` renders to PNG for eyeballing. trigger.config.ts lists
resvg as `external` and the font under `additionalFiles` (verified against the trigger.dev
docs via MCP); the in-worker smoke test is deferred to feat-128, the first task that will
import the module. Next: feat-123 (schema / prompt / identify / consensus) → feat-124.

**Latest change (branch `feat-121-job-input-refs`): feat-121 — bundle plumbing for the Job
inputs.** Three new Sierra export files (`job-study.json`, `five-day-rolling.vbp.md`,
`four-hour-rolling.vbp.md`) now ride uploader → ingest → Storage → `raw_bundles`
(`job_study_ref`, `five_day_vbp_ref`, `four_hour_vbp_ref`, all nullable, migration
`20260822200000_job_input_refs.sql` applied live). Nothing in analyze/eval reads them; the
`MgiStaticLevels` type accepts the optional `symbol` + `weekly.pwVAH`/`pwVAL` feat-118 will add
to the MGI export, pinned inert by tests. The feat-054 registry gate required rows in
`docs/engine-ownership.md` for the three fields — written as "Job planning task only, never
surfaces to the briefing model". **Deploy note:** the Windows uploader checkout must pull +
restart before the refs populate; until feat-118's exporter ships, bundles carry NULL refs and
the job-plan task (feat-128) fails closed. Next in the Job chain: feat-122 (renderer) →
feat-123 (vision read) → feat-124 (config + bench; depends on feat-120 golden labels as well).

**2026-08-22 (branch `claude/trading-plan-youtube-analysis-izig3g`): the Job planning task is
now tracked in `feature_list.json` as feat-118 – feat-130**, one entry per implementable step
of `docs/job-planning-task-plan.md` (the step → feature map is in that doc's "Implementation
steps"). Two entries are operator-side Sierra/Windows work (feat-118 exporter + snapshot
archive, feat-119 golden-set replay exports) and carry status `operator`; note that
`scripts/auto-implement.sh` only skips `done`/`skipped`, so its jq filter needs `operator`
added before the loop runs again. Unblocked repo work right now: feat-120 (golden labels),
feat-121 (bundle plumbing), feat-122 (profile renderer). The planner chain (feat-125 →
feat-127) waits on feat-118's real `job-study.json` sample by design (parser strictness is
calibrated to real output). `main` (feat-117) was merged into this branch.

**Latest change (branch `feat-117-pivot-tie-break`): feat-117 — double-top pivot annihilation
fixed; the defining rotation now ships dated.** Live defect, found by the operator reading the
2026-08-21 08:28 PT briefing (`edfa06a2`, bundle `8455eacd`): *"Range: mixed confirmed swings, so
no directional integrity qualifier applies. The current 78-point rotation spans 29321.25 to
29399.25"* — a rotation whose legs confirmed at 21:30 and 23:30 the **previous day** while the
live session had already traded 29220–29539. The bundle was FRESH (bars through 10:00 chart time,
price 29359.5) and the model reported the engine fact faithfully. The fact was wrong.

Root cause: `findPivots` disqualified a candidate on a **non-strict** comparison against BOTH
windows, so two bars with an identical extreme inside the ±5-bar window annihilate each other and
neither confirms. That session's high **29539.00 printed twice** — 06:30 and 07:30, four bars
apart, exactly at the ONH — so no swing high from the session entered the sequence at all. The
knock-on is what made it dangerous: with the high erased the sequence read "mixed" → state
`range`, and integrity is only computed for `up`/`down`, so **feat-064's real-time squaring — the
one mechanism built to stop a lagging swing read shipping unqualified — was switched off by the
same bug that caused the staleness.** Over the 2955-bar export the tie rule annihilated 5
candidates in ~3 months, all highs: rare, but landing precisely on double-tested extremes.

The tie rule is now asymmetric — strictly above the left window, at or above the right — so the
**earliest** bar of an equal-extreme cluster is the pivot (it also confirms soonest, which matters
for a read already lagging 2.5 h). On the incident export: last swing high 29539.00 @ 2026-08-21
06:30, state `up`, rotation 217.75 pts / 3.3 ATR, integrity `under-test` at ~82% retrace — the
honest read of a session that rallied to 29539 and got sold 319 pts to 29220.

Two companions shipped with it. `intradayTrend.ts` kept a **private copy** of the same rule on
exec bars — which tie far more often at 750-volume granularity and feed `intradayTrend.direction`,
the fact that awards the primary objective — and now shares htfStructure's finder (its bar
parameter widened to a structural `PivotBar`); `htfFlow.ts` already shared it and inherits the fix.
And `rotation` gained `highDateTime`/`lowDateTime`: "most recent CONFIRMED" is not "current", the
two legs need not come from the same session, and an undated span reads as the live range — both
prompts, the eval context line and the two knowledge docs now forbid *"the current rotation"* and
require the span dated whenever a leg predates the live session. Note this second gap is
independent of the bug: even with the tie fixed, the incident's low leg is still 23:30 the prior
day against a session low of 29220. That is inherent fractal lag the prose must disclose, not a
threshold to tune.

**Prior change (branch `feat-113-retire-atr-rungs`): feat-113 — the ATR-projected rung anchor
class is deleted; the engine carries ONE volatility measure.** Operator decision 2026-08-12, from a
review of feat-113's original scope: "it doesn't make any sense to use two different volatility
measures, especially if the Sigma one is way better", and on the rungs specifically, "I never asked
for this ATR multiplication stuff". `lib/engine/atrProjection.ts` and its test are gone, along with
`ATR_PROJECTION_RULE` in both prompts, the rung payload block, the anchor class in
`knowledge/system/output-objective.md`, and `engineAnchorPrices()`'s 5th argument.

**Removing the rungs made `EngineFactsInput.significantMoveSigma` dead** — the engine needed the
configured multiple ONLY to mark each rung against the floor per run. It is removed with them, so
`computeEngineFacts` no longer takes a gate at all and the floor lives purely in the prompt and
validation layers where feat-086 put it. Both callers stop passing it to the engine and keep passing
it to `buildPrompt` / `enforceCodeOwnedFacts` unchanged.

**Note on provenance, because the record disagreed with the operator.** This log (below) and
feat-108's decisions-log entries attribute the rungs to a 2026-08-09 operator directive — "current
price plus one ATR is a target, swing low minus one ATR is where a reversal is expected". The
operator states he never asked for ATR multiplication. Read as: an offhand chart remark was built
into an engine fact class with a 16-price anchor surface. **A remark about how the operator reads a
chart is not automatically a request for an engine fact.**

The rungs were in live use when removed — 5 of the 40 briefings before 2026-08-12 anchored on them,
every one as a STOP or invalidation and never as a target, most recently the 2026-08-12 11:32 PT
morning briefing's stop at 29707.76 (last swing low 29818.5 −2× ATR). Those stops now have to land
on observed structure or the objective abstains; that is the intended consequence.

Deleting the module also closed the two defects feat-113 originally tracked, by removal rather than
repair. `buildNote()`'s hardcoded "just under"/"just above" prose was **still lying after feat-112,
in the opposite direction**: measured on `chart-data/htf_bar_data.rolling.csv` at the live 0.3σ
config, ATR 116.23 against an 84.21-pt floor — 138% of it — was narrated as "at — just above — the
floor, so a 1× projection buys barely the minimum reversal room the engine demands". And a defect
never recorded: `clearsSignificantMove` measures travel from the RUNG'S OWN reference, while the
prompt rule and `output-objective.md` stated its consequence absolutely ("never as a target"), which
under the feat-086 entry-first contract wrongly forbade a 0.5× rung sitting well beyond an entry —
the same target-derived filtering the retired rr gate did.

**The MGI `ATR High` / `ATR Low` levels are untouched and are NOT part of this** — those are the
operator's own Sierra chart levels arriving as exported data (`lib/engine/mgiPriority.ts`, tier 2,
group `atr`), and three 2026-07-31 briefings exited on ATR Low. Only engine-COMPUTED ATR is retired.

The normalizer half survives for now and is **feat-116**: `htfStructure.atrPoints`,
`rotation.extentAtr` and `currentVsSwings.*Atr`, plus the eval prompt's "30-min ATR N pts" line.
Measured while scoping it, the two measures disagree IN THE PAYLOAD — the analyze prompt ships
`atrPoints` 116.23 (Wilder, 14 bars, ALL bars including overnight) beside
`volatilityScale.medianBarRangePts` 96.13 (RTH-only), while `parkinson.barSigmaPts` 74.68 is computed
and never shipped. They are the same quantity in different conventions: Parkinson converts a range to
a sigma by dividing ~1.665, and 116.23/1.665 = 69.8 against 74.68 agrees within ~7%.

The prompt-data sync gate (feat-054) earned its keep here: it caught two stale
`docs/engine-ownership.md` rows the removal missed — a registry path pointing at the deleted module
and the `atrProjections` fact still listed in the Bundle exports table. `./init.sh` green after the
rebase onto feat-102: 1384 passed | 1 skipped.

**Work was done in a separate git worktree** (`../gekko-feat-113` off `main`) because the primary
checkout carried uncommitted feat-102 HTF-order-flow work in five of the same files. That WIP was
left exactly as found, and feat-102 merged first (#156) — this branch rebased onto it.

**Previous change (branch `feat-102-htf-order-flow`): feat-102 — the HTF bars' order flow finally
feeds something, and a base-rate control study cut the feature's headline signal before it
shipped.** `parseHtfBars` had produced `volume`/`bidVolume`/`askVolume`/`delta` since feat-049 with
zero consumers; `lib/engine/htfFlow.ts` → `EngineFacts.htfFlow` now reads them, wired into analyze,
update and eval.

**The divergence half of the spec was measured and withheld.** A parallel study on 3,559 union'd
HTF bars — three live Supabase bundles spanning 2026-04-26..2026-08-12, 78 trading days, 6x the
593-bar repo fixture — found swing-level delta divergence has no empirical support: 89 divergent
swings, the fade thesis **underperforming** the unconditional base rate by 6.7 / 5.6 / 6.7 / 11.3 pp
at h=4/8/16/34 bars, every 95% CI containing the base rate, nothing surviving Holm, and 1 of 64 grid
cells at raw p<0.05 against 3.2 expected by chance. Holding "fresh price extreme" fixed, the delta's
own contribution flips sign between horizons — the extreme does the work, not the order flow. This
**replicates the 2026-08-07 day-level rejection at swing level**; the only replicable direction is
continuation, i.e. opposite to what the label implies. Operator call: `divergence` is computed and
unit-tested but withheld from every prompt payload, pinned by gates in `tests/prompt-data-sync.test.ts`
and `tests/eval.runEval.test.ts`. Re-enabling is one line at a marked seam in `lib/analyze/prompt.ts`
and `lib/eval/prompt.ts`. **Do not re-propose it without new data**: divergent swings arrive at
1.14/trading day, so a 5 pp lift needs ~700 trading days and the export is a 90-day rolling window —
this question is unanswerable from Gekko's data, not merely unanswered.

**Cumulative delta ships anchored or not at all.** The same study found HTF cumulative delta ran
opposite to realised price direction on 60 of 78 trading days (77%) — over the window price rose
+2,491 pts while cumulative delta fell to −53,901 contracts — and the level's origin is arbitrary,
set by wherever the rolling export begins. So there is no bare signed total in the fact: every net
delta names its anchor bar (time + open) and travels paired with the price change over that same
window, per RTH session too. Both prompt rules state the 77% figure as the reason never to read
delta as direction. On the repo fixture the hazard shows immediately — net delta +9277 (rising)
while price moved −642.25 pts over the same 138 bars, 4 of 5 sessions disagreeing in sign.

What ships as the real deliverable is per-swing delta/volume annotation on the same confirmed swings
`htfStructure` reports (`findPivots` is now exported so there is one definition of "confirmed swing",
not two that can drift). Measured and non-directional: swings print ~55% more volume than an
ordinary bar, swing-high delta skews mildly positive (median +44), swing-low negative (median −121).
Per-swing *running* cumulative delta was deliberately left out — comparing one swing's running total
to the next is swing-level divergence by another name.

Study, power table and reproduction: `docs/htf-delta-divergence-study-2026-08-12.md` +
`scripts/studies/htf-delta-divergence/`. No Sierra Chart change was needed — the export has carried
bid/ask volume since feat-049; the gap was entirely downstream. `./init.sh` green: 1395 passed |
1 skipped, including 25 new `htfFlow` tests.

**Previous change (branch `feat-115-features-tab`): feat-115 — a third dashboard tab renders
`feature_list.json` as a sortable, filterable TanStack table.** Operator ask: feature state should
be readable from the app, not only from the file. ID sorts ascending, the Status column opens
pre-filtered to `not-started` (the work that is left), grid descriptions truncate at 100 characters,
and a row click opens a modal with the full description.

**The installed table library is TanStack Table v9 (`@tanstack/react-table` ^9.1.2) and v8 examples
do not transfer.** Features are registered explicitly through `tableFeatures` (each row-model slot
after its feature), the hook is `useTable` not `useReactTable`, and header/cell rendering goes
through `table.FlexRender`. CLAUDE.md's intent block now routes this: `npx @tanstack/intent list`
then `load @tanstack/react-table#getting-started`, `#table-state`, `@tanstack/table-core#sorting`,
`#column-filtering` — worth doing, since the v9 shape is not what training memory produces.

Two behaviors that are easy to get wrong and are now pinned in code comments: `resetColumnFilters()`
resets to `initialState`, i.e. straight back to the default `not-started` filter, so Clear Filters
passes `resetColumnFilters(true)` for the blank state; and table state stays INTERNAL because
`useTable` without a selector subscribes to every registered slice, so sort clicks and filter
keystrokes re-render on their own — controlled React state would be redundant ownership.

The grid truncates descriptions but **filtering still runs against the full text**, so shortening a
cell never narrows what a search can find. The dialog is the native `<dialog>` element with
`showModal()`: TanStack ships no dialog package, and the element already owns the top layer,
backdrop, focus trap and Escape. `@tanstack/react-form` was considered and rejected — not installed,
the filter inputs' state is already owned by the table's column-filtering feature, and the dialog is
read-only.

`lib/features/featureList.ts` reads the file off disk at request time (so the tab tracks it without
a rebuild) and is deliberately permissive: `status` is a plain string because the file is hand-edited
and an unseen status must render rather than blank the tab. `evidence` is parsed off and dropped —
nothing renders it and it is half the file's 274 KB. `./init.sh` green: 1365 passed | 1 skipped,
including 6 new loader tests, one of which parses the real `feature_list.json`.

**Previous change (branch `feat-114-full-width-briefing-tabs`): feat-114 — the dashboard tabs span
the page, the latest eval moved under the Objectives tab, and the Danger Zones tab is gone.**
Operator layout call, render-only. The body was a two-column grid whose RIGHT column alone carried
the tab bar, so the tabs read as a widget on half the page and the Tactical Overview pane was
confined to that same half while the EvalStrip sat outside the tabs entirely.

`BriefingTabs` now wraps the whole body section: the tab row spans the content container, the
Objectives pane holds the old two-column grid (eval left, objective cards right), and the Tactical
Overview pane gets the full width. Its three prose groups became a 3-up grid at `xl` — at 1800px a
stacked card is one ~200-character line per row, which is not readable. The Update / Briefing
buttons moved out of the objectives pane into a new right-aligned `actions` slot on the tab row
(second operator call, same session: as a row inside the pane they pushed the objective cards
down). `role="tablist"` stays on a wrapper around the tab buttons only, so those trigger buttons
are never invalid tablist children.

**`dangerZones` was NOT removed from the pipeline** — only from the UI. The schema field, both
prompts, `composeBriefing` and the persisted `danger_zones` column are untouched, so nothing about
briefing generation changed and the data is still there if the tab ever comes back.

`./init.sh` green (1359 passed | 1 skipped). Also checked against the live dashboard through
headless Chromium: two tabs only, no "Danger Zones" string in the served HTML, and DOM order
tablist → tabpanel(objectives) → 2-col grid → `id="eval"` → Primary Objective.

**Previous change (branch `feat-112-recency-weighted-session-sigma`): feat-112 — the session
volatility scale is now recency-weighted, and the significant-move floor drops 0.4σ → 0.3σ.**
Operator-reported, not a backlog item: the 2026-08-11 briefing put its short entry 246 pts above
the market and its long 203.5 pts below, on a day whose prior session ranged 181.25 pts in total.

The model was compliant — this was the engine. Bundle `b6f71b2e` promoted exactly four terrain
borders (29900 / 29718.75 / 29631.75 / 29450.5), spans of **181.25 / 87 / 181.25**, with price at
29654 sitting inside the 87-pt one. The significant-move floor resolved to 145.56 pts, so the only
entry→T2 pairs that cleared it were the outer two, and feat-086's "walk outward from price and
anchor at the FIRST qualifying level" had nowhere nearer to stop. Both objectives got exiled to the
walls. Two independent causes:

**(1) The estimator was wrong for a non-stationary series.** feat-095 aggregated per-session
Parkinson variance as a flat RMS — the textbook estimator, which assumes stationarity. It failed
twice over: squaring let one 898-pt session carry ~27x the weight of a 181-pt one, and a flat
window cannot see a regime turn. So it reported **363.9** while the last three sessions ranged
445 / 296 / 181 and the engine's *own* `dailyRanges` fact read `"contracting"`. Backtested over
the 60 RTH sessions in that bundle's own export — each candidate predicting the NEXT session's
realized sigma, 40 test points — the flat RMS was the **worst of seventeen** candidates swept:

```
                       RMSE    bias   P(actual < predicted)
flat RMS, 10 sessions  153.4   +58.6        65%
median, 10 sessions    127.4    -6.9        50%
EW mean of sigma λ.75  133.9   +27.6        60%
```

Now a recency-weighted mean of per-session **sigma** (`ewMeanSigma`, decay 0.75, ~2.4-session
half-life). Two rejected alternatives worth not re-proposing: weighting the **variance** barely
moved it (364 → 271 even at λ=0.70 — squaring dominates any weighting), and the 10-session
**median**, though best on RMSE and nearly unbiased, is a flat window wearing a robust hat: it read
352.8 on the same export, i.e. it does not turn either. The window stays at 10 sessions —
1−0.75¹⁰ = 94.4% of the weight is already inside it, and running unbounded moved the live number
257.45 → 259.61 (0.8%). Only the SESSION statistic changed; the per-bar sigma and both medians are
still flat measures over that same window.

**(2) The multiple had outgrown its own calibration.** feat-096 chose 0.4σ *because* it was one
median 30-min bar range at the 283-pt reference sigma. That equivalence only held at that sigma —
by 2026-08-11 it had drifted to ~1.5 bar ranges and to **1.43x the operator's ~102-pt average
rotation**, so the engine was rejecting trades of exactly the size the operator normally takes.
Now 0.3σ: ~0.75 of a rotation, 3.1x the 25-pt operational stop, and still above feat-095's 0.25σ
noise band — which is the one property of the old default worth keeping and the reason it is 0.3
and not lower. A re-tune of the multiple only; feat-096's units decision and the standoff/chase
gates are untouched.

Replaying `b6f71b2e` through `computeEngineFacts` before/after: **σ 363.9 → 257.45**, floor
**145.56 → 77.24 pts** — under the 87-pt span, so both near borders now qualify as entry anchors.

Every pre-existing hand-computed fixture in `volatilityScale.test.ts` survived untouched: those
fixtures hold their sessions identical, and a weighted mean and a flat RMS agree by construction
there. Five new tests cover what only appears once sessions differ, and `scaledGates.test.ts` pins
the 2026-08-11 failure directly as a regression test. `./init.sh` green: 1359 passed | 1 skipped.

**Both migrations are now applied to the live DB.** `20260809140000_volatility_scaled_gates.sql`
had been committed-but-unapplied since 2026-08-09, which had a real cost: `config` still carried
`significant_move_pts = 50` while `fetchConfigRow` silently padded the sigma default, so the
operator's `/settings` value was dead and the pipeline enforced a ~146-pt floor nobody had chosen.
Only `/settings` surfaces `significantMoveColumnMissing` — the analyze path does not. **A padded
config default is invisible to the pipeline that consumes it.** They went in via the claude.ai
Supabase **MCP `apply_migration` tool, which IS reachable from Claude Code** — earlier sessions
assumed the server was disabled and escalated to the operator instead, which is why it sat for two
days. `.claude/skills/gekko-db/SKILL.md` now says so at the top of the DDL options.

**CLOSED by feat-113 (2026-08-12) — by deleting the module, not by fixing the prose.** The
note was still wrong after feat-112, in the above-floor direction (ATR 116.23 against an 84.21-pt
floor, narrated as "just above ... barely the minimum"), and the all-bars-vs-RTH ATR finding filed
with it moved to feat-116, where it dissolves: `barSigmaPts` is RTH-only by construction.

**Previous change (branch `fix-ai-sdk-system-in-messages-warning`): the doctrine prefix now travels
via the AI SDK `system` option instead of a system-role entry in `messages`.** Not a feature —
every analyze/eval/update run was printing `AI SDK Warning: System messages in the prompt or
messages fields can be a security risk because they may enable prompt injection attacks.` in the
task logs. AI SDK v6's `standardizePrompt` warns whenever `messages` contains a `system` role;
`generateStructured` was pushing the doctrine prefix in there as `messages[0]`.

The fix keeps the cache. `Prompt.system` accepts `string | SystemModelMessage |
SystemModelMessage[]`, and `convertToLanguageModelPrompt` copies a message-shaped `system`
through with its `providerOptions` intact, so the prefix is still passed as an object carrying
`openrouter.cacheControl: { type: 'ephemeral' }` — the provider prompt the model receives is
byte-identical to before, same message, same position, same ephemeral cache marker. Telemetry is
unaffected: `buildLangsmithProviderOptions`'s `processInputs` already destructured `system`
alongside `prompt`/`messages`.

`allowSystemInMessages: false` is now set on the call, so `messages` is user content only and a
system role appearing there throws instead of silently reaching the model — untrusted bundle text
can never impersonate doctrine. `generateStructured` is the single AI SDK call site in the repo
(nothing else calls `generateObject`/`generateText`/`streamText`), so that closes the surface.

Test coverage: the two existing system-prefix tests now assert the `system` option rather than
`messages[0]`, plus a no-prefix case, plus a new test that drives the REAL `generateObject`
through a stub `LanguageModelV3` — it captures `console.warn` (asserting the warning is gone) and
asserts the provider-level prompt still carries the cache-controlled system message. That last
test was verified to fail against the old inline-message shape before the fix was restored.
`./init.sh` green: 1352 passed | 1 skipped, typecheck + lint + build clean.

**Previous change (branch `feat-111-job-pivots`): feat-111 — Job Pivots (daily + weekly) added to
the MGI level set, Sierra study through to doctrine.** Operator-supplied definitions, not a
backlog item. The daily Job Pivot is the auction's line in the sand — the level directional bias
flips across depending on which side price can hold, and where large rotations visibly start and
stop. The weekly one is that same job at a weekly horizon, built from the PRIOR week's activity.

Both levels were already plotted on the chartbook (OrderFlow Labs `scsf_JobPivots` /
`scsf_JobWeeklyPivots_v2`) and simply never exported, so this starts in Sierra:
`D:\SierraChart\ACS_Source\MgiDataExporter.cpp`, the only writer of `mgi_static_levels.json`,
gained four inputs — Study ID **and Subgraph Index** for each pivot — and writes
`daily.jobPivot` / `weekly.jobPivot`. The subgraph index is an input rather than a constant
because these are third-party DLLs whose subgraph order cannot be verified from source; the
default `2` (`Pivot`) was read off the DLL's own subgraph-name ordering (`0` Pivot High, `1`
Pivot Low, `2` Pivot) and is correctable in the settings dialog if the exported number does not
match the pivot drawn on the chart. **The study still needs a recompile and a re-export before
the fields appear in a live bundle** — the app tolerates their absence by design.

Tiering is the operator's call, and it deliberately inserts nothing new into the priority order:
the **daily** pivot is Tier 2 at Daily MGI Priority **rank 1, shared with the Rip** (same
functional class — an intraday bias filter, not a campaign border), so ONH/ONL stay at 2 and
everything below is untouched; the **weekly** pivot is Tier 1 like every other weekly level, so
it can hold a terrain partition and surface in `nearestTier1Above/Below`. Pivot LINE only — the
studies also plot Pivot High / Pivot Low zone edges, and the operator declined the band, so the
single-price shape every other MGI level has still holds.

One engine change fell out of the rank decision. feat-109 gave the Rip a consolidation-survival
exemption keyed on `code === 'rip'`, but its stated justification was always the RANK ("the Daily
MGI Priority Order's rank-1 level, the immediate directional filter"). The Rip was simply the only
rank-1 level at the time. `consolidationTier()` is now keyed on
`group === 'daily' && dailyRank === 1`, so the Job Pivot earns the same partition protection for
the same stated reason, and a test pins the other half of the rule (an UNRANKED daily level — OR
Mid — still loses the identical contest).

Doctrine: `MGI_STRUCTURE_RULE` (shared verbatim with the update task) now carries the order
"1 Rip + Job Pivot" and how to read both pivots — price sitting ON a pivot is an undecided
auction, not confirmation of either side. `knowledge/doctrine/glossary.md` gained a row in each
glossary plus a pivots-are-bias-filters note. That growth pushed the cached analyze prefix to
48_438, so the budget ceiling went 48k → 49k in the same diff, per the test's own instruction.

`./init.sh` green: 1350 passed | 1 skipped, typecheck + lint + build clean. The `chart-data`
fixture is a pre-feature export carrying neither pivot, which is why its 30-level counts are
unchanged — that path (fields absent) is now covered by its own test.

**Earlier change (branch `feat-109-mgi-band-rip-nearest`): feat-109 — three fixes to the MGI
importance hierarchy, from an operator review of it.** Not a bundle-review item; the operator
asked to see where MGI importance is encoded and then to change it. It lives in exactly two
places: `LEVEL_SPECS` / `PRIOR_DAY_VALUE_SPECS` in `lib/engine/mgiPriority.ts` (tier + Daily MGI
Priority rank, the declarative table) and `borderRank` in `lib/engine/terrainZones.ts` (which
consumes tier as its FIRST sort key, so tier decides which border survives spacing
consolidation).

**(1) VRange is implied-volatility geography, and the ±2/±3 pair is one shaded zone.** The
operator supplied the Sierra study's definition mid-session, which corrected a wrong reading. My
first pass derived "±2/±3 are fixed multiples of the RANGE WIDTH (2.3× / 2.5× off the opposite
edge)" from the archived exports — arithmetically true but a fitted artifact, not the generator.
The real construction is the Implied Vol Ranges study: every level is the session OPEN ± a multiple
of `D`, the expected session move implied by VIX. Verified on two exports agreeing to 4 dp, both
with `D` at **1.45% of the open** (433.5 and 431.5 pts → implied VIX ≈ 23.0):

| export field | is |
| --- | --- |
| `high` / `low` | O ± 0.25·D — the study's Upper/Lower Ranges, value-area-like mean reversion |
| `extPlus2` / `extMinus2` | O ± 0.90·D — NEAR edge of the shaded "1x Range Zone" |
| `extPlus3` / `extMinus3` | O ± 1.00·D — FAR edge: the full expected session move |

So the band read was right for a better reason — the two `ext` edges are literally the two edges of
ONE shaded zone — but the **tier lever was the wrong fix, and it is reverted.** Tier answers "how
important is this level"; the band's problem was never importance, it was that the engine treated
one object as two. Demoting the far edge to Tier 2 (the first pass, committed in 6801604) cost a
real partition: on the fixture the profile's genuine AAA acceptance sat at the FAR edge (29504.25),
the near edge has no volume geometry at all, so the demotion retired a real border instead of
relocating it — zone stack 10 → 9. All six VRange levels are Tier 1 again and the stack is back
to 10 / 11.

**The fix instead lives in `mergePartitions`:** the two zone edges cluster into ONE composite
border at any spacing (`sameVRangeZone`), not just within `mergeTolerancePts`. They fell inside
`aTierMinSpanPts` but outside the merge tolerance — the exact gap where consolidation demoted one
of them on an arbitrary price tie-break (far edge survived above price, near edge below). Merged,
the composite's price is the deepest local dip (the acceptance the profile actually shows) while
BOTH member prices stay legal entry anchors, so a fade can still sit on the near edge. Clustering
is adjacency-based, so an unrelated partition between the edges blocks the merge — deliberate, and
documented rather than tested (constructing a third promotable valley needs a bespoke
profile/LVN/magnet set, more fragile than the assertion is worth).

**Operator decision: the whole `vRange` group stays Tier 1.** I had recommended demoting it to
Tier 2 for consistency with ATR (audit A9 excludes ATR projections from Tier 1 as "not campaign
borders or partition anchors", and VRange is the same category of object — a volatility projection
off a reference price). Declined: the 0.25·D Upper/Lower lines are good levels in practice. Do not
re-propose it.

**Labels corrected, and this was a live prose bug.** `high`/`low` were labelled "VRange High" /
"VRange Low" and the docstring called them "VRange extremes" — but they sit at a QUARTER of the
expected move, so the model was quoting them in briefings as the session's expected extreme, wrong
by a factor of four. Now `VRange Upper` / `VRange Lower`, with the `ext*` levels named
`VRange 1x Zone near/far (upper|lower)` so the zone reads as one object. `knowledge/doctrine/
chart-reading.md` and `glossary.md` corrected to match ("VRange extremes" → the expected-move
levels).

**(2) The Rip holds its partition.** It could always BE a border — it is a `daily`-group level, so
`selectAnchorLevels` always carried it, and the trailing `code === 'rip'` clause was redundant
(deleted). What lost it was consolidation: `borderRank`'s first key is tier, so any Tier-1 neighbor
16–60 pts away took its border — too far to merge into one composite band, close enough to trip
consolidation. New `consolidationTier()` is now that first key and ranks a Rip-member border as
tier 1 **for consolidation only**; `border.tier` still reports the true tier. Deliberately NOT a
tier promotion in `mgiPriority.ts`: the playbook classifies the Rip Tier 2, and `mgi.tier1` feeds
the Stratosphere/Abyss envelope plus `nearestTier1Above/Below` — the Rip tracks price intraday, so
a real promotion would let it become the campaign ceiling or floor and collapse the map. No-op on
the fixture (the Rip there merges into the `RPOC / 24 VWAP / Rip` composite at 29885.08, inside
`mergeTolerancePts`, and was already surviving); the exemption is insurance for the 16–60 pt
window, covered by a test that inverts the existing "Tier-1 A survives a Tier-2 AAA neighbor" case.

**(3) `nearestDailyAbove/Below` — the distance-aware companion.** `dailyPrioritySort` is RANK
order and blind to distance (it lists the Rip first at 200 pts away and the OR levels last with
price sitting on one), and levels sharing a rank — ONH/ONL, PDH/PDL, IBH/IBL — are TIED, ordered
by price with no importance implied. The only distance-aware MGI fact was Tier-1-only, so the Rip,
PDH/PDL, IBH/IBL, RVAH/RVAL/RPOC and the OR levels could never reach the model with a distance
attached — the wrong shape for feat-086's entry-first, nearest-first contract. The fixture shows
the gap exactly: price 29945.75 sits **3.00 pts under PDC** while the nearest Tier-1 border is
100.25 pts away, and PDC is Tier 2 AND unranked. Covers the WHOLE daily group, not just ranked
members, because OR High/Mid/Low are unranked live session structure used as rungs.

**Also (small, in the same function):** `nearest()` now rejects non-positive prices. The fixture
exports `onh`/`onl`/`ibh`/`ibl` as **0.00**; they are finite, so they survive extraction, and on a
gap-down open with no real level below price a 0.00 ONL would have been returned as "the nearest
level below". Same guard `terrainZones` already applied to the campaign anchors. Per the operator,
those zeroes are an artifact of generating `chart-data/` **off hours** (current time 21:52, no IB,
no RTH session yet) — not a permanent export property. The guard still earns its place, because a
live pre-open or overnight run carries the same zeroes; its coverage comes from the synthetic
gap-down test, not the fixture. One new shared `MGI_STRUCTURE_RULE` carries rank-vs-distance and the band doctrine to
both the analyze and update prompts (one-home-per-rule). `./init.sh` green: typecheck, lint,
**1341 tests passing** (1 skipped), build.

**OPEN — tracked as feat-110 (`not-started`): add an RTH bundle fixture (operator, 2026-08-10).** Because `chart-data/` was
generated off hours it cannot exercise the RTH-only paths at all: `tests/analyze.engineFacts.test.ts`
asserts `developingSession` is **null** on it, and with `ibh`/`ibl` at 0 there is no Initial Balance,
no RTH-so-far extremes, and no real ONH/ONL. The operator wants a bundle from the DB instead and
correctly expects breakage. Measured blast radius: **21 test files read `chart-data/`, ~750 pinned
assertions** (`toBe`/`toEqual`/`toBeCloseTo`/`toHaveLength`), concentrated in
`tests/analyze.engineFacts.test.ts` (111), `tests/eval.runEval.test.ts` (109),
`lib/engine/sessionIntraday.test.ts` (61), `lib/engine/mgiPriority.test.ts` (51),
`tests/analyze.runAnalysis.test.ts` (46), `tests/update.runUpdate.test.ts` (45); 13 files read
`mgi_static_levels.json` specifically. Recommendation, carried into feat-110's description: **add, do not replace.** Those numbers carry
provenance — feat-100's distribution was validated against this exact bundle, the gem-comparison
tests encode findings measured on it — and re-baselining discards the evidence they were ever
checked. Add a full RTH bundle as a second named fixture with a loader (the convention already
exists: `chart-data/lvn-fixtures/` + `lib/engine/loadLvnFixtures.ts`) and migrate the RTH-only paths
onto it. NB `chart-data/comparison-examples/` cannot serve as that second set — those predate the
TPO, daily-value-area and HTF exports, so they are not complete bundles.

**Gotcha worth remembering:** `MgiLevel.code` is NOT unique across groups — `vRange` and `atr`
both export `high`/`low`. A `new Map(levels.map(l => [l.code, l]))` silently resolves `high` to
ATR High (extraction order puts `atr` last). Scope by `group` when keying by code. The `label` is
unique; the `code` is not.

**BATCH COMPLETE — feat-089 through feat-097 are all `done`.** Nothing from the
2026-08-07 bundle review batch is in flight. See "Carried forward" at the end of this
block for the follow-ups that outlive it.

**Latest change (branch `feat-100-ib-extension-distribution`): feat-100 — the IB→day-range
extension distribution is measured live, per bundle.** Closes review B7 and the seam
feat-093 deliberately left open. New `lib/engine/ibExtension.ts` rebuilds the export's own
RTH sessions from the 30-min HTF bars and measures, per session, `day_range / IB_range`
against the first hour's Initial Balance (`IB_BARS = IB_MINUTES / HTF_BAR_MINUTES = 2` —
the IB is DEFINED, not assumed, and the definition rides in the fact). On the review's own
bundle 1c15934a the live pass measures **p25 1.30 | median 1.55 | p75 2.09 | p90 2.59 |
max 3.85 over n=60**, against the review's hand-measured **1.25 / 1.52 / 2.08 / 2.58 /
3.58 (n=62)** — the same distribution, independently reproduced; sides 3/80/17% vs
4/79/16%; and today's session reads **IB 29241.25–29667.00 (425.75 pts), range 445 pts,
day/IB 1.05, below-p25**, which is the review's sentence to the decimal.
**Two payoffs, both live.** (1) Every quantile is projected from the live IB into a PRICE
(`upProjections` / `downProjections`, each with the quantile's multiple, the price and
whether the session already `reached` it), so a target rung sits on a distribution: on that
bundle the p75 upside projection is **29892.65**, against the review's illustrative 29910.
(2) `computeEngineFacts` passes the measured distribution into `classifyTpoDay`, and the
classifier — **unchanged, not one branch touched** — now reports
`distribution: {source: "measured", sampleSize: 60, p25: 1.3, p90: 2.59}` and a basis line
reading "day/IB 1.04x (below-p25, n=60, measured)". Every quantile is quoted with its n,
per B7's explicit instruction. Below **`MIN_IB_DISTRIBUTION_SESSIONS = 20`** complete
sessions the review's pinned n=62 sample stands and the fact says why (`fallbackReason` +
a warning) — 20 is argued from the p90 the trend threshold cuts at, not picked round
(`decisions-log.md`). The repo fixture holds 12 complete sessions and therefore exercises
the fallback path; the live bundle exercises the measured one.
**Session reconstruction was EXTRACTED, not duplicated:** `lib/engine/rthSessions.ts` now
owns `HTF_BAR_MINUTES` / `RTH_CLOSE_MINUTES` / `RTH_BARS_PER_SESSION` (15, the CME-halt
count) / `sessionOhlc` / `groupRthSessions`, and feat-095's `volatilityScale.ts` imports
and re-exports them — its 39 tests pass **unchanged**, byte-identical behaviour.
**The analyze user-prompt budget went DOWN for the first time in this gate's history:
106k → 100k, measured 93,630** on the fixture after rebasing onto feat-108 (99,311 on the
live bundle pre-rebase). The new fact costs 1,060 chars and its interpretive half went into
the cached `output-objective.md` prefix (feat-096/097's pattern); it is paid for many times
over by harvesting the second half of the duplication feat-090 flagged — feat-108 took the
first (compacting the composite borders' members), and `terrain.partitions` is literally
`terrain.levels.filter(v => v.hard)`, the SAME verdict objects re-serialized in full
(−10,528 chars) two keys below the list they came from, named by no prompt line, no
doctrine file and no output field. The two trims compose in one `modelTerrain()` projection;
`facts.terrain` is untouched for code consumers. The CACHED prefix ceiling moved the other
way, 47k → 48k (measured 47,248), which is the trade working as designed: the prefix is
paid once per model version, the user message every run.
`./init.sh` green: typecheck, lint --max-warnings 0, vitest 1333 passed / 1 skipped
(24 new), next build.

**Prior change (branch `feat-108-atr-projected-levels`): feat-108 — ATR-projected price
levels are anchorable structure.** Operator direction 2026-08-09: he uses ATR as a PRICE
LEVEL — "current price plus one ATR" is a target, "swing low minus one ATR" is where a
reversal is expected — but the engine exposed ATR only as a NORMALIZER (`atrPoints`,
`rotation.extentAtr`, `currentVsSwings.*Atr`, all feat-049). No ATR-derived price existed
anywhere, so `engineAnchorPrices()` could not host an entry, stop or target on one and the
model could only produce such a price as freehand arithmetic in prose — the same off-anchor
advisory feat-090 and feat-097 eliminated for the value and VWAP levels. New
`lib/engine/atrProjection.ts` projects the 30-min ATR from three references at
`ATR_PROJECTION_MULTIPLES = 0.5/1/1.5/2x`: **current price both directions** (target rungs)
and **outward from the last confirmed swing high and swing low** (reversal rungs; inward is
already terrain, and no rung is emitted for a side with no confirmed swing). Each rung
carries its reference and multiple as a quotable attribution label in feat-097's `vwapRungs`
style — `"current price (29945.75) +1× ATR"`. Reached the anchor set through a new 5th
optional argument on `engineAnchorPrices()`, the feat-090 seam; **`engineZoneBorders()` was
not touched and the zone stack is verified unchanged (10 zones / 11 borders before and
after)**, with the assertion paired against a check that the anchor set *did* grow, so the
test fails if a projection ever leaks into the partition. All 16 rungs are anchors at
distance exactly 0, pinned by the feat-090-style regression.

The sharp part is the **scale relationship**. One 30-min ATR measures 116.23 pts against a
295.12-pt session sigma = **0.394σ**, and feat-096's significant-move floor is 0.4σ =
118.05 pts — so 1× ATR does not sit merely *at* the floor, it lands **1.82 pts under it** on
this fixture, and 8 of the 16 rungs (every 0.5× and 1× rung) cannot host a target. The fact
**says so** rather than emitting them silently: a per-rung `clearsSignificantMove` boolean
plus a `significantMoveNote`, both resolved against the gate *as it resolves that run*. That
is deliberate — the gate degrades to the fixed 50-pt fallback when the sigma is unmeasured,
under which the same 0.5× rungs DO clear, so a static filter would have been wrong in one of
the two regimes. Both are pinned by tests. Sub-floor rungs stay in the set because they are
legitimate entry and stop structure (0.5× ATR is still 2.3× the fixed 25-pt operational
stop); they are just never legal as a target. `significantMoveSigma` is now an optional
`EngineFactsInput` field so the engine tests the flag against the operator's configured
value, not the default. The existing ATR normalizer fields and the eval-prompt ATR line are
unchanged — this feature adds the price-level role alongside them.

**Prompt budget: the ceiling did NOT move, and the payload got smaller.** Naive wiring
measured 110_459 (+5_396 over the 105_063 baseline); the shipped version measures
**102_273** against the unchanged 106k ceiling — 2_790 chars *below* baseline. Paid for by
honouring the standing "trim before you bump" note with the duplication feat-090 identified:
all 10 `terrain.borders[].members` entries were verified byte-identical to verdicts
`terrain.levels` already carries, so members now keep price, kind, `hard`/`faint`/`shallow`,
`source` and the `reason` string the AAA-demotion rule quotes and drop the re-serialized
`level`/`local`/`magnet`/`detectorNode` (all reachable under the same label two lines up);
rungs render as compact `PRICE · label · travel` strings, the feat-090 `mgiPriority.tier1`
precedent. Interpretive prose went into the cached `output-objective.md` prefix
(feat-096/097's split), which measures 46_757 against its 47k ceiling — also not raised.
**Prior change (branch `feat-090-anchorable-value-levels`): feat-090 — prior-day and TPO
value levels are anchorable structure.** Closes review D5/B4 and the operator's open
follow-up from the 2026-08-03 briefing review. `engineAnchorPrices()` was built from
terrain only — MGI levels plus the two VOLUME profiles — so nothing derived from TPO, the
value-area history or the multi-day composite could host an entry: on bundle 1c15934a the
session's own point of control sat **1 pt from current price and could not be traded**,
and the nearest anchor to any of the seven measured value prices was 2.98 pts away. Two
routes, deliberately different. (1) The prior COMPLETED session's value area enters
`computeMgiPriority` through a new `priorDayValue` option as the doctrine's **Daily MGI
Priority ranks 4–5 — RVAH/RVAL (4) and RPOC (5), Tier 2 alongside PDH/PDL** — so it tiers,
sorts in `dailyPrioritySort`, and reaches terrain (`selectAnchorLevels` takes the whole
`daily` group), arriving in the anchor set as an ordinary terrain level with a verdict.
This is only safe because of feat-089: promoting a contaminated `priorDay` would have
anchored entries on the value area being built around current price. (2) `tpo.poc`,
`tpo.valueArea` and `multiDayTpo.composite.poc` — TIME-based levels terrain can never mint
— are passed straight into `engineAnchorPrices()` through a new 4th `value` argument, the
same seam feat-074's LVN nodes and feat-097's VWAP rungs use. **All seven measured prices
are now anchors at distance exactly 0**, pinned by a regression test that reproduces the
review's own D5 table. `mgiPriority`'s stale docstring ("ranks 4 and 5 … are not in this
export" — untrue since feat-048) is corrected. `engineZoneBorders()` was left alone per
feat-097's boundary, and the zone stack is verified unchanged (10 zones / 11 borders before
and after): the three new levels earn level verdicts, not zone splits. The developing
session's levels are deliberately **not** anchorable — an unfinished value area is a moving
target, and today is already anchorable time-based via `tpo.poc` (reasoned in
`decisions-log.md`). Structural note: `resolveCurrentPrice()` is now exported from
`mgiPriority.ts` and `computeEngineFacts` runs the feat-089 partition ABOVE the MGI
classification, because the classification now consumes a fact parsed from an export that
is itself priced against current price. Analyze-prompt budget 104k → 106k (**measured
105,063**), taken *after* the trim feat-089's stop demands: `mgiPriority.tier1` and
`dailyPrioritySort` were re-serializing level objects `mgiPriority.levels` already carries
two lines above them and are now compact `"LABEL PRICE #rank"` strings (−3,738, orderings
intact), and the new anchoring doctrine went into the cached `output-objective.md` prefix
rather than the per-run message. Net +2,628 for seven newly tradable levels.
`./init.sh` green: typecheck, lint --max-warnings 0, vitest 1296 passed / 1 skipped
(9 new), next build.

**Carried forward (open, out of scope for this batch):**
- **feat-100 is now `done`** — the pinned IB-extension quantiles are live. Remaining
  follow-ups it did not take: the `ibExtension` fact is analyze-only in its guide bullet
  (the update prompt receives the DATA through the shared `factsPayload` but gets no rule
  line), and nothing yet feeds the measured distribution into `validateBriefing` — a target
  rung beyond the p90 projection is narrated, not gated.
- **`supabase/migrations/20260809140000_volatility_scaled_gates.sql` (feat-096) is
  COMMITTED BUT NOT APPLIED** — no Supabase credentials in these sessions. The config
  ladder degrades by design until an operator applies it; recorded as PENDING in
  `.claude/skills/gekko-db/SKILL.md`.
- **Two coexisting scale measures:** `htfStructure.atrPoints` and feat-095's session sigma.
  Neither is wrong; nothing has unified them, and gates now key off the sigma.
- **feat-092's TPO period→clock map is inert on live bundles** until the Sierra ACSIL study
  ships the two metadata lines. Everything downstream (feat-093 included) is built to work
  with every clock null.
- **The `chart-data` fixture has internally inconsistent dates across files.** Tests work
  around it; a bundle refresh would be the real fix.

**Prior change (branch `feat-096-volatility-scaled-gates`): feat-096 — the fixed-point
gates are volatility-scaled.** Closes review D3/C1. feat-086 made `significant_move_pts`
the binding gate for entry qualification and set it to 50 points; measured over the 61 RTH
sessions in bundle 1c15934a's own HTF export that is **0.18σ against a 283-pt median
Parkinson session sigma, 0.45 of ONE 30-min bar (median range 110 pts) and 11% of a median
day (464 pts)** — every level on the map cleared it, so `validateBriefing`'s reversal-room
warning never fired. New `lib/engine/scaledGates.ts` re-expresses all three point gates as
MULTIPLES of feat-095's measured session sigma and resolves them to points per run
(`resolveGates` → `pointsForSigma`): the significant-move floor **0.4σ** (~113 pts at 283,
118.05 on the repo fixture's 295.12-pt sigma), entry standoff **0.005σ** (1.42 pts) and
entry chase **0.02σ** (5.66 pts). 0.4σ is argued against the measured distribution, not
picked round: one median 30-min bar range, ~1.1 average operator rotations (~102 pts), 24%
of a median day, and above feat-095's own 0.25σ noise band — the band the retired 50-pt
floor sat inside (see `decisions-log.md`). **The reversal-room warning now fires and there
is a test proving it**: the fixture's doctrine-sound 3:1 objective (75 pts entry→T2)
cleared the old 50-pt floor with room to spare and is below the 113.2-pt floor at the
measured sigma; a companion test pins that the same briefing stays silent at 0.18σ, so the
D3 no-op is a visible regression if the default is ever walked back. Degradation is
explicit: an unmeasured sigma (under 3 complete RTH sessions) falls back to the
pre-feat-096 FIXED points (50 / 1 / 5) and every message says so — never a zero-width gate,
never a divide by zero. Both prompts inject each gate in BOTH units (`describeGate`:
resolved points first, multiple as the qualifier) so the model reasons in the units it
quotes. DB: `significant_move_pts` (int, CHECK 10–500) → **`significant_move_sigma`**
(numeric, CHECK 0.05–2.0, default 0.4) in
`supabase/migrations/20260809140000_volatility_scaled_gates.sql`; the conversion takes an
untouched 50 to the new 0.4 default (a proportional 0.18σ would have carried the no-op
across) and any operator-tuned value to `points / 283` clamped into range, then drops the
old column. **The migration is COMMITTED BUT NOT APPLIED — this session had no Supabase
credentials.** Until an operator applies it the existing `fetchConfigRow` ladder degrades
by design (pads 0.4, flags `significantMoveColumnMissing`, `/settings` says which migration
to apply); recorded as PENDING in `.claude/skills/gekko-db/SKILL.md`. `/settings` relabels
the field "Significant Move (× session σ)" with help text leading "NOT points — a
MULTIPLIER". Analyze prompt budget **NOT raised**: stating both units cost +135 chars, so
the interpretive half moved into the cached `output-objective.md` prefix (feat-097's
pattern), landing **+84 net** — measured 100_403 against feat-093's 101k ceiling, which
feat-096 did not raise. `./init.sh` green: typecheck,
lint --max-warnings 0, vitest 1244 passed / 1 skipped (21 new), next build.

**Prior change (feat-093, branch `feat-093-tpo-day-open-type`):** the canonical Market
Profile session reads are code-owned, closing review item C2. New `lib/engine/tpoDayType.ts`
classifies a session from the TPO letter **sequence** and hangs off `TpoFacts.classification`
(so `facts.tpo` → `factsPayload` `tpo`, no new payload key): `dayType` — normal /
normal-variation / trend / neutral / neutral-extreme / double-distribution — `openType` —
open-drive / open-test-drive / open-rejection-reverse / open-auction — the IB→day-range
`extension` (IB high/low, day range, `ratio` = day/IB and the quantile `band`), range
extension **by period** (filtered to the periods that actually pushed the range out), and
`highPeriod` / `lowPeriod`. The thresholds are **pinned-empirical, not textbook**:
`PINNED_IB_EXTENSION_DISTRIBUTION` holds review section B7's measured sample (n=62, p25 1.25 /
median 1.52 / p75 2.08 / p90 2.58) and the ladder is cut at those quantiles — below p25 the IB
essentially held (`normal`), p25–p90 one-sided is `normal-variation`, ≥ p90 one-sided is
`trend`, both sides is `neutral` (`neutral-extreme` when the last period sits on a session
extreme). `double-distribution` is checked first, off feat-046's interior `singlePrintZones`
with gap/body guards; when the extension *also* clears the trend decile the basis line says so
(the chart-data fixture is exactly that: two bodies split by E's 12-bin vacuum, day/IB 3.25x,
high printed by B at 09:00, low by F at 11:00, open read as an auction). **feat-100 seam:**
`classifyTpoDay()` takes an optional `IbExtensionDistribution` defaulting to the pinned one and
the fact reports `distribution.source` / `sampleSize`, so a live-computed distribution drops in
without a rewrite — feat-100 stays `not-started`. Nothing branches on a clock time: `periodClock`
only decorates the output, so the classifier works unchanged on live bundles whose exports
predate feat-092's anchor lines (pinned by a test that strips those lines and asserts an
identical classification with every clock null). Analyze prompt gained
`TPO_CLASSIFICATION_RULE`; the screenshot-scoping line now excludes the code-owned day/open
classification; `docs/engine-ownership.md` `tpo_data` + `tpo_png` rows updated. Analyze-prompt
budget raised 98k → 101k (measured 100,319) with the rationale inline in the feat-054 gate —
taken *with* the trim feat-097's stop note asks for, not instead of it: the fact was cut from
+3,056 to +2,588 chars first (extension events only, stripped of the running high/low they
imply; `dayRange` dropped as `tpo.sessionRange` already carries it; the reference distribution
cut to the two quantiles the ladder cuts at), and the bullet rewritten tight.
`./init.sh` green: typecheck 0, lint 0 warnings, vitest 1255 passed / 1 skipped, build OK.
**Latest change (branch `feat-089-split-developing-sessions`):** **feat-089 — split
developing vs completed sessions in the daily value-area history — is DONE.** Review
item D1 is closed. `daily-value-areas.csv` ships the LIVE in-progress RTH session as
row 1 (contradicting its own exporter contract in `docs/data-todos.md` §3), so
`valueMigration.priorDay` resolved to TODAY and `currentPriceVsPriorValue` answered
`{position:'inside', pointsOutside:0}` by construction on every bundle — price compared
against the value area being built around it, which killed the doctrine's
accepted-outside-prior-value read the day feat-048 landed. The fix PARTITIONS rather
than discards: new `partitionDailyValueAreas()` in `lib/engine/parseDailyValueAreas.ts`
splits the parse BY DATE (never by position) into the live row and the completed
remainder; `computeValueMigration` and `computeDailyRanges` now consume only the
completed half, and the live row becomes a new nullable `developingSession` fact
(`lib/engine/developingSession.ts`) — the only VOLUME-based view of the in-progress
session anywhere in the bundle, and the companion to `tpo`'s TIME-based view of the
same day. Verified with the review's own numbers: on the 08-06 bundle the
un-partitioned read says `inside / 0 pts`, the partitioned one resolves priorDay to
08-05 (VAL 29693) and puts price 150.5 pts BELOW prior-day value — the opposite call.
The developing fact carries a maturity qualifier so an unfinished value area is never
read as a finished one: elapsed RTH minutes (clamped to the 390-minute cash session
from the freshest exec-bar chart clock), volume so far against the time-of-day
expectation (reusing feat-094's `sessionSoFar.expectedFraction` × the completed-session
volume median, so there is exactly one time-of-day baseline in the engine), and range
used so far against the completed-session median range — plus an `early` /
`developing` / `mature` / `unknown` read and a prose `basis`. Reconciled feat-094's
competing notion of "which row is today": `computeRelativeVolume` no longer date-matches
internally, it takes `completedSessions` + `developingSession` from the caller's single
partition (the old `dailySessions` input was RENAMED so an un-partitioned list cannot
compile). `lib/eval/evalBundle.ts` partitions on the same terms (its live session date
comes from the exec bars, since eval bundles carry no TPO). The engine resolves ONE
live session date — `tpo.sessionDate`, else the exec bars' trading day — and warns
when the split fires AND when it does not, so the partition is always visible in the
trace. The export may now carry an optional `IsComplete` column: the parser reads it
and warns when it disagrees with the dates, but the engine never partitions on it. The
`chart-data` fixture gained the live in-progress row the real export ships, so the
prompt-data-sync gate finally exercises the partition. Analyze-prompt budget raised
101k → 104k (measured 102,435 after rebasing onto feat-091/093/094/095/096/097) — but trimmed
first, per feat-097's "the next fact to land here should trim something before it bumps
this number again": three duplicated fields removed from the fact, the guide bullet cut
~25%, both split warnings shortened. `./init.sh` green.

**Next up:** feat-090 (promote priorDay / TPO levels to anchorable structure) — it can
now consume `valueMigration.priorDay.{poc,vah,val}` knowing it is the true PRIOR
COMPLETED session, and `developingSession.{poc,vah,val}` for the live one, without
re-deriving either.

**Prior change (feat-097, branch `feat-097-session-vwap-bands`):** the session VWAPs now
carry a volume-weighted sigma envelope, closing review item A4 without touching the ACSIL
export. `execution_bars.csv` already ships per-bar volume and `sessionIntraday` already
accumulates both anchored VWAPs, so sigma is one pass over the same bars:
`sqrt(Σ v·(typical − VWAP)² / Σ v)` (population, weights = bar volume, typical = (H+L+C)/3).
`lib/engine/sessionIntraday.ts` gained the exported `VWAP_BAND_MULTIPLES` ([1, 2]), the
`SessionVwapBand` / `SessionVwapSigmaBands` / `SessionVwapRung` types and
`sessionVwapRungs()`. Every `SessionVwapAnchor` now carries `sigmaBands { sigma, bands
(−2σ/−1σ/+1σ/+2σ, price-ascending), z }`, and `SessionIntradayFacts` carries `vwapRungs` —
both anchors' centerlines and bands flattened price-descending, each with the attribution
label the briefing must quote ("Globex session VWAP −1σ"). Band prices derive from the
UNROUNDED VWAP and sigma and are rounded once, so no band inherits two roundings; that is
what reproduces the review's reference geometry (bundle `1c15934a`: VWAP 29522.89, sigma
83.72, −2σ 29355.45 / −1σ 29439.17 / +1σ 29606.62 / +2σ 29690.34, price 29542.50 at
z = +0.23) to the cent. **The partial-coverage degradation is load-bearing and tested:**
`vwap` is already null when the export starts mid-session, so the bands go with it and
`vwapRungs` is `[]` — no sigma envelope is ever drawn around a session average that was
never a session average. As rung structure the prices flow through
`engineAnchorPrices(terrain, lvn, sessionIntraday)` (new optional third argument) into both
the analyze and update validation paths, so an entry/stop/target anchored on a band is
engine structure rather than an off-anchor advisory; the anchor enumeration in
`knowledge/system/output-objective.md`, both prompt builders and the `docs/engine-ownership.md`
registry row were updated to match. feat-051 stays `not-started` and is now explicitly
narrowed to the 24h/weekly/monthly bands, which genuinely need the export (those VWAPs
arrive as bare scalars in `mgi_static_levels.json` with no underlying series). The analyze
user-prompt budget was NOT raised: feat-095's reconciliation note declares 98k a stop
rather than a running total, so the guide bullet was written tight and its interpretive
half moved into the cached doctrine prefix (`knowledge/system/output-objective.md`) —
measured 97_731, 269 chars of headroom. `./init.sh` green: typecheck 0, lint 0 warnings,
vitest 1234 passed / 1 skipped, build OK.

**Next up (from the feat-097 session):** feat-089 has since landed (see the top of this
file); feat-090 is the natural follow-on.
feat-051 remains open and is now narrowed to the 24h/weekly/monthly VWAP bands only; when
it lands it should reuse `VWAP_BAND_MULTIPLES` from `lib/engine/sessionIntraday.ts` so both
families of bands sit at the same multiples.

**Prior change (branch `feat-095-volatility-estimators`): feat-095 — range-based
volatility estimators and sigma-normalized distances.** Closes review §B6: `atrPoints`
was the engine's only scale measure. New `lib/engine/volatilityScale.ts` computes
Parkinson (high/low) and Garman-Klass (OHLC) variance from the existing 30-min HTF bars —
no new export — at two granularities: per 30-min bar, and per RTH session using each
session's own aggregated OHLC. The headline `volatilityScale.sessionSigmaPts` is the
Parkinson session sigma in points: **295.12 on the repo's fixture bundle against the
review's measured 283-pt median**, with a 446-pt median session range (review: 464).
Two measurement decisions are worth knowing (both in `decisions-log.md`): the session
sigma is measured AT session granularity rather than √t-scaled up from the bar sigma —
√t-scaling read 348 pts, ~25% high, because intraday ranges rotate rather than compound;
and `RTH_BARS_PER_SESSION` is 15 (08:30–16:00 CT), not the 17 implied by
`overnightSession`'s open→Globex-reopen window, because the live export prints no bars
during the 16:00–17:00 CME maintenance halt. `distancesToStructure` reports the nearest
Tier-1 level and zone border on each side in points AND sigma, banded
noise/minor/meaningful/large — so "29 pts away" also reads as "0.10σ, inside the noise"
without points ever being replaced. Degrades to null + a warning under 3 complete RTH
sessions. Surfaced through `EngineFacts.volatilityScale` → `factsPayload` → the analyze
and update prompts as a raw fact, and into the eval prompt as a context line. Exported
`sigmaOfPoints` / `pointsForSigma` are the resolvers **feat-096** consumes to re-express
`significant_move_pts`, `MIN_ENTRY_STANDOFF_PTS` and `MAX_ENTRY_CHASE_PTS` as sigma
multiples. No DB change (feat-096 owns the config migration). `./init.sh` green:
typecheck, lint --max-warnings 0, vitest 1218 passed / 1 skipped, next build. Analyze user-prompt
budget raised to 97k chars — feat-094 and feat-095 each measured +2k against the 91k
base in parallel and both bumped to 93k; together they measure 95_076, reconciled in
`tests/prompt-data-sync.test.ts` with a note that 97k is a stop, not a running total.

**Prior change (feat-091, branch `feat-091-tpo-excess-tails`):** TPO excess is measured
instead of discarded, closing review item D2. `lib/engine/tpoFacts.ts` gained
`TpoFacts.excess` (`TpoExcess` / `TpoTail`, threshold `EXCESS_MIN_BINS = 2`):
`detectExcess()` walks the price-descending ladder inward from each end and reports the
contiguous `count==1` run touching the LAST row as `buyingTail` (session low) and the run
touching the FIRST row as `sellingTail` (session high) — each with `bins`, `points`
(`bins * step`), `top`/`bottom`/`extreme`, the period `letters` that built it in period
order, and the `HH:MM` `clock` of the earliest of those letters (reusing feat-092's
`tpoPeriodClock`; null on anchorless exports) — plus `singlePrintBins` / `totalBins` /
`singlePrintFraction` for the session. `detectSinglePrintZones()` is **untouched**: its
interior-only semantics are unchanged, but the extreme runs it drops by design now land
in `excess` rather than vanishing. Degrades to null tails on a run below `EXCESS_MIN_BINS`,
on a run broken by an untraded hole (same one-grid-step contiguity rule as the zone
detector), and on a ladder that is single-printed end to end (no body → no excess relative
to value). Surfaced through `facts.tpo` → `factsPayload` `tpo` (no new payload key, so the
prompt-data-sync registry is satisfied by an updated `tpo_data` row in
`docs/engine-ownership.md`), with an analyze-prompt bullet teaching a tail as a FINISHED
(rejected) auction whose far edge is defended until repaired — the mirror image of
`poorHigh`/`poorLow` as unfinished auctions — and `singlePrintFraction` as the thin-profile
/ one-timeframe-day signal. The review's two-run reference case is pinned as a test (446-bin
1-pt ladder: 208-bin/208-pt `A` buying tail off 29241, 19-bin/19-pt `D` selling tail at
29686, fraction 0.51), alongside the chart-data fixture's 4-bin/8-pt `F` tail at 29862
(clock 11:00). Day-type/open-type classification (feat-093) is the next consumer and is
deliberately NOT in this change. Analyze-prompt budget raised 93k → 95k (measured 94,017)
with the rationale recorded inline in the feat-054 gate. `./init.sh` green: typecheck 0,
lint 0 warnings, vitest 1201 passed / 1 skipped, build OK.

**Prior change (branch `feat-094-rvol-time-of-day`):** **feat-094 — relative volume
(RVOL) from time-of-day seasonality — is DONE.** New engine module
`lib/engine/relativeVolume.ts` finally reads the `htf_bars.csv` volume column that
D4 found parsed, typed and consumed by nobody: a per-intraday-slot median baseline
built from the export's own prior sessions (46 distinct 30-min slots on the live
bundle), today's completed slots measured against it, cumulative RTH volume against
the time-of-day expectation, and the day-level companion from
`daily-value-areas.csv`'s `SessionVolume` (the other field D4 flagged as referenced
nowhere). Everything reduces to one `participation` scalar — `rvol`, a
dead/light/normal/elevated/heavy `band`, and a `gate` — which is the confidence
modifier the analyze/update and eval prompts now apply to delta divergence,
absorption candidates and climax prints: the same divergence is noise at 0.7x and
information at 1.4x. The in-progress final bar is never measured (a partial 30-min
volume against a full-slot median reads light by construction), and a slot with
under `RVOL_MIN_SLOT_SESSIONS` history degrades to a null rvol rather than a ratio
built on three sessions. Verified on the real fixture: 12:30 slot 19,668 vs a
15,749 median over 12 sessions = 1.25x, session-so-far 1.43x at 75% of the day
elapsed. Analyze-prompt budget raised 91k → 93k (measured 92,127) with the
rationale recorded inline. `./init.sh` green.
**Earlier change (feat-092, branch `feat-092-tpo-period-clock-map`):** the TPO export
now carries a period→clock anchor, closing review item A2. `tpo.data.md`'s `## Metadata`
section gained two additive lines — `- **First Period Letter**: A` and
`- **First Period Start**: 2026-06-16 08:30:00` — and `lib/engine/parseTpo.ts` captures
them as `meta.firstPeriod`. New `lib/engine/tpoPeriodClock.ts` resolves any letter from
that anchor plus `TPO Period Minutes`: `TPO_PERIOD_LETTERS` (A–Z then a–z, 52 periods),
`resolveTpoPeriodTime()` → `{letter, index, start, end, clock}`, `buildTpoPeriodClock()`
for a whole ladder. Times are naive local wall-clock (matching the study's own output),
computed in UTC so DST can never shift a period boundary. `tpoFacts` surfaces
`tpo.firstPeriod` and `tpo.periodClock` (letter → `HH:MM`; the fixture resolves A..M to
08:30..14:30) and the analyze prompt tells the model to time letter-sequenced reads from
it instead of quoting bare letters. **Backward compatibility is the load-bearing part:**
either anchor line missing → `firstPeriod: null`, `periodClock: null`, everything else
parses exactly as before, so bundles already in `raw_bundles` (and any Sierra machine
running the pre-feat-092 study) keep working; only a *present but unreadable* value is a
hard reject. Exporter contract updated in `docs/data-todos.md` §1 (sample block, a new
anchor-contract subsection, and the ACSIL study prompt) plus the registry row in
`docs/engine-ownership.md`. This unblocks the period-sequenced reads that were stuck
behind A2 — open type, which period made the high/low, range extension by period, excess
timing — of which feat-091 (TPO tails) and C2/day-type are the next consumers.
`./init.sh` green: typecheck 0, lint 0 warnings, vitest 1164 passed / 1 skipped, build OK.

**Earlier change (ad-hoc, branch `claude/data-bundle-adversarial-review-ef0a5b`):**
adversarial review of the live data bundle → `docs/data-bundle-review-2026-08-07.md`,
plus 19 new backlog features (**feat-089..feat-107**). Method: pulled the newest
`raw_bundles` row (`1c15934a`, 2026-08-06 18:33 UTC, price 29542.50, mid-RTH),
downloaded all nine storage artifacts, and ran `computeEngineFacts()` over them
verbatim via `tsx` — measured, not asserted. Four defects, all higher-value than
any new export: (D1) `daily-value-areas.csv` ships the IN-PROGRESS session as row 1,
so `valueMigration.priorDay` is *today* and `currentPriceVsPriorValue` returns
`inside / 0 pts outside` by construction on every bundle — the
accepted-outside-prior-value read has been dead since feat-048, and `dailyRanges`
gives a partial range a third of its contraction verdict (`RANGE_RECENT_SESSIONS`
= 3). **Revised per operator direction:** feat-089 now PARTITIONS rather than
drops — that row is the only volume-based view of the live session in the bundle
(developing volume POC 29520 / VA 29476.75–29620 vs the time-based TPO POC 29541
/ VA 29478–29638, a ~20-pt disagreement), so it becomes a nullable
`developingSession` fact with a maturity qualifier and a range-used-so-far read,
while valueMigration/dailyRanges consume only the completed remainder. That in
turn narrows feat-098 (session volume profile export) to the price-by-volume
ladder, since the summary numbers now arrive free. (D2) TPO `Letters` produced *nothing* on a
day where 227/446 bins (51%) are single prints — a 208-pt A-period buying tail and a
19-pt D-period tail both discarded by `detectSinglePrintZones`, whose deferred-to
"poor/tapered-extreme read" does not exist (feat-091). (D3) `significant_move_pts =
50` is 0.18σ / 0.45 of one 30-min bar at current vol, so the feat-086 gate rejects
nothing (feat-095/096). (D4) `htf_bars.csv` volume + delta (87d × 2916 bars) are
parsed, typed, documented and read by no consumer (feat-094/102). Also confirmed and
generalized the operator's open 2026-08-03 item: TPO POC (1 pt from price),
prior-day POC/VAH/VAL and the multi-day composite POC are all non-anchorable — 40
anchor prices, nearest 2.98 pts away (feat-090). Data adds: session volume profile
(feat-098), TPO period→clock map (feat-092), event calendar (feat-105), timezone
metadata (feat-107); feat-051's *session* VWAP σ bands need no ACSIL work at all and
are split out as feat-097. Math adds: RVOL (feat-094), Parkinson/GK vol (feat-095),
IB→day-range distribution (feat-100), Kyle's λ (feat-101), HTF order flow
(feat-102), empirical per-level reversal stats (feat-103). **Reconciled with the
parallel `claude/delta-intensity-redundancy-xe1bbj` review (PR #131):** its feat-088
already covers the volume-clock finding both reviews reached independently, so no
duplicate was filed; and its base-rate-controlled negative results — λ as a timing
filter (60% vs 58%), day-level HTF delta divergence as a fade — are recorded on
feat-101/102 as constraints rather than argued around. Two cautions preserved in the
feature text: λ needs a confidence gate (per-window R² 0.02–0.44), and the
level-reversal stats rest on n = 20–34 per class — the method is feasible, the edge
is not established. `./init.sh` green (docs + `feature_list.json` only, no code
touched).

**Earlier change (ad-hoc, branch `claude/delta-intensity-redundancy-xe1bbj`):**
bundle-data math review — no code changes, two new backlog features. Tested
Codex's claim that DeltaIntensity is redundant given the raw BidVolume/
AskVolume columns, on two live bundles (2026-08-06). It is NOT reproducible:
per-bar delta correlates only 0.36; the best bid/ask-derived proxy (EMA-7 of
delta with in-sample-optimal thresholds) caps at ~63% exact-bucket accuracy
(60% out-of-sample; ±1 buckets unresolvable), so the study stays in the
bundle. The same review prototyped candidate math on existing data and added
the two that survived base-rate controls to `feature_list.json`:
`feat-087` effort-vs-result absorption prints (|delta| ≥ p75 + body ≤ 25% of
range after a >10-pt move → 64%/71% reversal vs 57% base, ~2x mean move
against trend, replicated on both bundles) and `feat-088` tape pace telemetry
(constant-volume bars ⇒ time-per-bar = participation; 23x dynamic range,
currently discarded; context-only, no standalone directional edge). Tested
and rejected: VPIN (no range-expansion correlation), Kyle's lambda as a
timing filter (60% vs 58%), day-level HTF delta divergence as a fade
(slight continuation). HTF bid/ask delta noted as parsed-but-unused
(`parseHtfBars` computes it; nothing downstream reads it).

**Prior change (ad-hoc):** lint hardening. `npm run lint` now runs with
`--max-warnings 0` (warnings fail verification instead of accumulating);
typescript-eslint's type-aware `recommendedTypeChecked` preset is on for all
TS files (projectService), plus `switch-exhaustiveness-check`;
@vitest/eslint-plugin bans focused/disabled tests. `require-await` is off
(async-interface-conforming fakes/deps are the house idiom). Two scoped
waivers, both documented in eslint.config.mjs: the untyped-Supabase boundary
(`lib/*/deps.ts`, fetchConfig, server.ts) skips the unsafe-`any` family +
only-throw-error until DB types are generated, and test files skip
unsafe-`any` + unbound-method (mocks). ~230 findings triaged to zero: real
fixes include a floating realtime auth/subscribe chain and 7 async handlers
in void onClick/onSubmit positions (alerts-center, settings-form,
trigger-run-button), exhaustive switches (terrainZones positionLabel 'zone',
statusLabel undefined), deps interfaces switched to property-style members
(unbound-method), `request.json()` results typed unknown at both run routes,
redundant `unknown | null` unions collapsed, and 24 auto-fixed unnecessary
assertions. Follow-up candidate: generate Supabase DB types and drop the
boundary waiver.

**Prior change (ad-hoc):** `./init.sh` warning cleanup. The 14
@typescript-eslint/no-unused-vars lint warnings (all `_`-prefixed bindings,
mostly rest-sibling omit-destructures) are gone: eslint.config.mjs now sets
the standard underscore ignore patterns + ignoreRestSiblings. `npm audit fix`
(non-breaking) trimmed vulnerabilities 27 → 24 (lockfile-only churn); the
remaining 24 all require breaking majors (next@16 pulls sharp/postcss/cookie/
otel; socket.io chain pins vulnerable ws) — left for a deliberate upgrade
feature, so npm install still prints its vulnerability count.

**Prior change (ad-hoc, branch `claude/model-effort-max-setting-dcleix`):**
'max' added as a selectable reasoning-effort level on /settings. OpenRouter's
API documents `reasoning.effort = "max"` (~95% of max_tokens, same allocation
as 'xhigh') but @openrouter/ai-sdk-provider (≤3.0.0) omits it from its effort
union, so `openrouterModelSettings` casts it through at that one boundary.
Touched: `lib/llm/reasoning.ts` (REASONING_EFFORTS + 'max'),
`lib/llm/generateStructured.ts` (boundary cast), settings-form label,
migration `20260804000000_model_effort_max.sql` (drop/recreate the three
config effort CHECK constraints — applied live via the Supabase MCP, verified
in pg_constraint), gekko-db skill snapshot, and tests (schema accepts 'max',
unknown-effort rejection example now 'ultra', migration guard, settings pass-
through). `./init.sh` green.

**Active Feature:** none — latest merged: **feat-086 entry-first
nearest-reversal-level objective contract** (operator review of the 2026-08-03
morning briefing: the long shipped 398 pts below market at the deepest AAA
trench while PW High sat 157 pts away, because the T2-first R/R gate
(entry→T2 ≥ rr_min×25 on mapped structure) worked backwards from targets to
select entries — with price extended above the whole mapped acceptance, the
gate exiled every objective to deep structure. New contract: each slot answers
"walking outward from current price, what is the CLOSEST level below (long) /
above (short) with a decent probability of reversal AND ≥ significant_move_pts
of room for the reversal to travel"; entries are picked nearest-first on their
own merit, targets are demoted to advisory runner guides (T2 = nearest
realistic mapped conclusion, no minimum distance), and rr is engine-computed
but informational (rr_min is display-only). New config column
significant_move_pts (int default 50, CHECK 10–500, /settings-editable,
injected into analyze/update user messages; migration applied live via the
claude.ai Supabase MCP). validateBriefing now warns on reversal room <
significant_move_pts instead of R/R-gate failure; geometry defects and the
no-widen rule still warn/throw as before. Law of Asymmetric Initiative, Magnet
Prohibition, entry standoff/chase gates, and stop doctrine unchanged. Also
noted during the investigation (NOT yet addressed): (a) on big migration days
the terrain map lags the day's newly built value — today's TPO POC 28790 was
only encoded as a prohibited magnet, so no acceptance anchor existed near
price; (b) the briefing model leaked deliberation text into a target
description ("287? No. 28698.25 …"). Both are candidate follow-up features.
Prior state: the 2026-08-02 Codex adversarial EVAL-prompt review
(LangSmith run 019fc3c5-c241, extracted to langsmith-prompt-review/, 3 CRITICAL
/ 4 HIGH / 3 MEDIUM) is FULLY CLOSED as feat-081..085, all merged to main:
feat-081 (eval-only prefix — briefing-only doctrine split out of the eval's
cached prefix into constraints-objective.md + campaign-strategy.md; eval
prefix 32k → 25k) → feat-082 (status-discriminated EvalResult — per-status
field matrix via superRefine, WAIT=armed vs NOT_VALID=dead semantics,
revalidationAction column live in prod) → feat-083 (coherent coercion —
gate demotions rebuild a contract-coherent WAIT, fail-closed re-parse,
near-gate NO_ENTRY_NEAR rejected for retry via EvalContractViolationError) →
feat-084 (prior-baseline context — the evaluated level's creation-time thesis
from its source briefing renders in the eval prompt) → feat-085 (level-aware
absorbed-flush exception — stall-confirmed stack at the level or bar contact
required; far counter-extremes no longer bypass the demotion). Follow-up
2026-08-02 (operator review): LEVEL_CONTACT_TOLERANCE_PTS bumped 5 → 10 —
measured 750-volume exec bars (chart-data rolling sample) span ~14.75 pts
median / ~17.7 mean, so a flush reversing one bar early stalls ~half a bar
short of the border and 5 pts wrongly demoted that front-run; 10 stays well
inside the 20-pt proximity gate and 25-pt rotation scale. Two boundary tests
pin it (8 pts passes, 10.25 rejects). Remaining
`not-started`: feat-051..053 (data exports).
Latest: **Eval-only system prefix + absorption dedup + per-run bar volume**
(feat-081 — Codex eval findings #1/#9/#10: the eval's cached prefix shipped
briefing-only mandates it cannot satisfy (R/R-to-T2 gate, target
classification, primary/secondary award, Vanguard consult, patternScan),
hardcoded "750-volume bars" against the per-run metadata contract, and
duplicated absorption stall semantics into the user message; constraints.md
and chart-reading.md each split briefing-only content into new
constraints-objective.md + campaign-strategy.md files shipped to
analyze/update only, output-eval.md states the geometry-inheritance contract,
the eval user message states config.execution_bar_volume per run, and the
absorption-candidate section became facts+pointer; eval prefix 32k → 25,069
chars; guarded by a feat-081 canary describe in prompt-data-sync.test.ts), on
top of the closed 2026-08-01 briefing-prompt review (feat-076..080).
Earlier: **Per-run preamble dedup** (feat-080 — Codex finding #5: the user
message restated 4–31 lines of system doctrine and the copies drifted twice;
every rule now has ONE home — the Active Pattern Scan contract moved into
patterns.md (shared by both briefing prefixes), detector-LVN-node anchor
legality moved into output-objective.md, and the analyze/update user bullets
(fakeoutTails doctrine, pattern scan, overview register, rr restatement,
entry/stop/ladder, objective-slot abstention) trimmed to live values +
contract pointers; user prompt 91.4k → 88.4k chars per run, ceiling lowered
back to 91k; analyze prefix ceiling consciously 41k → 43k (cached once); four
prefix-owned canary phrases now guard against restatements creeping back), on
top of **Execution bar size as config** (feat-079 — Codex finding #4: the
doctrine's "500 volume" line was stale prose vs the exporter's 750-volume bars;
`config.execution_bar_volume` (int, default 750, CHECK 50..50000, migration
applied to the live DB and the gekko-db skill snapshot updated) is now injected
into the analyze + update prompts ("The execution chart trades N-VOLUME bars"),
the cached doctrine prefix is number-free (chart-reading.md heading
de-numbered), fetchConfigRow grew a pre-bar-volume degradation tier, and
/settings gained an Execution Bar Volume field), on top of
**Structured Active Pattern Scan** (feat-078 — Codex finding #3: the
binary present/absent keyPoint mandate had no honest middle state, pressuring
hallucinated visual evidence; `patternScan` is now a structured Briefing +
BriefingUpdate field (verdict present/absent/indeterminate, pattern nullable,
evidence), enforcePatternScan throws on present-without-a-name and nulls stray
names on absent/indeterminate, updates re-scan the current chart (compose never
inherits the parent's), an indeterminate scan cannot justify a pattern-based
entry trigger (ground in engine facts or abstain), and the dashboard meta strip
shows the verdict with evidence tooltip; analyze user-prompt budget consciously
bumped 91k→92k, to come back down with feat-080), on top of
**noTrade/abstention objective state** (feat-077 — Codex finding #1: no
abstention path forced the model to fabricate complete objectives when evidence
was absent; an objective slot may now ship `{noTrade: true, reasonCode,
macroGoal, rationale}` — its own ObjectiveSlot union branch (Objective listed
first, every historical row parses unchanged; strict-mode anyOf with all keys
required). validateBriefing runs per-objective gates on trade slots only, the
distinct-anchor invariant needs BOTH slots trading, R/R verdicts are per-slot
nullable, and both-abstain / primary-abstains advisories surface to the
operator; persistBriefing arms no entry_levels rows for an abstaining slot
(prior set still deactivated → eval reads NO_ENTRY_NEAR); doctrine gains a
"No-trade abstention" section (abstain rather than inventing a distant rung;
not-yet-actionable belongs in a trigger unless no concrete trigger can be
written); dashboard renders a neutral NoTradeCard), on top of
**One-or-two-rung target contract + rr doctrine fix** (feat-076 — Codex
adversarial review of the recorded LangSmith briefing prompt found the target
cardinality mutually exclusive ("exactly TWO rungs" vs the single-target
carve-out 14 lines later vs the preamble's "at least T1") and the
output-objective.md rr bullet contradicting the authoritative constraints.md
formula by naming entry/stop/T1; operator picked the one-target variant:
doctrine now reads ONE or TWO rungs with the conclusion LAST, a sole target is
LABELED T2 and the R/R gate measures to it, the rr bullet states the
(entry→T2)/25 formula, both task prompts align, and enforceTargetCeiling
relabels a sole T1 to T2 with an advisory warning — riskReward gates on the
last listed target, so a sole "T1" would silently gate a mid-traverse rung;
schema unchanged at .min(1)/no-max for historical-row backcompat), on top of
**Code-owned fakeout-tail formation test** (feat-075 — the first briefing
after feat-074 STILL shipped the IBL fade with a verified-current serving stack:
the model never spontaneously engages the "reserved" formation exception, so the
finding is now an engine fact: `lib/engine/fakeoutTails.ts` flags every
trading-formed High/Low MGI extreme sitting at the far end of a thin tail
(rotation profile, session-lens rationale) with its LVN `acceptanceEdge`;
prompt bullets make the flag non-disputable and require explicit rationale for
an entry AT a flagged extreme; validateBriefing warns (2-pt tolerance) naming
the edge; live replay flags IBL 28079.75 → edge 28112, span 32.25 pts,
maxTailBinFrac 0.14), on top of
**Fakeout-formed-extreme fade anchor — detector LVN nodes join the legal
entry-anchor set** (feat-074 — the 2026-08-01 morning briefing anchored the fade
at IBL again despite feat-073: the detector emitted the 28112/28126 acceptance-edge
nodes but the Output Contract and `engineAnchorPrices` restricted entries to
MGI-anchored terrain structure, so IBL stayed the only legal anchor in the region;
operator reframing — a High/Low MGI print may itself be a pre-reversal fakeout, and
when the model judges it was, it may anchor where the actual action took place:
`engineAnchorPrices(terrain, lvn)` now admits detector LVN node prices (taper-edge/
valley, both profiles; HVN peaks stay excluded), both prompts name the LVN-node
anchor as legal for exactly this case, and the doctrine paragraph leads with the
formation test; analyze prefix 39,127 chars, PREFIX_BUDGET ceiling raised to 41k),
on top of **Local-contrast taper-edge LVNs + fake-breakout-tail fade-anchor doctrine**
(feat-073 — operator caught the secondary fade anchored at IBL 28079.75 at the far
end of a fake-breakout tail while retests reversed at the undetected ~28110
acceptance edge: the taper-edge shoulder test measured against the GLOBAL profile
peak, blinding it to shelf knees on the far side of the profile from the POC;
new `shoulderContrastMult`/`shoulderFloorFrac` params give deep shelves a
locally-scaled bar — sweep-validated at (3, 0.45): TRAIN LVN F1 45%↓6 /
HOLDOUT 44%↑8, live bundle now emits the 28112 knee — plus output-objective.md
extends the near-edge fade-anchor principle to thin tails as model judgment,
MGI extreme becomes the stop-side reference), on top of
**Absorption always a condition + code-owned passing-stack stat row**
(feat-072 — every level verdict must carry a check named exactly "Absorption";
the stall-confirmed stack nearest the evaluated level persists as
`eval_results.absorption_stack` and renders as a four-column spec-cell band in
the eval strip: side-colored netDelta | bars at stack | qualifying/bins | top
over bottom), on top of **Multi-day TPO composite + HTF/MTF narrative restyle +
name-first emphasis** (feat-071 — the missing multi-day TPO study reconstructed from the
HTF 30-min bars as engine fact `multiDayTpo`; htfView/mtfView contracts
rewritten to the Current section's storytelling register; UI emphasis
inverted so MGI names are bold and prices in parens are not), on top of
**Vanilla role prompt replaces the Gekko persona** (feat-070), on top of
**Shallow balance-area valleys no longer confer AAA** (feat-069), on top of
**Tactical Overview reads as narrative + key points** (feat-068, built
concurrently with feat-067 in an isolated worktree; merged after PR #107), on top of
**intraday trend in the dashboard meta strip** (feat-067), on top of
**faint balance-area promotions no longer confer AAA** (feat-066), on top of
**objectives awarded off the intraday trend** (feat-065), on top of
**composite intraday trend + HTF integrity qualifier** (feat-064), on top of
**session-anchored intraday facts — VWAP / cum delta / one-timeframing**
(feat-063), on top of **full-session Globex exec-bar export ingest** (feat-062), on top of
**Operator directive on objective cards** (feat-061), on top of
**Tactical Overview redesigned to HTF / MTF / Current** (feat-060), on top
of **MGI level attribution on every price in objective content** (feat-059),
on top of **single-print doctrine inverted — scars favor same-direction entries,
fades anchor at the near-edge border** (feat-058), and before that
**fixed 25-pt R/R basis gated on T2** (feat-057), and before that
**two-target ladder doctrine** (feat-056), and before that
**per-model reasoning-effort steering** (feat-055), the **delta
split on the structural profiles + code-owned node build quality** (feat-050),
the HTF 30-min bar export + code-owned HTF structure (feat-049), the daily
value-area history + code-owned value migration (feat-048), the enriched
execution bars + engine-owned order flow (feat-047), the numeric TPO
export + code-owned TPO facts (feat-046) and direction-aware
objective anchor separation (PR #86), the Long/Short
position-eval buttons (feat-046, branch `claude/long-short-eval-buttons-hrbfcu`), the eval strip scoped to the current briefing (PR #83), on-demand bundle uploads
(PR #82), the entry chase-side gate (PR #81), the system-prompt restructure +
campaign-scale terrain zones (PR #79), contested-border entry doctrine (PR #77) + entry
standoff relaxed to 1 pt (PR #76), eval warnings persistence (PR #75), the area-exit
absorption exception (PR #74), the count-only initiative gate (PR #73), the briefing
entry anchoring fix (PR #72) and the sign-gate count fix (PR #71).

**Code-owned fakeout-tail formation test (2026-08-01, feat-075).** The first
briefing after feat-074 merged (12:01 PM, bundle `69bde751`, dev worker
`v20260801.9`) STILL anchored the secondary fade at IBL 28079.75. This time the
serving stack was verified current end-to-end: the dev server runs from this
checkout (started 11:59, post-merge), the built worker bundle carried the new
anchor sentence, the build's `knowledge/output-objective.md` carried the
formation test, and the engine offered 28163/28126/28112 as legal anchors. The
exec bars (Friday's session) showed the textbook geometry — IBL printed as a
single 09:16 spike, every later retest reversing at 28112–28130. The model
simply never engaged: zero mention of tail/fakeout/28112, ~1.5k reasoning
tokens, same laundered "composite HVN shelf" attribution. Conclusion: a
doctrine that asks the model to spontaneously spot a pattern and invoke a
"reserved" exception under-triggers — three consecutive briefings prove it.
Fix: the FINDING is now code-owned, the model keeps only the anchor judgment
(the same engine-owns-facts / model-owns-judgment split as ripStatus,
absorption, magnetCheck). (1) `lib/engine/fakeoutTails.ts`: for each
trading-formed High/Low MGI extreme (on/pd/ib/or highs+lows, pwHigh/pwLow,
pmHigh/pmLow — projections, VWAPs, opens, mids, VRange, ATR excluded), flag
when the nearest interior LVN node sits 12–120 pts away and every raw bin
inside the tail plus beyond the extreme stays under 0.35 × raw peak. Runs on
the ROTATION profile only — the session-lens doctrine says the trade-horizon
profile governs where retests stall, and the balance-area composite is exactly
the laundering lens (it flags nothing on the live bundles, correctly). (2)
`EngineFacts.fakeoutTails` + `factsPayload` key + `rotation_vbp` registry row.
(3) Prompt bullets (analyze + update): a listed extreme IS fakeout-formed —
never re-derive, dispute, or counter with composite acceptance; an entry AT a
listed extreme is allowed ONLY with explicit rationale (campaign border at the
extreme / tail actively repaired), else anchor at `acceptanceEdge.price`
naming the node. (4) `validateBriefing`: advisory warning when an entry sits
within 2 pts of a flagged extreme, naming the edge. (5) Doctrine paragraph
rewritten around the fact: the finding is data; the judgment is only the
exception; an unjustified extreme anchor is a defect. Live replay (both 08-01
bundles): `fakeoutTails = [IBL 28079.75 → edge 28112 taper-edge, span 32.25,
maxTailBinFrac 0.14]`. Reaches live runs on the next dev-server restart (it
rebuilds from this checkout).

**Fakeout-formed-extreme fade anchor — detector LVN nodes join the legal
entry-anchor set (2026-08-01, feat-074).** The first post-feat-073 briefing
(2026-08-01 morning, bundle `a32050bd`) anchored the secondary fade at IBL
28079.75 again. Replay of the exact bundle with current main proved the
detector half works — rotation taper-edge 28112 and balance-area valley 28126
both emitted — but those nodes never became shippable structure: the terrain
zone stack is MGI-anchored (no MGI level exists between the 28204.5 trench and
IBL, so no border forms at the acceptance edge), and both the Output Contract
anchor sentence and `engineAnchorPrices` restricted entries to zone borders /
`terrain.levels` / border members. The model faced contradictory instructions
— doctrine said prefer the near-edge LVN, contract forbade entering there —
and correctly obeyed the contract: IBL was the only legal anchor in the
region. (Tellingly it used a raw LVN for the STOP — "27908 (balance-area LVN
valley)" — since off-anchor validation only polices entries.) Operator
reframing sharpened the doctrine: any High/Low-type MGI print may itself be
the artifact of a pre-reversal fakeout, and when the model judges an extreme
was formed that way it should anchor where the actual action took place.
Three parts. (1) `engineAnchorPrices(terrain, lvn?)` admits detector LVN node
prices (taper-edge/valley, both profiles) into the legal anchor set; HVN
peaks stay excluded (middle of value), the data-edge filter is unchanged;
both call sites pass `facts.lvn`. (2) The anchor sentence in
`lib/analyze/prompt.ts` and `lib/update/prompt.ts` names `lvnHvnNodes` LVN
node prices as legal anchors, reserved for the fakeout-formed-extreme case,
node named in the label. (3) `output-objective.md`'s tail paragraph now leads
with the formation test before any High/Low anchor is used. Analyze prefix
grew to 39,127 chars — PREFIX_BUDGET ceiling consciously 39k → 41k. Verified:
replayed anchor set on bundle `a32050bd` now offers 28163 / 28126 / 28112
between the trench and IBL. Doctrine + prompt changes reach live runs on the
next trigger.dev deploy / dev-server restart from a pulled checkout — the
serving dev worker (`v20260731.17`) builds from wherever `trigger dev` runs,
and the Windows checkout is known to drift.

**Local-contrast taper-edge LVNs + fake-breakout-tail fade-anchor doctrine
(2026-07-31, feat-073).** Operator caught a live entry-selection miss on the
2026-07-31 briefing: the secondary fade shipped at IBL 28079.75 ("composite
HVN shelf") while the rotation VbP's acceptance collapsed at ~28110 — bins run
700–1200 through 28116, then 486/321/142 down to 49 contracts AT the entry.
Retests reverse at the acceptance edge (lows ~28125–28140) and never reach the
MGI extreme, so fills are missed. Diagnosis: `detectLvnHvn`'s taper-edge pass
required a shoulder ≥ `shoulderFrac` (0.6) of the GLOBAL profile peak; the
knee's local distribution smoothed to ~1026 vs peak 2083 (~49%), so the shelf
edge could never fire whenever the POC sits in the opposite half of the
profile — exactly the fake-breakout-before-reversal geometry. With no engine
node between the 28204.5 trench and IBL (terrain's bottom zone spanned 1,000
pts), the model legally snapped the fade to the MGI extreme, and the
balance-area profile (uniformly fat 4.3–5.4k/bin down there) laundered the
"HVN shelf" attribution. Fix (1), engine: new `shoulderContrastMult` (3) /
`shoulderFloorFrac` (0.45) — per-run effective bar
`min(shoulderFrac·peak, max(contrastMult·runMin, floorFrac·peak))`, so deep
shelves get a locally-scaled bar while the contrast term pushes shallow
shelves (runMin > 0.15·peak) back onto the strict global rule; the floor must
exceed `plateauLevelFrac` else every run-terminating bin would self-qualify.
Grid sweep (contrast × floor, knee-detection as a hard constraint): floor 0.5+
loses the live knee, (3, 0.45) is the best detecting point — TRAIN LVN F1 45%
(was 51%, partly overfit), HOLDOUT 44% (was 36%), HVN untouched 81%/43%,
lvn:eval gate ≥40% passes; live bundle f86aa0a9 now emits taper-edge 28112.
Fix (2), doctrine as model judgment (operator's explicit call — surface the
border in code, let the model judge the anchor): `output-objective.md` extends
the PR-98 near-edge principle to fake-breakout tails — when an MGI extreme
sits at the far end of a thin tail, prefer the fade anchor at the tail's
near-edge acceptance boundary with the extreme as the stop-side reference;
anchoring at the extreme stays legitimate when a campaign border sits there or
the tail is being repaired (say why in the rationale); the session-lens
profile, not the multi-day composite, governs where a retest stalls. Note:
knowledge files ship with the trigger.dev deploy — live briefings pick up the
doctrine on the next `trigger deploy`; the detector change is live on the next
Vercel/worker deploy of lib/.

**Absorption always a condition + code-owned passing-stack stat row
(2026-07-30 evening, feat-072).** Operator ask after reviewing a live eval's
absorption facts (the confirmed 20-bar stack at 28154.75–28184): the eval must
ALWAYS include Absorption as one of its conditions, and the passing stack's
stats deserve their own scannable row. (1) `output-eval.md` now requires one
check named exactly "Absorption" on every level verdict (pass per the
absorption-alone rule; pending when no stack/stall visible; fail only when the
flush kept moving price through the level); `enforceEvalFacts` warns —
warning-only, never fabricates — when the model omits it. (2) New
`lib/eval/absorptionStack.ts` selects the stat-row stack code-side: the
stall-confirmed candidate nearest the post-enforcement evaluated level
(current price on level-less verdicts); confirmed-only by design (unconfirmed
means "no stall visible", not refuted). Persisted verbatim as
`eval_results.absorption_stack` jsonb — repo migration
`20260731030000_absorption_stack.sql`, applied live as `20260731033446` via
the claude.ai Supabase MCP (verified queryable). Degradation on both sides:
the eval insert retries without the column on PGRST204, and the dashboard
eval select switched to `*` + embed so a lagging schema can't break either
path. (3) The eval strip renders the stack as a four-equal-column spec-cell
band (DESIGN.md spec-cell language) between the verdict header and the
conditions: netDelta large and side-colored (buy=bmw-blue, sell=m-red,
signed) | bars at stack | qualifying bins / span | stack top over bottom
(both `formatPrice`d). `parseEvalAbsorptionStack` degrades malformed jsonb to
no-row. Note: `output-eval.md` ships with the trigger.dev deploy — live evals
pick up the required-check doctrine on the next `trigger deploy`.

**Multi-day TPO composite + HTF/MTF narrative restyle + name-first emphasis
(2026-07-30, feat-071).** Operator report: the Tactical Overview's Current
section reads as envisioned, but htfView/mtfView recite dates and bare POC
prices, and the UI bolds prices while the MGI names go unemphasized. Three
fixes. (1) The missing multi-day TPO study is reconstructed in code from the
HTF 30-min bars (`lib/engine/multiDayTpo.ts`): each 30-min bar is one TPO
period, so counting the 1-pt bins each bar's low→high traverses rebuilds the
ladder — validated against the live `tpo.data.md` (single-session rebuild
reproduces the study's POC exactly, VAH/VAL within one bin). The last 5 RTH
sessions merge into engine fact `multiDayTpo`: composite POC + prominence,
70% value area, range, HVN shelves, interior LVN valleys, per-session POC
walk, current-vs-composite-value. (2) `output-briefing.md` htfView/mtfView
contracts + the analyze-prompt overview bullet rewritten: all three sections
carry the same storytelling register — a campaign told at named structure,
never a date-by-date number recitation; day-value references named by day
("Tuesday's POC (27600)"), the composite by identity ("the 5-day composite
POC (28054)"); mtfView anchors on `multiDayTpo`, never the chart image.
(3) Emphasis inverted in `highlighted-text.tsx`/`highlight.ts`: names bold
bright, prices unemphasized; labels also match with their kind suffix
stripped ("Weekly VWAP" ← "Weekly VWAP wall"); POC/VAH/VAL/HVN/LVN/IBH/IBL/
Initial Balance/ONH/ONL join the doctrine vocabulary. Prompt budget raised
87k → 91k consciously (measured 88.6k); engine-ownership `htf_csv` row
extended. Note: knowledge files ship with the trigger.dev deploy — live
briefings pick up the new prompts on the next `trigger deploy`.

**Vanilla role prompt replaces the Gekko persona (2026-07-30, feat-070).**
Operator decision: the Gordon Gekko persona (`knowledge/system/persona.md`)
dated from the manual chat-Gem era; the operator no longer converses with the
system and briefing output wasn't carrying the voice anyway. Replaced by
`knowledge/system/role.md` — a vanilla prompt keeping ONLY the
analysis-governing content not duplicated elsewhere: advisory-only constraint,
attention-economy output rules (short declarative sentences anchored to
levels, max 2 key areas per briefing), the say-plainly no-trade bias
("better to miss a move than force a bad entry"), and
plan-executes-without-renegotiation (stops are invalidation, not
suggestions). Dropped as voice or as duplicated: identity/tone bullets,
trend-continuation bias (constraints #5 Law of Asymmetric Initiative),
trade-what-IS (constraints #3), LVN-entry preference (chart-reading),
one-action macroGoal (Objective contract), ADHD framing (schema comment now
says "attention economy"). `doctrine.ts` SHARED_PREFIX, both tests, and doc
references updated; `gem-files/` and `docs/traces/` untouched (historical).

**Shallow balance-area valleys no longer confer AAA (2026-07-30, feat-069).**
Operator flagged a "AAA trench" at Weekly VWAP (27917.62) with nothing visible
on the balance-area VbP. Verified on the real bundle: the profile there is a
flat shelf — center at 89% of its own thinner flank — and the "valley" was
manufactured by a single 10,622 bin 32 pts away stretching the LOCAL PEAK the
trench test normalises against (blockFrac 0.55 / valleyFrac 0.6 overlap, so a
flank barely above the center still reads as a "block"). Fix mirrors feat-066:
new `aaaMaxCenterFlankFrac` (0.75) — a balance-area TRENCH promotion only
confers AAA when its center is ≤ 0.75× the thinner flanking block's max;
shallow promotions keep the trench kind + border but rank A (new `shallow`
flag, reason suffix "shallow valley … — not AAA"). Threshold from a 14-bundle
sweep: genuine AAA valleys read 0.54–0.64 depth, the false positive 0.89; no
other border in the sweep changes. Walls exempt (no valley geometry); rotation
promotions never carry the flag. Prompt significance lines updated; analyze
user-prompt budget 85k→87k (the per-verdict boolean, measured 85,850).

**Tactical Overview reads as narrative + key points (2026-07-29, feat-068).**
Operator ask: each overview section should read as a time-based narrative
paragraph of what occurred over that timeframe, then a few bullets with the
most important points the data surfaces; levels called by MGI name, not raw
price. Schema: `OverviewSection { narrative, keyPoints[2..4] }` for
htfView/mtfView/current (ceiling 5→4 — the narrative carries the description);
the feat-060 bullet-array shape parses as `BulletOverview` on the persisted
read path only, alongside the pre-060 `LegacyOverview`. Contract: narratives
are time-ordered with explicit anchors ("off the 17:00 reopen…"), 4–6
sentences, each ending by setting up the section below; keyPoints never
restate the narrative; Active Pattern Scan verdict + stale flag are required
`current` keyPoints. Vocabulary inversion vs the Objective contract: NAME
first ("PW Low"), price at most in parens — the terms highlighter already
matches MGI labels so names light up in the narrative. OverviewPane renders
the paragraph above the bullets with a three-way shape branch. Updates carry
the overview forward verbatim, unchanged. Analyze cached-prefix budget
36k→39k chars (measured 37,323).

**Intraday trend in the dashboard meta strip (2026-07-29, feat-067).**
Operator ask: split the meta strip's HTF Trend cell in two and show the
intraday trend in one column. The intraday trend is code-owned (feat-064
composite), so the new cell renders a deterministic engine summary — new
`summarizeIntradayTrend()` formats "Up (strong) · trending" /
"Neutral · rotational", appending the open-conflict count when components
disagree. Plumbing mirrors the ripStatus code-owned pattern: `CodeOwnedMeta`
gains a required `intradayTrend`, `enforceMeta` stamps it verbatim (the
generation contract is UNCHANGED — the model never emits it, no
strict-structured-outputs impact), both analyze and update pipelines pass the
summary. Read path: new `PersistedBriefingMeta` makes the key optional so
pre-feat-067 rows keep parsing; the UI shows a dash for them. Meta strip grid
is now Price | Rip | Intraday Trend (semantic tones: success up / m-red down)
| HTF Trend | run meta. `./init.sh` green: 1009 tests passed / 1 skipped.

**Faint balance-area promotions no longer confer AAA (2026-07-29, feat-066).**
Operator flagged the "AAA trench" at 28212.5/28227.75 as barely noticeable on
the balance-area VbP. Verified on the real bundle: flanks 32-43% of the
profile's 11,048 peak — the F5 floor uses the profile MEAN, which the
profile's own thin tail dilutes. New `aaaMinFlankPeakFrac` (0.5): a
balance-area promotion whose thinner flank is under half the profile PEAK is
marked `faint` (verdict field + reason suffix "faint acceptance ... — not
AAA") and ranks A instead of AAA; the border itself survives as a hard
partition/entry anchor. Rotation promotions never faint. Prompt significance
lines updated ("never call faint balance-area borders AAA in prose").
Real-bundle result: all four thin-tail borders now A with explicit reasons.

**Objectives awarded off the intraday trend (2026-07-29, feat-065).**
Operator doctrine change: the Law of Asymmetric Initiative now awards the
PRIMARY objective off `intradayTrend.direction` (the feat-064 composite), not
the HTF swing state — HTF is campaign background only. Weak conviction still
awards but the rationale carries the disagreements; `neutral` = no trend
claim, primary goes to the structurally superior setup with the rotational
read stated. Campaign Boundary Override unchanged. Rewritten in
constraints.md #5, output-briefing.md, output-update.md, chart-reading.md
step 5, + reinforcement in both volatile prompt guide lines. Sierra-side same
session: fixed ExecutionDataExporter.cpp session-start walk (D:\SierraChart\
ACS_Source) — `Hour <= 17` excluded the whole 17:00 reopen hour and the
day-change guard never re-anchored after the evening reopen; now anchors on a
real SessionStart datetime (most recent 17:00 CT). Operator rebuilt; globex
export confirmed working (replay chart explains truncated evening files).

**Composite intraday trend + HTF integrity qualifier (2026-07-29, feat-064).**
Closes the intraday-trend rethink. `htfStructure.trend.integrity`
(intact / under-test / broken vs the live price, 50%-retrace threshold,
one-tick break epsilon) — both prompts forbid narrating a directional HTF
state without it; the fixture test now pins the incident shape (state down +
integrity broken). New `lib/engine/intradayTrend.ts`: direction = majority of
{15-min OTF (vote withheld if the developing bar broke the run), micro swing
structure on exec bars with a real-time Dow break rule, 15/60/180-min momentum
stack (flat thresholds 10/20/40 pts)}; conviction = confirming reads (session
cum delta, Rip, VWAP position); character trending/transitioning/rotational;
disagreements[] surfaced verbatim in prose. Threaded into analyze + update
factsPayload/guides (senior to the HTF swing state for session narration) and
the eval prompt (new intraday-trend context line; Rip frame null on that
path — eval has no MGI). Analyze prompt budget consciously 80k → 85k
(measured 81,819). Timezone verified on request: exec/HTF timestamps are
Chicago wall clock; local-parse + local-field reads make every session
boundary (17:00 Globex / 08:30 RTH) runtime-TZ invariant — proven byte-identical
under America/Chicago, UTC, Australia/Sydney.

**Session-anchored intraday facts (2026-07-29, feat-063).**
New engine module `lib/engine/sessionIntraday.ts` — the operator's intraday
trend read, from the full-session exec bars: Globex- and RTH-anchored session
VWAP (raw-bar accumulation, slope vs 30 min ago), session cumulative delta
(same anchors, last-30-min trend), and 15-min one-timeframing (state, bars
held, break level, real-time developing-bar break). VWAP/cum-delta null +
warning when the export starts >30 min after the Globex open (the retired
rolling export); OTF computes regardless. Wired into EngineFacts,
factsPayload (analyze + update prompts), facts-guide lines in both prompts,
engine-ownership registry. 14 new tests including the real fixture (rolling
window captured at 21:52 — correctly reads as FULL coverage of the young
Globex session). Still open for the next feature: composite `intradayTrend`
synthesis (OTF + micro swing structure with a Dow break rule + momentum
stack + flow confirmation), HTF trend intact/under-test/broken qualifier,
eval-gate threading.

**Full-session Globex exec-bar export ingest (2026-07-29, feat-062).**
Operator-directed data upgrade, first step of the intraday-trend rethink. The
morning's briefings called the HTF trend "Down" while NQ was ~700 pts off the
session low — root cause: the 30-min fractal swing logic (5 bars each side =
2.5h confirmation lag) never consults current price, and the only "trend" in
the briefing is that HTF background fact. Plan agreed with the operator:
(1) THIS feature — switch the exec-bar export from the rolling ~250-bar window
(~2.8h) to all bars since Globex open; Sierra reconfigured to write
`execution_bar_data.globex`. Uploader now maps candidate filenames per field
(globex.csv → extensionless globex → retired rolling fallback for the
Windows-checkout-drift window); ingest field/column/object name unchanged, no
migration. (2) NEXT — engine work: resample 5-min bars from the timestamped
exec bars and compute session VWAP, session cumulative delta, and
one-timeframing (sub-30-min; operator says 30-min is too high for NQ) in code
— operator explicitly wants NO new chart studies or export columns. Then a
composite code-owned `intradayTrend` fact (OTF + micro swing structure with a
Dow break rule + multi-window momentum stack + flow confirmation + Rip/value
frame) and the HTF trend demoted to background with an
intact/under-test/broken qualifier. TODO: capture a real
`execution_bar_data.globex.csv` into `chart-data/` once Sierra writes one, and
remind the operator to pull + restart the Windows uploader checkout.

**Operator directive on objective cards (2026-07-28, feat-061).**
Operator request (mockup provided): a textbox in each objective card's header
to redirect where that objective anchors — "ONL", "move the entry to 27950",
or short prose — regenerating the objective and its targets. Two operator
decisions taken up front: directive runs REUSE the latest bundle (no
fresh-bundle handshake — the operator is reacting to the briefing on screen;
`awaitFreshBundle(undefined)` no-ops) and the untargeted objective is
HARD-FROZEN (`composeUpdateBriefing` copies it from the parent verbatim; a
directive that can't coexist with it under the distinct-anchor floors fails
loudly after the 3 task retries rather than silently moving the other card).
Implementation rides the existing update path end to end: Zod
`OperatorDirective` ({objective, text ≤280 single-line}, `lib/update/
directive.ts` — input-only, never model-facing, so OpenAI strict mode and
the Anthropic schema-size ceiling are untouched) → optional route body on
`/api/briefings/update` (400 on invalid before any side effects;
triggerReason `operator-directive`) → update-task payload → `runUpdate`
options → an additive `# Operator directive` section in the user prompt
(byte-identical prompt without a directive — asserted in tests — so the
prompt cache and doctrine system prompt never shift) stating the directive,
precedence rules, and the frozen objective's entry price so the model
respects the separation floors on attempt 1. Directive persists to
`briefings.operator_directive` jsonb (migration `20260728090000`, applied
live via MCP; gekko-db skill snapshot updated) and renders as an "Operator
directive:" annotation on the resulting card. UI: `ObjectiveDirectiveInput`
client island (DESIGN.md text-input token at h-9 header scale) slotted into
the server-rendered card header; the queue → Realtime watch →
`router.refresh()` machine extracted from `TriggerRunButton` into a shared
`useTriggeredRun` hook (`app/components/use-triggered-run.ts`) — all four
existing buttons keep identical behavior. 16 new tests (route directive
paths + rejection matrix, prompt threading + cache guard, freeze in compose
and end-to-end, persistence column presence/absence, dashboard jsonb parse
degrade-to-null).

**Tactical Overview redesign (2026-07-28, feat-060).**
Operator request: replace the four Gem-derived overview sections with three
timeframe-descending ones — `htfView` (value migration across days, daily-range
contraction/expansion, HTF trend), `mtfView` (the last few days day-by-day),
`current` (overnight summary, then the RTH session so far) — with hard
vocabulary rules: NO terrain-zone names (Kill Box / Elevator Shaft / etc. are
not on the operator's charts) and NO ATR anywhere in overview prose (ranges
quoted in actual points); every price carries its structure attribution.
Implementation: new `Overview` schema (3 × 2–5 bullets; `keyInflections`
dropped — it was generated but never rendered) plus `LegacyOverview` /
`PersistedOverview` / `PersistedBriefing` so pre-feat-060 rows keep parsing on
the dashboard and update-parent read paths (same pattern as the legacy T3
rung); `composeUpdateBriefing`, `persistBriefing`, `enforceCodeOwnedFacts`
(now generic), `dashboardData`, `highlight` and `OverviewPane` retyped, the
pane branching on shape. New cheap engine facts: `lib/engine/dailyRanges.ts`
(per-session range series + contracting/expanding/stable read from
`daily-value-areas.csv`), `valueMigration.recentSessions` (last ≤10 sessions
day-by-day), `lib/engine/overnightSession.ts` (overnight high/low/range +
RTH-so-far extremes from the 30-min bars; the export's chart time is US
Central — Globex reopen 17:00, RTH open 08:30 — and the module null-degrades
with a warning on RTH-only exports). `factsPayload` gains `dailyRanges` and
`overnightSession`; registry rows added to `docs/engine-ownership.md` (the
prompt-data-sync gate binds them); doctrine rewritten in
`knowledge/system/output-briefing.md`; analyze-prompt rules remapped (Active
Pattern Scan verdict + stale flag now land in `overview.current`).
`chart-data/htf_bar_data.rolling.csv` refreshed to a full-24h live snapshot
(Jul 10–28, US Central) — the old fixture was RTH-only in ET and could never
exercise the overnight facts; two fixture-derived HTF expectations updated
(trend now down, ATR 116.23). MTF still has no multi-day TPO export — a
possible follow-up Sierra export. `./init.sh` green (957 passed / 1 skipped,
lint 0 errors).

**MGI level attribution in objectives (2026-07-27, feat-059).**
Operator request: when an objective headline (`macroGoal`) states a price tied
to MGI level(s), name those levels — and do the same throughout the objective
content. Added a "Level attribution" section to
`knowledge/system/output-objective.md` (cached system prefix shared by the
analyze and update tasks): every price stated in `macroGoal`, `rationale`,
entry `label`/`trigger`, stop `invalidation` or target `description` names its
structure in parentheses after the number — MGI engine labels when the price
is or clusters with MGI level(s) (a composite border names ALL members, e.g.
"28212.5 (PDL / PW Low)"), otherwise the non-MGI engine structure ("28210
(LVN, balance-area profile)"). The `macroGoal` contract line now carries a
worked headline example. Doctrine prose only — no engine, validator or schema
change. `./init.sh` green (933 passed / 1 skipped, lint 0 errors).

**Single-print doctrine inverted (2026-07-27, feat-058).**
Investigated the 2026-07-27 11:18 briefing skipping the 28210 short: the MGI
cluster (Rip AAA trench 28201.43, PDL/PW Low 28212.5, VRange −2 28218, PM Low
28227.75) plus a volume ledge (bin volume collapses ~2,200 → 37 contracts
across 28226 → 28208) was fully mapped, the model's own `keyInflections` said
the failed reclaim at 28201.43 "authorizes the counter-short" — yet the
secondary short shipped at 28500, 436 pts above price (unactionable; eval
would report NO_ENTRY_NEAR on a 28210 reoffer). LangSmith showed a single LLM
pass, no validator retry; no engine gate blocks a 28201.43 short. Root cause:
the analyze prompt taught `tpo.singlePrintZones` are "fragile fast-traverse
scars (weak support/resistance, repair magnets)", and the engine scar
28206–28340 sat on top of the cluster, so the model exiled the fade past the
scar to the far-side structure (the 8:44 briefing had faded 28176.5 only
because the AAA badge then sat below the scar). Operator doctrine is the
opposite: single prints favor entries in the DIRECTION of the move that
created them, and a border at a scar's near edge keeps full entry authority.
Rewrote the tpo bullet in `lib/analyze/prompt.ts`, added the near-edge
fade-anchor rule to `knowledge/system/output-objective.md` (cached prefix,
shared with the update task), aligned the `singlePrintZones` doc comment in
`lib/engine/tpoFacts.ts`. Prompts/doctrine only — no engine or validator
behavior change, no test-fixture churn.

**Fixed 25-pt R/R basis, gated on T2 (2026-07-27, feat-057).**
Operator decision: "I use a 25 point stop, not structure, so the reward just
needs to be 3x that" + "T2 should be 3:1 RR, not T1". `riskReward.ts` now
computes every rr as `reward / FIXED_RISK_PTS` (25) and the headline rr / gate
measure to the LAST listed target (the T2 conclusion), so the gate is
entry→T2 ≥ rr_min × 25 pts (75 pts at the default 3.0). The structural stop
keeps its geometry check, the MIN_STRUCTURAL_STOP_PTS advisory and the
stops-never-widen rule, but no longer sets R/R. Prompt rr lines (analyze +
update), constraints.md, chart-reading.md and the schema rr comment updated to
match. Context: investigated the 2026-07-27 08:00 briefing whose primary entry
sat 235 pts below price — the bundle was fresh and the levels were drawn
faithfully; the model had anchored the long at the 27939 flush low because
price had crashed below the entire MGI map (no mapped floor beneath IBL
28075.25). A rerun produced sane near-price levels with the same two-target
shape, so feat-056 was NOT the drawing culprit and was left in place.

**Live cache-probe test re-gated (2026-07-26, PR #96).**
The feat-023 gated integration test (`tests/llm.cacheHit.integration.test.ts`)
armed itself on mere `OPENROUTER_API_KEY` presence. Because the trading machine
exports `.env` into terminals (the `useEnvFile` injection issue, resurfaced —
`python.terminal.useEnvFile` is already `false`, so the vector is something
else), every `npm test` / `./init.sh` run fired two REAL
`anthropic/claude-sonnet-5` calls with the full doctrine prefix. That was the
source of the unexplained Sonnet 5 entries in the OpenRouter activity log AND
the credit drain behind the 2026-07-26 analyze-task failure ("requires more
credits… requested 65536, can only afford 58620"). The test now requires
`RUN_LLM_INTEGRATION=1` in addition to the key. Suite: 931 passed / 1 skipped.
Open follow-ups: top up OpenRouter credits; rotate the OpenRouter key (it was
also echoed into a session transcript during diagnosis); find the actual env
injection vector.

**Two-target ladder doctrine (2026-07-26, feat-056).**
Operator decision: the T1/T2/T3 ladder required a homerun to pay all rungs, so
objectives now carry exactly TWO targets. **T2 (Conclusion)** is the model's
best structural estimate of where the move realistically concludes when it
plays out reasonably well (an LVN return over a distribution concludes at the
distribution's opposite side) — the full HTF campaign traverse is narrative
context, never a rung, and the Magnet Prohibition now binds T2 as the final
target. **T1 (Tactical)** is an engine structure level between entry and T2,
ideally near the midpoint of the traverse, with latitude toward whichever real
border sits closest to it — the first obstacle a few points off entry no longer
qualifies. Doctrine rewritten in `knowledge/system/output-objective.md`
(+ constraints.md #4, chart-reading.md ×3); analyze/update user prompts updated;
`validateBriefing` gains `enforceTargetCeiling` (trims any third rung with a
warning — mirrors the single-entry precedent; NO schema `.max(2)` and `'T3'`
stays in the `TargetLabel` enum because historical three-rung briefings must
keep parsing through `Briefing.safeParse` on the dashboard/update read paths)
and `ladderWarnings` now expects the two-target ladder plus warns when T1 is
not between entry and T2 (nearest-first — the R/R gate measures to the first
listed target). Since T1 now sits deeper than the old first-obstacle rung, the
R/R gate clears more easily by construction. 932 tests green.

**Per-model reasoning-effort steering (2026-07-26, feat-055).**
Follow-up to the 2026-07-25 briefing audit (`docs/briefing-audit-2026-07-25.md`,
Flash-vs-Terra A/B): the operator wants to steer OpenRouter's `reasoning.effort`
per model slot from /settings instead of always running provider defaults (both
gemini-3.6-flash and gpt-5.6-terra default to "medium"). Migration
`20260726000000_model_reasoning_effort.sql` (applied to live Supabase via MCP)
adds nullable CHECK-constrained `model_effort`, `triage_model_effort` and
`high_conviction_model_effort` columns; NULL = provider default —
`generateStructured` sends no reasoning parameter at all (an absent override must
not become `reasoning: {effort: null}`). New dependency-free leaf module
`lib/llm/reasoning.ts` (`REASONING_EFFORTS` = none/minimal/low/medium/high/xhigh,
mirroring the @openrouter/ai-sdk-provider union) is imported by both the browser
settings form and the server path; `openrouterModelSettings(effort)` keeps usage
accounting on and adds `reasoning.effort` only when set. Providers reject efforts
they don't support ⇒ loud run failure, never silent degradation. Effort travels
with the model slot that serves the run: analyze/update pick
`high_conviction_model_effort` when routed high-conviction, else `model_effort`;
the eval-task uses `triage_model_effort` (its `select('*')` config read needs no
column-list change). `fetchConfigRow` now degrades across THREE migration tiers
(full → pre-effort → legacy) and reports `effortColumnsMissing` alongside
`highConvictionColumnsMissing`; /settings shows an apply-the-migration warning and
a "Reasoning Effort" select (Provider default + six levels) under each of the
three model inputs; `ConfigUpdateSchema` validates the three fields (nullable
enum). ./init.sh green: typecheck, lint (0 errors), 930 tests (12 new), build.
Live row's efforts are all NULL, so behavior is unchanged until the operator picks
an effort.

**Delta split on the structural profiles + node build quality (2026-07-25, feat-050).**
Data-todos item 5. Sierra side: `D:\SierraChart\ACS_Source\VbPDataExporter.cpp` (the
shared study behind all four `.vbp.md` exports) gains a third Column Type option —
`Volume;Delta;Both` — where **Both** writes `Price,Volume,Delta` (delta = ask − bid
volume per bin, whole numbers; the study already computed it internally). Everything
else (metadata/summary sections, bin sizes, ordering, filenames, cadence, atomic
writes) unchanged. **User-side setup:** rebuild the DLL, then on the chart set Column
Type = Both on the TWO structural profile exporter instances (`four-hundred-rotation`
and `balance-area`); the half/full-rotation delta exporters stay on Delta. Gekko side:
`lib/engine/parseProfile.ts` accepts an optional third `Delta` column on vbp profiles
(2-col pre-delta exports still parse — deploy-window compatible; unknown 3rd headers
and short rows still hard-reject; delta profiles must stay 2-col). New
`lib/engine/nodeBuild.ts`: `buildAt` sums RAW volume/delta bins within ±7 pts (half
the detector merge tolerance) of a node price → `{volume, delta, ratio,
classification}` with `buyer-built` / `seller-built` at |ratio| ≥ 0.2, else
`balanced`; null when the export has no delta split. `computeEngineFacts` annotates
the canonical `lvn.{rotation,balanceArea}` hvn/lvn node lists and the top-level
`magnetCheck.magnets` (against the balance-area profile) — deliberately NOT the
magnet/node refs embedded in terrain and the magnet verdicts, which would have
duplicated ~95 build objects and blew the 80k analyze-prompt budget (measured: 25
builds, payload 61.8k). Missing delta ⇒ per-profile warning. Analyze + update prompts
gain a `build` data-ownership bullet (one-sided acceptance = softer magnet/wall; null
⇒ never infer from screenshots). Fixtures regenerated with a deterministic synthetic
delta; registry rows add `lib/engine/nodeBuild.ts`. ./init.sh green: typecheck, lint
(0 errors), 918 tests (16 new), build.

**HTF 30-min bar export + code-owned HTF structure (2026-07-25, feat-049).**
Data-todos item 4. Sierra side: new study
`D:\SierraChart\ACS_Source\GekkoHtfBarDataExporter.cpp` (own DLL, like the other Gekko
exporters) exports `C:\gekko\export\htf_bar_data.rolling.csv` — header
`DateTime,Open,High,Low,Close,Volume,BidVolume,AskVolume`, one row per 30-min bar,
chronological, rolling 90 calendar days, current partial bar as the last row, same 30 s
timer + atomic tmp+rename pattern. Volumes come from the base data arrays
(SC_VOLUME/SC_BIDVOL/SC_ASKVOL; delta convention ask − bid); the 90-day window is
anchored to the LAST bar's timestamp (not the wall clock) so replays export correctly.
**User-side setup:** attach to the 30-minute HTF planning chart (90+ days loaded), then
rebuild the DLL (Analysis >> Build Custom Studies DLL, this file only). Gekko side:
`htf_csv` manifest field → `raw_bundles.htf_csv_ref` (additive migration, applied to
Supabase), uploader watches `htf_bar_data.rolling.csv`, loadBundle fetches it
best-effort on BOTH the analyze and eval loads (missing ref = pre-study bundle, silent;
failed download warns). New `lib/engine/parseHtfBars.ts` (strict: header, column count,
numerics, High ≥ Low, chronological order) and `lib/engine/htfStructure.ts` (Wilder
ATR over 14 30-min bars, confirmed fractal swings at strength 5 — the in-progress bar
can never carry a swing — trend state from the last two swing pairs (HH+HL up / LH+LL
down / else range), recent swing highs/lows, rotation extent in points and ATR
multiples, ATR-normalized current-price-vs-swing distances). `computeEngineFacts`
surfaces `facts.htfStructure` (null + warning when absent/malformed) → `htfStructure`
payload key in the analyze/update prompts with a data-ownership bullet; `meta.htfTrend`
is no longer requested as a pure planning-chart read — it must be grounded in the
engine facts, with the screenshot contributing distribution shape only (the feat-054
vision-exclusivity conditional for feat-049 flipped in this change). Eval: one
code-owned "HTF structure context" line (trend + ATR + ATR-normalized swing distances —
the rotation-noise vs trend-break scale for position holds), best-effort so it never
blocks a check. Registry rows updated (`htf_csv` added; `htf_png` re-scoped to
distribution shape only). Doctrine prose aligned (output-briefing.md htfTrend semantics,
chart-reading.md step 2). ./init.sh green: typecheck, lint (0 errors), 902 tests, build.

**Daily value-area history + code-owned value migration (2026-07-25, feat-048).**
Data-todos item 3. Sierra side: new study
`D:\SierraChart\ACS_Source\GekkoDailyValueAreasExporter.cpp` (own DLL, like the TPO
exporter) exports `C:\gekko\export\daily-value-areas.csv` — header
`Date,POC,VAH,VAL,SessionHigh,SessionLow,SessionVolume`, one row per *completed* RTH
session, most recent first, rolling 20 sessions, same 30 s timer + atomic tmp+rename
pattern. It reads per-session profiles from a session-based Volume by Price study
(`GetNumStudyProfiles` + `GetStudyProfileInformation`: `m_VolumePOCPrice`,
`m_VolumeValueAreaHigh/Low`, `m_Volume`, extremes) — nothing recomputed, so the export
matches the study on screen. The in-progress session (profile 0 on the current trading
day inside the chart's session window, 60 s grace) is excluded. **User-side setup:**
attach to an RTH-session intraday chart with a session-profile VbP study, then rebuild
the DLL (Analysis >> Build Custom Studies DLL, this file only). Gekko side: `daily_va`
manifest field → `raw_bundles.daily_va_ref` (additive migration `20260725190539`,
applied to Supabase), uploader watches `daily-value-areas.csv`, loadBundle fetches it
best-effort on BOTH the analyze (`all`) and eval (`exec-plus-delta`) loads (missing ref
= pre-study bundle, silent; failed download warns). New `lib/engine/parseDailyValueAreas.ts`
(strict: header, row shape, dates strictly descending, VA inside session range, POC
inside VA) and `lib/engine/valueMigration.ts` (prior-day POC/VAH/VAL, POC drift
direction/pace over a 5-session window with a 5 pts/day flat threshold, consecutive
higher/lower-value days, prior-day VA overlap pct + relation + midpoint shift, current
price vs prior-day value). `computeEngineFacts` surfaces `facts.valueMigration`
(null + warning when absent/malformed) → `valueMigration` payload key in the
analyze/update prompts with a data-ownership bullet; the "value-migration ... on the
Market Profile chart" vision read left both prompts (feat-054 vision-exclusivity
conditional added for feat-048). Eval: one code-owned "Prior-day value context" line
(position vs prior VA + drift + streak), best-effort so it never blocks an entry
check. Registry rows added (`daily_va`; `tpo_png` re-scoped to distribution shape
only). ./init.sh green: typecheck, lint (0 errors), 872 tests, build.

**Data Todos refinement: no anchor validation, value migration is the point
(2026-07-24, operator follow-up).** The doctrine's balance-area "rule" is just the
third-party auto-anchoring study's own documentation, so the verify-the-anchor framing
added in the previous correction is out too. Item 3 (feat-048) now centers on the
computable value-migration read — POC drift direction/pace, higher/lower-value day
sequences, day-over-day overlap, acceptance outside the prior area — and what it means
for price; item 7 (feat-052) keeps anchor metadata as coverage/framing (which sessions
the balance area spans, rotation traverse) with no disagreement-flagging. feat-048 and
feat-052 descriptions rewritten to match. Docs/backlog only.

**Data Todos correction: balance-area anchoring (2026-07-24, operator report).** The
report claimed the balance-area VbP was *manually* anchored; in fact a custom
third-party Sierra study anchors it automatically. Items 3 (daily value-area history,
feat-048) and 7 (profile anchor metadata, feat-052) reframed: the value of the exports
stands, but the engine's job is to independently verify the third-party auto-anchor
against the doctrine's overlapping-value rule (and flag disagreement in the briefing),
not to police a manual anchor. Item 7's ACSIL prompt now tells the study to read the
anchor the profile is actually using rather than assume a fixed/manual one; feat-048
and feat-052 descriptions updated to match. Docs/backlog only, no code changes.

**Enriched execution bars (2026-07-24, feat-047).** Data-todos item 2. Sierra side:
`D:\SierraChart\ACS_Source\ExecutionDataExporter.cpp` now appends
`Volume,BidVolume,AskVolume,NumberOfTrades` (whole numbers, from
SC_VOLUME/SC_BIDVOL/SC_ASKVOL/SC_NUM_TRADES; delta convention = AskVolume − BidVolume,
noted in the source). **Needs a DLL rebuild in Sierra (Analysis >> Build Custom Studies
DLL) before the next gekko deploy — `parseExecBars` hard-rejects the old 7-column
header by design.** The execution chart uses 750-VOLUME bars, so the Volume column is
~flat (kept anyway: validates the bid/ask split, marks the in-progress partial bar);
participation reads are bar-count-at-price / trade count / delta magnitude, never
per-bar volume. Gekko side: `ExecBar` carries the four columns + derived `delta`; new
`lib/engine/barFlow.ts` (engine-computed cumulative delta, divergence at the fresh
price extreme, climax prints at ≥50% one-sided volume, avg trade size) surfaced as
`deltaTelemetry.flow` in both analyze and eval prompts; new
`lib/engine/stallConfirmation.ts` annotates every absorption candidate with a
code-owned stall check (longest consecutive bar run overlapping the stack ±1 pt —
≥3 bars with net close-to-close progress within max(5 pts, stack height) confirms).
The analyze/update prompts and chart-reading doctrine now treat `stall.confirmed` as
absorption (the "execution chart shows price STALLED" vision read left the prompt —
the feat-054 vision-exclusivity gate flipped and enforces this); the eval recent-bars
table gained `delta,volume,trades` columns. Fixtures (`chart-data/` + the two
comparison bundles) enriched deterministically. `./init.sh` green: typecheck, lint,
848 tests, build.

**Numeric TPO / Market Profile export (2026-07-24, feat-046).** First of the
data-todos export backlog. Sierra side: new ACSIL study
`D:\SierraChart\ACS_Source\GekkoTpoDataExporter.cpp` (own `SCDLLName`, build as its own
DLL) exporting `C:\gekko\export\tpo.data.md` — Metadata (Session Date/RTH-ETH/period/
tick/bin) + Summary (TPO POC, VA, IB, session extremes via `GetStudyProfileInformation`)
+ fenced csv `Price,TPOCount,Letters`. Counts come from the TPO Profile Chart study
(`GetVolumeAtPriceDataForStudyProfile` — `.Volume` is the TPO count, confirmed against
the Sierra support board); ACSIL does not expose letters, so they are reconstructed from
the chart bars inside the profile's own `m_BeginIndex..m_EndIndex` range (A–Z then a–z).
**The study still needs building in Sierra (Analysis >> Build Custom Studies DLL, this
file alone) and adding to the TPO chart with its study reference + bin size set to match
the TPO study's price increment.** Gekko side: `tpo_data` manifest field →
`raw_bundles.tpo_data_ref` (migration 20260724090000, applied), uploader watches
`tpo.data.md`, analyze/update loads fetch it best-effort (missing ref = pre-study
bundle, silent; engine degrades to `tpo: null` + warning). `lib/engine/parseTpo.ts`
hard-rejects drifted exports; `lib/engine/tpoFacts.ts` computes single-print zones
(contiguous count==1 runs, tails at the extremes excluded), poor high/low (2+ TPO shelf
at an extreme), POC prominence (≥1.5× median bin count) and IB. Surfaced as the
`tpo` payload key; the "TPO single prints / poor highs-lows" vision read left both
prompts per the feat-054 vision-exclusivity gate (screenshot keeps only value-migration/
distribution shape). Fixture `chart-data/tpo.data.md` generated per-period so letters ↔
counts ↔ summary agree and every detection has a positive + negative case.

**Direction-aware objective anchor separation (2026-07-24, PR #86, operator request).**
The 2026-07-24 morning briefing bracketed one contested zone with a long reload at
VRange Low 28436.75 and a short reoffer at the Rip 28453.90 — 17.15 pts apart, opposite
directions — and passed the flat 5-pt distinct-anchor floor. `assertDistinctObjectiveAnchors`
is now direction-aware: opposite-direction Entry A prices must sit ≥ 25 pts apart
(`MIN_OPPOSING_ENTRY_SEPARATION_PTS`), same-direction objectives keep the 5-pt
distinct-border floor. `DISTINCT_ANCHORS_RULE` (shared analyze + update prompts) states
both floors. Clarified in-session: the 5-pt rule is objective-to-objective separation;
distance-from-current-price is the separate 1-pt `MIN_ENTRY_STANDOFF_PTS` proximity gate.

**Long/Short position-eval buttons (2026-07-24, operator request).** Next to "Eval" in
the entry-eval column, new "Long" (bmw-blue accent) and "Short" (new `red-accent` Button
variant — direction color, not danger) buttons: same eval-task, but a hold-or-exit read
on the operator's OPEN POSITION at the current price, for deciding whether to exit at
the current level. Flow: the button POSTs `{direction}` to /api/eval/run
(`TriggerRunButton` gained an optional JSON `body` prop; the route validates with zod —
unknown direction → 400 before any bundle request, body-less/malformed POST stays the
plain entry check) → `eval-task` payload `direction` → `runEval(deps, {position})`. In
position mode the entry-level proximity gate is bypassed (synthetic evaluated level =
current price in the declared direction, `nearEntry` true), active levels render as
context only, the no-active-levels LLM-skip shortcut is exempted, and the prompt reads
ENTER = hold / WAIT = unclear (nextSignal) / NOT_VALID = exit at current price.
`enforceEvalFacts` treats the direction and current-price level as code-owned
(overwrites model drift with a warning), keeps the count-only initiative gate (an
unsupported ENTER still demotes to WAIT), and always persists
`evaluated_level_id = null` — position rows link no `entry_levels` row, so `EvalStrip`
falls back to a direction-colored "Current price" level cell on level verdicts without
an embedded level. Tests: 7 new (route forwarding/validation, position pipeline,
enforcement drift, gate demotion, no-levels exemption) — 768 total. `./init.sh` fully
green (typecheck / lint / test / build). Merged with PR #83's superseded-eval empty
state: the superseded message now also offers Long / Short for position checks (which
do not depend on the briefing's levels).

**Data Todos: eval-task applications + range fix (2026-07-24, operator request, branch
`claude/chart-export-analysis-a5lx6v` restarted from main after PR #85 merged).** The
report only mapped the new exports onto the analyze task; each item now carries an
**Eval-task use** note grounded in what the eval actually consumes (exec CSV, the two
execution delta exports, images -- no profiles/MGI/HTF reach it today): TPO single-print
/ poor-extreme checks at the evaluated level (item 1), the headline eval win of enriched
exec bars -- magnitude-aware recent-bars table, code-owned stall confirmation, true-delta
initiative gate, cumulative-delta divergence (item 2), prior-day value context (item 3),
HTF trend/ATR for position hold-or-exit reads (item 4), node build-quality annotation
(item 5), nearby VWAP band prices as hold/exit context (item 6), code-owned absorption
scan-coverage from delta-export anchors (item 7), indirect only (item 8). The Bundle
exports registry rows for exec_csv and the two delta exports now name their eval
consumers (lib/eval/proximity.ts, lib/eval/evalBundle.ts). Also fixed a renumbering
artifact from the PR #84 conflict resolution: bare ranges had double-shifted to
"feat-047..053" (correct: feat-046..053) in five files, and the feat-054 description's
capability triple read "feat-046/048/046" (correct: feat-046/049/047). Suite green: 804
tests, gate 29/29.

**feat-054 — Prompt–data sync gate (2026-07-24, operator request, same branch as the
Data Todos report).** Quality gate so the feat-046…053 exports cannot undo the PR #79
prompt/data alignment. New `tests/prompt-data-sync.test.ts` (29 offline vitest tests,
rides `npm test` in `./init.sh`): (1) a new machine-parsed "Bundle exports" registry
table in `docs/engine-ownership.md` must cover every manifest field, name only existing
modules, and surface exactly the `factsPayload` keys (both directions); (2) every
backticked engine-fact path in the three prompt builders, three assembled doctrine
prefixes and the built analyze prompt must resolve against the payload computed from
the `chart-data/` fixtures; (3) vision-exclusivity conditionals pair each
screenshot-only instruction with the numeric capability that obsoletes it (TPO reads ↔
a tpo payload key, `meta.htfTrend` pure-vision read ↔ an htf payload key, absorption
stall confirmation ↔ Bid/AskVolume in the exec CSV header) and assert presence while
absent / absence once present; (4) char budgets on the cached prefixes (20k–36k) and
the fixture analyze user prompt (35k–80k). Gate verified by four mutation runs (registry
row deleted, payload key renamed, unregistered manifest field added, fake tpo fact
injected) — each fails with a targeted message. feat-046…053 now all depend on
feat-054; `docs/data-todos.md` gained a prerequisite section. 794 tests green,
`./init.sh` fully green.

**Data Todos report + export backlog (2026-07-24, operator request, branch
`claude/chart-export-analysis-a5lx6v`).** Reviewed the bundle contract, engine modules
and the analyze trace for gaps in the Sierra chart exports; wrote
`docs/data-todos.md` — eight ranked export upgrades (numeric TPO, enriched execution
bars with volume/bid-ask/trade count, daily value-area history, HTF bars CSV, delta
column on structural profiles, VWAP SD bands, profile anchor metadata, RTH-only
balance-area variant), each with the target file type/format and a paste-ready Claude
Code prompt for creating/editing the ACSIL study on the trading machine. Added them to
`feature_list.json` as feat-046…feat-053 (`not-started`). The zeroed `onh/onl/ibh/ibl`
MGI fields were ruled a benign export-timing artifact — no action. Docs/backlog only,
no code changes.

**Eval strip scoped to the current briefing (2026-07-24, operator request).** After
generating a new briefing the dashboard kept showing the previous eval verdict — stale
and confusing, since an eval only ever checks the ACTIVE entry levels and each
briefing/update replaces that set. `loadDashboardData` now withholds the latest
`eval_results` row when it predates the current `briefings` row (raw-row `created_at`
comparison, so it applies even when the payload fails schema validation; withheld only
when both timestamps parse and the eval is strictly older — degrade to showing, never
hide fresh data on malformed rows) and surfaces the new `evalSuperseded` flag; the
`EvalStrip` empty state distinguishes it ("The last eval predates this briefing — press
Eval to check the current entry levels"). No migration — derived at read time, so
existing stale rows are cleaned up retroactively. Tests: five new `loadDashboardData`
cases (superseded, superseded-despite-invalid-payload, no-briefing keep, unparsable
timestamp keep, fresh keep; 765 tests). `./init.sh` fully green.

**On-demand bundle uploads (2026-07-23, operator request).** Uploading a bundle on every
~15s Sierra rewrite made no sense when briefings are on-demand only. New fresh-bundle
handshake: a dashboard run button (Briefing/Update/Eval) now inserts a pending row in the
new `bundle_requests` table (migration `20260723090000`, RLS-no-policies, service-role
only) and triggers its task with that `bundleRequestId` in the payload; the uploader —
rewritten from a chokidar folder-watch to a poll loop — asks GET /api/ingest every
`UPLOADER_POLL_MS` (default 7s) whether a recent pending request exists and only then
bundles + POSTs (a settle check skips a tick while any export file changed within
`UPLOADER_DEBOUNCE_MS`, so a mid-rewrite folder is retried next poll); POST /api/ingest
marks all pending requests fulfilled with the stored bundle id (best-effort, after
commit); the task meanwhile polls the request row (`trigger/freshBundle.ts` →
`lib/bundleRequests`, 3s interval, 2 min cap) and commences once fulfilled — timeout or a
missing row degrades to a logged warning + the latest stored bundle, so a dead uploader
never bricks the buttons ("bundleWait" outcome in run metadata). New `lib/bundleRequests`
module (pure logic + injected deps + service-role wiring); `lib/uploader/scheduler.ts`
and the chokidar dependency removed; uploader pending check in `lib/uploader/pending.ts`.
Tests: `bundleRequests`, `uploader.pending`, `ingest.pending.route`, migration guards,
and the three run-button route tests now assert request-then-trigger ordering (761 tests).
`./init.sh` fully green (typecheck / lint / test / build).

**Entry chase-side gate (2026-07-23, operator bug report).** A fresh briefing generated a
LONG objective 30 pts ABOVE current price — a breakout chase the doctrine forbids
("do not chase … breakouts above a ceiling cluster") but nothing enforced: the standoff
gate only set a MINIMUM distance from price, with no side/maximum check (the old standoff
test even blessed the exact geometry: long @ 30250, price 30220). Fix in
`validateBriefing.ts`: new `MAX_ENTRY_CHASE_PTS = 5` — an entry may sit at most 5 pts
beyond current price in the trade direction (long above / short below; the allowance
covers contested-border anchors). Hard (throws → regenerate) on the analyze path via the
existing `enforceEntryStandoff` flag; advisory warning on the update path, where price
trading through a standing entry is stale-plan information, not grounds to reject the
revision. Analyze prompt's `entryStandoffRule` now carries the ENTRY SIDE clause with the
live threshold; `output-objective.md` states the side rule qualitatively (long anchors
at/below price, short at/above). Tests: new chase-side describe block (both directions,
contested-border allowance, update-path demotion, no-meta skip); `runAnalysis` mock
briefing re-anchored relative to the fixture bundle's real current price. `./init.sh`
fully green (738 tests / typecheck / lint / build).

**Terrain rework: campaign-scale zones (2026-07-22, operator doctrine).** Operator reviewed
the 07-20 trace terrain: 16 zones (four consecutive slices all labeled "Lower Kill Box
(void)", slivers to 22 pts) where doctrine expects ~5-6 — the map should divide the chart
into the zones where MAJOR moves start/end, not every micro rotation. Root causes: the
feat-040 G1 "void-splitter" rule promoted every unpromoted daily/Tier-1 MGI outside the
rotation profile's range to a zone border (10 of the 16 zones were bare-MGI slices of one
traversal), and recall-favoring session-level promotion crowded borders 17-56 pts apart.
Operator doctrine corrections: (1) bare MGI in a void is NEVER a border — a border needs
MGI + volume confluence; (2) MGI clusters merge into one composite band and clustering
RAISES significance; (3) the balance-area profile is the SENIOR read — classify anchors
against BOTH profiles, balance-area promotion = AAA, rotation-only = A (like PM-H vs PW-H);
OR Mid is tier 2, Week Open tier 1 (already so in mgiPriority.ts). Implemented in
`terrainZones.ts`: dual-profile `classifyBorder` (senior profile decides when decisive —
hard promotion or Magnet invalidation; rotation fills in otherwise), void-splitters retired
(waypoints stay in `levels` for rungs), `CompositeBorder` gains significance/tier, new
class-aware consolidation (`aTierMinSpanPts` = 60: the weaker of an A-involved pair closer
than the floor demotes to a level, recorded in `terrain.demoted`; AAA pairs exempt), zone
volumeClass reads the balance-area profile where rotation has no coverage, data edges track
COMBINED coverage with a sliver guard at campaign extremes. Prompts + chart-reading.md
updated (AAA/A significance, `terrain.demoted`, MGI-composite-edge border language removed).
Results: 07-20 live bundle 11 zones → **5** (all-AAA borders: Monthly VWAP, VRange+3/PDH,
OR Mid, PDC); 07-18 fixture 10 → 7 keeping the Gem's PDL/VRange−2 foundation shelf (AAA)
and demoting exactly the confetti (OR Low, PDH, PDC); 07-14 fixture → 7, IBH/IBL kept. Live
no-persist analyze on the new map: entry separation 20 → 37.75 pts, primary R/R 0.35
(pre-restructure) → 1.94, T3 now traverses the full 382-pt void to the campaign floor.
Judgment call surfaced and RESOLVED by operator same session: consolidation ranking is now
tier-FIRST (then significance class) — a Tier-1 A border survives a Tier-2 AAA neighbor, so
the live Kill Box floor is the tier-1 Week Open / 24 VWAP band (28747.75), with PDC/PDL
demoted to levels. Gem fixture maps unchanged by the reorder. 733 tests green (7 new;
gem-comparison zone-count guard now 5-8 with anti-confetti ceiling). Branch merged to main
via squash PR.

**User-prompt consolidation (2026-07-22, follow-up to the restructure below).** Moved the
static doctrine out of the user-message builders into the cached per-task prefixes, so each
rule now has exactly one home: `EVAL_DECISION_LOGIC` + the verdict-structure block moved from
`lib/eval/prompt.ts` into `knowledge/system/output-eval.md` (minus two sentences chart-reading/
patterns already carry in the same prefix); `TACTICAL_LADDER_RULE` + the entry-priority and
stop-placement rules moved from `lib/analyze/prompt.ts` into
`knowledge/system/output-objective.md` (wording preserved verbatim); the "Target rungs" tail
was collapsed to a pointer in both briefing builders. Only per-run rules remain in the user
message: DISTINCT ANCHORS (live threshold), entry standoff (live price), campaign-boundary
check, data edges, staleness. Verified two ways: (1) full suite green (726 tests; eval prompt
tests retargeted to `loadDoctrine('eval')`); (2) live A/B dry-run against the real 2026-07-20
bundle with all DB writes stubbed — origin/main prompts vs restructured prompts, same model
(`x-ai/grok-4.20`), same bundle. Both runs produced doctrine-conformant briefings: one
entry/stop per objective, full ladders, Campaign Boundary Override explicitly evaluated (both
correctly declined it at 21 pts off the Week Open wall), same directional read (continuation
short primary / fade long secondary). R/R gate warnings appear in BOTH runs (baseline primary
0.35, new primary 0.86) — a property of the compressed engine map on this stale bundle, not
the prompt change. One n=1 observation to watch: the new run's `macroGoal` texts named the
campaign border while the entries sat on the adjacent contested border (validation passed;
plausibly the contested-border rule at work, price was 1.25 pts off that border). Eval
dry-run: correct `NO_ENTRY_NEAR` with the stale flag in the reason. Prefixes after the move:
~28.4k (analyze) / ~28.1k (update) / ~28.8k (eval) chars — the eval user message shrank by
the entire decision-logic block, now billed at cached rates instead of per run.

**System-prompt restructure (2026-07-22).** Operator reviewed the trace extract
(`docs/traces/analyze-task-2026-07-20/system-prompt.md`) and flagged the shared doctrine
prefix as a Frankenstein: maintainer commentary, repo file paths, code comments, chat-Gem
vestiges and all three output contracts shipped to every task. Restructure:
(1) `loadDoctrine(task)` now assembles a per-task prefix — `output-schema.md` split into
`output-briefing.md` / `output-update.md` / `output-eval.md` + shared
`output-objective.md` (analyze/update only), so eval-only gate prose no longer leaks into
analyze runs (each prefix still run-stable → prompt cache unaffected, asserted by a new
determinism test). (2) Model-facing knowledge files stripped of maintainer content — file
paths, feat-refs, changelog notes, the "unwired stop gap" aside, drift-guard commentary —
now guarded by a new no-repo-paths test in `tests/knowledge-restructure.test.ts`; the
maintainer half (module ownership map, Zod-wins note, assembly table) moved to
`docs/engine-ownership.md`, which the feat-032 drift guard now targets instead of
constraints.md. (3) Chat-era vestiges removed: discipline-enforcement reply scripts,
markdown-formatting UX rules, phrasing templates recast as narration guidance for JSON
prose fields. (4) Un-observable instructions dropped (VIX, news calendar, options/dark
pool) and the two doctrine "DOM" references replaced with delta-telemetry cues — the eval
prompt explicitly bans citing the DOM while patterns.md told the model to look for a "DOM
shift". (5) Balance-Area definition deduped: doctrine keeps it, the analyze user prompt
now references it. Prefixes: old shared ~32.8k chars for every task; new ~27.3k (analyze) /
~27.1k (update) / ~25.5k (eval). Also fixed: the prose `EvalResult` had drifted from the
Zod contract (missing `checks`/`nextSignal`/`caution`) — the trace doc under `docs/traces/`
is left as a historical record. 726 tests green (48 files); `./init.sh` passes end-to-end.

**Count-only initiative gate (2026-07-20, PR #73, commit `0375c41`).** Operator report: a
check-eval showed all five checks pass but verdict WAIT. Diagnosis: the model returned ENTER
long; the code sign gate demoted it (mean −2.95, 14 red extremes vs 0 blue, last close at
0.04 of the 20-bar range so the absorbed-flush exception did not lift). The demotion itself
was right, but the operator flagged that the gate still consulted the window MEAN sign at
all — doctrine says initiative is a COUNT, not a mean (PR #71 had only added counts as a
second AND-condition). `validateEval.ts` now demotes purely on counts: counter side must
out-print the entry side AND cluster ≥ `RED_BUILDING_MIN_BARS` (3, imported from ripStatus)
so rogue single prints never demote; the mean is display context only. This also closes the
inverse hole where mild entry-side bars dragged the mean to neutral and vetoed a genuine
counter-extreme cluster. Absorbed-flush exception unchanged. 678 tests green (2 new).

**Area-exit absorption exception (2026-07-20, PR #74, commit `692de8c`).** Follow-on
operator doctrine, same session: absorption is volume delta + price STALLING where the
delta occurred ("a few bars chop around the stack area — that's how it gets built"), and
counter-initiative only matters when price is "exiting the area". Iterated through three
framings with the operator: (1) bars-since-extreme-extension — rejected, a 2-tick lower low
doesn't matter; (2) delta-profile stacks as the area — rejected after checking the live
bundle: `scanAbsorption` found ZERO candidates on the reported eval's exports, so a
stack-required lift would rarely fire; (3) shipped: closes define acceptance. The exception
now lifts the demotion unless the latest bar CLOSED beyond the earlier window's accepted
closes (new telemetry fields `recentRange.priorMinClose`/`priorMaxClose`, excluding the
latest bar) in the flush direction, tolerance `AREA_EXIT_TOLERANCE_PTS` = 0.5 (two ticks).
Wicks/sweeps past the extreme never exit; grinds (every bar a new low close) still demote.
Replayed on the live bundle: today's WAIT stands correctly — the final bar closed at a new
window-low close (28765.75 vs prior floor 28773.56), price still accepting lower at
snapshot. Also updated `knowledge/system/output-schema.md`, which still described the
pre-#73 mean-sign gate. 681 tests green (3 new).

**Eval warnings persisted + surfaced (2026-07-20, PR #75, commit `161c85b`).** Closed the
presentation gap: `eval_results.warnings` (jsonb string[], migration
`20260720090000_eval_result_warnings.sql`, applied to the live DB) now stores every warning
the run accumulated — enforcement coercions, staleness, degraded inputs — at both persist
sites; null on clean runs. The dashboard eval card renders them as a warning-toned
"Enforcement" callout above the condition checks, so a code-demoted WAIT above all-pass
checks explains itself. Pre-migration rows / malformed jsonb degrade by omitting the
callout (`parseEvalWarnings`). 685 tests green (4 new). Remaining nit (not done): the
persisted `reason` still reads as the model's pre-demotion prose; the Enforcement callout
makes the contradiction legible, so no reason rewrite was implemented.

**Contested-border entry doctrine (2026-07-20, PR #77, commit `f87c6a2`).** Follow-on to
PR #76: `entryStandoffRule` in the analyze prompt no longer tells the model to always defer
to the NEXT border when the ideal one is contested. It now PREFERS the contested border as
the Entry A anchor when (1) it is significant structure (Tier-1 campaign border, composite
border band, or balance-area-profile structure — not a lone minor level) AND (2) the
execution chart shows a sustained fight there (stalling bars of two-sided trade, repeated
tests, or a building absorption stack — not a first touch or clean traversal). Falls back
to the next structural border otherwise; if the border price itself sits inside the 1-pt
floor, anchor on the entry-side band member that clears it. Prompt-only; the hard
`enforceEntryStandoff` gate is unchanged. Analyze-only — the update prompt never carried
this rule.

**Entry standoff relaxed 15 → 1 pt (2026-07-20, PR #76, commit `49b09ce`).** Operator
reversed the PR #72 standoff: near-price entries are allowed again; `MIN_ENTRY_STANDOFF_PTS`
dropped from 15 to 1, so `enforceEntryStandoff` now only rejects a fresh entry pinned
exactly where price already trades (within 1 pt). Prompt rule and error message interpolate
the constant, so `validateBriefing.ts` was the only source change; tests updated (at-price
case moved inside the 1-pt floor, new 2-pts-away-passes case). Update path stays exempt.
686 tests green.

**Briefing entry anchoring (2026-07-20).** Operator report: briefings kept planting an
objective entry basically at current price, and same-price opposite-direction entries on BOTH
objectives. Data confirmed it — 3 of 5 briefings that day were straddles (short + long at
29109.5 twice with price ~2 pts away; short + long at 28908), i.e. single-border fixation:
the whole tactical picture collapsed onto the border price was contesting. Root causes:
(1) `TACTICAL_LADDER_RULE` literally read "Entry A (Ideal) at the border; Entry A (Fade) at
the border" — one shared border; (2) no cross-objective validation (the single-entry trim of
2026-07-18 only fixed the same collision *within* one objective). Fix: prompt doctrine now
requires DISTINCT ANCHORS (shared rule, analyze + update) and an analyze-only ENTRY STANDOFF
(operator decision: entries must sit ≥ 15 pts from current price; the contested-border
decision belongs to the eval, and the model must anchor the next structural border instead).
Enforcement in `validateBriefing.ts`: hard `BriefingValidationError` (regenerate) when the
two Entry A prices are < 5 pts apart (`MIN_OBJECTIVE_ENTRY_SEPARATION_PTS`) or, on fresh
analyze runs only (`enforceEntryStandoff` — updates are exempt because price approaching a
standing plan's entry is the success path), when an entry is < 15 pts
(`MIN_ENTRY_STANDOFF_PTS`) from code-owned current price. Plus an advisory warning when an
entry price matches no engine anchor (new `engineAnchorPrices()`: zone borders + level
verdicts + composite band members, minus data edges — catches free-floating prices like the
28976.54-vs-28976.13 drift). 676 tests green (9 new), full `./init.sh` pass.

**Dashboard layout fixes (2026-07-19 morning, PR #63, commit `6594b0b`).** Operator-requested
UI changes: (1) the floating status flyouts under the nav trigger buttons persisted forever
after a successful run — `trigger-run-button.tsx` now resets to idle 5s after completion
(failure notes still persist); (2) removed the execution chart + Campaign Zones strip from the
page and deleted the unused `execution-chart{,-section}.tsx` components (the `buildExecutionChart`
lib model and its tests remain); (3) `EvalStrip` moved into the former chart column with its
condition checks always visible (no more `<details>` expander); (4) body columns are now equal
width (`xl:grid-cols-2`); (5) the meta strip spans the full row above the columns as a single
cell row (price / rip status / HTF trend / run meta). `./init.sh` green — 667 tests, 0 lint
errors, build passes. Follow-up (PR #64, commit `e7c7539`): the eval verdict chip is now a
solid fill (black label on the status color) and the whole eval card carries a status-colored
`border-t-2` accent, mirroring the objective cards' direction accent. Further operator
iterations same session: PR #65 renders the eval condition checks as a Condition/Status/Note
table matching the objectives' levels table; PR #66 drops the "Latest Entry Eval" label and
the "Conditions" header row; PR #67 replaces the unclear "Targets" cell with the evaluated
entry level (embedded from `entry_levels` via `evaluated_level_id` in the dashboard query;
label + price colored bmw-blue/m-red by direction, em dash when no level matched); PR #68
makes the tricolor stripe under the nav full-width like the footer's; PR #69 adds the
`UpdateGlow` client wrapper — a ~2s bmw-blue box-shadow pulse on the meta strip / tab column
(new briefing id) and eval card (new eval id) when `router.refresh()` swaps in fresh data
after a trigger run (no glow on initial load; respects prefers-reduced-motion). Operator
reported no glow on a live Check Entry: headless-Chromium end-to-end test proved the glow
fires (run complete → refresh → class applied), root cause was the long-running `next dev`
watcher (pts/18, running since Jul 16) no longer picking up file changes — Turbopack's lazy
compile serves new code to fresh page loads but never pushed it to the already-open tab.
Remedy: restart the dev server + hard-reload the tab. PR #70 additionally keeps a steady
(non-pulsing) glow under prefers-reduced-motion instead of disabling the cue.

**feat-044: eval absorption facts + sequence-aware sign gate (2026-07-18 late night).**
Operator report: the eval said "No confirmed red absorption followed by blue continuation at
29565.25" on a tape (bundle `1c524056`) where four -3/-4 bars flushed through the long border
to 29536.75, stalled, and blue bars recovered 40+ points — textbook red absorption. Three
root causes, all fixed:

1. **The eval had no absorption evidence.** `scanAbsorption` ran only in analyze; the eval
   judged absorption from the exec PNG + a 20-bar telemetry summary. The eval now loads the
   two execution delta exports best-effort (`loadLatestBundle` mode `'exec-plus-delta'` —
   missing/failed exports degrade to warnings, never block an entry check), scans them, and
   renders candidates into the prompt as code-owned facts. The recent execution bars (OHLC +
   delta intensity, Leg VWAP excluded) also render as a CSV block so the model judges the
   flush→stall→response sequence directly.
2. **The window-mean sign gate structurally vetoed absorption entries** (catch-22: the mean
   is guaranteed red right when an absorption long confirms; when it flips, price has left
   the entry window and "moved past without confirming" fires instead). New `DeltaTelemetry`
   fields — `recentBlueExtremeCount` and `recentRange.position` (where the last close sits in
   the recent bar range, 0 = low, 1 = high) — power `absorbedFlushException` in
   `validateEval.ts`: aggressor-extreme prints in the window + last close recovered to the
   entry-side half of the range lift the ENTER→WAIT demotion (kept for genuine
   counter-initiative). Eval prompt doctrine + `knowledge/doctrine/patterns.md` +
   `output-schema.md` rewritten: judge initiative from the bar SEQUENCE, never fail a Delta
   check solely on the flush-colored mean, and absorption at the border ALONE satisfies an
   Absorption check — continuation strengthens but never gates (operator: by the time
   continuation is confirmed, price is out of the window).
3. **`MIN_QUALIFYING_FRAC` 0.8 → 0.7**: the real sell stack under the entry (29542.5–29549.25,
   bins -61/-92/-26/-72) is 3-of-4 qualifying = 0.75 and was rejected; one weak interior bin
   now tolerated per operator doctrine.

Replay of the misjudged live bundle through the new code: sign=negative (mean -0.6), 4 red
extremes, position 0.82 → long gate lifted; the sell stack at 29542.5–29549.25 surfaces as a
candidate. Note the fixture characterization changed: the July-9 full-rotation fixture now
yields one buy stack at 29830.5 (tests updated to assert it). Evidence: ./init.sh green,
667 tests (12 new).

**feat-043: single-entry tactical ladder + eval DOM fix (2026-07-18 night).** Operator
directives after live eval use: (1) an eval ENTERed short at 29565.25 (primary Entry B
Add-on) where the operator reads the long fade (secondary Entry A at the same price) — the
proximity gate cannot disambiguate opposite-direction rungs at an identical price, and the
operator never trades Entry B anyway, so Entry B is removed: `TACTICAL_LADDER_RULE` /
`ENTRY_STOP_DOCTRINE_RULES` now mandate exactly ONE entry + ONE stop per objective,
`output-schema.md` updated, and `enforceSingleEntry` in `validateBriefing.ts` trims any
extra rungs/stops (keeps the Entry A-labeled rung + worst-case protective stop, warns)
before R/R recompute — schema stays `.min(1)`, the ceiling is prompt + trim. The two live
active Entry B `entry_levels` rows were deactivated in Supabase; the dashboard still shows
the old briefing's ladder until the next briefing/update regenerates. (2) The eval prompt
demanded "DOM confirming" but no DOM data ships in a bundle — decision logic now keys on
delta telemetry + execution chart with an explicit never-cite-DOM instruction.

**Proximity recency bugfix (2026-07-18 night, PR #60).** Operator-reported: when price traversed BOTH
active entry levels inside the proximity window, the eval compared against the primary
objective even though price had more recently been at the secondary. Cause: `assessProximity`
collapsed the recency window into one [low, high] hull, so both levels scored effective
distance 0 and the tie-break fell to snapshot distance — recency was never considered. Fix:
the gate now takes the recent bars themselves (`filterRecentBars`) and measures per-bar; each
level tracks its most recent in-threshold contact (snapshot = most recent of all) and
nearest-selection orders by that recency first, falling back to the old distance ordering when
nothing is within threshold. Side effect (more correct): a level in an un-traded gap between
bars — inside the old hull — no longer counts as near. `computeRecentBarRange` remains for the
prompt's reported bar span. Regression tests in `tests/eval.proximity.test.ts`.

**Terrain sees the whole theater + Gem loop (2026-07-18 evening, PRs #57–#59).** The day's
morning briefing shorted **29587** — the rotation profile's bottom data bin (session low), not
structure — while the real floor (PDL 29567.50 / VRange −2 29565.25) was invisible ("anchor
outside the volume profile range"). The operator replayed the session through the original Gem
(Gemini 3.1 Pro, extended thinking) which produced the correct read; output preserved in
`chart-data/comparison-examples/example2/` (with the 09:39:45 input bundle in `data/`), analysis
in `docs/gem-comparison-2026-07-18.md` (findings G1–G4).

- **feat-040 (PR #57)**: `terrainZones.ts` — anchors beyond the rotation profile's range
  classify against the balance-area profile (`BorderVerdict.source`); still-unpromoted
  out-of-range Tier-1/daily anchors split extension voids as kind-`mgi` composite borders
  (clipped to the campaign envelope); profile data edges only become borders when nothing else
  partitions the extension and are reported via `terrain.dataEdges` — the prompts forbid
  trading them and add a Campaign Boundary Override check when price is within 50 pts of a
  Tier-1 border. New regression harness `tests/terrain.gemComparison.test.ts` over both
  preserved Gem bundles: example2 now yields the Gem's floor read (PDL/VRange−2 trench,
  VRange−3 splitting the lower void, no 29587); the 07-14 map keeps its 8 zones and gains the
  Gem's ONL 29303.5 border.
- **feat-041 (PR #58)**: `TACTICAL_LADDER_RULE` in both prompts (Entry A + Entry B with
  separate stops; full T1→T2→T3 whenever rungs exist) + non-fatal `ladderWarnings` in
  `validateBriefing` (schema floor stays `.min(1)` for OpenAI strict mode).
- **feat-042 (PR #59, Gem loop-2)**: first regenerated briefing still chased the floor breach
  as primary Entry A with a 2.25-pt stop inside the entry's own composite band →
  `ENTRY_STOP_DOCTRINE_RULES` (Entry A = reoffer at the nearest FAILED structure; Tier-1
  breach is at most Entry B; stops clear the whole composite band + buffer) + a <5-pt
  degenerate-stop warning.
- **Loop-2 briefing `5374e794` on the exact Gem snapshot bundle (price 29592.5)**: primary
  short Entry A = IBL 29639.25 reoffer (stop 29652, R/R 5.8) + Entry B failed retest under
  29565.25; secondary long Entry A = PDL/VRange−2 flush-and-reload (stop 29552) + Entry B IBL
  reclaim, full ladder 29699.11 → 29745.5 → 29785.75. Matches the operator-endorsed Gem read;
  only divergence is judgment, not structure: gpt-5.6-terra kept the short primary (override
  evaluated and rejected — "no exhaustion/reload visible"), where the Gem saw the flush-reload
  and flipped the long primary.
- Ran via local trigger.dev dev server against live Supabase; synthetic replay bundle removed
  afterwards. `./init.sh` green on main: 647 tests (48 files), typecheck/lint/build clean.
- **Not deployed**: production trigger.dev deployment still predates all of this (v20260621.1);
  the briefings above ran on a dev session. Deploy when ready to activate (also activates the
  feat-039 cleanup schedule).

**Scheduled bundle cleanup — feat-039 (2026-07-18, branch `feat-039-cleanup-bundles`).**
Sierra now exports every ~15s (uploader `.env` debounce lowered 7000→1000ms; docs/defaults
aligned in PR #55), landing ~240 raw_bundles/hour of which only briefing/eval-referenced ones
matter long-term. New daily janitor:

- Migration `20260718100000_unused_bundles_fn.sql`: STABLE SQL function
  `unused_bundles_before(cutoff, limit)` — NOT EXISTS on BOTH referencing FKs
  (`briefings.bundle_id`, `eval_results.bundle_id`; both are ON DELETE CASCADE, so a naive
  age-only bulk delete would destroy briefings/evals), cutoff on `received_at`, newest row
  excluded unconditionally, oldest-first. Applied to the live project via MCP and validated
  live: 476 bundles, 462 candidates >24h, referenced + recent rows correctly protected.
- `lib/cleanup/`: `cleanupBundles` orchestration (injected deps) — Storage objects removed
  BEFORE rows (partial failure ⇒ rows survive and retry next run; reverse order would strand
  orphaned objects), column→bucket mapping reused from `lib/ingest/manifest` FILE_FIELDS,
  remove calls chunked ≤100 paths, 200-row batches, 50-batch/run cap with `truncated` flag.
  `realCleanupDeps`: rpc + `storage.remove` + delete-in on the service client.
- `trigger/cleanupTask.ts`: `cleanup-bundles` `schedules.task`, cron `0 18 * * *`
  America/Los_Angeles (after session close), counts in run metadata. NOTE: the declarative
  schedule registers on the next `trigger.dev deploy` (or dev session) — until then the task
  exists but never fires.
- Retention doctrine: an unused bundle is deletable when >24h old. Safe because every reader
  (`current_price`, eval proximity exec-bar window, analyze/update loads) consumes only the
  LATEST bundle; the proximity window is seconds-scale *within* that bundle's exec CSV.
- Also applied the previously-pending `20260718090000_proximity_window_seconds.sql` to the
  live project via MCP (was flagged below as not-yet-applied; eval had been degrading to the
  60s code default).
- Verified: `./init.sh` all green (47 files, 624 tests) — new `tests/cleanup.bundles.test.ts`
  (9 cases) + a feat-039 describe in `tests/migrations.test.ts`.

**Eval proximity gate now consults recent exec-bar high/low, not just the snapshot
(2026-07-18, branch `claude/eval-proximity-check-nuance-smh8m7`).** Operator report: whether
"Check Entry" passed the near-entry gate depended on the timing of the last bundle — a wick
through a level that pulled back between ~30s exports was invisible to the snapshot-only
`|level − current_price| <= 20` check. Changes:

- `assessProximity` now takes an options object with an optional `barRange` (from the new
  `computeRecentBarRange(bars, windowMs)` in `lib/eval/proximity.ts`): a level's effective
  distance is the MIN of its snapshot distance and its distance to the [low, high] span of
  exec bars within the window. Deliberately min-of-distances, NOT a convex hull — a level
  sitting between a far-off snapshot and the bar range is near neither.
- Window is anchored to the LAST bar's timestamp (chart-local times only compared to each
  other; a stale bundle doesn't empty the window — staleness is still surfaced separately).
- Window length is configurable: new `config.proximity_window_seconds` column (migration
  `20260718090000_proximity_window_seconds.sql`, default 60s ≈ two export cycles), read by
  `fetchConfig` with code fallback `DEFAULT_PROXIMITY_WINDOW_SECONDS`.
- The prompt now shows BOTH distances when the wick, not the snapshot, opened the gate
  ("N points away at its closest within the recent execution-bar window … snapshot price is
  M points away") so the model can judge "moved past without confirming"; `runEval` also
  records a warning when the gate passed only via the window.
- Threshold (20 points) unchanged and still code-owned; `validateEval` untouched.
- Verified: `./init.sh` all green (610 tests, incl. new unit tests for range/window
  semantics and two new `runEval` integration tests: wick-pass path + config window
  override). Migration not yet applied to the remote Supabase project (`supabase db push`
  locally, or apply via MCP when authenticated).

**Run-button completion derived from run status — stuck "Queued" fixed (2026-07-17,
branch `fix-run-button-terminal-status`).** Operator report: eval runs sometimes showed
Running → "Queued" → stuck until a manual reload. Root cause in
`app/components/trigger-run-button.tsx`: `useRealtimeRun`'s `onComplete` only fires when
the streamed run has `finishedAt`, but a Realtime frame can carry the terminal status
without it — and `statusLabel` mapped every unrecognized status (including `COMPLETED`)
to "Queued" via its default branch. Fixes:

- Completion no longer relies on `onComplete`: a terminal `run.status`
  (COMPLETED/CANCELED/FAILED/CRASHED/SYSTEM_FAILURE/EXPIRED/TIMED_OUT) is detected
  directly; done/failed presentation is derived at render and `router.refresh()` is the
  only effect (the new react-hooks lint rule rejects setState-in-effect anyway).
- `statusLabel` speaks v4: EXECUTING→Running, DEQUEUED→Starting, WAITING→Waiting,
  DELAYED→Delayed (dead REATTEMPTING branch removed).
- Verified: `./init.sh` all green + live Playwright click-through on the running
  dashboard — Check Entry → eval run → "Run complete — dashboard refreshed" note in ~10s,
  no console errors.

**Objective arrays now `.min(1)` — empty secondary entries crashed analyze (2026-07-17,
branch `fix-objective-min-arrays`).** Two live analyze runs on terra failed with
`secondary objective has invalid R/R geometry: … no entry price`: the model expressed
"stand down on counter-trend longs" as `entries: [] / stops: [] / targets: []`, which
`z.array(...)` accepted and `objectiveRiskReward` then threw on. Fixes:

- `Objective.entries/stops/targets` are `.min(1)` in `knowledge/schema/briefing.schema.ts`
  (covers Briefing AND BriefingUpdate). `minItems` binds at generation time under OpenAI
  strict structured outputs — the pre-existing `keyInflections.min(1).max(2)` proved the
  keyword is accepted, and the live verification run confirmed no pre-call rejection.
- `buildAnalysisPrompt` gains an explicit rule: BOTH objectives carry ≥1 entry, ≥1
  protective-side stop and ≥ T1; a not-yet-actionable secondary is expressed through its
  entry `trigger` conditions, never by omitting geometry.
- Schema tests: `Objective`/`Briefing` reject empty entries/stops/targets arrays.
- Verified: `./init.sh` all green (601 tests) + live dev analyze run on
  `openai/gpt-5.6-terra` (run `run_cmrogcdytd0ba0vom23k2c89s`, ~$0.177) — briefing
  persisted; the secondary came back as a proper conditional Flush & Reload long from
  29256 with the stand-down expressed in the trigger text.

**Entry-eval strip + structured checks (2026-07-16, branch `feat-eval-strip`).** The Latest
Entry Eval no longer sits below the fold as a prose paragraph; it is now a compact strip
directly beneath the meta strip, and the eval's reasoning is structured:

- `EvalResult` schema gains optional `checks` (`EvalCheck[]`: name / pass|fail|pending verdict /
  one-line note), `nextSignal` (what flips a WAIT/NOT_VALID to ENTER) and `caution`; `reason`
  becomes a 1–2 sentence summary. The eval prompt instructs the model accordingly; the
  NO_ENTRY_NEAR coercion in `enforceEvalFacts` drops them with the rest of the level verdict.
- Migration `20260716090000_eval_structured_checks.sql` adds `eval_results.checks jsonb`,
  `next_signal text`, `caution text` (applied to the live project). `persistEval`,
  the dashboard deps select and `DashboardEvalRow` carry them; `parseEvalChecks` validates the
  jsonb and degrades to null (strip falls back to the `reason` prose for pre-migration rows).
- New `app/components/eval-strip.tsx` (`EvalStrip`) replaces the bottom `EvalSection` in
  `app/page.tsx`: cell row (verdict chip + stop + targets + trigger + next signal) plus an
  always-visible condition-chip rail that expands (native `<details>`) into per-condition
  notes, caution and the summary. Keeps the `#eval` nav anchor.
- The latest live eval row was backfilled with checks decomposed from its own reason text so
  the strip demonstrates the structured format; future evals get checks from the model.
- Verified via `./init.sh` (all green) and Playwright screenshots of the live dashboard
  (both the checks path and the pre-migration prose fallback; no console errors).

**Eval triage model → gpt-5.6-terra + Leg-VWAP ban in eval checks (2026-07-16, branch
`fix-eval-triage-model-legvwap`).** Operator feedback on the first structured eval:

- Migration `20260716100000_triage_model_gpt_5_6_terra.sql` moves `config.triage_model_id`
  (default + still-on-default rows) from `anthropic/claude-haiku-4-5` to
  `openai/gpt-5.6-terra` — same price as gpt-5.4, newer, and already serving briefings.
  Applied live; `DEFAULT_TRIAGE_MODEL_ID` in `lib/eval/evalBundle.ts` mirrors it.
- The eval model no longer sees `legVwap` (omitted from the telemetry JSON in
  `buildEvalPrompt`) and the prompt forbids Leg VWAP as a check: at a reversal/reload entry
  price is definitionally on the counter side of Leg VWAP, so "price under leg VWAP" was an
  always-fail momentum condition. "Momentum" removed from the example check names.
  Briefing/update tasks still receive full telemetry (doctrine keeps Leg VWAP as Tier-3
  micro-timing).

**EvalResult schema: optionals → nullables for OpenAI strict mode (2026-07-16, branch
`fix-eval-schema-openai-strict`).** The first terra eval failed before the call ran:
`[Azure] Invalid schema … 'required' is required to be … including every key. Missing
'zone'.` OpenAI strict structured outputs reject any object whose `required` omits a
property; Anthropic tolerated `.optional()`, which is why this never bit on haiku and why
the Briefing schema (no optionals) always worked on terra. Every absent-able EvalResult
field (`meta.zone`, `evaluatedLevel`, `direction`, `trigger`, `stop`, `targets`, `checks`,
`nextSignal`, `caution`) is now `.nullable()` — required key, null value. Prompt says "set
to null" instead of "leave absent"; `enforceEvalFacts`' NO_ENTRY_NEAR coercion and the
no-levels short-circuit emit explicit nulls. A strict-mode walker test in
`tests/briefing.schema.test.ts` asserts every model-facing schema (Briefing,
BriefingUpdate, EvalResult) lists every property as required, so a stray `.optional()`
fails CI instead of the first live call. Verified with a real dev-environment eval run on
`openai/gpt-5.6-terra` (run `run_cmro4l6us7l2x0vn2pytjlaub`: WAIT, 4 model-authored checks,
no warnings, ~$0.098) and a dashboard screenshot.

**Triage → gpt-5.6-luna + absorption-color doctrine + reclaim demoted (2026-07-16, branch
`fix-eval-luna-absorption-doctrine`).** Operator feedback on the first terra eval:

- Migration `20260716110000_triage_model_gpt_5_6_luna.sql` moves `config.triage_model_id`
  (default + still-on-terra rows) to `openai/gpt-5.6-luna` — same 5.6 series, ~2.5x cheaper
  ($1/$6 vs $2.50/$15 per M), vision + structured outputs. Applied live; measured eval:
  $0.037 / 4.9s on luna vs $0.098 / 8.9s on terra. `DEFAULT_TRIAGE_MODEL_ID` mirrors it.
- **Absorption prints in the aggressor's color** (operator doctrine): price falling into
  support absorbs RED — the blue appears after, as the response. The old
  `knowledge/doctrine/chart-reading.md` "Tactical fusion" line literally said long entries
  show "a blue absorption cluster" — corrected there (shared analyze+eval system prefix)
  and in the eval decision logic ("Red aggression absorbed at the border, then blue
  continuation"). The rewritten fusion line also drops "Leg VWAP holds" (same always-fail
  wrong-way condition the eval prompt already bans).
- **Retest/reclaim is never a gate**: strengthens conviction only. Removed the "Structure
  valid but waiting for retest → WAIT" doctrine line and added an explicit never-a-gate
  rule; the model must not fail/pend a check solely because a retest hasn't printed.
- Verified: `./init.sh` green (600 tests, incl. prompt-content pins), live dev eval run
  `run_cmro4vh537r0i0joi9tivi230` on luna — WAIT with Absorption now PASS on the
  aggressor-color read ("Red aggression reached the support area and price held") and no
  Reclaim gate check; dashboard screenshot clean.

**Meta + eval two-column top strip (2026-07-16, branch `feat-meta-eval-columns`).** The meta
strip and the entry-eval strip now sit side by side in one section (`lg:grid-cols-2`,
stacking on smaller screens): left = `MetaColumn` (price / rip-status / run-meta cells, HTF
trend full-width row, and the feat-038 Immediate Tactical Read stacked inside an attached
`<details>` expander); right = `EvalStrip` slimmed to the verdict cell + targets with the
Conditions expander. Stop / Trigger / Next Signal are persisted but no longer displayed
(operator call — display only; the schema, prompt and columns are unchanged). The old
full-width `MetaStrip`/`TacticalReadStrip` components are gone; `#eval` still anchors the
eval column. Verified via `./init.sh` (600 tests) and Playwright screenshots with both
expanders open.

**Dashboard auto-refresh on run completion (2026-07-16, branch
`claude/briefing-auto-refresh-pc3bju`).** The three on-demand action buttons (Run Briefing,
Run Update, Check Entry) previously said "Queued — reload in a minute". They now subscribe to
the queued trigger.dev run via Realtime and refresh the dashboard automatically when it
completes:

- The three POST routes (`/api/briefings/run`, `/api/briefings/update`, `/api/eval/run`)
  return `data.publicAccessToken` alongside `runId` — the run-scoped read token that
  `tasks.trigger` already mints on the handle.
- `TriggerRunButton` uses `useRealtimeRun` (new dep `@trigger.dev/react-hooks@4.5.4`, pinned
  to the SDK version) with `skipColumns: ['payload','output']`, shows live Queued/Running
  status, and calls `router.refresh()` in `onComplete` when the run status is `COMPLETED`.
  Non-`COMPLETED` terminal statuses render the m-red failure note; a broken Realtime
  subscription degrades to the old "reload in a minute" message and re-enables the button.
- Route tests updated to assert the token in the 202 body. Verified via `./init.sh`
  (typecheck, lint, 587 tests, build — all green).

**Gem-comparison fixes F1–F6 (2026-07-16, branch
`claude/windows-uploader-briefing-analysis-b7s6z4`).** The first real Windows-uploader briefing
was compared against the operator's Google Gem run on the same 2026-07-14 bundle
(`chart-data/comparison-examples/2026-07-14/09-45/`, analysis in
`docs/gem-comparison-2026-07-14.md`); findings F1–F6 are now implemented (F7 — the model id —
deliberately left as-is per the operator):

- **F1 — composite borders:** `terrainZones.ts` chain-merges hard partitions within
  `mergeTolerancePts` (16) into `CompositeBorder`s (representative price = deepest local dip,
  label names every member); profile-edge/extreme borders within tolerance are deduped, so no
  more 0.25–3.33-pt sliver zones.
- **F2 — session structure anchors:** `selectAnchorLevels` now includes the whole `daily` MGI
  group (PDH/PDL/PDC, IBH/IBL, OR High/Mid/Low, 24h VWAP) alongside Tier-1 + Rip; ATR stays
  excluded (A9). Analyze/update prompts now allow entries/stops/T1 on any engine level, not just
  zone borders.
- **F3 — campaign envelope:** ceiling/floor anchor to the INNERMOST Tier-1 level at-or-beyond
  the HTF reference extent (outermost span of rotation + balance-area profiles, passed from
  `engineFacts` as `campaignExtent`) instead of the outermost Tier-1 level. On the comparison
  bundle: 30094/28909.75 (PW High/Low, = the Gem) instead of 30975.5/28227.75 (PM High/Low).
- **F4 — acceptance classification:** zone mean volume is judged against the PROFILE MEAN
  (`acceptanceFrac` 0.75) instead of 0.4× the single peak bin; the value area no longer
  classifies as void.
- **F5 — promotion volume floor:** Trench/Wall promotion requires flanking blocks ≥
  `promoteMinVolFrac` (0.5) of the profile mean; kills thin-tail false trenches (VRange −2/−3 on
  the comparison bundle) while real distribution edges (IBL wall) still promote.
- **F6 — overview density:** `Overview` prose sections require ≥2 bullets (schema `.min(2)`);
  the analyze prompt now mandates an Active Pattern Scan verdict in `orderFlowContext`.

Verified: `./init.sh` green (46 files / 587 tests, lint 0 errors, build OK) and the engine
re-run over the comparison bundle now yields an 8-zone, 1,184-pt map with composite borders
"OR Mid / PDH / Rip / Monthly VWAP", "VRange Low / OR Low", "24 VWAP / Weekly VWAP", walls at
IBH 29815.75 / IBL 29567.5 (the Gem's Kill Box + T3), acceptance across 29815.75–29567.5, and
void below IBL — closely matching the Gem's five-zone map. NOTE: old stored briefings with
single-bullet overviews will no longer `Briefing.safeParse` (dashboard shows "run a new
briefing"; update-task asks for a fresh full briefing) — both existing DB rows have 2 bullets,
so nothing breaks today.

**LangSmith telemetry reworked onto the official wrapper (2026-07-16, branch
`claude/langsmith-vercel-ai-setup-sz3nu3`).** Per Caleb's request, feat-030's hand-rolled
OTel pipeline (private `NodeTracerProvider` + OTLP-proto exporter + redacting span
exporter + `experimental_telemetry`) was replaced with LangSmith's documented Vercel AI
SDK integration for AI SDK v5/v6: `wrapAISDK` from `langsmith/experimental/vercel`
(`langsmith@0.8.3`). `lib/observability/telemetry.ts` now builds a `langsmith` `Client`
+ wrapped `generateObject` once per process; `generateStructured` routes through the
wrapped function when telemetry is opted in and passes per-call config (run name =
`functionId`, metadata) via `providerOptions.langsmith`
(`createLangSmithProviderOptions`) — the wrapper strips that key before OpenRouter sees
the call. **Preserved invariants:** (1) env gate unchanged — `LANGSMITH_API_KEY` set ⇒
tracing on (we pass `tracingEnabled: true`, so `LANGSMITH_TRACING` is NOT required),
unset ⇒ fully inert; (2) chart-image redaction — `redactImageParts` now runs in the
wrapper's `processInputs` (parent run: only system/prompt/messages recorded, model/schema
objects dropped) and `processChildLLMRunInputs` (provider-level file parts, incl.
Uint8Array payloads) hooks, recorded-only, never mutating what is sent; (3) per-call
flush via `client.awaitPendingTraceBatches()`, still best-effort. Env var rename:
`LANGSMITH_OTEL_ENDPOINT` → standard `LANGSMITH_ENDPOINT` (API base URL, EU:
`https://eu.api.smith.langchain.com`); `LANGSMITH_WORKSPACE_ID` supported. Dropped all
five `@opentelemetry/*` deps (only feat-030 used them). Tests rewritten:
`tests/observability.telemetry.test.ts` (gating, provider options, redaction hooks) and
the telemetry cases in `tests/llm.generateStructured.test.ts` (providerOptions.langsmith
presence/omission, wrapped-generateObject routing, flush). Verification: ./init.sh green
— 46 test files, 581 tests, typecheck + lint clean, build OK. NOTE for live
verification: the env vars must live on the **trigger.dev environment** (dashboard →
Environment Variables) for deployed tasks; local `trigger.dev dev` reads `.env`.

**feat-038 — the Gem's "Update" prompt reinstated (2026-07-13).** The doctrine's Update
(`gem-files/instructions.md` 113–118: Immediate Tactical Read + "the exact Primary, Secondary,
and Danger Zone sections from the Morning Brief format, updated for current realities") had been
retired in the structured-output rewrite; it's now a first-class vertical mirroring the eval
slice:

- **Contract:** `BriefingUpdate` (+ `TacticalRead`) in `knowledge/schema/briefing.schema.ts` —
  meta + tacticalRead{location, ripStatus, initiative} + primary/secondary/dangerZones. No
  overview/terrain: `lib/update/composeBriefing.ts` composes the stored full `Briefing` from the
  parent's overview/terrain + the fresh alignment, so the dashboard's `Briefing.safeParse` and
  the entry_levels refresh (eval) work unchanged. The smaller schema also sidesteps the
  Anthropic "grammar too large" issue.
- **Pipeline:** `lib/update/updateBundle.ts` `runUpdate` — config (same high-conviction
  routing), latest briefing as parent (`UpdateInputError`, abort-no-retry, when missing or
  unparseable), full bundle load, engine facts, LLM with the parent briefing embedded verbatim
  in the prompt (labeled with age + kind; chained updates inherit transitively), then
  `enforceCodeOwnedFacts` on the composed briefing (inherited-terrain drift off fresh engine
  borders surfaces as the existing warning) and `persistBriefing` with
  `kind='update'/parent_briefing_id/tactical_read` (analyze rows omit the columns — DB default
  `'morning'`).
- **Surface:** `update-task` (trigger/updateTask.ts, parentBriefingId in run metadata, push
  after persist), POST `/api/briefings/update`, "Run Update" outline button in the TopNav,
  UPDATE chip in the MetaStrip, and a three-cell Tactical Read strip beneath it (update rows
  only; degrades to null on bad tactical_read).
- **Doctrine:** `output-schema.md` gained the BriefingUpdate section; the eval NO_ENTRY_NEAR
  prompt regained the Gem's "Run an Update for a full tactical read" hand-off;
  `gem-alignment-audit.md` §C bullet rewritten (the "no update task exists" adaptation is
  history now).
- **Migration `20260713090000_briefing_updates.sql`** applied to the live project BEFORE the
  dashboard select change ships (the explicit column list would 42703 otherwise).
- **Verification:** ./init.sh green — 46 test files, 583 tests, typecheck + lint clean, build OK.

**Gem alignment audit (2026-07-13) — follow-up to PR #37's doctrine-drift finding.**
Full review of every Gem-document rule (`gem-files/`) against the code; findings +
verdicts with file:line evidence in **`docs/gem-alignment-audit.md`**. Fixed (A2–A9):
delta-sign-before-ENTER is now code-enforced in `lib/eval/validateEval.ts` (contradicting
ENTER demoted to WAIT); a void zone above the Kill Box now reads Elevator Shaft
(`terrainZones.positionZones`); T1/T2 target-rung semantics restored to
`knowledge/system/output-schema.md` + the analyze prompt; `keyInflections` bounded
`.min(1).max(2)` (ADHD max-2 rule); orphan "Rip Wall" term removed from `highlight.ts`;
`constraints.md` no longer claims the unwired stop-widening check is enforced;
Stratosphere/Abyss now anchor to the outermost of the profile extremes and the Tier-1
HTF envelope (extension zones classify void; 0.00 placeholders guarded); ATR High/Low
demoted Tier 1 → Tier 2 in `mgiPriority.ts`. Waived by operator: wiring `priorStop`
(A1). Flagged, not changed (operator doctrine calls, see report §B): the >50-pt
Green-Line partition trigger, magnet-geometry symmetry/proximity drift, warn-vs-reject
on the R/R gate, snapshot-based Rip "closes below", and the unchecked `meta.htfTrend`
that drives Asymmetric Initiative.

**Dashboard display overhaul (2026-07-12) — briefing page redesign per Caleb's review.**
Caleb reviewed the rendered briefing (screenshotted headlessly via Playwright + the
dev server) and called out four problems; all fixed and verified visually:

- **Terrain SVG replaced with a real chart:** the hand-rolled SVG map (which a
  placeholder "overnight high unavailable" level at price 0 stretched to a 0–30,975
  axis, crushing everything into an unreadable smear) is gone — deleted
  `app/components/terrain-map.tsx`, `lib/briefing/terrainMap.ts`, and its test. New:
  **lightweight-charts v5** candlestick chart of the latest bundle's
  `execution_bars.csv` with terrain levels overlaid as styled price lines.
  `lib/briefing/executionChart.ts` (pure, tested) builds the model: wall-clock→UTC
  time anchoring, time-dedup, junk-level filtering (price ≤ 0), a ±35%-of-range
  window that lists far-away levels "beyond the traded range" instead of plotting
  them, and autoscale bounds covering every plotted line. The dashboard loader
  gained `fetchLatestExecCsv` (latest `raw_bundles.exec_csv_ref` →
  `bundle-csvs` download, reusing `parseExecBars`); chart failures degrade to a
  fallback note, never the page. Zones render as a color-chip strip below the chart.
- **Objectives are direction-keyed:** `ObjectiveCard` now reads bmw-blue for
  long/bullish and m-red for short/bearish (top accent border, LONG · BULLISH /
  SHORT · BEARISH badge, macro goal + price column in the accent).
- **Prices and doctrine terms pop in prose:** `lib/briefing/highlight.ts` (pure,
  tested) segments briefing text; `HighlightedText` bolds NQ-scale prices
  (years/small counts excluded) and level/zone labels + doctrine vocabulary
  (longest-match-first, word-boundary, case-insensitive) across overview bullets,
  inflections, objective rationale/tables, danger zones, HTF trend, and eval reason.
- **Hero fixed:** the HTF-trend paragraph was rendered as a giant uppercase stat in
  a narrow cell (stretching the hero and leaving the left half empty) — now a
  full-width sentence-case cell; rip status is color-coded (Green/Yellow/Red →
  success/warning/m-red); footer got bottom padding so the fixed AlertsCenter strip
  can't cover the disclaimer.

**Round 2 (same session, from Caleb's annotated screenshots):** the page became a
dense tool view.

- **Header collapsed:** stale banner, "Advisory Only · NQ Futures" eyebrow, the big
  MORNING BRIEFING title, and the Key Inflection Points section are all gone. The
  Run Briefing / Check Entry buttons moved into the top-right of the nav (new
  `size="sm"` button variant; compact status notes float under the header). Nav
  links trimmed to Eval + Settings (the old section anchors died with the tabs).
- **Compact meta strip** under the nav: current price, color-coded rip status, HTF
  trend, and the run meta (date · trigger · model + STALE badge with the full
  warning as its tooltip).
- **Two-tab body** (`briefing-tabs.tsx`, panes stay server-rendered as ReactNode
  props): tab 1 **Objectives** = chart (left, 3fr) + stacked objective cards
  (right, 2fr) + danger zones; tab 2 **Tactical Overview** = the three prose
  groups stacked. Page width widened to `max-w-[1800px]`.
- **Chart restyled to theme voltage:** candles are bmw-blue up / m-red down; ALL
  level price-lines, the level legend, and the off-map list are gone ("get rid of
  all the stuff on chart"). Instead, one shaded band per objective entry —
  entry→stop, blue for long, red for short — drawn by a lightweight-charts
  series-primitive (`EntryZonesPrimitive`, canvas fillRect behind the candles),
  with a solid edge on the entry level. Model builder reworked accordingly
  (`buildExecutionChart(bars, objectives)`), tests rewritten.
- **All times are Chicago (CME):** `fmtDate` renders `America/Chicago` with a "CT"
  suffix; the chart axis shows the CSV's wall-clock (which is Chicago) via the
  wall-clock→UTC re-anchor, labeled "All times CT".

**Round 3 (same session):** chart pinned in the left column (always visible,
taller at 900px so chart + campaign zones ≈ objectives column height); the tabs
moved into the right column and grew a third tab — Objectives / Tactical
Overview / Danger Zones. Overview groups and danger zones restyled as cards
matching the objective cards; entry prices now sit on the chart's price scale as
colored axis labels (blue long / red short, `lineVisible: false` price lines).

Verification: `./init.sh` passes (typecheck, lint — 3 pre-existing warnings in
tests/briefing.schema.test.ts, 547 tests, build); full-page Playwright screenshots
of all three tabs confirmed the layout. New dep: `lightweight-charts` ^5.2.0.
Playwright itself is NOT a project dep — it runs from a scratchpad install
(system libs `libnspr4 libnss3 libasound2t64` were apt-installed for headless
Chromium). PR #40, squash-merged.

**feat-037 live smoke test (2026-07-11) — PASSED.** The end-to-end check noted in PR #39
ran against the live Sierra export folder (`C:\gekko\export`, accessed from WSL as
`/mnt/c/gekko/export` via a `GEKKO_EXPORT_DIR` env override — the `.env` value stays the
Windows path for normal operation). Uploader POSTed on attempt 1 → bundle
`dc2641ae-60d4-4073-9052-44e95eef8b68`: `raw_bundles` row has all four profile refs
populated (`balance_area_vbp_ref` = `<id>/balance-area.vbp.md`), `is_stale` false,
`current_price` 30068.5, and all 8 Storage objects landed with byte-exact sizes
(balance-area.vbp.md 12,533 B matches the local export).

**analyze-task live smoke test (2026-07-11) — first LLM run; model swapped to
`openai/gpt-5.6-terra`.** The first-ever live analyze-task run (dev env, trigger.dev dev
server) failed on `anthropic/claude-sonnet-5`: Anthropic's structured-output grammar
compiler rejects the Briefing schema (`AI_APICallError: The compiled grammar is too
large`). Root cause isolated by bisection: the schema is only 3.7 KB, but `primary` and
`secondary` inline the large `Objective` shape twice and Anthropic counts both copies —
every section individually passes, `Briefing.omit({secondary})` passes, and a
`$defs`/`$ref`-deduplicated emission (`z.toJSONSchema(Briefing, { reused: 'ref' })`,
2.9 KB) passes. Per Caleb's direction the fix was a **non-Anthropic model** instead of a
schema workaround: five vision + structured-output candidates were verified against the
real Briefing schema via OpenRouter (gpt-5.6-terra, gpt-5.4, grok-4.5,
gemini-3.1-pro-preview, qwen3-vl-235b — all pass; the limit is Anthropic-specific).
`config.model_id` updated in the live DB to `openai/gpt-5.6-terra` ($2.50/$15 per MTok,
automatic OpenAI prompt caching; `assertModelMatch` accepts its dated serve id). Rerun
succeeded end-to-end: briefing `a0f52291-e349-4b92-9aa3-e70185320844` persisted (6 terrain
zones, primary long, 2 entry_levels), engine fact-enforcement overwrote a model ripStatus
claim, cost $0.16 / 41k in + 2.2k out / 17 s. Code untouched — `DEFAULT_MODEL_ID` in
`lib/llm/generateStructured.ts` is still `anthropic/claude-sonnet-5` (config-row fallback
only); if a Briefing-shaped schema must ever run on Anthropic again, the `$ref` dedup in
`generateStructured` is the known fix. `triage_model_id` (haiku, small schema — safe) and
`high_conviction_model_id` (opus, disabled, would hit the same limit) are unchanged.

**feat-037 (2026-07-10) — balance-area VBP replaces rolling five-day; magnets re-anchor.**
Caleb replaced `rolling-five-day.vbp.md` with `balance-area.vbp.md` — an HTF VbP anchored
to the current **Balance Area** (a balance starts when two days of overlapping value occur
and expands while following days keep overlapping value; exceptions for a peak above/below).
Same export format, so `parseVbpProfile` is unchanged.

- **Full rename:** ingest field `balance_area_vbp`, migration
  `20260710090000_balance_area_vbp_ref.sql` renames `raw_bundles.five_day_vbp_ref` →
  `balance_area_vbp_ref` (guarded, applied to the live project), uploader watch list,
  `loadBundle.balanceAreaVbpContent`, `facts.lvn.{rotation,balanceArea}` +
  `profileSummary.{rotation,balanceArea}`, prompt, doctrine, docs, diagrams, tests.
- **Magnet set re-anchored + single-sourced:** magnets (POC/VAH/VAL + HVN peaks) now come
  from the **balance-area** profile — matching the Gem playbook, where the Magnet Check
  runs on the HTF chart that shows the balance-area VbP. Built ONCE in `engineFacts` via
  `collectMagnets` and passed to both `evaluateMagnetCheck({ magnets, levels })` and
  `assembleTerrain({ ..., magnets })` — terrainZones no longer rebuilds the set (its
  `summary` input is gone). The terrain zone stack itself stays rotation-anchored.
- **Fixture re-anchor:** the last commit (51eea9b) had also refreshed
  `four-hundred-rotation.vbp.md` (bin 4 → 1.0-pt step, CSV 28910–30072 — the feat-036
  doubled-scale quirk is RESOLVED) without updating tests; parseProfile + engineFacts
  expectations re-anchored to both current exports (balance-area: POC 29950 / VAH 30310 /
  VAL 29496, 823 rows).

**feat-036 (2026-07-09) — four-profile export contract + absorption candidates.**
Caleb's real charts no longer export `vbp_export.md`/`delta_vbp_export.md`; the export
folder now writes FOUR profiles (all sampled in `chart-data/`): two HTF VbPs
(`four-hundred-rotation.vbp.md` medium-term, `rolling-five-day.vbp.md` long-term — a
big ledge on the 5-day outweighs one on the 400) and two execution delta profiles
(`half-rotation-delta.vbp.md` ~35 pt, `full-rotation-delta.vbp.md` ~75 pt), used for
spotting absorption.

- **Join removed:** `parseProfiles`' per-bin VbP↔delta join deleted — it only fed
  terrain zone character, and the new bin grids (2.0 vs 2.25-pt steps) can never
  key-match. `parseVbpProfile` + new `parseDeltaProfile` parse each file standalone.
  Terrain zones are volume-structure only now (deltaClass/character removed).
- **NEW `lib/engine/absorption.ts`:** code-owned absorption-candidate detection over
  the delta exports — stacks of same-sign bins ≥ threshold; gap bins tolerated at a
  qualifying ratio (Caleb: "if I have five bins and 4 are over 50, that's good");
  strong opposite-sign bin hard-breaks; span capped (configurable, default per
  constant). Constants exported + drift-guard tested; prose defers to the module.
  CANDIDATES ONLY — doctrine/prompt tell the model absorption requires price stalled
  at the stack (execution chart); a stack alone means nothing. Raw delta text is NOT
  in the prompt (token cost; the model sees the delta profiles in the exec screenshot).
  NOTE: the real fixtures yield ZERO candidates at doctrine thresholds (verified —
  longest qualifying run is 2 bins); positives are covered synthetically.
- **Dual LVN/HVN:** detection runs on both VbPs → `facts.lvn.{rotation,fiveDay}` +
  `profileSummary.{rotation,fiveDay}`; magnets + terrain stay rotation-anchored
  (magnet tolerance is calibrated to rotation-scale geometry). *(Superseded by feat-037:
  the five-day profile became the balance-area profile and magnets moved to it.)*
- **Contract ripple:** migration `20260709090000_four_profile_refs.sql` (4 new
  `raw_bundles` ref columns, old 2 dropped — bundles are transient, repurposing would
  poison history), `FILE_FIELDS` (object name = local Sierra filename now), uploader
  watch list (9 files), loadBundle, analyzeBundle, prompt, doctrine, setup walkthrough
  step 7, architecture plan (Profile Export Format rewritten — no join), diagrams.
- **Fixture re-anchor:** the refreshed `chart-data/` also changed the MGI + exec CSV,
  so ripStatus/mgiPriority/parseExecBars/deltaTelemetry fixture tests were re-anchored
  (price 29945.75 is now ABOVE the rip 29883.51 → fixture condition Green; recent
  window holds 0 red extremes; nearest Tier-1 above/below = VRange High / Week Open).
- **KNOWN SAMPLE QUIRK (tolerated, flagged):** `four-hundred-rotation.vbp.md` Summary
  POC 29900 vs CSV prices ~57820–59988 (doubled scale) — the engine tolerates it, but
  terrain/magnet output against this sample is degenerate. Caleb should re-export that
  chart.

Previous session (2026-07-08, fifth that date) was a **full-codebase review +
hardening pass** (no feature_list change) plus a new `docs/setup-walkthrough.md`.

**Review + hardening (2026-07-08, fifth session) — quality/integration audit of the
whole codebase.**

- **Audit verdict:** four parallel review agents (engine, pipelines, ingest/uploader/API,
  UI/notifications/observability) verified **every integration seam clean** — uploader↔
  ingest manifest, storage buckets↔loadBundle, all DB columns↔migrations, Zod schema↔
  tables↔dashboard, trigger task ids↔routes, doctrine bundling, Realtime topic/payload,
  push payload/env names, telemetry redaction. Findings were quality/robustness items;
  all fixed on branch `fix/review-hardening`:
  - **Pipelines:** persistBriefing reordered (insert new levels BEFORE deactivating the
    prior set, scoped `.neq('briefing_id', id)`) — eliminates the zero-active window a
    concurrent eval-task could persist as spurious NO_ENTRY_NEAR; analyze now enforces
    code-owned meta (createdAt/currentPrice/triggerReason, ripStatus when engine-computed)
    mirroring eval; AnalyzeInputError/EvalInputError abort via AbortTaskRunError instead
    of retrying 3× (no wasted LLM spend); eval loads bundles `exec-only` (no longer fails
    on missing VbP/delta it never used); evaluated_level_id prefers label+direction+price
    match, unmatched echo → null FK; engineFacts warns when the VbP/delta join yields
    all-null deltas (bin-grid drift).
  - **Ingest/uploader:** `scripts/uploader.ts` now actually loads `.env.local`/`.env` via
    `process.loadEnvFile` (was documented but never wired — uploader config always failed;
    Node ≥ 20.12); ingest made idempotent (uploader sends a stable `bundle_id` across
    retries, storage upserts, on-conflict-ignore insert — no duplicate bundles on flaky
    links); scheduler sync-throw deadlock + cancel/rerunQueued fixed.
  - **Engine:** lvnDetection valley LVNs no longer mislabeled `taper-edge` when a taper
    displaced their merge neighbor (`npm run lvn:eval` F1 identical before/after — label
    fix only); terrainZones empty-profile crash guard; magnetTolerance single-sourced from
    DEFAULT_MAGNET_TOLERANCE; riskReward per-target gate gains the `rr > 0` guard; dead
    `parseProfilesFromFiles` removed.
  - **UI:** alerts-center auto-reconnects with capped backoff after Realtime channel
    errors (was dead until reload); push retry respects the failed operation's intent (a
    failed *disable* no longer re-subscribes); sw.js gains `pushsubscriptionchange`
    re-subscribe + notificationclick navigate fallback; shared `lib/api/respond.ts`;
    the two trigger buttons merged into `trigger-run-button.tsx`; `role="status"` live
    regions; eval section shows an honest unavailable state during DB outages.
- **Condition Red input — RESOLVED with Caleb (same session/PR):** the flagged
  mean-based Red trigger (`recentMeanDelta ≤ −3`, effectively unreachable) was replaced
  with a **count-based flip**: `deltaTelemetry.recentRedExtremeCount` (bars ≤ RED_EXTREME
  within the 20-bar recent window) and `ripStatus.RED_BUILDING_MIN_BARS = 3` — Caleb's
  doctrine: exec bars are 750-volume bars, one rogue −3/−4 print carries no weight, he
  wants ≥3 clustered prints; window deliberately NOT shrunk (clusters shouldn't be missed
  because of when the analysis request is submitted). `deltaIntensity` (the mean) is kept
  as display context only; drift guard re-tied to both constants. The fixture day (~196
  pts below the Rip, 5 recent extremes) now reads Red where it read Yellow. Also noted,
  not done: orphaned
  storage objects on failed ingests (no GC), proximity threshold (20 pt) as a config
  column, `round2`/`isFiniteNumber` duplicated across 7 engine modules, mobile nav
  fallback, staleness `ageMs: Infinity` serializing to JSON null.
- **New doc:** `docs/setup-walkthrough.md` — step-by-step runbook to get Gekko running
  on the trading machine (env, the 3 pending migrations, trigger.dev deploy vs dev,
  Windows uploader, VAPID/LangSmith extras, smoke test, troubleshooting).
- **Verification:** `./init.sh` green — typecheck 0, lint 0 errors (3 pre-existing
  warnings), **506/506 tests** (was 481; +25 net new), build OK; `npm run lvn:eval`
  TRAIN gate PASS with unchanged F1.
- **Live migrations APPLIED (2026-07-08, post-merge):** all 7 migrations now live on
  project qvhkqilizwozikpomxob — verified via Supabase MCP: config has the
  high-conviction columns (flag false, opus-4-8 default; Sonnet 5 / Haiku 4.5 /
  rr_min 3.0 untouched), both `realtime.send()` AFTER INSERT triggers + the
  `gekko:alerts` `realtime.messages` policy exist, and `push_subscriptions` exists with
  RLS-no-policies. Still pending user-side: VAPID keys + trigger.dev prod env vars —
  captured in `docs/setup-walkthrough.md`.

**feat-026 + feat-027 (2026-07-08, fourth session) — Web notifications (Realtime) +
Web Push (tab-closed).**

- **Realtime/RLS decision (feat-026): Broadcast, NOT postgres_changes.** All tables are
  RLS-enabled with no policies (service-role only). Delivering `postgres_changes` INSERTs
  to the browser's anon client would require anon SELECT policies on
  `briefings`/`eval_results` — which also opens the FULL rows (briefing content, model
  output, entry levels) to any anon-key holder via the REST Data API, far more surface
  than "something new exists". Instead
  `supabase/migrations/20260708120000_realtime_notifications.sql` installs an AFTER
  INSERT trigger on both tables calling `realtime.send()` with a **minimal payload**
  (`{type,id,status,created_at}`) on the **private topic `gekko:alerts`**, plus a
  `realtime.messages` SELECT policy for `anon`/`authenticated` scoped to
  `extension='broadcast'` AND that single topic. Net: zero table data exposed, no
  `supabase_realtime` publication change, one channel for both tables (simpler client),
  and the trigger's exception guard means a Realtime hiccup can never fail the INSERT.
- **feat-026 client.** First browser Supabase client `lib/supabase/browser.ts` (anon
  key, cached singleton, `null` without env — never imported server-side).
  `app/components/alerts-center.tsx` (client, mounted in `app/layout.tsx` so the
  subscription survives navigation): explicit **Enable Alerts** opt-in (no auto-prompt)
  → private-channel subscribe (`realtime.setAuth()` first) → page-context
  `Notification` per event — titles **"New briefing ready"** / **"Entry eval:
  \<STATUS\>"** from the shared `lib/notifications/events.ts` (`parseAlertEvent` +
  `buildAlertContent`, also used by push so the channels never drift). Status strip
  shows Live / Connecting / Realtime error / No Supabase env / Blocked in browser;
  every failure mode degrades to a label, never a crash. DESIGN.md conformant
  (surface-card, hairline, rounded-none, no shadows, uppercase 1.5px tracking,
  success/warning tokens, no m-red).
- **feat-027 (Web Push).** `web-push@3.6.7` + VAPID. New table migration
  `supabase/migrations/20260708120001_push_subscriptions.sql` (`endpoint` unique
  natural key, `p256dh`, `auth`; RLS with no policies). Opt-in: **Enable Push**
  registers `public/sw.js` (plain JS: `push` shows title/body/tag,
  `notificationclick` focuses/navigates an existing window or opens `/`),
  `pushManager.subscribe` with `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
  (`lib/push/vapid.ts` base64url→Uint8Array), POST `/api/push/subscribe`
  (Zod-validated; upsert `onConflict: endpoint`; DELETE unsubscribes — route
  unauthenticated per the feat-020/028 local-machine rationale). Sending:
  `lib/push/sendPush.ts` — `sendGekkoPush` is **env-gated** (no VAPID keys = silent
  no-op) and **never throws**; `sendPushToAll` fans out to all stored subscriptions and
  **prunes 404/410-gone** endpoints; real deps (`lib/push/deps.ts`: web-push +
  service client, TTL 3600) load via dynamic import. Wired into
  `trigger/analyzeTask.ts` + `trigger/evalTask.ts` **after successful persistence**
  with `logger.warn` as the log sink — a push failure can never fail a task.
  `eslint.config.mjs` now ignores `public/**` (plain-JS SW outside the Next graph).
- **Env.** `.env.example` documents `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` /
  `VAPID_SUBJECT` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + the generation one-liner
  (`npx web-push generate-vapid-keys`). No real keys committed.
- **Tests/verification.** +52 tests → **481 passed** (`tests/notifications.events.test.ts`
  16, `tests/push.send.test.ts` 14, `tests/push.subscribe.route.test.ts` 10, +12
  migration guards in `tests/migrations.test.ts` — incl. "no public-table
  policies/publication changes/grants" and "RLS with no policies on
  push_subscriptions"). All offline with DI'd fakes; no real push sends, no live DB
  writes/DDL. `./init.sh` fully green: typecheck ✓, lint ✓ (0 errors; only the 3
  pre-existing warnings in `tests/briefing.schema.test.ts`), vitest 481 ✓, build ✓
  (`/api/push/subscribe` in the route table).
- **⚠️ PENDING USER STEPS (in order):**
  1. Apply the still-pending `supabase/migrations/20260708090000_high_conviction_flag.sql`
     (from the feat-031 session), then the two new migrations
     `20260708120000_realtime_notifications.sql` and
     `20260708120001_push_subscriptions.sql` — via the Supabase dashboard SQL editor or
     `supabase db push` (this container has no DB credentials; nothing was applied
     live). Until applied: alerts strip connects but receives no events (or shows
     "Realtime error" if private-channel auth is rejected), and push subscribe fails
     with a clean 500.
  2. `npx web-push generate-vapid-keys` once; put the four VAPID vars in `.env.local`
     on the trading machine (public key in BOTH `VAPID_PUBLIC_KEY` and
     `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) and set `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/
     `VAPID_SUBJECT` on the trigger.dev environment (the analyze/eval tasks do the
     sending). Rebuild the app after setting `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (inlined at
     build time).
  3. Verify live on the trading machine: Enable Alerts → run a briefing → notification
     with the tab backgrounded; Enable Push → close the tab → run a briefing →
     tab-closed push arrives; check trigger.dev logs for the `push send complete`
     summary and 404/410 pruning behavior over time.

**feat-031 + feat-028 (2026-07-08, third session) — Opus high-conviction flag; /settings
Config UI.**

- **feat-031 (high-conviction flag).** New migration
  `supabase/migrations/20260708090000_high_conviction_flag.sql` adds
  `high_conviction_enabled boolean not null default false` and
  `high_conviction_model_id text not null default 'anthropic/claude-opus-4-8'` to
  `public.config` (idempotent `add column if not exists`, house ALTER style, doctrine
  comments per plan "Decisions locked" + Phase 4). Routing: `runAnalysis` uses
  `high_conviction_model_id` instead of `model_id` when the flag is on (both from config,
  never hardcoded; blank id → warning + fall back to `model_id`);
  `AnalyzeResult.highConviction` lands in analyze-task run metadata + logs next to
  `model`. The eval-task triage path is deliberately untouched (triage stays cheap).
- **⚠️ PENDING USER STEP — migration NOT applied live.** This container has no DB
  password and the Supabase MCP server is unauthorized, so the migration is committed but
  **not** applied to the live project. Apply
  `supabase/migrations/20260708090000_high_conviction_flag.sql` via the Supabase MCP
  server or the dashboard SQL editor. Until then the app degrades gracefully (below), and
  a /settings save fails with an explicit "apply the high_conviction_flag migration
  first" 400 (raw Postgres errors are never surfaced).
- **Graceful pre-migration reads.** New shared `lib/config/fetchConfig.ts`
  (`fetchConfigRow`): selects the full column set; on Postgres 42703 (undefined column —
  matched by code or message) retries with the legacy column set, pads
  `high_conviction_enabled=false` + the default Opus id, and reports
  `highConvictionColumnsMissing=true`. `lib/analyze/deps.ts` `fetchConfig` now routes
  through it. **Live read-only smoke this session:** the real DB returned 42703 for the
  new columns and the seeded legacy row (`model_id anthropic/claude-sonnet-5`) for the
  fallback select, and a one-off vitest run of the real `fetchConfigRow` against the live
  DB passed (`highConvictionColumnsMissing: true`) — production hits exactly the tested
  path. No live writes/DDL were attempted.
- **feat-028 (Config UI).** `/settings` (server shell, `force-dynamic`) + client
  `settings-form.tsx` editing `model_id`, `triage_model_id`, `rr_min`,
  `high_conviction_enabled`, `high_conviction_model_id`; DESIGN.md-conformant (uppercase
  1.5px-tracked labels, surface-card rounded-none 48px inputs, bmw-blue Save, m-red
  errors only, success saved-state, warning note pre-migration; `updated_at` shown and
  refreshed after save). `GET`+`POST /api/config`: Zod validation
  (`lib/config/updateConfig.ts` — model ids trimmed non-empty `provider/model` regex,
  `rr_min` bounded 0.5–10, NaN/∞ rejected, boolean flag) → 400 with per-field
  `fieldErrors` the form renders inline; success updates config `id=1` with fresh
  `updated_at` and returns the row. **Intentionally unauthenticated** like
  `/api/briefings/run` (local-machine app; feat-020 rationale). Top-nav gained a
  Settings link; dashboard anchors root-prefixed (`/#overview`) so they work from
  /settings.
- **Tests/verification.** +37 tests → **429 passed** (`tests/config.schema.test.ts`,
  `tests/config.store.test.ts`, `tests/config.route.test.ts`, migrations guards for the
  new SQL, runAnalysis routing cases incl. pre-migration config shape). `./init.sh`
  fully green: typecheck ✓, lint ✓ (only the 3 pre-existing warnings in
  `tests/briefing.schema.test.ts`), vitest 429 ✓, build ✓ (`/settings` + `/api/config`
  in the route table).

**feat-023 + feat-030 + feat-032 (2026-07-08) — prompt caching read-back;
cost/latency/LangSmith observability; doctrine drift guard.**

- **feat-023 (prompt caching — the read-back half).** The cacheControl write side has
  existed since feat-018. Added `extractCachedInputTokens(usage, providerMetadata)` to
  `lib/llm/generateStructured.ts`: reads the AI SDK v6 shape
  (`usage.inputTokenDetails.cacheReadTokens`, then the deprecated
  `usage.cachedInputTokens` alias) and falls back to OpenRouter usage accounting
  (`providerMetadata.openrouter.usage.promptTokensDetails.cachedTokens`, plus the raw
  snake_case defensively). Returned as `GenerateStructuredResult.cachedInputTokens`
  (0 stays 0, absent → null), propagated through `runAnalysis`/`runEval` into
  analyze-task/eval-task run metadata. **Gated integration check**:
  `tests/llm.cacheHit.integration.test.ts` — `describe.skipIf(!OPENROUTER_API_KEY)`,
  two identical real calls with the REAL `loadDoctrine()` prefix (well above Anthropic's
  ~1024-token cache minimum) + `cacheSystem: true`, asserts the second call reports
  `cachedInputTokens > 0`. Skipped offline; **it ran LIVE this session (a key was
  present in the env) and PASSED** — cache write + read proven against real
  OpenRouter/Anthropic.
- **BASELINE REPAIR (exposed by the live check, would have broken every live run):**
  OpenRouter now serves Anthropic models under **dated canonical ids**
  (`anthropic/claude-sonnet-5` → `anthropic/claude-sonnet-5-20260630`;
  `anthropic/claude-haiku-4-5` → `anthropic/claude-4.5-haiku-20251001`), so the strict
  string-equality `assertModelMatch` threw "Model mismatch" on every real analyze/eval
  call. It now accepts the requested id's canonical variant — same provider + same
  name-token multiset (`.`/`-`/`:` separated, 8-digit date stamp ignored) — and still
  throws on any real substitution (different provider/family/version). Unit-tested in
  both directions.
- **feat-030 (cost/latency observability + LangSmith).** `generateStructured` measures
  `latencyMs` around the LLM call; analyze-task + eval-task now set `model`, `costUsd`,
  `latencyMs`, `cachedInputTokens` and
  `usage{inputTokens,outputTokens,totalTokens,cachedInputTokens}` in trigger.dev run
  metadata (that metadata IS the dashboard surface per the plan — no new UI).
  LangSmith: new `lib/observability/` — `telemetry.ts` lazily builds ONE **private**
  `NodeTracerProvider` per worker (BatchSpanProcessor → RedactingSpanExporter →
  OTLP-proto exporter at `https://api.smith.langchain.com/otel/v1/traces`, headers
  `x-api-key` + optional `Langsmith-Project`; `LANGSMITH_OTEL_ENDPOINT` override) and
  hands its tracer to the AI SDK via `experimental_telemetry.tracer`.
  `generateStructured` gained an **opt-in `telemetry` param** (recordInputs +
  recordOutputs, functionId); analyze passes `analyze-task`, eval `eval-task`.
  **Wiring decision**: NOT trigger.config.ts `telemetry.exporters` — that hook gets
  every span of the worker's global provider (noise), and AI spans on the global
  provider would ship the multi-MB base64 chart images to trigger.dev's own exporter
  too. The private provider guarantees the only consumer is our redacting exporter;
  spans still start under the active trigger.dev run context, so trace ids correlate.
  **Image redaction** (`redact.ts`): the AI SDK records the prompt in
  `ai.prompt`/`ai.prompt.messages` with no built-in redaction, so the exporter rewrites
  those attributes at export time — image/file parts become
  `[image: <mediaType>, ~N bytes]` placeholders; doctrine text + JSON response stay
  verbatim; what is SENT to the model is untouched. Env-gated: no `LANGSMITH_API_KEY`
  ⇒ `getLlmTelemetry()` null ⇒ `experimental_telemetry` omitted entirely; flush
  failures are swallowed (a LangSmith outage can never fail a run). New deps (OTel
  only): `@opentelemetry/{api,sdk-trace-node,sdk-trace-base,resources,exporter-trace-otlp-proto}`.
- **feat-032 (doctrine drift guard).** `tests/doctrine-drift.test.ts` — dynamic, engine
  authoritative: (1) behavior ties (gate flips exactly at `DEFAULT_RR_MIN`; Rip flips
  red exactly at `RED_EXTREME`, newly exported from ripStatus.ts — the only engine
  change); (2) constraints.md's "Computable guardrails" bullets each name their owning
  module (riskReward.ts/evaluateRiskReward/config.rr_min, stopWidened, mgiPriority.ts,
  ripStatus.ts; output-schema.md → briefing.schema.ts); (3) numeric-drift bans over ALL
  `knowledge/**/*.md` (discovered dynamically), with forbidden spellings derived from
  the live constants: any `N:1` ratio, the Rip threshold, magnet tolerance, staleness
  margin (seconds + minutes forms), near-entry proximity. Prose cleanup the guard
  forced: constraints.md "The 3:1 R/R gate" → "The minimum R/R gate";
  briefing.schema.ts comment "(3:1 gate)" → "(the rr_min gate)".
- **USER-SIDE STEPS (cannot be verified from this repo):**
  1. **LangSmith live verification**: set `LANGSMITH_API_KEY` (+ optionally
     `LANGSMITH_PROJECT`) on the trigger.dev environment (dev + prod), run a briefing /
     entry check, and confirm the trace (doctrine prompt + JSON response, images as
     placeholders) appears in LangSmith. Nothing breaks while the key is unset.
  2. The repeat-run **cache-hit assertion needs `OPENROUTER_API_KEY`**
     (`npx vitest run tests/llm.cacheHit.integration.test.ts`) — it passed live this
     session; re-runnable any time.
- **Verified**: `./init.sh` green — typecheck 0, lint 0 errors (3 pre-existing warnings
  in tests/briefing.schema.test.ts), vitest **392/392** (35 files; +25 unit tests + the
  live-run integration test), next build OK.

**feat-024 + feat-025 (2026-07-08) — eval-task + "Check Entry" button; entry_levels
lifecycle closed.**
- **feat-024 was already half-built**: `lib/analyze/persistBriefing.ts` (feat-018)
  deactivates every prior `entry_levels` row and inserts the new `active=true` set on each
  briefing (tested in tests/analyze.persistBriefing.test.ts). This session closed the read
  half: the eval-task consumes **`active=true` rows only** —
  `lib/eval/deps.ts#fetchActiveEntryLevels` selects with `.eq('active', true)` (the
  partial index `entry_levels_active_idx` already existed in the init migration).
- **`lib/eval/` mirrors `lib/analyze/`** (pure orchestrator over injected deps):
  `evalBundle.ts#runEval` → shared `loadLatestBundle` (current price =
  `raw_bundles.current_price`, `EvalInputError` when absent; chart images + exec CSV from
  Storage) → delta telemetry (`parseExecBars`→`computeDeltaTelemetry`) + `assessStaleness`
  → active levels → **code-owned proximity gate** (`proximity.ts#assessProximity`) →
  `generateStructured` with the `EvalResult` Zod schema on **`config.triage_model_id`**
  (eval deps fetchConfig selects it; default `anthropic/claude-haiku-4-5` = the migration
  column default; never hardcoded at call sites) → `validateEval.ts#enforceEvalFacts` →
  `persistEval.ts` one `eval_results` row.
- **Decisions**: (1) proximity is decided in code, not by the model —
  `DEFAULT_NEAR_ENTRY_POINTS = 20` NQ points (doctrine gives no number; documented in
  proximity.ts, overridable per call / future config column). If code says not-near and
  the model still returns a level verdict, the status is **coerced to NO_ENTRY_NEAR**
  (warning recorded); code-owned meta (createdAt/currentPrice/nearEntry) is always
  overwritten. (2) `evaluated_level_id` fk resolved by matching the model's echoed
  evaluatedLevel to an active row within 0.25 pt (one tick), falling back to the
  code-nearest level. (3) Columns hold the **enforced** verdict; `raw_model_json` keeps
  the model's unmodified output so coercions stay auditable. (4) **Zero active levels ⇒
  no LLM call**: a code-owned NO_ENTRY_NEAR row is persisted with `model_id null`
  ("run a briefing first"). (5) The instructions.md eval logic (long/short
  ENTER/WAIT/NOT_VALID + the Delta>0-for-longs / Delta<0-for-shorts rule) is embedded in
  the user prompt (`lib/eval/prompt.ts`); the system prefix is the same cached
  `loadDoctrine()` as analyze (`cacheSystem: true`).
- **DEVIATION**: the feature description says "triggers notify" — **not wired**;
  notify-task doesn't exist yet (feat-026/027), same deviation pattern feat-008 recorded
  for analyze-enqueue. Wire it in the notify feature.
- **trigger/evalTask.ts**: schemaTask id `eval-task`, empty/optional payload
  (`z.object({}).default({})`), retry maxAttempts 3, logs
  model/costUsd/usage/evalResultId/stale to run metadata (mirrors analyzeTask).
- **POST /api/eval/run**: mirrors /api/briefings/run — type-safe
  `tasks.trigger<typeof evalTask>('eval-task', {})`, 202 `{runId}` / clean 500 body;
  intentionally unauthenticated (local-machine app, no input, worst case an extra
  advisory triage run).
- **Dashboard**: `check-entry-button.tsx` (client, outline variant,
  pending/success/error states matching Run Briefing) replaces the disabled placeholder
  in `app/page.tsx`; the "wired when feat-025 lands" notes are gone and the eval
  empty-state now points at the live button.
- **Tests**: +17 (316 total, all offline, DI fakes + real chart-data fixtures):
  eval.runEval (9 — end-to-end order, prompt/config wiring, fk mapping, not-near
  coercion, zero-level short-circuit, default-model fallback, staleness, meta
  enforcement, missing current_price), eval.proximity (5), eval.run.route (3, hoisted
  SDK fake).
- **Verified**: `./init.sh` green — typecheck 0, lint 0 errors (3 pre-existing warnings
  in tests/briefing.schema.test.ts), vitest 316/316 (32 files), next build OK
  (`/api/eval/run` registered dynamic).
- **User-side smoke (once TRIGGER_SECRET_KEY + bundles are live)**: run a briefing so
  active entry levels exist → click **Check Entry at Current Price** → exactly one
  eval-task run in the trigger.dev dashboard (metadata shows the haiku triage model +
  cost) → an `eval_results` row appears → reload the dashboard: "Latest Entry Eval"
  renders the status chip (ENTER/WAIT/NOT_VALID/NO_ENTRY_NEAR) + trigger/stop/targets/
  reason. With no active levels, the row appears instantly with NO_ENTRY_NEAR and
  `model_id` null (no LLM spend). Remember `npx trigger.dev@latest deploy` (or dev) so
  the worker knows the new `eval-task`.

**Previous:** feat-019 + feat-020 DONE (briefing dashboard + Run Briefing trigger, below).

**feat-019 + feat-020 (2026-07-08) — briefing dashboard + manual Run Briefing trigger.**
- **`app/page.tsx` replaces the filler marketing landing page** (user decision) with the
  real dashboard: a `force-dynamic` server component fetching via the service-role client.
  `lib/briefing/` follows the house pattern — `dashboardData.ts` (pure `loadDashboardData`
  over injected deps: latest briefing row **re-validated against the Zod Briefing schema**
  so a corrupt payload surfaces an error instead of half-rendering, latest eval_results
  row, latest bundle `received_at` → `assessStaleness`), `deps.ts` (real Supabase deps),
  `terrainMap.ts` (pure SVG geometry).
- **Gem parity** (gem-files/instructions.md Morning Briefing template): meta band
  (created/trigger/model + currentPrice/htfTrend/ripStatus spec cells) → 1·Tactical
  Overview (three bullet columns + Key Inflections grid) → Terrain campaign map →
  2·Strategic Alignment (Primary/Secondary objective cards with macroGoal, rationale,
  direction, R/R, target sequence, Action Point|Price|Level table) → III·Danger Zones →
  Latest Entry Eval (status chip + trigger/stop/targets/reason, empty state until
  feat-025). Empty DB renders a clean "No Briefing Yet — run one" state.
- **Terrain SVG**: `buildTerrainMap(terrain, currentPrice)` returns a serializable layout
  model (nice-step price axis, contiguous zone rects — the No-Gap invariant renders as
  touching rectangles tiling the plot, Gem blue→purple palette mapping, per-kind
  trench/wall/magnet/mgi level overlay, bmw-blue current-price marker); the component
  only paints. 13 geometry tests.
- **Staleness**: m-red "STALE DATA" banner + STALE chip whenever the latest bundle
  exceeds the assessStaleness margin or no bundle exists — stale is never presented as
  fresh (m-red used per DESIGN.md's critical-significance role).
- **feat-020 route**: `POST /api/briefings/run` (nodejs) does the type-safe
  `tasks.trigger<typeof analyzeTask>("analyze-task", { triggerReason: "manual" })`
  (type-only task import), 202 `{runId}` / clean 500 body. No cron/schedules — on-demand
  only. **Auth decision: unauthenticated** — local-machine-only app, no input accepted,
  worst case an extra advisory run; `/api/ingest` stays bearer-authed because a separate
  process writes data through it (rationale in the route header).
- **Run Briefing button** (`run-briefing-button.tsx`, client) with pending/success(run
  id)/error states; **Check Entry at Current Price rendered DISABLED** with a "wired in
  feat-025" note — the eval backend does not exist yet (decision documented here per the
  feature spec). `button.tsx` gained `disabled:` styling; top-nav/footer trimmed of
  marketing filler (nav now anchors dashboard sections; footer keeps stripe+disclaimer).
- **Tests**: +22 (299 total, all offline): terrainMap geometry (13), dashboard loader
  with fake deps (6), route with a hoisted SDK fake (3).
- **Verified**: `./init.sh` green — typecheck 0, lint 0 errors (3 pre-existing warnings
  in tests/briefing.schema.test.ts), vitest 299/299 (29 files), next build OK
  (`/` and `/api/briefings/run` dynamic). Live smoke against the real (empty-briefings)
  Supabase project: GET / → 200 with No-Briefing + Stale-Data + eval empty states;
  POST /api/briefings/run without TRIGGER_SECRET_KEY → clean 500 error body.
- **USER SETUP REQUIRED**: set `TRIGGER_SECRET_KEY` in `.env` on the trading machine
  (now uncommented in `.env.example`) — trigger.dev dashboard → Project → API keys
  (`tr_dev_*` when running `trigger.dev dev`, `tr_prod_*` against the deployed worker).
  Live end-to-end smoke still to do once bundles flow: click Run Briefing → one
  analyze-task run → new briefing row → reload renders it.

**Previous:** feat-021 descoped (below); `feat-018` DONE (analyze-task).

**feat-021 descoped (2026-07-08) — Vercel deployment removed from scope.**
- User decision: Gekko will run locally on the trading machine; no public deployment needed.
- Verified safe to remove: no feature in `feature_list.json` depends on feat-021 (leaf node in
  the dependency graph); no code assumes a deployed URL (`INGEST_URL` is configurable and the
  uploader runs on the same machine; `trigger/analyzeTask.ts` talks to Supabase/OpenRouter
  directly, never calls back into the app). feat-026/027 web notifications still work locally
  (`localhost` is a secure context) but will only reach browsers on the trading machine.
- Changes: `feature_list.json` feat-021 → `skipped` with evidence note (entry kept for
  numbering history); `docs/diagrams/feature-roadmap.md` F021 node/edges/crit-class removed;
  `CLAUDE.md` + `docs/agent-architecture-plan.md` stack descriptions reworded ("run locally on
  the trading machine") and the Vercel-deploy integration bullet dropped from CLAUDE.md.

**feat-018 (2026-07-06) — analyze-task (engine-integrated full-briefing pipeline).**
- **Model research first (user request), via the OpenRouter MCP live catalog** (image input +
  `structured_outputs`, Artificial Analysis indices): **`anthropic/claude-sonnet-5`** strictly
  dominates the old `anthropic/claude-sonnet-4-6` default (II 53.4 vs 47.2, better coding/agentic)
  at ~2/3 the price ($2/$10 vs $3/$15 per M tokens), same 1M ctx + caching + reasoning efforts.
  Budget alternative `google/gemini-3.5-flash` ($1.50/$9); escalation `anthropic/claude-opus-4.8`
  ($5/$25). Default promoted in migration `20260706190000_default_model_sonnet_5.sql` (column
  default + row update only-if-still-old-default) and `DEFAULT_MODEL_ID`.
  **Applied LIVE** to project qvhkqilizwozikpomxob via Supabase MCP (2026-07-07, live version
  `20260707035809_default_model_sonnet_5`); verified `config` row id=1 now serves
  `anthropic/claude-sonnet-5` (triage model + rr_min unchanged).
- **`lib/analyze/`** — the pipeline, all side effects injected (ingest-route pattern):
  `loadBundle.ts` (latest `raw_bundles` row + Storage fetch-back; texts required, PNGs optional →
  warning), `engineFacts.ts` (parseProfiles/parseExecBars → deltaTelemetry/mgiPriority/
  lvnDetection/staleness → ripStatus → magnetCheck(tier1) → assembleTerrain; rip absent degrades
  to warning), `doctrine.ts` (knowledge/system+doctrine md → static system prefix), `prompt.ts`
  (volatile user message: engine facts + raw MGI + chart manifest + staleness; code-owned facts
  declared non-negotiable, screenshots perception-only), `validateBriefing.ts` (No-Gap zone
  invariant throws → trigger retry; off-engine borders warn; `Objective.rr` overwritten via
  `objectiveRiskReward` with `config.rr_min`), `persistBriefing.ts` (briefings insert → deactivate
  prior `entry_levels` → insert new active set, one row per entry rung with engine stop + target
  ladder), `analyzeBundle.ts` (`runAnalysis` orchestrator), `deps.ts` (service-role Supabase deps).
- **`trigger/analyzeTask.ts`** — `schemaTask` id `analyze-task`, payload `{triggerReason}`
  (default "manual", per the on-demand-only doctrine in the plan), per-task retry maxAttempts 3,
  `logger.info` + `metadata.set` model/costUsd/usage/briefingId/stale (cost from OpenRouter usage
  accounting). `trigger.config.ts` ships `knowledge/**` via `additionalFiles` (`@trigger.dev/build`
  added as devDep) so the doctrine reads work after deploy.
- **`lib/llm/generateStructured.ts`** — gained `cacheSystem` (system prefix as a message with
  `providerOptions.openrouter.cacheControl: ephemeral` — the plan's main cost/latency lever),
  default provider settings `usage: {include: true}`, and `extractCost` → `result.cost` (USD).
- 43 new tests (277 total): `tests/analyze.*.test.ts` run the real `chart-data/` Sierra fixtures
  through the full engine, plus fake-deps end-to-end `runAnalysis` coverage (order of persistence,
  rr overwrite, No-Gap rejection, staleness/missing-chart warnings, config fallback) and llm
  cacheSystem/cost tests.
- `./init.sh` green: typecheck 0, lint 0 errors (3 pre-existing warnings), 277 tests pass,
  next build OK.
- **Not in scope / next:** `/api/briefings/run` route + UI button (feat-019+?), `eval-task`,
  `notify-task`; first real `trigger.dev dev` smoke run of `analyze-task` against a live bundle.

**feat-015 + feat-016 (2026-07-06) — terrain engine (magnetCheck + terrainZones).**
- **feat-015 `lib/engine/magnetCheck.ts`** — the single source of Magnet classification.
  `collectMagnets({summary,hvn})` builds the magnet set (POC/VAH/VAL + detected HVN peaks);
  `classifyMagnet` / `evaluateMagnetCheck` flag any MGI level within `DEFAULT_MAGNET_TOLERANCE`
  (10 pts) of a magnet as a structural invalidation (cannot be a border or T3, per
  chart-reading.md's Magnet Check). MGI accepted structurally (no runtime coupling to
  mgiPriority). 15 unit tests.
- **feat-016 `lib/engine/terrainZones.ts`** — `assembleTerrain(...)`. For each major MGI anchor
  (Tier-1 + Rip) it inspects the LOCAL VbP shape and promotes with strict doctrine priority
  **Trench > Wall > Magnet > mgi**. Wall (Shelf+MGI) is checked *before* Magnet so a block-edge
  MGI is a Wall not a Magnet — this is the HOME FOR HARD-LEDGE DETECTION, anchored on the few
  MGI prices to avoid the whole-profile false-positive explosion that killed the feat-035 ledge
  scan; the local test deliberately favors recall (MGI cross-ref only prunes, never creates).
  The magnet set/alignment is single-sourced from feat-015. Hard partitions + profile extremes
  assemble a contiguous Stratosphere→Abyss zone stack with the No-Gap invariant
  (`bottom[N]===top[N+1]`), each zone classified by volume (acceptance/void) × delta sign
  (absorption/initiative) and given a vertical-map position. No MGI-terrain eval fixtures exist,
  so the thresholds are documented recall-favoring doctrine heuristics in
  `DEFAULT_TERRAIN_PARAMS` (overridable), validated by 20 unit tests on synthetic profiles.
- `./init.sh` green: typecheck 0, lint 0 errors (3 pre-existing warnings), 234 tests pass
  (21 files, +35), next build OK.

**Prior:** `feat-035` DONE (LVN detection accuracy improvement — see below); `feat-014` DONE
(+ `feat-034` folded in).

**feat-035 (2026-07-06) — LVN/HVN detection re-tune to Caleb's real methodology.** Caleb
re-labeled all 8 fixtures: **HVNs = only the most prominent** (1 on clean/trend, 3–4 on
multi-modal); **LVNs = shelf edges** — the edge of a large distribution / where volume drops off a
cliff / the start of a low-volume area between distributions, **not** troughs (so LVN labels can
sit at 24–66% of peak, on the high side of a drop). This moved the ground truth and broke the old
gate (train LVN F1 0.33). Two algorithm changes in `lib/engine/lvnDetection.ts`: (1) **HVN
dominance floor** `hvnDominanceFrac` (0.35) — an HVN must be prominent AND tall, cutting
over-detection (train HVN det 27→15 vs 12 labeled; precision 0.41→0.73); (2) **shelf-edge
generalization** — `plateauLevelFrac` 0.18→0.30 (catch moderate-volume shelves) and the
distribution shoulder is sought within `shoulderWindow` (40pt), not just the adjacent bar
(`findShoulder`). Re-tuned TRAIN-only via a throwaway 58k-config grid sweep (not committed); picked
a **stable, moderate** config (`sw17 pp0.2 hd0.35 vd0.1 pl0.3 pr6 sf0.6 shw40 mt14`) from the
winning cluster, favoring generalization over train-max (the feat-014 overfit lesson). **Result**
(`npm run lvn:eval`, ±10pt): TRAIN LVN F1 **0.51** / HVN **0.81** — gate PASSES at 0.40; HOLDOUT LVN
0.36 / HVN 0.43 (honest, never tuned). **Known remaining limitation:** shallow tall ledges high on a
distribution (e.g. fixture-7 30270 @54%, on a ~50%-of-peak flat) are still missed. A
relative-contrast / high-side gradient-knee ledge detector was investigated (4 variants, incl.
moving the target ledge into train) and rejected: it catches a tall ledge only at a step threshold
that also fires on the ordinary flanks of every distribution — a NET NEGATIVE on train (one catch
costs ~8 false LVNs; train F1 48→43). A big ledge and a normal distribution flank aren't separable
in the 1-D volume shape by a threshold; that needs a width/shape-aware model or the chart image
(forbidden — code-owned detection). Baseline kept. Caleb later re-reviewed fixture-8 and dropped its
30470 label (mid-distribution, not a ledge), leaving 30347/30541 (holdout LVN 0.34→0.36). **No re-binning** — Caleb confirmed the CSV bins
ARE the 4/8-tick chart bars (no coarse-vs-fine resolution mismatch). Tests:
`lib/engine/lvnDetection.test.ts` 13 pass (added HVN-floor + windowed-shoulder mechanics). README
labeling philosophy updated to the shelf-edge definition.

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

---

## Research track: distilling Job's planning and execution processes (2026-08-20)

**Not a feature.** No `feature_list.json` entry, nothing wired into the engine. This is source
research toward a possible alternative analysis mode, kept in `docs/jba-research/` so it survives
the sessions that produced it. Branch: `claude/trading-plan-youtube-analysis-izig3g`.

**The goal.** Reconstruct, as an explicit rule set, the method the OrderFlow Labs author ("Job" —
author of the Job Pivot and Job Balance Area studies) uses. It splits cleanly in two: **planning**
(where, and what if — done premarket) and **execution** (which, when, how much — done live). Each
track has a *process* document (the deliverable) and a *notes* document (the evidence log). The
split is deliberate: evidence lands in the notes first, then the process is updated. A rule whose
provenance has evaporated is not worth having.

### Planning process — `jba-analysis-process.md` (14 rules, five phases)

Documents referenced:

- `docs/jba-research/transcripts/` — **25 premarket prep transcripts**, 2026-02-13 → 2026-08-11,
  named `YYYY-MM-DD_<youtube-id>.txt`. The sole basis for every rule in the process.
- `docs/jba-research/reference/job-pivots-deep-dive.txt` — the author's complete Job Pivot
  walkthrough (38:44). **Background, not process**: it supplies the study construction (pivot,
  70% value zone, A/B ladder as stacked value-zone widths, JBA = overlapping value zones on a
  rolling 5-day lookback). Rules sourced *solely* from it were removed — it teaches how the
  studies are built, which is not the same as how they are used.
- `docs/jba-research/priority-videos.json` — the 16 dates chosen by cross-referencing corpus gaps
  against the 2026 economic calendar and the Feb–Mar 2026 correction. All downloaded.
- `docs/jba-research/jba-prep-video-notes.md` — companion evidence log.
- `docs/jba-research/pull-transcripts.py` — the puller (`--browser chrome` locally; without
  cookies use `--browser none --player-clients android,tv,web`).

### Execution process — `execution-process.md` (39 rules, seven phases)

Documents referenced:

- `docs/jba-research/replays/` — **9 trade-replay transcripts** (~5.4 hrs) with `[mm:ss]`
  timestamps. The evidence base for every execution rule.
- `docs/jba-research/reference/dominator-2-0-deep-dive.txt` and `dominator-2.0.txt` — the
  session-aware aggression-anomaly detector.
- `docs/jba-research/reference/ofl-101-time-and-sales.txt` and `time-and-sales.txt`.
- `docs/jba-research/reference/dom.txt`.
- `docs/jba-research/execution-notes.md` — companion evidence log.

### Where we are: reviewing and fine-tuning the process documents

Both process documents are drafted and evidenced. The current pass is **review and fine-tuning**,
not new extraction. Completed so far:

- Timestamped source links added to every rule (replay rules land within ~15s; the 25 prep
  transcripts lost their caption timings, so those links are bare — re-runnable locally).
- Cross-instrument (ES/NQ) material removed from both documents; they are now instrument-agnostic.
- A "Data, studies and exports this process needs" section added to each, split into what already
  ships in the bundle, what needs new Sierra exports, what must be built as a study, and what is
  personal configuration. Level 2 in Sierra Chart unblocks the execution track's gating primitive
  (whether resting size at a price is replenishing or vanishing).
- **Planning document consolidated 31 → 14 rules** (commits `2ff5044`, `0d3b1bc`): deep-dive-only
  rules removed, duplicate rules merged (confluence marking + collapse; six "locate X" rules into
  one rule plus a reference-set table; five band rules into three; seven plays into four, since
  look-above-and-fail / traverse value / testing-value-from-outside are one play at different
  references). The negative-rules list now carries only what is not stated positively above.
- Corrected the weekly open's role throughout: it is the most-cited reference in the corpus but
  gates direction **only while price is near it** — four lines had called it the primary bias gate
  unconditionally.
- Dropped the zone formation-context rule by operator decision (single instance, and the only
  `C`-confidence rule driving a new export). Evidence retained in the notes, marked excluded.

### Open / next

1. **Same consolidation pass on the execution document** — 39 rules, likely the same duplication.
2. **Classify each rule by owner** before any feature work. Proposed policy: `A`-confidence rules
   that are *arithmetic over inputs* may become engine facts in `lib/engine/`; `A` rules that are
   *judgment* and all `B` rules become prompt doctrine in `knowledge/doctrine/`; `C` rules stay in
   the notes or ship behind a flag, never as a hard engine gate. `feature_list.json` has no field
   for a confidence tag, so the tag has to survive the transfer as a *destination*. The repo has
   already been burned once by the alternative — feat-113 retired the ATR-projected rungs after an
   offhand chart remark became a 16-price anchor surface.
3. Doctrine reconciliation — a JBA (overlapping session pivot value zones) is a different study
   from the balance area already in `knowledge/doctrine/chart-reading.md` (overlapping daily value
   areas). He runs both; this is not drift to reconcile.
4. The Phase 4 plays table has a `Conf` column but no `Source` column.
5. Scoring plans against price data is **parked**, deliberately.

**Artifacts** (private mirrors of the four documents):
[planning process](https://claude.ai/code/artifact/8438bfb9-b04a-41cb-a4db-b296749303e1) ·
[planning notes](https://claude.ai/code/artifact/46957b20-7ea1-4784-ae9c-62337ad78cd2) ·
[execution process](https://claude.ai/code/artifact/bcebab65-9d8f-4ba8-8e31-16e4b85c896c) ·
[execution notes](https://claude.ai/code/artifact/010913d6-4d0e-4f14-9b19-754087079ebd)
