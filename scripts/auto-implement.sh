#!/usr/bin/env bash
#
# auto-implement.sh — autonomous feature-by-feature implementation loop for Gekko.
#
# Press start and walk away. For each unfinished feature whose dependencies are all done, this
# script: creates a branch, runs ONE fresh unattended Claude Code session to implement it, re-runs
# ./init.sh as the objective gate, then (only on green) commits, opens a PR, squash-merges it,
# deletes the branch, and moves on. A feature that can't pass the gate halts the loop for review.
#
# The Claude session never touches git/gh — this script owns the entire version-control lifecycle.
#
# Prerequisites (one-time, local machine):
#   - claude  CLI installed + logged in
#   - gh      CLI installed + `gh auth login`
#   - jq, git installed; git identity configured
#   - run from the repo root, on a clean default branch
#
# Usage:
#   scripts/auto-implement.sh                 # run a batch (up to MAX_FEATURES)
#   MAX_FEATURES=1 scripts/auto-implement.sh  # do just the next feature (recommended first run)
#
set -euo pipefail

# ----------------------------- Tunables (override via env) -----------------------------
MAX_FEATURES="${MAX_FEATURES:-1}"     # how many features to land this run (raise once trusted)
MAX_TURNS="${MAX_TURNS:-60}"          # per-session agentic turn cap
MAX_BUDGET="${MAX_BUDGET:-10.00}"     # per-session USD budget cap
MAX_RETRIES="${MAX_RETRIES:-1}"       # extra "fix the failing gate" sessions after the first
MODEL="${MODEL:-}"                    # optional --model override (e.g. opus); empty = CLI default
FEATURE_FILE="${FEATURE_FILE:-feature_list.json}"
GATE_CMD="${GATE_CMD:-./init.sh}"     # the objective pass gate
LOG_DIR="${LOG_DIR:-logs/auto-run}"
DECISIONS_LOG="${DECISIONS_LOG:-decisions-log.md}"

# Default branch: explicit env wins, else origin/HEAD, else "main".
DEFAULT_BRANCH="${DEFAULT_BRANCH:-$(git symbolic-ref --quiet refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')}"
DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"

# ----------------------------- Helpers -----------------------------
log()  { printf '\033[1;34m[auto]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[auto]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[auto] FATAL:\033[0m %s\n' "$*" >&2; exit 1; }

record() {  # append a one-line outcome to the decisions log
  printf '\n## %s — %s (%s)\n- %s\n' "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "orchestrator" "$2" >> "$DECISIONS_LOG"
}

slugify() { echo "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g' | cut -c1-40; }

push_with_retry() {  # $1 = branch; retry network failures 2s/4s/8s/16s
  local branch="$1" delay=2 attempt
  for attempt in 1 2 3 4 5; do
    if git push -u origin "$branch"; then return 0; fi
    [ "$attempt" -eq 5 ] && return 1
    warn "push failed (attempt $attempt) — retrying in ${delay}s"; sleep "$delay"; delay=$((delay*2))
  done
}

# Next feature: first one not "done" whose every dependency is "done". Empty = nothing left.
next_feature_id() {
  jq -r '
    [.features[] | select(.status != "done")] as $todo
    | ($todo | map(select(.id))) as $_
    | [ .features[] | select(.status=="done") | .id ] as $done
    | first(
        $todo[]
        | select( all(.dependencies[]; . as $d | $done | index($d)) )
        | .id
      ) // empty
  ' "$FEATURE_FILE"
}

feature_name() { jq -r --arg id "$1" '.features[] | select(.id==$id) | .name' "$FEATURE_FILE"; }
feature_status() { jq -r --arg id "$1" '.features[] | select(.id==$id) | .status' "$FEATURE_FILE"; }

# ----------------------------- Preflight -----------------------------
log "default branch: $DEFAULT_BRANCH | batch size: $MAX_FEATURES | gate: $GATE_CMD"
for bin in claude gh jq git; do command -v "$bin" >/dev/null 2>&1 || die "missing required tool: $bin"; done
gh auth status >/dev/null 2>&1 || die "gh is not authenticated — run 'gh auth login'"
[ -f "$FEATURE_FILE" ] || die "no $FEATURE_FILE in $(pwd) — run from the repo root"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not a git repository"
[ -z "$(git status --porcelain)" ] || die "working tree is dirty — commit or stash first"

mkdir -p "$LOG_DIR"
log "baseline gate check on $DEFAULT_BRANCH"
git checkout "$DEFAULT_BRANCH" >/dev/null 2>&1 || die "cannot checkout $DEFAULT_BRANCH"
$GATE_CMD || die "baseline $GATE_CMD already fails on $DEFAULT_BRANCH — fix that before automating"

# ----------------------------- Main loop -----------------------------
landed=0
while [ "$landed" -lt "$MAX_FEATURES" ]; do
  git checkout "$DEFAULT_BRANCH" >/dev/null 2>&1
  git pull --ff-only origin "$DEFAULT_BRANCH" >/dev/null 2>&1 || warn "could not pull $DEFAULT_BRANCH (offline?) — continuing"

  id="$(next_feature_id || true)"
  if [ -z "$id" ]; then
    log "no eligible features remaining — all done (or blocked by unfinished dependencies)."
    break
  fi

  name="$(feature_name "$id")"
  branch="feat/${id}-$(slugify "$name")"
  sess_log="$LOG_DIR/${id}.log"
  log "=== $id — $name ==="
  log "branch: $branch"

  git checkout -b "$branch" >/dev/null 2>&1 || die "could not create branch $branch (already exists?)"

  # ---- run the (possibly retried) unattended sessions until the gate passes ----
  attempt=0
  gate_ok=false
  while : ; do
    if [ "$attempt" -eq 0 ]; then
      prompt="/implement-feature $id"
    else
      prompt="/implement-feature $id — the previous session left ./init.sh failing. Run $GATE_CMD, read the errors, and fix them until it exits 0. Do not touch other features."
    fi
    log "session attempt $((attempt+1)) (max turns $MAX_TURNS, budget \$$MAX_BUDGET) → $sess_log"

    set +e
    claude -p "$prompt" \
      --permission-mode bypassPermissions \
      --max-turns "$MAX_TURNS" \
      --max-budget-usd "$MAX_BUDGET" \
      ${MODEL:+--model "$MODEL"} \
      --output-format stream-json --verbose \
      2>&1 | tee -a "$sess_log"
    set -e

    # Objective gate — the orchestrator decides, not the LLM's self-report.
    if $GATE_CMD >>"$sess_log" 2>&1 && [ "$(feature_status "$id")" = "done" ]; then
      gate_ok=true
      break
    fi

    attempt=$((attempt+1))
    if [ "$attempt" -gt "$MAX_RETRIES" ]; then break; fi
    warn "gate not green after attempt $attempt — retrying"
  done

  if [ "$gate_ok" != true ]; then
    warn "$id did NOT pass the gate after $((attempt+1)) attempt(s). Halting for human review."
    record "$id" "FAILED — gate ($GATE_CMD) not green and/or status not 'done' after $((attempt+1)) attempt(s). Branch '$branch' left in place; session log: $sess_log."
    git add -A && git commit -q -m "WIP $id: $name (gate failing — left for review)" || true
    push_with_retry "$branch" || warn "could not push WIP branch $branch"
    die "stopped at $id — inspect branch '$branch' and $sess_log, then re-run."
  fi

  # ---- gate is green: commit, PR, squash-merge, delete branch ----
  log "$id gate green — committing and opening PR"
  git add -A
  git commit -q -m "$id: $name" || die "nothing to commit for $id (did the session write changes?)"
  push_with_retry "$branch" || die "could not push $branch after retries"

  gh pr create --base "$DEFAULT_BRANCH" --head "$branch" \
    --title "$id: $name" \
    --body "Automated implementation of **$id — $name**.\n\nGate: \`$GATE_CMD\` passes. See feature_list.json evidence and decisions-log.md." \
    >/dev/null
  gh pr merge "$branch" --squash --delete-branch --admin >/dev/null \
    || gh pr merge "$branch" --squash --delete-branch >/dev/null \
    || die "PR for $id opened but merge failed (branch protection? required reviews?) — merge it manually."

  git checkout "$DEFAULT_BRANCH" >/dev/null 2>&1
  git pull --ff-only origin "$DEFAULT_BRANCH" >/dev/null 2>&1 || warn "could not pull merged $DEFAULT_BRANCH"
  git branch -D "$branch" >/dev/null 2>&1 || true

  record "$id" "MERGED — squash-merged into $DEFAULT_BRANCH and branch deleted. Gate ($GATE_CMD) green."
  log "$id landed ✓"
  landed=$((landed+1))
done

log "done — landed $landed feature(s) this run."
