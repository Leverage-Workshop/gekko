# Decisions Log

Append-only audit trail for the autonomous implementation loop (`scripts/auto-implement.sh`).

- **Sessions** (`/implement-feature`) append their judgment calls here: assumptions, library
  choices, scoped-down interpretations, and rationale — so unattended runs are reviewable.
- **The orchestrator** appends one outcome line per feature: `MERGED` or `FAILED` (with the branch
  and session-log path).

Newest entries are added at the bottom. Per-session stdout lives in `logs/auto-run/<feat-id>.log`.

---
