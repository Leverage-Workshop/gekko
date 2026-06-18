# {{AGENT_FILE_NAME}}

{{PROJECT_PURPOSE}}

## Startup Workflow

Before writing code:

1. **Confirm working directory**: `pwd`
2. **Run `./init.sh`** — stop here if it fails; repair before adding new scope
3. **Read `feature_list.json`** — identify the one feature to implement (first `not-started`
   whose deps are all `done`); read its `description` and `dependencies`
4. **Create a feature branch**: `git checkout -b feat-NNN-<slug>`
5. **Read only the docs relevant to your chosen feature** (architecture docs are a reference;
   skim the relevant section, not the full file)
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

## Required Artifacts

- `feature_list.json` — Feature state tracker (source of truth)
- `progress.md` — Session continuity log
- `init.sh` — Standard startup and verification path
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
{{PRIMARY_VERIFICATION_COMMAND}}
```

Required checks:
{{VERIFICATION_COMMANDS}}

## Escalation

If you encounter:
- **Architecture decisions**: Consult project architecture docs if present, otherwise ask user
- **Unclear requirements**: Check product/requirements docs if present, otherwise ask user
- **Repeated test failures**: Update progress, flag for human review
- **Scope ambiguity**: Re-read `feature_list.json` for definition of done
