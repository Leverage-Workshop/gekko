# Engine Ownership Map (maintainer doc)

The markdown under `knowledge/` is **model-facing only**: it is concatenated per task by
`lib/analyze/doctrine.ts` (`loadDoctrine(task)`) into the cached system-prompt prefix. Everything
in those files must be written for the model — no repo file paths, no changelog notes, no
maintainer commentary (guarded by `tests/knowledge-restructure.test.ts`).

This file is the maintainer-facing half that used to be interleaved into the prompt: which engine
module owns each computable guardrail, and the pointers the drift guard
(`tests/doctrine-drift.test.ts`) checks so prose can't silently restate engine-owned numbers.

## Output contracts

The single source of truth for the output shapes is the Zod contract in
`knowledge/schema/briefing.schema.ts` — `analyze-task`, `update-task` and `eval-task` generate
objects against those schemas (`generateObject`), and the Next.js UI renders from the returned
object. The prose contracts in `knowledge/system/output-*.md` describe field *semantics* only; if
the two ever disagree, the Zod schema wins.

History: the Gem's free-text markdown templates are retired — the Morning Briefing became
`Briefing`, the Gem's "Update" prompt became `BriefingUpdate` (feat-038), and the CSV terrain map
is engine-owned. The model supplies perception and judgment; the engine supplies all computed
fields.

## Computable guardrails

Each deterministic rule is owned by an engine module; the model-facing prose states the rule
qualitatively and defers the numbers to the engine facts.

- **Minimum risk/reward.** Enforced by `lib/engine/riskReward.ts` (`evaluateRiskReward`, default
  from `config.rr_min`). Prose must never restate the ratio — the model reads the engine's
  `meetsGate` / `rr`, and the per-run gate value is injected into the user prompt by
  `lib/analyze/prompt.ts`.
- **Volatility-scaled gates (feat-096).** The three point thresholds that decide whether a
  level is worth trading — the significant-move floor (`config.significant_move_sigma`), the
  entry standoff and the entry chase allowance — are stored as MULTIPLES of the measured
  Parkinson session sigma and resolved to points per run by `lib/engine/scaledGates.ts`
  (`resolveGates`), against `facts.volatilityScale` from `lib/engine/volatilityScale.ts`.
  Bundle review 2026-08-07 D3: the retired fixed 50-pt floor was 0.18σ — inside feat-095's
  own "noise" band — so every level on the map cleared it and `validateBriefing`'s
  reversal-room warning never fired. Defaults: **0.3σ** / 0.005σ / 0.02σ (~85 / 1.4 / 5.7 pts
  at the review's 283-pt reference sigma). The floor was 0.4σ until feat-112 measured it on
  the 2026-08-11 briefing: at that run's sigma it resolved to 145.56 pts against terrain
  border spans of 181.25 / **87** / 181.25, so the 87-pt span price sat inside could host no
  objective and both were exiled to entries 246 pts above and 203 pts below the market. Under
  0.4σ the floor had also outgrown its own calibration — it was chosen as one median 30-min
  bar range and had drifted to ~1.5 of one, and at 1.43x the operator's ~102-pt average
  rotation it rejected trades of exactly the size they normally take. Prose must never restate a point value: the
  prompts inject each gate in BOTH units (`describeGate` — resolved points first, the
  multiple as the qualifier) so the model reasons in the points it quotes. When the sigma is
  unmeasured (under 3 complete RTH sessions) every gate degrades to its pre-feat-096 fixed
  points and says so — it is never dropped and never divides by zero.
- **Stops never widen.** The check lives in `lib/engine/riskReward.ts` (`stopWidened` against a
  prior stop), but the analyze pipeline does not currently feed it the prior briefing's stop — a
  known, deliberately unwired gap (see `docs/gem-alignment-audit.md`). Until it is wired, the
  model holds this rule itself; the model-facing statement is in
  `knowledge/system/constraints.md`.
- **Structural tiering (Leg VWAP is Tier 3).** The Tier 1/2/3 hierarchy, daily priority sort, and
  nearest Tier-1 borders are computed in `lib/engine/mgiPriority.ts`. Not every level comes from
  the static MGI JSON: Daily MGI Priority **ranks 4–5 (RVAH/RVAL/RPOC)** are the prior COMPLETED
  session's value area, passed in from `daily-value-areas.csv` via `computeMgiPriority`'s
  `priorDayValue` option (feat-090) and classified Tier 2 alongside PDH/PDL. **VRange is
  implied-volatility geography, not traded structure** (feat-109, from the Sierra Implied Vol
  Ranges study's own definition): every level is the session OPEN ± a multiple of `D`, the expected
  session move implied by VIX — `high`/`low` at 0.25·D (the study's Upper/Lower Ranges, which act
  like value-area edges, NOT range extremes — the labels say so), and the four `ext*` levels at
  0.90·D and 1.00·D, which are the NEAR and FAR edges of one shaded "1x Range Zone". Verified on
  two archived exports agreeing to 4 dp, both with D at 1.45% of the open (implied VIX ~23). All
  six stay Tier 1; the zone's two edges are merged into ONE composite border by `mergePartitions`'
  band rule rather than competing for the partition, because they fall inside `aTierMinSpanPts`
  but outside `mergeTolerancePts`, where consolidation used to demote one on an arbitrary price
  tie-break. Distance reads come in two flavours:
  `nearestTier1Above/Below` (campaign borders) and `nearestDailyAbove/Below` (feat-109 — the
  intraday companion, since the Tier-1-only read can never surface the Tier-2 daily levels — the
  rolling pivot, PDH/PDL, IBH/IBL, RVAH/RVAL/RPOC, the OR levels — however close they sit). Both
  reject non-positive prices, which are unset export placeholders (ONH/ONL export as 0.00), never
  structure. (The word above is deliberately not the three-letter one: the drift guard takes the
  FIRST guardrail bullet matching /Rip|Vanguard/ and requires it to name `ripStatus.ts`.)
- **Where an entry may anchor.** `engineAnchorPrices()` (`lib/analyze/engineFacts.ts`) is the one
  definition of hostable structure, and it feeds `validateBriefing`'s off-anchor check: terrain
  zone borders and level verdicts, composite border members, detector LVN nodes (feat-074),
  session-VWAP rungs (feat-097), the TIME-based value levels terrain can never mint —
  `tpo.poc`, `tpo.valueArea` and `multiDayTpo.composite.poc` (feat-090) — and the ATR-projected
  rungs (feat-108: `atrProjections.rungs`, from `lib/engine/atrProjection.ts`, which give an
  ATR-derived PRICE somewhere to sit so "current price plus one ATR" stops being freehand
  arithmetic in prose). Distinct from `engineZoneBorders()`, which is the hard-enforced zone
  stack the model must reproduce and therefore stays a strict partition read (a VWAP band, a
  POC or an ATR projection is structure, not a partition — verified on the fixture bundle:
  10 zones / 11 borders before and after feat-108, and unchanged by feat-109 — the VRange 1x-zone
  merge only fires where BOTH edges promote, and on this fixture only the far edge has the volume
  geometry for it).
- **ATR's two roles (feat-108).** `lib/engine/htfStructure.ts` owns ATR as a NORMALIZER
  (`atrPoints`, `rotation.extentAtr`, `currentVsSwings.*Atr` — feat-049, untouched);
  `lib/engine/atrProjection.ts` owns ATR as a PRICE LEVEL. Multiples are named and exported
  (`ATR_PROJECTION_MULTIPLES` = 0.5/1/1.5/2), argued against the measured scale rather than
  chosen round — the module doc carries the derivation. The binding relationship: one 30-min
  ATR is ~0.34σ against a **0.3σ** floor (feat-112; it was ~0.4σ against a 0.4σ floor), so a
  1x projection now clears the minimum reversal room by a little and anything under 1x still
  cannot host a target. The re-tune matters here: under 0.4σ the 2026-08-11 bundle flagged
  ALL 16 of its rungs as target-illegal, i.e. the gate had swallowed the whole feature.
  That is expressed per rung as `clearsSignificantMove`, resolved against the gate as it
  resolves THAT run (measured sigma, or the fixed 50-pt fallback) rather than filtered
  statically — which multiples clear is a property of the regime, not of the multiple.
- **Rip / Vanguard Protocol thresholds.** Green/Yellow/Red is resolved by
  `lib/engine/ripStatus.ts` from price-vs-Rip and Delta Intensity.
- **The rank-1 daily levels hold their partition.** `borderRank`'s tier key is `consolidationTier`
  (`lib/engine/terrainZones.ts`, feat-109): a Daily MGI Priority **rank-1** level ranks WITH the
  campaign borders for spacing consolidation only, so one that promoted on real volume geometry no
  longer loses its border to a Tier-1 level 16–60 pts away (too far to merge into one band, close
  enough to trip consolidation). Keyed on `dailyRank`, not a level code, so it covers the Rip and
  the daily Job Pivot (feat-111) alike. Deliberately not a tier promotion — the playbook classifies
  both Tier 2, and `mgi.tier1` feeds the Stratosphere/Abyss envelope, which a price-tracking level
  would collapse. `border.tier` still reports the true tier.
- **Job Pivots are pivots, not borders** (feat-111, `lib/engine/mgiPriority.ts`). The Sierra MGI
  exporter now writes `daily.jobPivot` and `weekly.jobPivot` (OrderFlow Labs "Job Pivots" / "Job
  Weekly Pivots" — the pivot line only, not the Pivot High/Low zone edges). The daily pivot is the
  auction's line in the sand: **Tier 2, Daily MGI Priority rank 1 shared with the Rip** (same
  functional class — which side price holds sets the session's bias), so it tiers and sorts beside
  it and inserts no new rank. The Weekly Job Pivot is **Tier 1** like every other weekly level, so
  it can hold a terrain partition and surface in `nearestTier1Above/Below`. Both fields are
  optional: exports predating the study update, and charts without the study (the exporter writes
  `0.00`), simply carry no pivot — and the `nearest*` reads already skip non-positive placeholders.
- **Absorption candidates.** Stack detection thresholds are owned by `lib/engine/absorption.ts`.
- **Delta telemetry reduction.** The compact window the model receives is produced by
  `lib/engine/deltaTelemetry.ts`.
- **Staleness.** Budget owned by `lib/engine/staleness.ts`; the per-run verdict is injected into
  the user prompt.
- **Eval proximity + initiative gates.** The near/not-near gate is `lib/eval/proximity.ts`; the
  COUNT-only initiative demotion (ENTER → WAIT on counter-extreme out-printing, with the
  absorbed-flush exception) is code-enforced in `lib/eval/validateEval.ts`.

## Bundle exports (data ↔ prompt registry)

Every bundle export must have a declared consumer and a declared model surface. The
prompt–data sync gate (`tests/prompt-data-sync.test.ts`, feat-054) fails when a manifest
field (`FILE_FIELDS` / `MGI_FIELD` in `lib/ingest/manifest.ts`) has no row here, when a
listed module path does not exist, when a row names a manifest field that no longer
exists, or when the engine-facts payload (`factsPayload` in `lib/analyze/prompt.ts`)
carries a top-level key this table does not surface — or vice versa. Adding a new export
(feat-046…053) therefore requires deciding, in the same change, which module owns it and
where the model sees it.

| Field | Export file | Consumer | Surfaces to the model as |
| --- | --- | --- | --- |
| `htf_png` | `htf.png` | model vision (attached screenshot) | HTF distribution shape only — trend state, swings, rotation extent and ATR are code-owned by the numeric HTF bar export (feat-049) |
| `tpo_png` | `tpo.png` | model vision (attached screenshot) | intraday distribution shape only — day structure (single prints, poor extremes, POC, IB) is code-owned by the numeric TPO export (feat-046), as are the day type / open type / range-extension-by-period classification (feat-093); value migration is code-owned by the daily value-area history (feat-048) |
| `exec_png` | `exec.png` | model vision (attached screenshot) | pattern scan, absorption vs exhaustion shape, delta clustering quality (stall confirmation is code-owned by the enriched bars, feat-047) |
| `exec_csv` | `execution_bars.csv` (full session since Globex open, feat-062) | `lib/engine/parseExecBars.ts` → `lib/engine/deltaTelemetry.ts` (incl. `lib/engine/barFlow.ts` raw-flow reduction), `lib/engine/ripStatus.ts`, `lib/engine/stallConfirmation.ts` (absorption stall annotation), `lib/engine/sessionIntraday.ts` (feat-063), `lib/engine/intradayTrend.ts` (feat-064); eval: `lib/eval/proximity.ts` (bar-range gate), `lib/eval/evalBundle.ts` (intraday-trend context) | `deltaTelemetry` (incl. flow: cumulative delta, divergence, climax), `ripStatus`, stall blocks on `absorptionCandidates`, `sessionIntraday` (Globex/RTH session VWAP with slope and its volume-weighted ±1σ/±2σ bands + z (feat-097), flattened into sessionIntraday.vwapRungs entry/stop/target-rung structure and fed to engineAnchorPrices; session cumulative delta, 15-min one-timeframing with break level; VWAP/bands/cum-delta null + warning on partial-coverage exports), `intradayTrend` (composite trade-horizon trend: direction from one-timeframing + micro swings with a Dow break rule + momentum stack, conviction from cum delta + Rip + VWAP position, character, explicit disagreements); eval prompt: telemetry + enriched recent-bars table + intraday trend context line |
| `rotation_vbp` | `four-hundred-rotation.vbp.md` | `lib/engine/parseProfile.ts` → `lib/engine/lvnDetection.ts`, `lib/engine/nodeBuild.ts`, `lib/engine/terrainZones.ts`, `lib/engine/fakeoutTails.ts` (formation test vs the MGI High/Low extremes, feat-075) | `lvnHvnNodes`, `profileSummary`, `terrain`, `fakeoutTails` |
| `balance_area_vbp` | `balance-area.vbp.md` | `lib/engine/parseProfile.ts` → `lib/engine/lvnDetection.ts`, `lib/engine/nodeBuild.ts`, `lib/engine/magnetCheck.ts`, `lib/engine/terrainZones.ts` | `lvnHvnNodes`, `profileSummary`, `magnetCheck`, `terrain` |
| `half_rotation_delta` | `half-rotation-delta.vbp.md` | `lib/engine/parseProfile.ts` → `lib/engine/absorption.ts`; eval: `lib/eval/evalBundle.ts` (best-effort scan) | `absorptionCandidates`; eval prompt: absorption-candidates section |
| `full_rotation_delta` | `full-rotation-delta.vbp.md` | `lib/engine/parseProfile.ts` → `lib/engine/absorption.ts`; eval: `lib/eval/evalBundle.ts` (best-effort scan) | `absorptionCandidates`; eval prompt: absorption-candidates section |
| `tpo_data` | `tpo.data.md` | `lib/engine/parseTpo.ts` → `lib/engine/tpoFacts.ts`, `lib/engine/tpoPeriodClock.ts`, `lib/engine/tpoDayType.ts` (best-effort: null + warning when absent) | `tpo` (single-print zones, poor high/low, the feat-091 excess read `tpo.excess` — buying/selling tails at the extremes in bins + points with their period letters, and the session single-print fraction — POC prominence, value area, Initial Balance, plus the feat-092 period→clock map: `tpo.firstPeriod` anchor and `tpo.periodClock` letter → `HH:MM`; both null on exports predating the anchor lines; plus the feat-093 session classification `tpo.classification` — day type, open type, IB→day-range extension with its band in the empirical distribution (feat-100 swaps the live-measured one in for the pinned sample; `tpo.classification.distribution.source` says which judged the session), range extension by period, and which period printed the session high and low; derived from the letter SEQUENCE, so it survives a missing clock anchor, and null when the ladder holds under three periods) |
| `daily_va` | `daily-value-areas.csv` | `lib/engine/parseDailyValueAreas.ts` (parse + feat-089 date partition) → `lib/engine/valueMigration.ts`, `lib/engine/dailyRanges.ts` (COMPLETED sessions only), `lib/engine/developingSession.ts` (the live in-progress row) — best-effort: null + warning when absent; eval: `lib/eval/evalBundle.ts` (best-effort context, same partition) | `valueMigration` (prior-day POC/VAH/VAL, the day-by-day recentSessions series, POC drift, value-day streaks, prior-day overlap, price vs prior-day value; feat-090 also promotes the prior-day POC/VAH/VAL into `mgiPriority` as the doctrine's RVAH/RVAL/RPOC, Daily MGI Priority ranks 4-5, so they tier, sort, reach terrain and become anchorable entry structure), `dailyRanges` (per-session range series + contraction/expansion read, in plain points — the overview never cites ATR), `developingSession` (feat-089: the live session's developing VOLUME value area — POC/VAH/VAL, high/low, volume and travel so far, price vs developing value — with a maturity qualifier: elapsed RTH minutes, volume vs the time-of-day expectation, range used vs the completed-session median; null on pre-open/overnight bundles, and the split is warned either way); eval prompt: prior-day value context line; also feeds the day-level SessionVolume leg of `relativeVolume` (feat-094, via `lib/engine/relativeVolume.ts`) |
| `htf_csv` | `htf_bars.csv` | `lib/engine/parseHtfBars.ts` → `lib/engine/htfStructure.ts`, `lib/engine/htfFlow.ts`, `lib/engine/overnightSession.ts`, `lib/engine/multiDayTpo.ts`, `lib/engine/relativeVolume.ts`, `lib/engine/volatilityScale.ts`, `lib/engine/atrProjection.ts`, `lib/engine/rthSessions.ts` → `lib/engine/ibExtension.ts` (best-effort: null + warning when absent); eval: `lib/eval/evalBundle.ts` (best-effort context) | `htfStructure` (trend state from the swing sequence PLUS the real-time `trend.integrity` qualifier — intact / under-test / broken vs the live price, feat-064 — recent swing highs/lows, rotation extent, 30-min ATR, ATR-normalized swing distances) → grounds meta.htfTrend, `overnightSession` (overnight high/low/range + RTH-so-far extremes; null on RTH-only exports), `multiDayTpo` (feat-071: last ~5 RTH sessions' TPO profiles reconstructed from the 30-min bars — one bar = one TPO period — and merged: composite POC with prominence, 70% value area, range, HVN shelves, interior LVN valleys, per-session POC/range walk, current price vs composite value; the numeric multi-day Market Profile behind `overview.mtfView`; null when under two RTH sessions), `relativeVolume` (feat-094: per-intraday-slot volume medians from the export's own history, today's completed 30-min slots against them, cumulative RTH volume vs the time-of-day expectation, the day-level SessionVolume companion, all reduced to one `relativeVolume.participation` scalar with a band and a confidence gate the other order-flow facts are read through; per-slot reads degrade to null below the minimum history), `volatilityScale` (feat-095: Parkinson + Garman-Klass range estimators over the RTH 30-min bars — one RTH session's sigma in points, per-bar sigma, median bar/session ranges, and the distance from current price to the nearest Tier-1 and zone borders in points AND sigma with a noise/minor/meaningful/large band; the scale that says whether a point gap is meaningful; null under 3 complete RTH sessions. feat-112: the SESSION statistic is a recency-weighted mean of per-session sigma (ewMeanSigma(), decay 0.75), NOT the flat RMS of variance it was — that estimator was both outlier-dominated, because squaring let one 898-pt session carry 27x the weight of a 181-pt one, and blind to a regime turn, so on 2026-08-11 it reported 363.9 while the last three sessions ranged 445/296/181 and `dailyRanges` read "contracting". Backtested over 60 RTH sessions the flat RMS was the worst of seventeen candidates, overstating the next session by 58 pts with 65% of sessions landing under its forecast. The per-BAR statistic and both medians are unchanged flat measures over the same 10-session window), `htfFlow` (feat-102: the ORDER-FLOW half of the same export — the per-bar delta (askVolume − bidVolume) that had been parsed, typed and read by nothing until this feature (bundle review 2026-08-07, B5/D4). Ships two things: a WINDOW-ANCHORED cumulative delta — the anchor bar is named (time + open) and the net delta always travels with the price change over that same window, plus a per-RTH-session walk (net delta AND session price change) grouped through `lib/engine/rthSessions.ts` so a session means what it means everywhere else — and the pivot bar's own delta/volume at each confirmed swing `htfStructure` reports (SAME pivots; htfStructure's findPivots() is exported and reused, never re-implemented). Two measured negative results bind this fact, both from the 2026-08-12 base-rate control study over 3,559 union'd HTF bars / 78 trading days plus the 2026-08-07 delta-intensity review: (1) swing-level delta divergence has NO empirical support — the fade thesis underperformed the unconditional base rate at every horizon, all 95% CIs contained it, nothing survived Holm correction, and the only replicable direction is CONTINUATION — so the divergence read is COMPUTED and tested but WITHHELD from every prompt at a marked seam in `lib/analyze/prompt.ts` (its modelHtfFlow projection), pinned by a gate in tests/prompt-data-sync.test.ts, and exposing it is a one-line operator decision; (2) a bare cumulative-delta total is misleading — over the study window price rose +2,491 pts while cumulative delta fell to −53,901 contracts and the running total carried the OPPOSITE sign to realised price direction on 60 of 78 days (77%) — so no export-wide signed total is emitted anywhere and the prompt rule states the 77% figure. What IS load-bearing: per-swing delta and volume (swing-high delta median +44 / 55% positive n=206, swing-low median −121 / 36% positive n=216, swing volume ~55% above an ordinary bar). No climax analogue — a 30-min bar's absolute delta reaches at most 19% of its own volume on the live export, so barFlow's ≥50% one-sided test can never fire; no average-trade-size analogue — the HTF export carries no trade count. Null when the export is absent or malformed), `atrProjections` (feat-108: the 30-min ATR in its PRICE-LEVEL role — projected from current price both ways (target rungs) and outward from the last confirmed swing high/low (reversal rungs) at 0.5/1/1.5/2x, each rung carrying its reference and multiple as a quotable attribution label plus a clearsSignificantMove flag resolved against feat-096's floor for THAT run; feeds engineAnchorPrices() so an ATR-derived price can host an entry, stop or target instead of appearing as freehand arithmetic in prose; null when `htfStructure` is null or its ATR is unmeasurable, and no swing rung is emitted for a side with no confirmed swing), `ibExtension` (feat-100: the IB→day-range extension distribution measured from the export's own RTH sessions, reconstructed via `lib/engine/rthSessions.ts` — `day_range / IB_range` at p25/median/p75/p90/max with the sample size behind them and the no-extension / one-sided / both-sides split, today's first-hour Initial Balance with the ratio it has reached and its band, and each quantile projected from that IB into a PRICE for target rungs; `distribution.source` reads "measured" above 20 complete sessions and falls back to review B7's pinned n=62 sample below it, and is the distribution feat-093's `tpo.classification` day type is cut at; null when the export holds no RTH bars); eval prompt: volatility-scale context line |
| `mgi` | inline `mgi_json` (jsonb) | `lib/engine/mgiPriority.ts` (which also takes the prior completed session's value area from `daily_va` as Daily MGI Priority ranks 4-5 — feat-090), `lib/engine/staleness.ts`, `lib/engine/ripStatus.ts` | `currentPrice`, `mgiPriority` (levels with tier + Daily MGI Priority rank, the Tier-1 subset, the daily priority sort, and FOUR distance reads — `nearestTier1Above/Below` for campaign borders plus `nearestDailyAbove/Below` for intraday structure, feat-109), `staleness`, plus the raw MGI JSON block |
| (engine pass) | — cross-cutting | `lib/analyze/engineFacts.ts` | `warnings` |

## Per-task prompt assembly

`loadDoctrine(task)` concatenates, in order:

| Segment | analyze | update | eval |
| --- | --- | --- | --- |
| `system/role.md` | ✓ | ✓ | ✓ |
| `system/constraints.md` | ✓ | ✓ | ✓ |
| `system/output-briefing.md` | ✓ | | |
| `system/output-update.md` | | ✓ | |
| `system/output-eval.md` | | | ✓ |
| `system/output-objective.md` | ✓ | ✓ | |
| `doctrine/chart-reading.md` | ✓ | ✓ | ✓ |
| `doctrine/glossary.md` | ✓ | ✓ | ✓ |
| `doctrine/patterns.md` | ✓ | ✓ | ✓ |

Each task's prefix is identical run-to-run, so prompt caching still hits (per task). Volatile
per-run data (engine facts, raw MGI, staleness, chart manifests) lives exclusively in the user
message builders (`lib/analyze/prompt.ts`, `lib/update/prompt.ts`, `lib/eval/prompt.ts`).
