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

## feat-094 — 2026-08-09

- **Decision:** the headline RVOL is the most recent **completed** 30-min slot; the export's
  in-progress final bar is dropped from every measurement (and from every baseline).
  **Why:** `parseHtfBars` documents the last row as the in-progress bar, so its volume is a
  partial. Comparing a partial against a full-slot median reads "light" by construction on
  every bundle — the same class of by-construction bug D1 found in `valueMigration.priorDay`.
  **Alternatives considered:** pro-rating the partial bar by elapsed wall-clock minutes (needs
  a `now` the module does not otherwise take, and the bundle's own clock is the more honest
  source); reporting it unqualified (the bug above).

- **Decision:** the day-level `SessionVolume` read is measured against
  `medianSessionVolume × expectedFraction` — the fraction of a normal RTH day's volume that has
  typically printed by the last completed slot — not against the whole-session median.
  **Why:** the live export ships the in-progress session as row 1 (D1), so its `SessionVolume`
  is a running total. The review's own day-level figure (341,119 vs a 415,467 median = 0.82x)
  is that unqualified comparison; at ~75% of the session elapsed it is closer to 1.1x. The
  fact carries `inProgress` and `expectedFraction` so the model can see which comparison it got.
  **Alternatives considered:** reporting the raw ratio as the review did (systematically
  understates every mid-session bundle); suppressing the daily leg until feat-089 partitions
  the history (throws away the only day-level participation number in the bundle).

- **Decision:** the `gate` (discount / neutral / confirming) is *derived* from the band rather
  than getting its own threshold constants.
  **Why:** the harness's doctrine-drift guard wants one place per threshold. Two constant sets
  that must agree is exactly the drift the guard exists to catch.
  **Alternatives considered:** separate `RVOL_SIGNAL_CONFIRMING_MIN` / `RVOL_SIGNAL_DISCOUNT_MAX`
  constants set equal to the band edges (duplicated numbers, no extra expressiveness).

- **Decision:** RTH is `[08:30, 15:00)` chart time for the session-so-far / expectation window,
  via a new `RTH_CLOSE_MINUTES` constant — narrower than `overnightSession`'s implicit
  `[08:30, 17:00)` RTH.
  **Why:** the expectation curve has to be in the same units as the value-area exporter's
  `SessionVolume`, which covers the cash session. `overnightSession` only needs "not overnight",
  so its wider window is correct there and wrong here.
  **Alternatives considered:** reusing `overnightSession`'s window (would put the 15:00–17:00
  post-close tail into the "normal session" denominator and depress every RVOL).

- **Decision:** raised the analyze user-prompt size budget 91k → 93k
  (`tests/prompt-data-sync.test.ts`, measured 92,127).
  **Why:** the fact plus its ownership bullet costs ~1.6k of already-projected scalars, and the
  budget's own comment says to bump consciously in the same diff. The alternative it warns
  against — inlining raw tables — does not apply; there is nothing further to summarize.
  **Alternatives considered:** trimming `RVOL_REPORTED_SLOTS` 6 → 3 (saves ~400 chars and loses
  the slot series that shows participation building or fading, which is the read's main texture).

- **Decision:** `feat-089`'s seam is `computeSlotBaselines()` + `expectedRthVolumeThrough()`,
  exported from `lib/engine/relativeVolume.ts` and documented as reusable.
  **Why:** feat-089's developing-session maturity qualifier needs the same time-of-day
  expectation; a second implementation there would be a second baseline to drift.
  `expectedRthVolumeThrough` returns `expectedFraction` precisely so feat-089 can multiply it by
  a whole-session median and stay in `SessionVolume` units.
  **Alternatives considered:** exporting only the facts object (forces feat-089 to re-derive).

## feat-091 — 2026-08-09

- **Decision:** Tail length in points is `bins * step`, not `top - bottom`.
- **Why:** Each ladder bin is one grid step *tall*, so a 208-bin run on a 1-pt grid spans 208
  pts of price, not 207. It also reproduces the review's own measurement ("208 bins / 208 pts")
  exactly, so the fact can be checked against D2 without a fencepost argument.
- **Alternatives considered:** `top - bottom` (undercounts by one bin, and reports 0 pts for a
  legitimate single-bin excess).

- **Decision:** `EXCESS_MIN_BINS = 2` — one lone single-print bin at an extreme is not excess.
- **Why:** Every quiet turn leaves exactly one TPO at the extreme bin; calling that a tail
  would fire `excess` on nearly every session and make the fact meaningless. Two contiguous
  bins is the smallest run showing the auction was shut off rather than merely thinned. Kept
  as a named exported constant (engine convention) so the threshold is tunable and visible.
- **Alternatives considered:** no floor (noise on every profile); a points-based floor (breaks
  across instruments/bin sizes, where the bin count does not).

- **Decision:** A single-print run covering the WHOLE ladder yields null tails at both ends.
- **Why:** A tail is excess *relative to a body*. A profile with no 2+ TPO bin anywhere has no
  value area to be excess from, and reporting the same run as both a buying and a selling tail
  would double-count it. `singlePrintFraction` still reports 1.0, so the degenerate shape is
  visible without a bogus tail.
- **Alternatives considered:** report the run at both ends (double-counts); report it at the
  end nearest the POC (arbitrary when the POC is itself a single print).

- **Decision:** Each tail carries a single `clock` (the start of the earliest period that built
  it) rather than a per-letter clock map.
- **Why:** `tpo.periodClock` (feat-092) already maps every letter in the ladder to its start, so
  a per-tail map would duplicate payload for no new information. The one number the read needs
  is *when the excess was carved* — the earliest period in the run. Null on anchorless exports,
  matching the rest of the feat-092 degradation contract.
- **Alternatives considered:** `clock: string[]` per letter (duplicates `periodClock`); omit
  clock entirely and make the model join the letters against `periodClock` itself (works, but
  the join is exactly the kind of derivation the engine is supposed to own).

- **Decision:** The reference case is pinned as a synthetic 446-bin ladder reproducing bundle
  1c15934a's geometry, not as a committed copy of that bundle's `tpo.data.md`.
- **Why:** The bundle lives in Supabase storage, not the repo, and `chart-data/` holds one
  canonical fixture set that other gates (prompt-data-sync budgets, engine-ownership registry)
  measure against — adding a second TPO export there would move those numbers for reasons
  unrelated to this feature. The synthetic ladder pins every number D2 reports (208/208/`A`,
  19/19/`D`, 227 of 446 = 0.51) so the math is verified, not smoke-tested.
- **Alternatives considered:** commit the real bundle export as a second fixture (perturbs
  unrelated budget gates); assert only on the existing fixture's 4-bin tail (would not have
  caught a fencepost error at 208 bins).
