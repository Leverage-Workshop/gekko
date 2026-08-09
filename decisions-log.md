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

- **2026-07-16 · gem-comparison fixes F1–F6 (branch
  `claude/windows-uploader-briefing-analysis-b7s6z4`):** scope set by the operator ("let's do
  F1–F6, leave the model as is"). Judgment calls made without operator input:
  `mergeTolerancePts` defaults to 16 (wide enough to compose the Gem's 24h-VWAP/Weekly-VWAP band
  at 15.9 pts; chain-merging applies to HARD partitions only, so ladder over-merge is unlikely);
  composite-border representative price = the member with the deepest local dip (its actual
  valley), with Trench beating Wall in mixed clusters; the whole `daily` MGI group becomes
  anchor-eligible (not just IB/OR/PD) since promotion still requires local volume geometry;
  campaign extent = outermost span of BOTH profiles (rotation + balance area) as the "visible
  HTF structure" proxy; `acceptanceFrac` re-based to 0.75× profile MEAN and `promoteMinVolFrac`
  0.5× profile mean, both sanity-fitted on the 2026-07-14 comparison bundle (no labeled fixture
  set exists). Known cost: `Overview` `.min(2)` means pre-F6 stored briefings with single-bullet
  sections stop parsing (graceful "run a new briefing" paths); both existing DB rows pass.

## feat-092 — 2026-08-09

- **Decision:** A *partially* written anchor (one of the two `First Period …` lines present,
  the other missing) degrades to `meta.firstPeriod = null` exactly like a fully absent anchor,
  rather than throwing. A line that is *present but unreadable* (`First Period Letter: AB`,
  `First Period Start: 08:30`) still hard-rejects.
- **Why:** The feature's mandate is that `parseTpo` must tolerate absence rather than
  hard-reject, and `parseTpo` failing takes ALL TPO facts down with it (`computeEngineFacts`
  catches the throw and sets `tpo: null` + a warning). A half-written anchor is an absence of
  usable information, not corrupt information, so losing single prints / poor extremes /
  POC prominence over it is a bad trade. Genuinely garbage values still fail loudly, keeping
  the file's documented strictness where it actually protects against wrong facts.
- **Alternatives considered:** (a) throw on partial presence — most consistent with the
  parser's "fail loudly on drift" doctrine, rejected for the blast radius above; (b) tolerate
  malformed values too — rejected, that is how wrong times get published silently.

- **Decision:** Period-time arithmetic runs through `Date.UTC` / `getUTC*` even though the
  exported timestamps are local Chicago wall-clock, and the resolver emits naive local strings
  with no timezone.
- **Why:** The exports are naive local throughout (standing gap A5 in the bundle review, filed
  as feat-107); this feature is not the place to introduce a timezone model. Doing the
  add-N-minutes arithmetic in UTC makes it pure integer math on the wall-clock face, so a DST
  transition on the host cannot silently shift a period boundary — the letters keep the exact
  spacing the study used to letter them.
- **Alternatives considered:** local `Date` arithmetic (would inherit the runtime's TZ and
  double-count a DST jump — and the trigger.dev/Vercel runtimes are UTC anyway); carrying a
  real IANA zone (out of scope, that is feat-107).

- **Decision:** The letter sequence is `A`–`Z` then `a`–`z` (52 periods), and a letter that
  sorts *before* the anchor letter resolves to `null` instead of wrapping backwards.
- **Why:** It matches the `[A-Za-z]` alphabet `parseTpo` already accepts in the `Letters`
  column and Sierra's own TPO lettering; 52 × 30 min covers a full 24h session. A pre-anchor
  letter means the export disagrees with its own anchor, and inventing a time for it would be
  worse than omitting it — `buildTpoPeriodClock` drops unresolvable letters rather than
  throwing, so the rest of the profile is unaffected.
- **Alternatives considered:** 26 letters only (breaks ETH/Globex profiles); wrapping negative
  offsets into the previous day (guesswork).

- **Decision:** Surface the resolver's output in `TpoFacts` as `tpo.periodClock`
  (letter → `HH:MM`) rather than leaving the resolver unconsumed for a later feature.
- **Why:** The value of A2 is that the model can *say* "the single prints were carved at 10:30",
  and a resolver nothing calls is untested-in-anger code. The projection is compact — 13 letters
  ≈ 300 chars on the fixture, well inside the 91k analyze-prompt budget (measured, budget
  untouched) — and adds no new `factsPayload` key, so the feat-054 registry gate is satisfied by
  updating the existing `tpo_data` row.
- **Alternatives considered:** ship parser + resolver only (leaves the payoff to feat-091/C2);
  emit full `{start, end}` per period (several times the size for no extra read).
