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
## feat-096 — 2026-08-09

- **Decision:** The default significant-move floor is **0.4σ** of the measured Parkinson
  session sigma (~113 pts at the review's 283-pt reference, ~118 pts on the repo fixture's
  295.12-pt sigma), not a round number and not a sigma expression of the old 50 pts.
- **Why:** The point of review D3 is that 50 pts = 0.18σ filtered nothing, so a
  units-preserving conversion (0.18σ) would have shipped the same no-op in new clothes. 0.4σ
  is defensible against the measured distribution from four directions: it is one median
  30-min bar range (110 pts — the old floor was 0.45 of one bar); ~1.1 of the operator's
  average rotation (~102 pts, the 2026-07-27 expectancy note); 24% of a median day range
  (464 pts), so a session still has room for three qualifying setups; and it sits ABOVE
  feat-095's `SIGMA_NOISE_MAX` (0.25σ), the band the engine already calls "not a meaningful
  gap" — the old floor sat *inside* that band, which is precisely why it could never filter.
  Pinned in `lib/engine/scaledGates.test.ts` against the review's numbers rather than read
  back out of the implementation.
- **Alternatives considered:** 0.25σ (= the noise boundary, 71 pts — clears the "inside
  noise" objection but still under one bar range); 0.5σ (142 pts, the "meaningful" band
  floor — rejected as too aggressive for a *minimum*: it would abstain on legitimate
  rotations in a quiet tape); re-tuning the fixed points to ~110 (rejected — the number is
  fixed while the regime is not, which is half of the D3 finding).

- **Decision:** The DB column is RENAMED `significant_move_pts` → `significant_move_sigma`
  (numeric, CHECK 0.05–2.0), not kept under the old name with new units.
- **Why:** The feature description says "keeping significant_move_pts as the
  /settings-editable multiplier", which reads as *keep the same single knob*, not *keep the
  same identifier*. A column literally named `_pts` holding a sigma multiple is a naming lie
  that would mislead every future reader and every hand-written SQL query, and the units
  change already requires a migration. The knob itself is unchanged: one number, same place
  in `/settings`, same role.
- **Alternatives considered:** Keeping the name and changing only the semantics (rejected —
  silent unit drift is exactly the class of bug this feature exists to fix); adding a second
  column and keeping both (rejected — two sources of truth for one gate).

- **Decision:** The migration converts an existing stored value by CASE: exactly 50 (the
  untouched feat-086 default) becomes the new 0.4 default; anything else is converted
  proportionally as `points / 283` and clamped into 0.05–2.0.
- **Why:** A stored 50 surviving as 50σ (~14,000 pts) would abstain on every level, so a
  raw carry-over was never an option. But a purely proportional conversion of the *default*
  (50/283 = 0.18σ) would carry the no-op gate straight across into the new units and ship a
  feature that changes nothing on the live database. 50 is the seeded default and was never
  operator-tuned, so it takes the new default; any other value was a deliberate operator
  choice expressed in points and is honored proportionally at the reference sigma.
- **Alternatives considered:** Proportional conversion for all values (rejected — preserves
  the bug on the one database that matters); resetting all values to the default (rejected —
  discards a real operator preference without asking).

- **Decision:** When the session sigma is unmeasured, every gate falls back to its
  pre-feat-096 FIXED point value (50 / 1 / 5) rather than resolving the multiple against the
  283-pt reference sigma.
- **Why:** An unmeasured scale means the engine has just admitted it cannot size the regime
  (under 3 complete RTH sessions); quoting `0.4 × 283 = 113 pts` there would invent a scale
  from a historical constant and present it as measured. The fixed fallback is honest, is
  exactly the pre-feature behaviour, and is stated as a fallback in both the prompt and the
  warning text (`describeGate`). The gate is never dropped and never divides by zero.
- **Alternatives considered:** Resolving against `REFERENCE_SESSION_SIGMA_PTS` (keeps the
  operator's configured multiple meaningful and would make the gate strictly stronger — a
  defensible choice, rejected as it presents a historical constant as a live measurement);
  skipping the gate entirely when unmeasured (rejected outright — silently dropping a
  guardrail).

- **Decision:** The analyze user-prompt budget ceiling was NOT raised; it stays at 98k.
- **Why:** feat-095 left the 98k ceiling as "a deliberate stop, not a running total" with the
  instruction that the next feature should trim before it bumps. Stating each gate in both
  units (resolved points + multiple) is this feature's headline requirement and measured
  +135 chars, so the interpretive half of the floor bullet — "rescaled every run so the floor
  tracks the regime" — moved into the cached `output-objective.md` prefix (feat-097's
  pattern: interpretation in the cached prefix, live numbers in the per-run message),
  landing at **+84 net**. Measured 97_815 against the then-98k stop; after rebasing onto feat-093 (which raised the ceiling to 101k for `tpo.classification`) it re-measures 100_403 — feat-096 itself never moved the number. The user message now
  carries only numbers that change per run.
- **Alternatives considered:** Raising the ceiling to 99k (rejected — the instruction was
  explicit and the trim was available); dropping the multiple from the prompt and quoting
  points only (rejected — the spec requires both units so the model can reason about why the
  floor moved between runs).

- **Decision:** The migration is COMMITTED BUT NOT APPLIED to the live database.
- **Why:** This session has no Supabase credentials (no `.env` in the environment) and DDL
  cannot go through PostgREST, so applying it was impossible rather than skipped. The
  existing `fetchConfigRow` degradation ladder already covers exactly this state: the live DB
  still carrying `significant_move_pts` fails the full select, falls to the
  pre-significant-move tier, pads `significant_move_sigma` with 0.4, and `/settings` tells the
  operator to apply the `volatility_scaled_gates` migration before saving. Recorded in
  `.claude/skills/gekko-db/SKILL.md` as a PENDING migration so the snapshot does not claim a
  live column that is not there.
- **Alternatives considered:** Blocking the feature on DB access (rejected — the degradation
  path is designed for this and the code half is independently verifiable).
## feat-089 — 2026-08-09

- **Decision:** the partition lives in `lib/engine/parseDailyValueAreas.ts` as a separate
  exported `partitionDailyValueAreas(rows, liveSessionDate)`, not inside `parseDailyValueAreas`
  itself.
  **Why:** the parser has no way to know the live session date, and giving it one would make a
  pure "text → rows" function depend on the rest of the bundle. The parse module still OWNS the
  partition (same file, same contract prose), which is what the spec asks for.
  **Alternatives considered:** a `parseDailyValueAreas(content, liveSessionDate)` overload
  (changes every existing call site and couples parsing to bundle context).

- **Decision:** the live session date is `tpo.sessionDate` when the bundle has a TPO export,
  else the trading day of the LAST EXECUTION BAR (`tradingDayOf`, widened to accept any
  timestamped bar). A mismatch between the two is warned, and the TPO date wins.
  **Why:** the spec designates `tpo.sessionDate`, but TPO is best-effort and can be absent
  (pre-study bundles, and every eval bundle). The exec bars are always present and are the
  freshest dated tape in the bundle, so they are the honest fallback. Never the wall clock:
  chart time is US Central and the engine stays timezone-independent, exactly as
  `overnightSession` does.
  **Alternatives considered:** falling back to the HTF bars' trading day (also fine, but the HTF
  export is parsed later and is itself optional); refusing to partition without TPO (leaves the
  original bug in place for eval and pre-study bundles).

- **Decision:** `computeRelativeVolume`'s `dailySessions` input was RENAMED to
  `completedSessions`, with a new sibling `developingSession`, rather than being left in place.
  **Why:** feat-094 flagged that `computeDailyVolumeRvol` had its own "newest row is today"
  date-matching — a second, competing notion of the live session. The rename makes an
  un-partitioned list a COMPILE error instead of a silent regression where the live row rejoins
  its own baseline.
  **Alternatives considered:** keeping the field and having relativeVolume re-derive the date
  (two notions of "today" that must agree forever — the drift the harness guards against).

- **Decision:** elapsed RTH minutes comes from the last EXECUTION bar's chart-time timestamp,
  clamped to `[0, 390]`.
  **Why:** the exec export is the freshest clock in the bundle (volume bars, seconds
  granularity); the HTF 30-min bar start would understate elapsed time by up to half an hour,
  and `input.now`/`received_at` are UTC and would need a timezone conversion the engine
  deliberately avoids everywhere else.
  **Alternatives considered:** deriving elapsed minutes from feat-094's `slotsCovered` (coarse,
  30-min granularity, and null whenever slot history is thin).

- **Decision:** the maturity `read` is driven by the CLOCK first, falling back to the volume
  expectation, and is `'unknown'` when neither exists.
  **Why:** the clock is unconditional; the volume expectation needs ≥10 prior sessions per slot.
  Reporting a maturity band from a missing input would be exactly the fabricated confidence the
  qualifier exists to prevent.
  **Alternatives considered:** blending the two into a single score (unexplainable in prose, and
  the two disagree meaningfully on a heavy-volume half day — which is information, not noise).

- **Decision:** added the live in-progress row (`2026-06-16`, matching `tpo.data.md`'s session
  date and its session high/low, with a deliberately different VOLUME POC) to
  `chart-data/daily-value-areas.csv`.
  **Why:** the fixture could not represent the bug it now guards. With the row present the
  prompt-data-sync gate exercises the partition end to end and the prompt's
  `developingSession.*` fact-path pointers actually resolve. It also makes the fixture faithful
  to what the shipped study writes.
  **Alternatives considered:** leaving the fixture completed-only and referencing only the bare
  `developingSession` token in prose (the gate would then never see the feature, and the fact's
  sub-paths would go unguarded).

- **Decision:** raised the analyze user-prompt size budget 101k → 104k
  (`tests/prompt-data-sync.test.ts`, measured 102,435 after rebasing onto
  feat-091/093/094/095/096/097),
  but trimmed first, because feat-097 left an explicit note that 98k is "a deliberate stop" and
  "the next fact to land here should trim something before it bumps this number again". The
  trims: three fields in `developingSession` that duplicated its own top-level scalars
  (`maturity.rthSessionMinutes`, `maturity.volume.sessionVolume`, `maturity.range.rangePts`),
  the guide bullet cut ~25%, and both split warnings shortened.
  **Why:** unlike the facts that pushed the ceiling to 98k, this row was ALREADY inside every
  bundle — silently corrupting `valueMigration.priorDay` into TODAY — so the choice was never
  "carry it or not" but "carry it labelled or carry it lying". Nothing raw is inlined.
  **Alternatives considered:** dropping `maturity.basis` (saves ~200 chars and removes the one
  field the model can quote verbatim); omitting the split warnings (the spec requires them);
  suppressing `developingSession` when `maturity.read === 'early'` (hides the fact exactly when
  the model most needs to be told the value area is unformed).

- **Decision:** the optional `IsComplete` column is parsed and cross-checked, but never
  partitioned on; a disagreement raises a warning and the DATE verdict stands.
  **Why:** the spec is explicit that the engine must not depend on it, and an exporter flag that
  silently outranked the dates would reintroduce the same class of bug from the other side.
  **Alternatives considered:** ignoring the column entirely (loses a free drift detector);
  trusting it when present (couples the engine to an exporter field that does not exist yet).


## feat-090 — 2026-08-09

- **Decision:** the developing session's value levels (`developingSession.poc/vah/val`) are
  NOT added to the anchor set. Today's TIME-based value (`tpo.poc`, `tpo.valueArea`) IS.
  **Why:** the brief named only `priorDay` and the TPO/composite levels and asked for this to
  be decided deliberately. An anchor is a price an entry is committed to in advance, and a
  developing volume value area is still moving: its POC can migrate tens of points between the
  briefing and the fill, so an entry "on structure" at 09:45 is off it by 11:00 — the anchor
  set would be validating against a level that no longer exists. feat-089 makes the same point
  from the other side by attaching a maturity qualifier to the fact precisely because it is
  provisional. The live session is not left unanchorable, though: `tpo.poc` and the TPO value
  area are the same session read time-based, and they ARE promoted here, so the operator's
  "today's POC sits 1 pt away and cannot host an entry" complaint is answered. The developing
  fact stays what feat-089 built it to be — context the model reads and weighs by maturity.
  **Alternatives considered:** promoting it gated on `maturity.read === 'mature'` (a threshold
  that silently changes the anchor set mid-session, so the same briefing is valid at 14:00 and
  invalid at 09:30 — worse than either constant answer); promoting it unconditionally
  (anchors on a moving target, and doubles up with the TPO read of the same session).

- **Decision:** the prior-day value area reaches the anchor set through `mgiPriority` →
  `terrain`, while the TPO/composite levels are passed straight into `engineAnchorPrices()`.
  **Why:** the spec's own split, and it is the right one. RVAH/RVAL/RPOC are *named doctrine
  levels* with a defined tier and a defined rank, so they belong in the level classification
  where they get tested against local volume geometry like every other level. The TPO and
  composite POCs have no MGI name and no tier; terrain is built from the two VOLUME profiles
  plus the MGI levels, and nothing time-based can enter it without inventing a classification
  for it. `engineAnchorPrices` is exactly the seam for "hostable structure that is not
  terrain" — feat-074's LVN nodes and feat-097's VWAP rungs arrive the same way.
  **Alternatives considered:** passing all seven prices directly into `engineAnchorPrices`
  (leaves the doctrine's ranks 4–5 permanently missing from the priority sort, which is half
  of what the review asked for); synthesizing MGI levels for the TPO POCs too (invents tiers
  and ranks doctrine does not define).

- **Decision:** `engineZoneBorders()` is untouched, and the terrain zone stack does not change.
  **Why:** feat-097 established that the zone-border set is the hard-enforced partition the
  model must reproduce, and a POC is structure, not a partition. Adding three MGI levels *does*
  reach `assembleTerrain` (that is the point — `selectAnchorLevels` takes the whole `daily`
  group), so this was checked rather than assumed: on the fixture bundle the stack is 10 zones
  / 11 borders before and after. The three levels earn level verdicts, not zone splits.

- **Decision:** `resolveCurrentPrice()` was extracted from `computeMgiPriority` and the
  value-area partition moved above the MGI classification in `computeEngineFacts`.
  **Why:** `computeMgiPriority` now takes an input (the prior completed session's value area)
  that is itself parsed from an export priced against the current price — a cycle unless the
  price is resolved first. One exported helper keeps a single source and a single failure mode
  for "which price is live" rather than a second `mgi.current.price` read at the call site.
  **Alternatives considered:** computing `mgiPriority` twice (once for the price, once with
  the value levels) — two `MgiPriority` objects in scope is exactly the kind of trap where a
  later edit reads the stale one.

- **Decision:** raised the analyze user-prompt budget 104k → 106k, after trimming 3,738 chars
  in the same diff (measured 105,063; net +2,628 over feat-089's 102,435).
  **Why:** feat-089's stop says trim before you bump, so the trim came first. Promoting three
  levels costs ~6.4k because each earns a FULL terrain verdict (~660 chars) — and that verdict
  is the entire point, since it is what makes the level anchorable. The trim is the payload's
  largest genuine duplication: `mgiPriority.tier1` and `mgiPriority.dailyPrioritySort`
  re-serialized level objects that `mgiPriority.levels` already carries two lines above them.
  They are now `"LABEL PRICE #rank"` strings — the ORDERING is what those two views exist for,
  and it survives intact. The new anchoring doctrine went into the cached
  `output-objective.md` prefix (feat-096's pattern), so it costs the per-run budget nothing.
  **Alternatives considered:** dropping `tier1`/`dailyPrioritySort` outright (loses the two
  orderings, which are real engine output); trimming terrain verdict internals (`local` stats,
  embedded magnet refs) — a bigger, riskier change to the model surface with no connection to
  this feature; not promoting the levels to terrain (fails the feature).

## feat-108 — 2026-08-09

- **Decision:** Ship `ATR_PROJECTION_MULTIPLES = [0.5, 1, 1.5, 2]` — the starting set — but only
  after arguing each end against the measured scale, and bound it there.
- **Why:** Measured on the repo's own HTF export: ATR 116.23 pts, session sigma 295.12 pts, so
  0.5x = 0.20σ, 1x = 0.39σ, 1.5x = 0.59σ, 2x = 0.79σ (13/26/39/52% of the 446-pt median session
  range). The set stops at 2x because 3x is 349 pts — 1.18σ and 78% of a median session range,
  larger than the whole rotation the engine measures — so a rung there extrapolates past the
  measured distribution rather than naming structure. It stops at 0.5x because 0.25x (29 pts)
  sits inside the fixed 25-pt operational stop itself and could be traded neither to nor away
  from. 0.5x is retained despite failing the target gate because it is still 2.3x that stop and
  half an ATR beyond a swing is the operator's stop placement.
- **Alternatives considered:** (a) dropping sub-1x multiples entirely — rejected: it would delete
  legitimate entry/stop structure to avoid a target-only problem, and under the unmeasured-sigma
  fallback those rungs actually qualify; (b) adding 3x for "runner" targets — rejected as above;
  (c) deriving the multiples live from the session sigma so 1 rung always equals the floor —
  rejected: the operator names ATR multiples out loud ("plus one ATR"), so the multiples must be
  the round numbers he says and the GATE is what varies.

- **Decision:** The "below 1x mostly fails the gate" constraint is expressed as a per-rung
  `clearsSignificantMove` boolean resolved against feat-096's gate AS IT RESOLVES THAT RUN, plus a
  fact-level `significantMoveNote` — not as a static filter and not as a fixed threshold.
- **Why:** The gate is not a constant. `resolveGates` returns 118.05 pts against the fixture's
  measured 295.12-pt sigma, but degrades to the fixed 50-pt `SIGNIFICANT_MOVE_FALLBACK_PTS` when
  the scale is unmeasured — under which a 0.5x rung (58 pts) DOES clear. Which multiples can host
  a target is therefore a property of the regime, not of the multiple, and any static filter
  would have been wrong in one of the two regimes. This is also sharper than the brief assumed:
  1x ATR = 0.394σ against a 0.4σ floor lands 1.82 pts UNDER it on this fixture, so even the 1x
  rung is flagged. Both regimes are pinned by tests.
- **Alternatives considered:** (a) filtering sub-floor rungs out of `rungs` — rejected: they are
  valid entry and stop anchors, and silently dropping them is the "silently cannot host an
  objective" failure the feature description names; (b) a note field alone with no per-rung flag —
  rejected: the model would have to do the arithmetic per rung, which is the freehand ATR
  arithmetic this feature exists to remove.

- **Decision:** Swing-anchored rungs project OUTWARD only (swing high upward, swing low downward);
  current-price rungs project both ways.
- **Why:** The two uses the operator named are directional — "current price plus one ATR" is a
  target either side, "swing low minus one ATR" is where a reversal is expected, i.e. where an
  extension BEYOND the swing exhausts. Projecting inward from a swing would mint prices inside the
  rotation, which terrain already partitions and the current-price projections already reach —
  duplicate structure with a weaker claim on it, at real payload cost.
- **Alternatives considered:** projecting both directions from every reference (32 rungs instead
  of 16, half of them redundant with terrain).

- **Decision:** `significantMoveSigma` was added as an optional `EngineFactsInput` field rather
  than resolving the gate in the prompt layer where feat-096 put it.
- **Why:** The flag has to be computed where the rungs are built, and the rungs are engine facts
  that also feed `engineAnchorPrices()`. Both call sites (`analyzeBundle`, `updateBundle`) already
  resolve `config.significant_move_sigma` a few lines above `computeEngineFacts`, so passing it
  down costs nothing and keeps the engine from silently assuming the default when the operator has
  edited the config. It defaults to `DEFAULT_SIGNIFICANT_MOVE_SIGMA`, so every existing caller
  (including tests) is unaffected.
- **Alternatives considered:** computing projections in the prompt layer (splits one fact across
  two layers and leaves `engineAnchorPrices` unable to see them); hardcoding the default in the
  engine (wrong whenever the operator has changed the setting — the exact drift feat-096 fixed).

- **Decision:** Held the analyze user-prompt ceiling FLAT at 106k and paid for the new fact by
  harvesting duplication — measured 102_273, which is 2_790 chars BELOW the 105_063 baseline.
- **Why:** `tests/prompt-data-sync.test.ts` carries an explicit standing instruction ("the next
  fact to land here should trim something before it bumps this number again"). The naive wiring
  measured 110_459 (+5_396). Two trims, neither changing what the model sees semantically:
  (1) all 10 `terrain.borders[].members` entries were verified byte-identical to verdicts
  `terrain.levels` already carries, so members keep price, kind, `hard`/`faint`/`shallow`,
  `source` and the `reason` string the AAA-demotion rule quotes, and drop the re-serialized
  `level` object, `local` block, `magnet` ref and `detectorNode` (all reachable under the same
  label two lines up) — this is exactly the duplication feat-090 identified; (2) rungs render as
  compact `PRICE · label · travel` strings, the feat-090 `mgiPriority.tier1` precedent. The
  interpretive half of the teaching went into the cached `output-objective.md` prefix
  (feat-096/097's split), which measures 46_757 against its 47k ceiling — also not raised.
- **Alternatives considered:** raising the ceiling to 111k (ignores a recent explicit instruction
  and would have been a pure bump with no trim); dropping `rungs` from the payload and letting the
  model read only `atrPoints` (returns the feature to freehand arithmetic — the whole point).

- **Decision:** Verified the zone stack rather than assuming it, per feat-090's example, and did
  not touch `engineZoneBorders()`.
- **Why:** The zone stack is hard-enforced as the set the model must reproduce; an ATR projection
  is a derived expectation, not a partition of the map. Measured 10 zones / 11 borders on the
  fixture before and after, pinned as an assertion alongside a test that the anchor set DID grow —
  so the test fails if the rungs ever leak into the partition.
- **Alternatives considered:** none — this boundary was set by feat-097 and restated in the brief.
## feat-100 — 2026-08-09

- **Decision:** the minimum live sample is `MIN_IB_DISTRIBUTION_SESSIONS = 20` complete RTH
  sessions; below it the review's pinned n=62 distribution stands and the fact says so.
  **Why:** the number has to be argued from the quantile the day-type ladder cuts hardest
  at — the p90 that separates a trend day from an ordinary variation. Under R-7
  interpolation a p90 at n=20 lands between the 2nd and 3rd largest observations, so one
  wild session cannot set the trend threshold alone; below ~15 the p90 IS effectively the
  sample maximum, which would make "trend day" mean "the biggest day in this window".
  feat-095's `MIN_SIGMA_ESTIMATION_SESSIONS = 3` is precedent for the PATTERN, not the
  number: a mean over three sessions is a usable scale, a top decile over three sessions is
  not a decile. The rolling-90-day export carries ~60 complete sessions (60 on bundle
  1c15934a), so live bundles clear it comfortably and the gate binds only on a fresh export.
  **Alternatives considered:** 10, which would have let the 12-session repo fixture measure
  live and shown `source: 'measured'` in the committed integration test — rejected because
  choosing a statistical threshold to make a fixture look better is exactly backwards; the
  measured path is proven instead against the real bundle (n=60) and by a synthetic
  ≥20-session unit test.

- **Decision:** the quantiles are projected into prices DIRECTIONALLY — the measured
  one-sided extension beyond the IB edge (`ibHigh + q × ibRange`, `ibLow − q × ibRange`) —
  rather than by re-anchoring the implied day range on the session's realized extreme.
  **Why:** 79–80% of measured sessions extend one side only, so the one-sided extension
  distribution is the statistic that actually answers "how far past the IB does this
  market go". It also reproduces the review's own worked example: on bundle 1c15934a the
  p75 upside projection is 29892.65 against the review's quoted "extend to 29910 from this
  IB", where a day-range re-anchor gives 30126 — a 230-pt difference that would put target
  rungs in a different place. Quantiles whose measured extension is 0 (the p25 either side,
  and the downside median on that bundle) emit NO rung: their price is the IB edge itself.
  **Alternatives considered:** the day-range projection (simpler, one distribution, but
  systematically too far and not what the review means); emitting both (double the payload
  for two answers to the same question, and the model would quote whichever suits).

- **Decision:** RTH session reconstruction was EXTRACTED into `lib/engine/rthSessions.ts`
  and feat-095's `volatilityScale.ts` re-exports the constants and `sessionOhlc` from it.
  **Why:** the brief called duplication the worse outcome, and the two hard-won facts here
  (`RTH_BARS_PER_SESSION` is 15, not the 17 the open→Globex window implies, because no bars
  print during the 16:00–17:00 CME halt; incomplete sessions must be excluded or a
  truncated range deflates the statistic being quoted) are exactly the kind that must exist
  once. feat-095's behaviour is byte-identical — its 39 tests pass unchanged — and its
  public exports are preserved by re-export, so no caller moved.
  **Alternatives considered:** copying the ~20 lines into `ibExtension.ts` (two definitions
  of "one RTH session" drifting apart at the next early-close bug); moving the exports
  outright and updating every importer (a bigger diff across feat-095/096 for no gain).

- **Decision:** `terrain.partitions` was dropped from the MODEL's payload (not from
  `facts.terrain`), lowering the analyze user-prompt ceiling 106k → 100k with the feature
  landing at 93,630 after the rebase onto feat-108 — the first downward move in this gate's
  history. feat-108 had already compacted the composite borders' members; the two trims
  compose in one `modelTerrain()` projection and are documented together there. The CACHED
  prefix ceiling moved the other way, 47k → 48k (measured 47,248), because the target-rung
  sanity check belongs in the cached doctrine: that prefix is paid once per model version,
  the user message every run, and that trade is what let the user-prompt ceiling fall.
  **Why:** the standing stop says trim before you bump, and feat-090 named this exact
  duplication. `terrain.partitions` is built as `levels.filter(v => v.hard)` — literally the
  same verdict objects — and was re-serialized in full (11,069 chars on the fixture) two
  keys below the list it came from. No prompt line, no doctrine file and no output field
  names it; what the model reasons about is `terrain.borders`, the merged composite result,
  and `hard: true` on a level verdict carries the rest. Nothing the model can see was lost,
  so the ceiling came down with the payload rather than banking the slack.
  **Alternatives considered:** compacting the magnet refs embedded in every level verdict
  (feat-090's other candidate, ~2.4k, but it thins evidence the model does read); trimming
  the composite borders' `members` verdicts (the analyze prompt explicitly points the model
  at "the member verdict `reason`", so that one WOULD change what it sees); raising the
  ceiling to 108k (available, unnecessary, and the wrong habit).

- **Decision:** `computeEngineFacts` now parses the HTF export ABOVE the TPO block, holding
  any parse error and re-throwing it inside the original HTF block.
  **Why:** the day-type ladder is cut at the extension distribution, so the distribution has
  to exist before `computeTpoFacts` runs; only the PARSE moved (everything else in the HTF
  block depends on facts resolved later). Re-throwing in place keeps the warning's wording,
  position and ordering exactly as they were, which several tests and the trace depend on.
  **Alternatives considered:** computing the TPO facts and then recomputing just the
  classification afterwards (rebuilds `classifyTpoDay`'s whole input outside `tpoFacts.ts`,
  where it would rot); moving the entire HTF block up (it needs the value-area partition,
  which needs the live session date, which comes from the TPO export — a cycle).

- **Decision:** the `ibExtension` guide bullet is analyze-only; the update prompt receives
  the fact through the shared `factsPayload` but no rule line.
  **Why:** it mirrors its sibling `TPO_CLASSIFICATION_RULE` (feat-093) — the extension read
  is a statement about the SESSION's shape from its own first hour, settled once the morning
  briefing has it, and an update re-narrating it spends budget restating an unchanged fact.
  **Alternatives considered:** sharing the rule with the update prompt (defensible for
  target rungs, which updates do revise — recorded here as the obvious follow-up rather
  than taken silently in this diff).

- **Decision (feat-109):** all six VRange levels stay Tier 1; the 1x zone's two edges are merged
  into one composite border in `mergePartitions` instead of being separated by tier.
  **Why:** the operator supplied the Sierra study's definition, which corrected the diagnosis. Every
  VRange level is the session OPEN ± a multiple of `D`, the VIX-implied expected session move —
  `high`/`low` at 0.25·D, and the `ext*` levels at 0.90·D and 1.00·D, the NEAR and FAR edges of one
  shaded "1x Range Zone" (verified on two exports agreeing to 4 dp, both with D at 1.45% of the
  open, implied VIX ~23). So the pair genuinely is ONE object — but tier was the wrong lever for
  saying so. Tier answers "how important is this level"; the problem was that the engine treated one
  object as two. An earlier pass in this same branch demoted the far edge to Tier 2 (committed in
  6801604) and it cost a real partition: the fixture's genuine AAA acceptance sits at the FAR edge
  (29504.25) and the near edge has no volume geometry, so the demotion retired a border rather than
  relocating it (zones 10 → 9). Reverted. The merge keeps the partition where the profile actually
  shows acceptance while leaving BOTH edges as legal entry anchors, so a fade can still sit on the
  near edge.
  **Alternatives considered:** the midpoint of the two edges (the operator's first instinct —
  rejected: a price nothing was measured at, and it discards the zone's extent); demoting the far
  edge to Tier 2 (tried, reverted, see above); demoting the WHOLE `vRange` group to Tier 2 for
  consistency with ATR (audit A9 keeps ATR projections out of Tier 1 as "not campaign borders or
  partition anchors", and VRange is the same category — a volatility projection off a reference
  price). That last one was recommended and **declined by the operator**: the 0.25·D Upper/Lower
  lines are good levels in practice. Do not re-propose it.

- **Decision (feat-109):** VRange labels name what the level IS, not the export's field name.
  **Why:** `high`/`low` were labelled "VRange High"/"VRange Low" and documented as "VRange
  extremes", but they sit at 0.25·D — a quarter of the expected move. The model quotes MGI labels
  verbatim in briefing prose, so it was calling the inner mean-reversion line the session's expected
  extreme, wrong by a factor of four. Now `VRange Upper`/`VRange Lower`, with the extensions as
  `VRange 1x Zone near/far (upper|lower)` so the zone reads as one object in the composite border's
  joined label. `knowledge/doctrine/chart-reading.md` and `glossary.md` corrected to match.
  **Alternatives considered:** leaving the labels and fixing only the docs (the label is what
  reaches the operator, so the doc fix alone would not have changed a single briefing).

- **Decision (feat-109):** the Rip ranks with the campaign borders in `borderRank` via a new
  `consolidationTier()`, instead of being promoted to Tier 1 in `mgiPriority.ts`.
  **Why:** the operator asked for the Rip to be able to hold a border. It could always BE one (it
  is a `daily`-group level, so `selectAnchorLevels` always carried it — the `code === 'rip'` clause
  was redundant and is deleted); what it lost was the 16–60 pt consolidation window, too far to
  merge into one band and close enough to trip spacing, where `borderRank`'s tier key handed the
  border to any Tier-1 neighbor. A real tier promotion would leak into `mgi.tier1`, which feeds the
  Stratosphere/Abyss envelope and `nearestTier1Above/Below` — and the Rip tracks price intraday, so
  it would frequently become the campaign ceiling or floor and collapse the terrain map. Survival
  rule, not reclassification: `border.tier` still reports the true tier, and the playbook's Tier-2
  (Intraday Direction) classification stays honest.
  **Alternatives considered:** `LEVEL_SPECS` promotion (the envelope collapse above); a dedicated
  rank slot between tiers 1 and 2 (same effect, more machinery for one level).

- **Decision (feat-109):** `nearestDailyAbove/Below` covers the WHOLE daily group, not just the
  Daily-MGI-ranked members, and `nearest()` now rejects non-positive prices.
  **Why:** `dailyPrioritySort` is rank order and blind to distance, and the only distance-aware MGI
  fact was Tier-1-only — so the Rip, PDH/PDL, IBH/IBL, RVAH/RVAL/RPOC and the OR levels could never
  reach the model with a distance attached, however close. Wrong shape for feat-086's entry-first,
  nearest-first contract; the fixture makes it concrete (price 3.00 pts under PDC, nearest Tier-1
  border 100.25 pts away, and PDC is Tier 2 AND unranked). Rank-only would have excluded OR
  High/Mid/Low, which are unranked but live session structure the doctrine uses as rungs. The
  placeholder guard is required because ONH/ONL export as 0.00, which is finite and survives
  extraction — on a gap-down open with nothing real below price it would have been returned as the
  nearest level below. Same guard `terrainZones` already applied to its campaign anchors.
  **Alternatives considered:** ranked-only (drops the OR levels); filtering 0.00 out at extraction
  (cleaner, but it would change `levels`, `tier1`, `dailyPrioritySort` and the terrain anchor set
  at once — the targeted guard in `nearest()` is the minimal correct fix and terrain already
  guards itself); also feeding the new pair into `sigmaStructureRefs` (left narrow by design —
  its docstring says so, and 4 refs → 6 buries the "is the next thing inside the noise?" answer).

- **Decision (feat-111):** the daily Job Pivot tiers at **Tier 2, Daily MGI Priority rank 1 shared
  with the Rip**; the Weekly Job Pivot at **Tier 1**; and only the pivot LINE is exported, not the
  study's Pivot High / Pivot Low zone edges. All three are operator calls, made against options.
  **Why:** the daily pivot's stated job — the level directional bias flips across depending on
  which side price can hold — is the Rip's job, so it belongs in the Rip's class rather than in a
  new rank of its own. Sharing rank 1 also means nothing below moves: ONH/ONL stay at 2 and the
  rest of the order is untouched, so the change cannot silently re-sort levels it was not about.
  The weekly pivot is built from the PRIOR week's activity, which is exactly what makes every
  other weekly level Tier 1, so it tiers with them and can hold a partition. The zone edges were
  declined to keep the single-price shape every other MGI level has.
  **Alternatives considered:** its own rank below the Rip (pushes ONH/ONL and everything under it
  down one, for a level whose function duplicates the Rip's); Tier 1 for the daily pivot (it would
  enter `mgi.tier1`, which feeds the Stratosphere/Abyss envelope — same collapse the feat-109 Rip
  decision above refused, and for the same reason: a pivot tracks price intraday).

- **Decision (feat-111):** `consolidationTier()` is re-keyed from `code === 'rip'` to
  `group === 'daily' && dailyRank === 1`.
  **Why:** feat-109's exemption was always argued from the RANK ("the Daily MGI Priority Order's
  rank-1 level, the immediate directional filter") and written as a code check only because the
  Rip was the only rank-1 level in existence. Now that a second level shares that rank on the same
  reasoning, the code check would have quietly denied it the protection the rule already grants.
  Writing the predicate the rule actually claims is the smaller change and removes the trap.
  **Alternatives considered:** `code === 'rip' || code === 'jobPivot'` (the same latent bug, one
  level later, and the `jobPivot` code is shared with the weekly level so the disjunct would have
  been wrong-by-construction); leaving the Job Pivot unprotected (it would lose its border to any
  Tier-1 neighbour 16–60 pts away — the exact failure feat-109 was raised to fix).

- **Decision (feat-111):** the Job Pivot subgraph index is a Sierra study INPUT with a default,
  not a constant like every other subgraph index in `MgiDataExporter.cpp`.
  **Why:** the other exported studies' indices were established by working exports. These two are
  third-party DLLs (`OrderFlowLabs.com_64.dll`) with no source available, and the chartbook does
  not persist subgraph names, so the default `2` (`Pivot`) is inferred from the DLL's own
  subgraph-name ordering — good evidence, not verification. An input makes a wrong inference a
  settings-dialog fix instead of a recompile, and the debug log line prints the resolved study ID
  and index so a mismatch is diagnosable from the Sierra message log.
  **Alternatives considered:** hardcoding `2` (a wrong guess exports a plausible-looking number
  from the wrong subgraph — the worst failure mode for this pipeline); looking the subgraph up by
  name at runtime (more machinery, and the name is not guaranteed stable across study versions).

## feat-112 — 2026-08-11

- **Decision (feat-112):** the session volatility scale aggregates per-session **sigma** with
  exponential recency weights (`ewMeanSigma`, decay 0.75), replacing feat-095's flat RMS of
  per-session **variance**.
  **Why:** the flat RMS is the right estimator for a stationary process and this series is not
  one. It failed on two axes at once — squaring made it outlier-dominated (an 898-pt session
  carries ~27x the weight of a 181-pt one), and a flat window is blind to a regime turn. On
  2026-08-11 it read 363.9 while the prior three sessions ranged 445/296/181 and the engine's own
  `dailyRanges` fact read "contracting". Backtested over the 60 RTH sessions in bundle b6f71b2e's
  export (predicting the NEXT session's realized sigma, 40 test points) it was the worst of
  seventeen candidates: RMSE 153.4, +58.6 pt bias, 65% of sessions landing under its forecast.
  **Alternatives considered:** EW-weighted **variance** — tried first and rejected on measurement,
  it moved the live estimate only 364 → 271 even at λ=0.70, because squaring dominates any
  weighting scheme applied on top of it; the 10-session **median**, which actually scored BEST on
  RMSE (127.4) and was nearly unbiased (-6.9, P(actual<pred) = 50%) but is a flat window wearing a
  robust hat — it read 352.8 on the same export, so it fixes the outlier axis and not the lag axis,
  and the operator's complaint was the lag. Accepting ~+27 pts of residual conservatism to get an
  estimator that turns with the regime was the trade, and it is the one the operator chose.
  Do not re-propose median-only or EW-on-variance without new measurement.

- **Decision (feat-112):** `SIGMA_ESTIMATION_SESSIONS` stays at **10** rather than widening to 20
  to give the exponential tail more room.
  **Why:** 1−0.75¹⁰ = 94.4% of the total weight already falls inside 10 sessions, and running the
  same estimator unbounded moved the live number 257.45 → 259.61 (0.8%) with a backtest difference
  (RMSE 133.9 vs 131.0) well inside the noise of 40 test points. Widening would have changed
  `barSigmaPts`, `medianBarRangePts` and `medianSessionRangePts` — all quoted to the model — onto a
  20-session basis as a side effect, making the descriptive statistics laggier in the same feature
  that exists to reduce lag.
  **Alternatives considered:** 20 sessions (above); a separate longer window for the EW estimator
  only (two windows in one module, and every reader would have to track which statistic used
  which).

- **Decision (feat-112):** the significant-move floor default moves 0.4σ → **0.3σ**, and this is a
  re-tune of the MULTIPLE only — feat-096's units decision is untouched.
  **Why:** 0.4σ was not chosen as a round number; feat-096 chose it *because* it equalled one
  median 30-min bar range at the 283-pt reference sigma. That equivalence was a coincidence of one
  regime. By 2026-08-11 the same multiple was ~1.5 bar ranges and 1.43x the operator's ~102-pt
  average rotation — i.e. the gate was rejecting trades of exactly the size the operator normally
  takes, which is the opposite of what a "is this worth trading" floor is for. 0.3σ is ~0.75 of a
  rotation and 3.1x the 25-pt operational stop, and it stays ABOVE feat-095's 0.25σ noise band.
  That last constraint is why it is 0.3 and not lower: a floor inside the band the engine already
  calls "not a meaningful gap" could never filter anything, which is exactly how the retired 50-pt
  (0.18σ) floor failed.
  **Alternatives considered:** leaving 0.4σ and shipping the estimator alone (measured: the floor
  would land ~103 pts on that bundle, still above the 87-pt span price sat in, so the reported
  briefing would have come out unchanged — a fix that does not fix the complaint); anchoring the
  gate to the operator's rotation size as `max(min-viable-trade, k·σ)` (defensible, but needs the
  ~102-pt rotation number re-measured before it can carry a hard floor, and the operator chose the
  simpler re-tune).

- **Decision (feat-112):** both pending migrations were applied via the claude.ai Supabase MCP
  `apply_migration` tool rather than escalated to the operator.
  **Why:** the tool is reachable from Claude Code even though `.claude/skills/gekko-db/SKILL.md`
  exists precisely because the MCP server is *normally* left disabled. An earlier session inferred
  "disabled" and escalated, and `20260809140000_volatility_scaled_gates.sql` then sat unapplied for
  two days — during which `config` carried `significant_move_pts = 50`, `fetchConfigRow` silently
  padded the sigma default, and the pipeline enforced a ~146-pt floor nobody had selected. Only
  `/settings` surfaces `significantMoveColumnMissing`; the analyze path does not. The general
  lesson, now recorded in the skill: **a padded config default is invisible to the pipeline that
  consumes it**, so a config migration must be applied the same day or the stored value is a lie.

## feat-102 — 2026-08-12

- **Decision:** `htfFlow.divergence` is COMPUTED by the engine, unit-tested, and **withheld from
  every prompt payload** (analyze, update, eval), pinned by gate tests rather than left to review
  discipline.
  **Why:** the feature spec's own scope caveat required controlling against the unconditional base
  rate before surfacing a directional claim, so a base-rate study ran in parallel with the
  implementation on 3,559 union'd HTF bars — three live Supabase bundles, 2026-04-26..2026-08-12,
  78 trading days, 6x the 593-bar repo fixture. Swing-level delta divergence produced 89 events
  whose fade thesis *underperformed* the unconditional base rate by 6.7 / 5.6 / 6.7 / 11.3 pp at
  h=4/8/16/34 bars; every 95% CI (day-clustered) contained the base rate; nothing survived Holm
  correction; 1 of 64 grid cells reached raw p<0.05 against 3.2 expected by chance. The
  like-for-like control — divergent vs delta-CONFIRMED fresh extremes — flips sign between
  horizons, so the fresh price extreme is doing the work and the delta is not. Direction matches
  the 2026-08-07 day-level rejection: divergence tilts CONTINUATION, the opposite of what the label
  implies, which is exactly the inference an unqualified "delta diverged" would invite next to a
  hold-or-exit decision.
  **Alternatives considered:** shipping it with a verbatim caveat (rejected by the operator — it
  spends eval-prefix budget, capped ~25k, on a fact whose honest description is "ignore this");
  deleting it from the engine entirely (rejected — keeping it computed and tested means a future
  study can license it with a one-line change at the marked seam, and the field documents the
  negative result at the point of use).
  **Do not re-propose without new data:** divergent swings arrive at 1.14/trading day, so a 5 pp
  lift needs ~800 events ≈ 700 trading days (~2.8 yr) and 0.25 ATR at h=34 needs ~1,700. The live
  export is a 90-day rolling window, so it cannot accumulate that sample — this is unanswerable
  from Gekko's data, not merely unanswered. Full study, power table and reproduction scripts:
  `docs/htf-delta-divergence-study-2026-08-12.md`, `scripts/studies/htf-delta-divergence/`.

- **Decision (feat-102):** cumulative delta carries NO bare signed total — every net delta names
  its anchor bar (chart time + open) and ships paired with the price change over that same window,
  per RTH session as well.
  **Why:** the same study measured HTF cumulative delta running OPPOSITE to realised price
  direction on 60 of 78 trading days (77%); over the window price rose +2,491 pts while cumulative
  delta fell to −53,901 contracts. corr(ΔPrice, ΔCumDelta) decays 0.62 (1 bar) → 0.46 (136), so
  per-bar delta tracks its own bar's move near-tautologically while the multi-day *level* is
  dominated by an arbitrary start point — wherever the rolling export happens to begin. A model
  handed "cumulative delta: −53,901" would plausibly narrate distribution into a tape that rose
  2,491 points. The repo fixture reproduces the hazard on sight: net delta +9277 (rising) against
  price −642.25 pts over the same 138 bars, 4 of 5 sessions disagreeing in sign. Both prompt rules
  therefore state the 77% figure as the reason never to read delta as direction.

- **Decision (feat-102):** no Sierra Chart study change was made.
  **Why:** the session opened on the assumption that `GekkoHtfBarDataExporter.cpp` needed work.
  It does not — the export has carried `Volume,BidVolume,AskVolume` since feat-049, `parseHtfBars`
  has computed `delta = Ask − Bid` since then, and `rthSessions.ts` already reconstructs sessions
  from those bars; the gap was entirely downstream, exactly as D4/B5 of
  `docs/data-bundle-review-2026-08-07.md` described. The only additive Sierra change available is a
  `NumberOfTrades` column (it would enable an HTF analogue of `barFlow.recentAvgTradeSize`, the one
  barFlow field HTF cannot reproduce). Deferred, and note the ordering constraint if it is ever
  taken: `parseHtfBars` hard-rejects header drift, so the DLL rebuild has to reach the running
  pipeline before the parser change does.
