# CLAUDE.md

Harness for building **Gekko** — an advisory-only autonomous agent that turns the manual
NQ-futures Gemini "Gem" into a scheduled + proximity-triggered briefing system (Next.js
run locally on the trading machine, trigger.dev workflows, Supabase, Vercel AI SDK →
OpenRouter). The full architecture
and rationale live in `docs/agent-architecture-plan.md`; the work breakdown lives in
`feature_list.json`.

## Startup Workflow

Before writing code:

1. **Confirm working directory**: `pwd`
2. **Run `./init.sh`** — stop here if it fails; repair before adding new scope
3. **Read `feature_list.json`** — identify the one feature to implement (first `not-started`
   whose deps are all `done`); read its `description` and `dependencies`
4. **Create a feature branch**: `git checkout -b feat-NNN-<slug>`
5. **Read only the docs relevant to your chosen feature** — `docs/agent-architecture-plan.md`
   is a reference; skim the relevant section, not the full file
6. **Review recent commits**: `git log --oneline -5`

If baseline verification is failing, repair that first before adding new scope.

## Working Rules

- **One feature at a time**: Pick exactly one unfinished feature from `feature_list.json`
- **Branch per feature**: Before writing any code, create a feature branch
  (`git checkout -b feat-NNN-<slug>`). Never commit feature work directly to `main`.
- **PR to merge**: When `./init.sh` passes on the branch, open a PR against `main` and
  merge via squash.
- **Verification required**: Don't claim done without running verification commands
- **Update artifacts**: Before ending session, update `progress.md` and `feature_list.json`
- **Stay in scope**: Don't modify files unrelated to the current feature
- **Leave clean state**: Next session must be able to run `./init.sh` immediately
- **DESIGN.md is UI-only**: Read `DESIGN.md` only when the feature touches `app/` components,
  pages, styles, or the Tailwind theme. Engine (`lib/`), API routes, config, and test-only
  features do not need it.

## Required Artifacts

- `CLAUDE.md` — this file: harness routing, working rules, definition of done
- `feature_list.json` — Feature state tracker (source of truth)
- `progress.md` — Session continuity log
- `init.sh` — Standard startup and verification path
- `DESIGN.md` — Visual design system (source of truth for all UI work)
- `session-handoff.md` — Optional, for larger sessions

## Definition of Done

A feature is done only when ALL of the following are true:

- [ ] Target behavior is implemented
- [ ] Required verification actually ran (tests / lint / type-check)
- [ ] Evidence recorded in `feature_list.json` or `progress.md`
- [ ] Repository remains restartable from standard startup path

## End of Session

Before ending a session:

1. Update `progress.md` with current state
2. Update `feature_list.json` with new feature status
3. Record any unresolved risks or blockers
4. Push branch and open a PR against `main`; merge via squash once `./init.sh` passes
5. Leave repo clean enough for next session to run `./init.sh` immediately

## Verification Commands

```bash
# Full verification (recommended)
./init.sh
```

Required checks (once `package.json` exists, `./init.sh` auto-runs them):
- `npm run typecheck` (or `check`/`type-check`)
- `npm run lint`
- `npm test`
- `npm run build`

Until **feat-001** scaffolds the Next.js app there is no manifest; `./init.sh` will say so —
that is expected, and feat-001 is the first feature to pick up.

## Integration Sources of Truth

For the riskiest integrations, prefer the installed tooling over training memory:
- **trigger.dev** (tasks, schedules, deploy): read `docs/trigger-dev-rules.md`, use the
  trigger.dev MCP server (named `trigger`), and delegate complex work to the
  `trigger-dev-task-writer` / `trigger-dev-expert` subagents.
- **LLM**: Vercel AI SDK with OpenRouter as the gateway; model id comes from the `config` row
  (default `anthropic/claude-sonnet-5`). Never hardcode the model.

## Escalation

If you encounter:
- **Architecture decisions**: Consult project architecture docs if present, otherwise ask user
- **Unclear requirements**: Check product/requirements docs if present, otherwise ask user
- **Repeated test failures**: Update progress, flag for human review
- **Scope ambiguity**: Re-read `feature_list.json` for definition of done
