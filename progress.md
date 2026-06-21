# Session Progress Log

## Current State

**Last Updated:** 2026-06-20
**Active Feature:** `feat-008` **DONE** — `/api/ingest` endpoint. Next up is any unblocked
item: feat-003 (chart-image PoC); feat-010/012/013/017 (dep on feat-001 only); feat-014/015
(unblocked by feat-002); feat-009/029 (now unblocked by feat-008); feat-024/028 (feat-005);
feat-022 (feat-006). All feat numbers use the **post-renumber** scheme.

**feat-008 (2026-06-20):** `app/api/ingest/route.ts` — bearer-authed multipart ingest. Stores
PNGs to the `chart-images` bucket and CSV/MD exports to `bundle-csvs` (under a `<bundleId>/`
prefix), the MGI JSON inline as `jsonb`, parses `current_price`, and inserts one `raw_bundles`
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
