# Decisions Log

Append-only audit trail for the autonomous implementation loop (`scripts/auto-implement.sh`).

- **Sessions** (`/implement-feature`) append their judgment calls here: assumptions, library
  choices, scoped-down interpretations, and rationale — so unattended runs are reviewable.
- **The orchestrator** appends one outcome line per feature: `MERGED` or `FAILED` (with the branch
  and session-log path).

Newest entries are added at the bottom. Per-session stdout lives in `logs/auto-run/<feat-id>.log`.

---

- **2026-07-13 · gem-alignment audit (branch `claude/gem-docs-code-alignment-vxcsly`):** scope set
  with the operator mid-session — fix the clear-cut doctrine misalignments (A2–A7) **plus** B3/B4
  (promoted to A8/A9); A1 (wiring `priorStop` for stop-widening enforcement) explicitly waived by
  the operator; remaining judgment calls flagged, not changed. Full findings in
  `docs/gem-alignment-audit.md`. Judgment calls made without operator input: ENTER-vs-delta-sign
  contradictions demote to WAIT (warning) rather than hard-reject, mirroring the existing
  NO_ENTRY_NEAR coercion severity; campaign extremes use the Tier-1 envelope with a `price > 0`
  guard against unset 0.00 export placeholders; PDH/PDL/PDC/IB/OR stay Tier 2 (doctrine leaves
  them untiered; they are correctly not campaign borders).
