# Session Progress Log

## Current State

**Last Updated:** 2026-06-18
**Active Feature:** `feat-001` **DONE** — next up is `feat-002` (profile parser) or any
no-dependency item (feat-003 chart-image PoC; feat-005/006/007/010/015–017/021 now unblocked).

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

## Status

### What's Done

- [x] Architecture plan written: `docs/agent-architecture-plan.md`
- [x] Sample profile exports confirmed and parsing spec locked: `chart-data/vbp_export.md`, `chart-data/delta_vbp_export.md`
- [x] Agent harness created (`harness-creator` skill): `CLAUDE.md`, `feature_list.json`, `progress.md`, `session-handoff.md`, `init.sh` — validator reports 100/100
- [x] `feature_list.json` populated from the plan: 34 features (feat-001..feat-038 minus removed feat-004/027/032/034), dependency-ordered, validated (no cycles, all deps resolve)
- [x] Tooling installed: Vercel Claude Code plugin; Trigger.dev MCP server (`trigger`, in `~/.claude.json`); Trigger.dev agent rules (`CLAUDE.md` + `.claude/agents/trigger-dev-task-writer.md`)

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

1. Pick up **feat-002** (profile parser + tests) — first dependent feature, or any no-dependency
   item now unblocked by feat-001 (feat-003 chart-image PoC; feat-005/006/007/010/015–017/021).

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
