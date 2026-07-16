# Session Progress Log

## Current State

**Last Updated:** 2026-07-16
**Active Feature:** none — all features `done` (feat-021 skipped). Latest: **feat-038 Update
action** (branch `feat-038-update-action`).

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
