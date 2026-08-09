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
## feat-095 — 2026-08-09

- **Decision:** The headline `sessionSigmaPts` applies the Parkinson estimator to each RTH
  session's OWN aggregated OHLC (open of the first 30-min bar, session high/low, close of the
  last) and averages the per-session variances — rather than computing a per-bar sigma and
  scaling it up by √(bars per session).
- **Why:** The feature description pins the target at "median 283 pts over the 61 reconstructed
  RTH sessions". √t-scaling the 30-min bar sigma reproduced 348 pts on the fixture bundle — ~25%
  high — because intraday ranges rotate rather than compound, so the √t independence assumption
  does not hold within a session. Applying Parkinson at session granularity reproduces the
  review's number directly: ln(29464/29000)/(2·√ln2)·29000 = 276 pts against the review's
  464-pt median day range and 283-pt sigma, and 295 pts on the repo's own fixture export. The
  per-bar sigma is still exposed as `parkinson.barSigmaPts` / `garmanKlass.barSigmaPts`, just
  never scaled across time.
- **Alternatives considered:** (a) √t scaling from bar sigma — rejected, measurably biased high;
  (b) median instead of mean of the per-session variances (the review quoted a median) — kept
  the mean-of-variances, which is the standard Parkinson/Garman-Klass n-period estimator, and
  reported `medianSessionRangePts` separately so the median view is still visible.

- **Decision:** `RTH_BARS_PER_SESSION` is 15 (08:30–16:00 CT), not 17 (08:30–17:00), and only
  sessions carrying at least that many bars are measured.
- **Why:** `overnightSession.ts` defines the RTH window as open → Globex reopen (08:30–17:00 =
  17 bars), but the live export prints no bars during the 16:00–17:00 CME maintenance halt —
  verified against `chart-data/htf_bar_data.rolling.csv`, where every complete RTH session
  carries exactly 15 bars, 08:30–15:30. Using 17 as the completeness threshold rejected every
  session in the real export and degraded the fact to null. The RTH *filter* still matches
  `multiDayTpo` (>= open, < Globex reopen) so no bar is silently dropped if one ever prints in
  that hour; only the completeness threshold uses the 16:00 boundary.
- **Alternatives considered:** Accepting partial sessions — rejected: the in-progress day has a
  truncated range and would deflate the scale exactly when it is being quoted. Sessions are
  therefore excluded until complete, with a minimum of 3 complete sessions before any sigma is
  reported (`MIN_SIGMA_ESTIMATION_SESSIONS`).

- **Decision:** Sigma-normalized distances are computed against a deliberately narrow structure
  set — the nearest Tier-1 level each side and the nearest engine zone border each side — rather
  than the whole level map.
- **Why:** The review's point is that a nearby distance can read as meaningful when it is
  noise; four references answer that directly. Rendering every level in sigma would add ~3k
  chars to an analyze prompt already near its size budget and bury the signal.
- **Alternatives considered:** Adding a sigma field alongside `htfStructure.currentVsSwings`'s
  existing ATR-normalized distances — left alone to keep the feat-049 module untouched;
  `sigmaOfPoints` / `sigmaDistanceTo` are exported so any caller can normalize its own distance.

- **Decision:** The analyze user-prompt size budget in `tests/prompt-data-sync.test.ts` was
  raised 91k → 93k chars.
- **Why:** The new fact plus its ownership bullet measured 90_901 chars against a 91_000
  ceiling — passing, but with no headroom for the next change. The test's own comment prescribes
  bumping the number consciously, in the diff a reviewer sees.
- **Alternatives considered:** Trimming the fact — rejected, every field is already a scalar or
  a 4-element list; nothing is inlined raw.

## feat-097 — 2026-08-09

- **Decision:** Nest the bands inside the existing `sessionIntraday` fact (`vwap.<anchor>.sigmaBands`
  plus a flattened `vwapRungs`) rather than minting a new top-level engine fact.
- **Why:** The spec asks for the bands "as `SessionIntradayFacts` **and** as entry/stop/target-rung
  structure", and the bands are derived from the very VWAP they hang off — separating them would
  invite the two to drift. It also keeps the feat-054 registry gate satisfied by updating the
  existing `exec_csv` row instead of adding a payload key with no export of its own.
- **Alternatives considered:** a standalone `lib/engine/sessionVwapBands.ts` module + top-level
  `vwapBands` fact (duplicates the bar-filtering and anchor logic that already lives in
  `sessionIntraday`, and needs a new registry row for an export it does not own).

- **Decision:** Rung structure is plumbed through `engineAnchorPrices()` (new optional third
  argument) — NOT through `engineZoneBorders()`.
- **Why:** `engineBorders` is hard-enforced: the model's `terrain.zones` must reproduce that exact
  set. A session VWAP band is not a zone partition, so injecting it there would corrupt the zone
  stack contract to buy a target-rung advisory. `anchorPrices` is exactly the "prices an entry may
  legitimately sit on" set, and the labelled rungs reach the model directly in the facts payload,
  so targets can quote them without loosening zone validation.
- **Alternatives considered:** adding band prices to `engineZoneBorders` (breaks the zone
  contract); a third `rungPrices` option on `ValidateOptions` (new validation surface for no
  behavior the anchor set does not already give).

- **Decision:** Include the VWAP centerline itself (`multiple: 0`) in `vwapRungs`, and compute band
  prices from the UNROUNDED VWAP and sigma, rounding once at the end.
- **Why:** The centerline is the mean-reversion rung the bands are measured from; excluding it
  would make the session VWAP quotable in prose but not anchorable. Rounding once is what
  reproduces the review's reference geometry exactly (bundle `1c15934a`: +1σ 29606.62 and +2σ
  29690.34 are only reachable from unrounded inputs — 29522.89 + 83.72 rounds to 29606.61).
- **Alternatives considered:** bands only (centerline unanchorable); deriving bands from the
  already-rounded published VWAP/sigma (off by a cent at ±1σ/±2σ vs the reference).

- **Decision:** Population sigma (÷ Σv), not a sample/Bessel correction.
- **Why:** The band describes where THIS session actually traded around its own average; it is not
  estimating a parameter of a wider population, so there is no n−1 to make. It also matches how
  charting packages draw VWAP bands, which is what the operator sees on the Sierra chart.
- **Alternatives considered:** Bessel-corrected sigma (differs by <0.1% at hundreds of bars, and
  would silently disagree with the platform's own bands).

- **Decision:** Reference numbers verified analytically, not against the live bundle.
- **Why:** Bundle `1c15934a` lives in Supabase storage and the worktree has no `.env`, so the
  `gekko-db` skill has no credentials to fetch it. The published figures are internally consistent
  with this implementation's formula (each band = VWAP + k·sigma from unrounded inputs; z =
  (29542.50 − 29522.89)/83.72 = +0.23), and the math itself is pinned by a hand-computed unit test
  where the volume weighting changes the answer (sigma 10 weighted vs sqrt(125) ≈ 11.18 unweighted).
- **Alternatives considered:** committing a trimmed copy of that bundle as a fixture (bloats the
  repo and duplicates `chart-data/`, which already exercises the full-coverage path).

- **Decision:** Landed under the existing 98k analyze user-prompt budget instead of raising it,
  by tightening the guide bullet and moving its interpretive half (how to READ a band) into the
  cached doctrine prefix (measured 97_731).
- **Why:** feat-095's reconciliation note in `tests/prompt-data-sync.test.ts` declares 98k "a
  deliberate stop, not a running total: the next fact to land here should trim something before it
  bumps this number again" — this feature is that next fact. The split also follows the feat-080
  dedup rule the repo already runs on: static doctrine belongs in the cached prefix (paid once),
  live values and pointers in the per-run user message.
- **Alternatives considered:** bumping to 100k (ignores an explicit, recent instruction from the
  feature that set the stop); dropping `vwapRungs` from `factsPayload` and surfacing only the
  nested bands (saves ~450 chars but leaves the model to flatten and label the rungs itself — the
  attribution labels are the point).

## feat-093 — 2026-08-09

- **Decision:** The day-type thresholds are **pinned-empirical**, not live-computed:
  `PINNED_IB_EXTENSION_DISTRIBUTION` in `lib/engine/tpoDayType.ts` hard-codes review section
  B7's measured sample (n=62; day/IB p25 1.25, median 1.52, p75 2.08, p90 2.58, max 3.58;
  sides 4% / 79% / 16%), and `classifyTpoDay()` takes the distribution as an **optional
  argument defaulting to that constant** — the feat-100 seam.
- **Why:** feat-093's spec says to ground classification in the bundle's own extension
  distribution rather than textbook thresholds where they disagree, but the feature that
  *computes* that distribution per bundle (feat-100) is `not-started` and explicitly out of
  scope. B7 has already measured it, so the measured numbers are pinned as named constants
  with the review section cited in the docblock. The fact reports
  `classification.distribution.source` (`pinned-empirical` | `measured`) and `sampleSize`, so
  a briefing can always tell which distribution judged the session. feat-100 needs only to
  build an `IbExtensionDistribution` with `source: 'measured'` and pass it through
  `computeTpoFacts` → `classifyTpoDay`; no classifier logic changes.
- **Alternatives considered:** textbook thresholds (rejected — the spec forbids it where they
  disagree, and they disagree sharply: the textbook normal day is day/IB ≈ 1.0, but the
  measured p25 is already 1.25 and only 4% of sessions had no extension at all, so a textbook
  cut would classify almost nothing as normal); computing the distribution here from
  `daily-value-areas.csv` (that IS feat-100 — out of scope, and the daily history carries no
  IB, so it would need the same HTF reconstruction feat-100 owns).

- **Decision:** `double-distribution` is evaluated FIRST, ahead of `trend`, and when the same
  session's extension also clears the trend decile the `dayTypeBasis` says so explicitly
  ("double-distribution trend day").
- **Why:** `dayType` is a single closed enum but the two reads are not mutually exclusive — the
  chart-data fixture is both (two bodies split by E's 12-bin single-print vacuum, *and* a 3.25x
  one-sided extension above the p90). Double distribution is the more specific structural claim
  and the one nothing else in the engine names, so it wins the slot; the trend qualification is
  preserved in prose rather than silently dropped.
- **Alternatives considered:** trend first (loses the two-body shape, which is the actionable
  part — the vacuum between the distributions is the boundary that matters); a second
  `dayTypeSecondary` field (more payload for a case the basis line already carries).

- **Decision:** Open type is read from the opening periods' **ranges**, using the first
  period's own range as the stand-in for the opening price, over a 3-period window.
- **Why:** `tpo.data.md` exports no opening price — only `Price,TPOCount,Letters` — so the
  textbook "never traded back through the open" test is not literally computable. The first
  period's range is the tightest available proxy: an open-drive leaves it and never returns, a
  test-drive pokes one side and drives out the other, a rejection-reverse auctions well past
  one side then reverses further past the other. Documented as a proxy in the module docblock,
  with every cut-off a named exported constant.
- **Alternatives considered:** deriving the open from `execution_bars.csv`'s first RTH bar
  (couples a TPO fact to a different export and to session-boundary logic this module has no
  business owning; also breaks the "letter sequence is the only requirement" property); adding
  an `Open` line to the study export (an exporter change, i.e. a new feature, not feat-093).

- **Decision:** Nothing in the classifier branches on a clock time; `periodClock` only decorates
  the output, and `neutral-extreme` uses "the last period sits on a session extreme" as its
  proxy for the textbook "closes on the extreme".
- **Why:** `facts.tpo.periodClock` is null on every live bundle until the Sierra ACSIL study
  ships feat-092's two metadata lines, so a classifier that needed times would be dead code in
  production. Letter *sequence* is always present. Likewise the TPO export carries no close, and
  the final period's location is the closest ladder-derivable stand-in. Pinned by a test that
  strips the anchor lines from the fixture and asserts an identical classification with every
  `clock` null.
- **Alternatives considered:** requiring the anchor and returning null without it (would make
  the whole feature inert on live data).

- **Decision:** Analyze-prompt size budget consciously raised 98k → 101k (measured 100,319)
  AFTER trimming the fact; the classification rule is analyze-only, not shared with the update
  prompt.
- **Why:** feat-097 left the gate at 98k with 269 chars of headroom and an explicit note that
  *the next fact to land should trim before it bumps this number again*, so the trim came
  first: the fact went from +3,056 to +2,588 chars — per-period extension is filtered to
  extension *events* (3 rows on the fixture, not 13) and stripped of the running high/low each
  event implies, `dayRange` dropped because `tpo.sessionRange` already carries it,
  `periodCount` dropped as `periods.length`, and the reference distribution cut to the two
  quantiles the ladder actually cuts at (p25/p90, with the sample size B7 requires) — and the
  guide bullet was rewritten tight. What remains is irreducibly new: the bullet has to teach
  two closed enums plus how to trade each day type, and neither appears anywhere in the cached
  prefix. Keeping it out of the update prompt bounds the cost further: day type and open type
  are settled by the letter sequence the morning briefing already saw, so an update would be
  paying to restate an unchanged fact. Rationale recorded inline in the feat-054 gate, per
  convention, and the stop note is restated there rather than deleted.
- **Alternatives considered:** dropping `dayTypeBasis`/`openTypeBasis` (~300 chars saved, but
  they carry the numbers the briefing is supposed to quote); emitting all periods rather than
  extension events (~1.5k more, mostly rotation rows that say nothing).
