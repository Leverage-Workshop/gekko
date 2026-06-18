---
description: Implement exactly one feature from feature_list.json until ./init.sh passes (unattended)
argument-hint: <feat-id>  e.g. feat-001
allowed-tools: Read, Edit, Write, Glob, Grep, Bash
---

You are running as a single, fresh, unattended Claude Code session inside an automated
orchestration loop. Your entire job is to implement **one** feature and leave the working tree in a
state where `./init.sh` exits 0. The outer orchestrator owns all of git — you must NOT.

## Target feature

Implement feature: **$ARGUMENTS**

## Required reading (do this first)

1. `CLAUDE.md` — the project harness: working rules, definition of done, integration sources of truth.
2. `docs/agent-architecture-plan.md` — the architecture and rationale (the *what* and *why*).
3. The matching object in `feature_list.json` (find `"id": "$ARGUMENTS"`) — its `name`,
   `description` (the acceptance criteria), and `dependencies`.
4. `progress.md` — recent state and any handoff notes.

## How to work

- Implement **only** `$ARGUMENTS`. Do not start, modify, or "improve" any other feature, and do not
  touch files unrelated to this feature. Stay in scope.
- Follow the project's integration sources of truth (trigger.dev rules/MCP, Vercel skills, AI SDK →
  OpenRouter; never hardcode the model id — read it from config).
- The pass gate is `./init.sh` exiting 0. Run it yourself, read the failures, fix, and repeat until
  it is green. Do not declare success until you have personally seen `./init.sh` pass.
- **Never block waiting for a human.** This session is unattended — there is no one to answer
  questions. When a requirement is ambiguous or underspecified, choose the most conventional,
  lowest-risk option consistent with the architecture plan, proceed, and record the decision (see
  below). Do not use any interactive/question tool.

## Recording decisions (audit trail)

Whenever you make a non-obvious judgment call — an assumption, a library choice, a deviation, a
scoped-down interpretation — append an entry to `decisions-log.md` (create it if missing). Use:

```
## $ARGUMENTS — <ISO date>
- **Decision:** <what you chose>
- **Why:** <the ambiguity and your rationale>
- **Alternatives considered:** <briefly>
```

## Definition of done (all required before you stop)

1. The feature's target behavior is implemented per its `description`.
2. `./init.sh` exits 0 (you ran it and saw it pass).
3. In `feature_list.json`, set this feature's `status` to `"done"` and fill `evidence` with a short
   summary of what shipped and confirmation that `./init.sh` passed. Change **only** this feature's
   object — leave every other feature untouched.
4. Update `progress.md` to reflect the completed feature and what is next.

## Hard constraints

- Do **NOT** run any `git` or `gh` command. Do not commit, branch, push, or open/merge PRs. The
  orchestrator handles all version control and will commit whatever you leave in the working tree.
- Do **NOT** edit other features' entries in `feature_list.json`.
- If, after genuine effort, you cannot make `./init.sh` pass, do not mark the feature done. Leave a
  clear note in `decisions-log.md` describing exactly what is blocking and stop — the orchestrator
  will detect the still-failing gate and halt for human review.
