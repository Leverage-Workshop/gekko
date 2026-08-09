# Adversarial review: the data bundle (2026-08-07)

Scope: pull the newest `raw_bundles` row from production, verify what the engine actually
does with it, and answer two questions — **what data is missing that would be worth
adding**, and **what computation / math is missing that would be worth adding**.

Method: the bundle's nine artifacts were downloaded from `bundle-csvs`, then
`computeEngineFacts()` was executed over them verbatim (`tsx`, no mocks) so every claim
below is measured against the real payload rather than read off the source. Supporting
statistics come from the 90 days of 30-min bars the bundle already carries.

A second, independent bundle-data review ran the same day on branch
`claude/delta-intensity-redundancy-xe1bbj` (PR #131, `feat-087`/`feat-088`). The two
overlap in three places and this document has been reconciled against it: the volume
clock (B2) is already filed as `feat-088` and gets no duplicate feature here, and its
base-rate-controlled *negative* results on Kyle's λ and day-level HTF delta divergence
are carried into B3 and B5 rather than argued around.

**Bundle under review:** `1c15934a-4a19-46ce-a43a-96f4918ba05a`, received
2026-08-06 18:33:25 UTC (13:31 CT, mid-RTH), `current_price` 29542.50, `is_stale` false.

| Artifact | Size | Engine reads |
|---|---|---|
| `mgi_static_levels.json` | 28 levels | all 28 → `mgiPriority` |
| `four-hundred-rotation.vbp.md` | 223 bins, `Price,Volume,Delta` | full |
| `balance-area.vbp.md` | 1437 bins, `Price,Volume,Delta` | full |
| `half-rotation-delta.vbp.md` | 25 bins, `Price,Delta` | full |
| `full-rotation-delta.vbp.md` | 26 bins, `Price,Delta` | full |
| `execution_bars.csv` | 630 bars, 11 cols, full Globex session | full |
| `tpo.data.md` | 446 bins + `Letters` | **partial — see D2** |
| `daily-value-areas.csv` | 20 sessions, 7 cols | **partial + contaminated — see D1, D3** |
| `htf_bars.csv` | 2916 bars / 87 days, 8 cols | **partial — volume and delta unused, D4** |

Engine run over this bundle: `warnings: []`, 40 anchor prices, `factsPayload` 48,822 chars.

---

## Part 1 — Defects found (fix before adding anything)

New data is worth less than data already in the bundle that is being dropped or
misread. Four of those, in descending order of impact.

### D1. `daily-value-areas.csv` ships the **in-progress** session, and the engine treats it as the prior day

The exporter contract in `docs/data-todos.md` §3 says "the current in-progress session is
excluded". It is not. Row 1 of the live file is `2026-08-06` — today — and its
`SessionHigh`/`SessionLow` (29686.25 / 29241.25) match today's TPO summary exactly, i.e.
it is the developing session as of 13:31 CT.

`computeValueMigration()` and `computeDailyRanges()` both document their input as
"completed sessions" and neither validates it. Measured consequences on this bundle:

```
priorDay                 { date: "2026-08-06", poc: 29520, vah: 29620, val: 29476.75 }   ← today
currentPriceVsPriorValue { position: "inside", pointsOutside: 0 }
dailyRanges.days[0]      { date: "2026-08-06", rangePts: 445 }                            ← partial range
```

- **`currentPriceVsPriorValue` is structurally incapable of firing.** Current price is
  compared against the value area currently being built around it, so "inside / 0 pts
  outside" is the answer on essentially every bundle, every day. The doctrine's
  accepted-outside-prior-value read has been dead since feat-048 landed.
- The true prior day (08-05, VAL 29693) puts price **150.5 pts below prior-day value** —
  the opposite reading, and the one the doctrine cares about.
- `pocDrift`, `valueTrend` and `priorDayOverlap` are all computed one session off.
- `dailyRanges` mixes a partial range into the contraction/expansion mean — and
  `RANGE_RECENT_SESSIONS` is 3, so a partial number carries a **third** of the verdict. At
  09:00 CT today's row would be ~100 pts against a ~464-pt median, biasing the read toward
  "contraction" every morning.

**Fix: partition, don't discard** (operator direction, 2026-08-07 — the first draft of
this section said "drop the leading row", which throws away the more interesting half of
the problem). That row is the **only volume-based view of the live session anywhere in the
bundle**: developing volume POC/VAH/VAL, session high/low, and volume so far. It is
genuinely distinct from the time-based TPO read on the same session —

```
                POC       value area
volume (row 1)  29520     29476.75 – 29620
TPO  (letters)  29541     29478.00 – 29638
```

— a ~20-point POC disagreement between how volume and how *time* distributed on the same
day, which is exactly the kind of divergence the doctrine reads. So: `parseDailyValueAreas`
partitions by date rather than dropping. Rows matching the live session date
(`tpo.sessionDate`, already in the bundle) become a new nullable `developingSession` fact;
`computeValueMigration` and `computeDailyRanges` consume only the completed remainder.

Two things the developing fact needs to be safe to use. First a **maturity qualifier** — an
unfinished value area at 09:00 is not the same object as one at 14:30 — from elapsed RTH
minutes and volume-so-far against the time-of-day expectation (B1). Second,
**range-used-so-far** against the completed-session median: 445 of a typical 464 pts
already printed on this bundle, i.e. a full day's travel done by 13:31, which is a
different statement from "the range is contracting". Detect by date and never by position
(pre-open and overnight bundles carry no in-progress row at all), null the fact when
absent, and warn either way so the split shows up in the trace. An `IsComplete` column on
the export is belt-and-braces, but the engine must not depend on it.

### D2. The TPO `Letters` column is parsed and then almost entirely discarded

`Letters` was the stated reason for exporting TPO numerically (data-todos §1: "what lets
the engine sequence the day, not just count"). Today it produced **nothing**:

```
tpo.singlePrintZones : []
tpo.poorHigh         : null
tpo.poorLow          : null
```

On a day where **227 of 446 TPO bins (51%) are single prints**, in exactly two contiguous
runs:

| run | bins | pts | period | outcome |
|---|---|---|---|---|
| 29241 → 29448 | 208 | 208 | `A` | discarded (touches the low) |
| 29668 → 29686 | 19 | 19 | `D` | discarded (touches the high) |

`detectSinglePrintZones()` deliberately drops runs touching an extreme, calling them
"tails … belong to poor/tapered-extreme reads" — but no such read exists. `poorHigh` /
`poorLow` only fire on a 2+ TPO shelf, so a single-print extreme returns `null` and the
tail is never measured. A 208-point A-period buying tail — the defining structural
feature of this session — reaches the model only as pixels on the TPO screenshot.

Everything else the letters support is also absent: day-type classification (normal /
normal-variation / trend / neutral / double-distribution), which period made the high and
the low, range extension by period, open type, and TPO excess length at each extreme.

Note one blocker for the richer reads: the export gives letters but no letter→clock-time
map, so `A` cannot be tied to a time without assuming the session's first period. One
metadata line (`Period Start Times` or `First Period Letter` + start time) unlocks the
whole family — see A2.

### D3. `significant_move_pts = 50` is not a filter at current volatility

feat-086 made this the binding gate for entry qualification. Measured over the 61 RTH
sessions in the bundle's own HTF export:

```
median RTH day range            464 pts   → 50 pts = 11% of a day
median Parkinson session vol    283 pts   → 50 pts = 0.18 sigma
median 30-min bar range         110 pts   → 50 pts = 0.45 of one bar
```

Fifty points is less than half of a single 30-minute bar. Every level on the map clears
it, so the "does this level offer a real move" test currently rejects nothing, and
`validateBriefing`'s reversal-room warning never fires. The number is also fixed while
NQ's regime is not — the 20-session range history in this same bundle runs 445 to 748
points.

This wants to be volatility-scaled rather than re-tuned: express the floor as a multiple
of a measured scale (session Parkinson σ, or the existing `htfStructure.atrPoints`) and
keep `significant_move_pts` as the multiplier. See C1.

### D4. `htf_bars.csv` volume and delta are parsed, typed, documented — and never read

`parseHtfBars` produces `volume`, `bidVolume`, `askVolume` and a computed `delta` per bar.
Grepping the three consumers (`htfStructure`, `multiDayTpo`, `overnightSession`) finds
zero references to any of them: all three use OHLC only. That is **87 days × 2916 bars of
30-min order flow and volume already in every bundle, feeding nothing.** Sections B and C
below spend most of their budget on this.

Same pattern, smaller: `daily-value-areas.csv`'s `SessionVolume` is parsed into
`DailySession.sessionVolume` and referenced nowhere else. Its correlation with session
range over the 20 sessions on hand is **0.78**.

### D5. Developing value is still not anchorable (confirms the operator's open item)

`progress.md` flags this from the 2026-08-03 review; the bundle confirms it is general,
not a one-off. `engineAnchorPrices()` is built from terrain (MGI levels + the two volume
profiles) only, so nothing derived from TPO, the value-area history or the multi-day
composite can host an entry:

```
                          price       is an anchor?   nearest anchor
TPO POC (today, RTH)      29541       NO              29535.79  (5.21 pts)
TPO VAH                   29638       NO              29660.00  (22.00 pts)
TPO VAL                   29478       NO              29468.00  (10.00 pts)
prior-day POC             29520       NO              29522.98  (2.98 pts)
prior-day VAH             29620       NO              29607.25  (12.75 pts)
prior-day VAL             29476.75    NO              29468.00  (8.75 pts)
multi-day composite POC   29541       NO              29535.79  (5.21 pts)
session VWAP (globex)     29522.89    YES             29522.98  (0.09 pts — coincides with 24 VWAP)
session VWAP (RTH)        29530.91    NO              29535.79  (4.88 pts)
```

Today's point of control sits 1 point from current price and cannot host an entry. The
off-anchor check in `validateBriefing` is a warning rather than a rejection, so the model
*can* anchor there — it just gets told it is off-structure when it does.

Worth noting alongside this: `mgiPriority`'s own docstring records that Daily MGI Priority
**ranks 4 and 5 (RVAH / RVAL / RPOC) "are not in this export"**. They are, now — since
feat-048, in `daily-value-areas.csv`. The doctrine's 4th and 5th most important daily
levels are sitting in the bundle unpromoted.

---

## Part 2 — Data worth adding

Ordered by value per unit of work. Items already queued (`feat-051` VWAP bands,
`feat-052` profile anchors, `feat-053` RTH-only balance area) are not repeated; note that
A4 partially obsoletes feat-051.

### A1. Session volume profile (`session.vbp.md`) — the biggest genuine hole

Four profiles ship and none of them is *today*. The 400-pt rotation and the balance area
are structural/multi-session; the half/full-rotation deltas are ~25-bin execution-scale
windows with **no Volume column at all** (`Price,Delta` only — so no delta-per-volume
ratio is computable at those prices). The only view of the current session is TPO, which
is time-based.

Consequence: developing volume VPOC / VAH / VAL for the live session does not exist as a
number, and neither does the naked/virgin-POC set — POCs from prior sessions that price
has never returned to, one of the more reliable magnets in this style of trading, and
computable the moment per-session volume value exists as a series (`daily-value-areas.csv`
gives the POCs; it just needs a "has price traded back through this since?" pass, which
`htf_bars.csv` can already answer).

Same format as the existing `.vbp.md`, anchored at the RTH open, `Price,Volume,Delta`.

**Scope narrowed by the D1 revision.** Once the developing session is broken out of
`daily-value-areas.csv`, its *summary* numbers — volume POC/VAH/VAL, high/low, volume so
far — arrive free, so this export is no longer the only route to developing volume value.
What still needs it is the price-by-volume **ladder**: node and shelf detection inside the
live session, the developing profile's shape, and the per-bin delta split. C3 (double
distribution) and C5 (naked POCs) depend on the ladder, not the summary — so this drops
below the engine-only items in priority.

### A2. TPO period → clock-time map (one metadata line)

Unblocks day-type, open-type, period-sequence and excess-timing reads (D2). Cheapest
high-leverage line in this document:

```markdown
- **First Period Letter**: A
- **First Period Start**: 2026-08-06 08:30:00
```

### A3. Scheduled-event calendar (not a Sierra export)

The system has no notion of time-to-event. A briefing generated at 07:55 CT ahead of an
08:30 CPI print and one generated on a quiet Tuesday are treated identically, and the
doctrine has nothing to say about standing down into a release. This does not need an
API — a hand-maintained JSON of `{ timestamp, label, tier }` in the repo, or a `config`
column, gets 90% of the value: an engine fact of "next scheduled event in N minutes,
tier 1" plus a doctrine line. It also explains volume anomalies the RVOL work in B1 will
otherwise surface as unexplained.

### A4. VWAP σ bands — most of `feat-051` is already computable in-engine

feat-051 waits on an ACSIL change for `vwapBands`. Session-anchored bands need no export
at all — the exec CSV carries volume per bar and `sessionIntraday` already computes both
anchored VWAPs. Measured on this bundle:

```
Globex-anchored VWAP 29522.89   sigma 83.72 pts
  -2σ 29355.45 | -1σ 29439.17 | VWAP 29522.89 | +1σ 29606.62 | +2σ 29690.34
current price 29542.50 → z = +0.23σ
```

That is one small function over data already parsed. What genuinely still needs the export
is the **24h / weekly / monthly** bands, since those VWAPs arrive as scalars in
`mgi_static_levels.json` with no underlying series. Recommend splitting feat-051: ship the
session bands now, keep the export item for the longer anchors.

### A5. Timezone / session metadata in the exports

Every export is naive local time and the engine hard-codes 08:30 CT (`RTH_OPEN_MINUTES`).
Correct today, silently wrong on a DST boundary, an exchange holiday schedule, or if the
Sierra machine's timezone ever changes. A `- **Timezone**: America/Chicago` line plus a
`Session: RTH|ETH` marker (already planned in feat-053) makes it checkable instead of
assumed.

---

## Part 3 — Computation and math worth adding

Split by cost: B needs no new data at all, C needs the items above. Every addition has to
be projected into `factsPayload` (currently 48,822 chars, under a committed budget in
`tests/prompt-data-sync.test.ts`) — these are scalars and short arrays, not series dumps.

### B. Free — computable from the bundle exactly as it ships today

#### B1. Relative volume (RVOL) from time-of-day seasonality

`htf_bars.csv` gives 46 distinct 30-min slots with a median of 64 sessions each — plenty
for a robust per-slot median. Today's tape against its own history:

```
slot    median(90d)   today     RVOL
10:00       30709     34682     1.13x
10:30       27831     34826     1.25x
11:00       24026     30249     1.26x
12:30       18698     13737     0.73x
13:00       18292     16866     0.92x
```

"Is participation heavy or light right now" is currently a vision read on the execution
chart. This makes it a number, and it is the natural gate on every other order-flow
signal: a delta divergence at 0.7x RVOL is noise, the same divergence at 1.4x is
information. Pairs with `SessionVolume` (D4) for the day-level version — today
341,119 vs a 415,467 median = **0.82x**.

#### B2. The volume clock — bar duration as participation intensity

The execution bars are constant-volume (750), which means **elapsed time per bar is a
direct inverse measure of the volume rate**, and it is thrown away — the engine only ever
reads `dateTime` for windowing. Over this session:

```
bar duration: p10 16s | median 45s | p90 369s | max 990s   → 23x p90/p10 spread
volume rate : median ~1,000 contracts/min, fastest ~45,000/min
last 20 bars: median 84s vs session median 45s → 0.54x normal participation
```

A 23x spread in intensity, invisible to every current fact. Two immediate uses: the
"heavy participation" clause in `stallConfirmation` currently proxies participation with
bar count and trade count, and can use the actual rate; and `deltaTelemetry.flow.climax`
can distinguish a blowoff (large delta, fast bars) from a grind (large delta, slow bars),
which is the absorption-vs-exhaustion call the prompt hands to the screenshot.

**Already queued as `feat-088`** (tape pace telemetry, PR #131) — an independent
bundle-data review reached the same finding with the same measurements. No separate
feature is filed here; the two consumers named above belong in that one. Worth carrying
across: feat-088's base-rate control found pace has *no standalone directional edge*
(18 continuations vs 11 reversals after 4x-pace bursts), so it ships as context that
gates other signals, never as a trigger.

#### B3. Price impact per unit of order flow (Kyle's λ)

Regress per-bar close−open on per-bar delta over a rolling window. λ is *the* quantitative
statement of absorption: low λ means aggressive flow is being met without price moving —
someone is there; high λ means the book is thin and small flow travels far.

```
whole session   λ = 83.7 pts per 1000 net delta   R² = 0.27
rolling 30-bar  min 18.2 | median 76.4 | max 155.0        (9x spread)
lowest-λ windows  08:23 (18.2), 09:20 (26.7), 08:03 (31.6)   ← absorption
highest-λ windows 06:29 (155.0), 01:13 (140.5), 09:57 (138.4) ← vacuum
```

Honest caveat: per-window R² runs 0.02–0.44, so λ is a noisy estimate and any fact built
on it must carry a confidence gate (report only when R² and window volume clear a
threshold, else null — the same degradation pattern the other engine facts already use).
The signal is the *change* in λ, not its level. This generalises the current absorption
scan, which can only see stacks that happen to sit in the ~25-bin delta profiles; λ works
everywhere price has traded.

**A prior negative result applies here.** The 2026-08-07 delta-intensity review (branch
`claude/delta-intensity-redundancy-xe1bbj`, PR #131) tested λ *as a timing filter* and
rejected it: 60% vs a 58% base rate, near-nil. That does not refute the framing above —
λ here is a liquidity-regime read that gates other signals rather than a trigger — but it
does mean λ has to clear its own base-rate control in *this* framing before it ships, and
it drops below `feat-087` and RVOL in priority until it does.

Relationship to **`feat-087`** (effort-vs-result absorption prints, PR #131): that is the
same idea as a binary per-bar test — heavy `|delta|`, small body — and λ is its
continuous, windowed form. feat-087 should ship first: it carries replicated,
base-rate-controlled evidence (64%/71% reversal vs a 57% base rate on two bundles) and λ
does not. λ then adds the regime read a per-bar print cannot give.

#### B4. Promote the value levels that already exist to real structure

Direct fix for D5 and the rank-4/5 gap, no new data:

- Feed `valueMigration.priorDay` POC/VAH/VAL into `mgiPriority` as the doctrine's
  RVAH / RVAL / RPOC (ranks 4–5), so they tier, sort, and reach terrain.
- Feed `tpo.poc` / `tpo.valueArea` and `multiDayTpo.composite.poc` into
  `engineAnchorPrices()` as anchorable structure.
- Add naked/virgin POCs (A1) once the session-profile series exists.

This is the single change that would have prevented the 2026-08-03 briefing failure
recorded in `progress.md`.

#### B5. HTF order flow — cumulative delta and divergence at the swing level

`htfStructure` finds swing highs and lows from OHLC and stops there. The delta at those
swings is sitting in the same rows (D4). Multi-day cumulative delta, delta at each
confirmed swing, and divergence between a fresh HTF price extreme and HTF cumulative
delta are the exact analogues of what `barFlow` already does on the execution timeframe —
the code pattern exists, it just needs pointing at the other bar series.

Scope caveat: the 2026-08-07 delta-intensity review tested **day-level** HTF delta
divergence as a fade signal and rejected it (slight continuation bias). This is
swing-level annotation and cumulative-delta context for the narrative, not a day-level
fade trigger, and any directional claim needs its own base-rate control. That review also
reached the parsed-but-unused finding independently, without filing a feature for it.

#### B6. Better volatility estimators, and volatility-scaled distances

`htfStructure.atrPoints` is the only scale measure in the engine. Parkinson (high/low) and
Garman-Klass (OHLC) estimators are ~5x more statistically efficient per bar than
close-to-close, need no new data, and give a stable session σ (283 pts median here). With
one scale number, several existing facts get better:

- `significant_move_pts` becomes a σ multiple instead of a fixed 50 (D3).
- Entry standoff / chase gates (`MIN_ENTRY_STANDOFF_PTS`, `MAX_ENTRY_CHASE_PTS`, both
  fixed points today) scale with the regime.
- Distances to structure can be reported in σ alongside points, so "29 pts away" reads
  as "0.10σ — inside the noise" rather than as a meaningful gap.

#### B7. IB → day-range extension distribution: probabilistic targets

Classic Market Profile, made empirical from the bundle's own history. Over 62
reconstructed sessions:

```
day_range / IB_range :  p25 1.25 | median 1.52 | p75 2.08 | p90 2.58 | max 3.58
day type by extension:  no-extension 4% | one-sided 79% | both-sides 16%
upside extension as a multiple of IB: median 0.15 | p90 0.76
```

Today: IB 29242–29667 (425 pts), session range 445 pts so far → **day/IB = 1.05, below the
p25 of 1.25**. Either the day is unusually contained or there is range still to come — and
that is a statement the briefing can currently make only as an impression. Target rungs
get a distribution to sit on: "p75 of sessions extend to 29910 from this IB."

#### B8. Empirical reversal statistics per level class

feat-086's contract asks the model for the nearest level "with a decent probability of
reversal". No probability is computed anywhere. The bundle's 61 RTH sessions can measure
it. First touch of prior-session levels, 3-hour horizon, reversal excursion vs
continuation excursion:

```
level      n     median reversal   median continuation   edge
PDH        29         177.0               157.0          1.13
PDL        20         187.8               143.4          1.31
PDC        34         208.6               118.5          1.76
PD_MID     28         212.2               140.1          1.51
ANY BAR   358         121.8               104.6          1.16   ← baseline
```

Two things to read carefully. First, n of 20–34 per level is far too small to trade off —
this demonstrates the *method* is feasible on data already present, not that PDC has a
1.76 edge. Second, note the trap it already caught: measured as
"P(reversal ≥ 50 pts)" every level scores 100%, and so does the baseline, because 50 pts
is 0.18σ (D3). Any statistic here must be reported against its unconditional baseline or
it is theatre. Done properly — with the level classes the engine actually uses (AAA vs A
borders, LVN valleys, one-sided vs balanced HVN builds) accumulated over months — this
turns the doctrine's qualitative level ranking into a measured one.

### C. Needs the Part 2 data

- **C1. Volatility-scaled config** — needs nothing new, listed here because it depends on
  B6 landing first. `significant_move_pts`, standoff and chase gates become σ multiples.
- **C2. Day-type classification** — needs A2 (letter→time). Normal / normal-variation /
  trend / neutral / double-distribution from the TPO letter sequence, plus open type
  (drive / test-drive / rejection-reverse / auction), plus TPO excess length at each
  extreme (fixes the discard in D2).
- **C3. Double-distribution detection** — needs A1 or the TPO ladder. A bimodal session
  profile with a low-volume gap between two distributions is a distinct regime the
  engine has no name for; `multiDayTpo` finds interior LVN valleys across sessions but
  nothing looks for the shape *within* the day. A dip test or a two-component fit over
  the session profile is the standard treatment.
- **C4. Time-to-event conditioning** — needs A3. Suppress or flag setups inside N minutes
  of a tier-1 release; explain RVOL anomalies (B1) instead of narrating them as
  participation.
- **C5. Naked/virgin POC set** — needs A1 plus a traded-through pass over `htf_bars.csv`.

---

## Suggested order

1. **D1** — a live-session row poisoning `valueMigration` and `dailyRanges` is a
   correctness bug, and `currentPriceVsPriorValue` has never worked. Cheap.
2. **B4 + D5** — promote prior-day and TPO value to anchorable structure. Directly closes
   the operator's 2026-08-03 finding.
3. **D2 → A2 → C2** — stop discarding TPO tails, add the one metadata line, then build
   day-type on top.
4. **B1** — RVOL (the volume clock, B2, is already queued as `feat-088`). Both are free,
   and both gate everything downstream.
5. **B6 → D3/C1** — measure volatility properly, then scale the gates that are currently
   fixed points.
6. **A1** — the session volume profile, the one genuinely missing export.
7. **B3, B5, B7, B8** — the quantitative layer, once the scale and participation
   measures above are in place to gate them.

Items 1–4 are engine-only and need no ACSIL work.

---

## Reproducing this

```bash
# newest bundle row + its storage objects
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/raw_bundles?select=*&order=received_at.desc&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
curl -s "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/bundle-csvs/<bundle_id>/<file>" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -o <file>
```

Engine facts were produced by calling `computeEngineFacts()` directly over the downloaded
files via `npx tsx`, with `receivedAt` / `now` set to the bundle's own timestamps.
Statistics in B1–B8 were computed from `htf_bars.csv`, `execution_bars.csv`,
`daily-value-areas.csv` and `tpo.data.md` of the same bundle.
