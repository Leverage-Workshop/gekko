# Data Todos

New or enriched chart-data exports that would upgrade the analysis pipeline. Ranked by
expected value. Compiled 2026-07-24 from a review of the current bundle contract
(`lib/ingest/manifest.ts`), the engine modules (`lib/engine/`), and the analyze-task
trace (`docs/traces/analyze-task-2026-07-20/`).

**Current bundle (9 files, exported by the ACSIL studies to `C:\gekko\export` ~every 30 s):**
`htf_clean.png`, `tpo.png`, `execution_clean.png`, `execution_bar_data.rolling.csv`,
`four-hundred-rotation.vbp.md`, `balance-area.vbp.md`, `half-rotation-delta.vbp.md`,
`full-rotation-delta.vbp.md`, `mgi_static_levels.json`.

**Guiding principle:** every item below moves something the LLM currently squints at in a
PNG (or can't see at all) into numeric data the engine can compute deterministically —
the same treatment `ripStatus`, `lvnHvnNodes`, and `terrainZones` already got.

**Cross-cutting note:** each *new file* also needs gekko-side work — a new entry in
`FILE_FIELDS` (`lib/ingest/manifest.ts`), a `raw_bundles` ref column (Supabase migration),
uploader pickup, a parser in `lib/engine/`, and wiring into engine facts / the analyze
prompt. Items that *edit an existing export* need the matching parser updated in lockstep
(several parsers hard-reject on header mismatch). The feature-list items
(`feat-045`–`feat-052`) cover both sides.

---

## 1. Numeric TPO / Market Profile export (`feat-045`)

**What & why.** The TPO chart ships as an image only, yet the doctrine leans on it
heavily — the analyze prompt tells the model to read "TPO single prints / poor
highs-lows" off the screenshot, which is exactly the kind of pixel-level read vision
models get wrong. With TPO counts per price, the engine can *deterministically* detect
single prints (count == 1 inside the range), poor/unfinished highs and lows (flat 2+ TPO
shelf at an extreme), prominent POC, IB, and day type — and hand them to the LLM as
authoritative engine facts.

**File type & format.** New file `tpo.data.md` — Markdown with a metadata/summary header
and a fenced CSV block, matching the existing `.vbp.md` convention:

````markdown
## Metadata
- **Session Date**: 2026-07-24
- **Session**: RTH
- **TPO Period Minutes**: 30
- **Tick Size**: 0.25
- **Bin Size (Ticks)**: 8

## Summary
- **POC Price**: 29950.00
- **Value Area High**: 30010.00
- **Value Area Low**: 29890.00
- **IB High**: 29981.00
- **IB Low**: 29912.00
- **Session High**: 30044.00
- **Session Low**: 29862.00

## TPO Data

```csv
Price,TPOCount,Letters
30044.00,1,"H"
30042.00,2,"HI"
29950.00,9,"BCDEFGHIJ"
```
````

`Letters` (period letters that traded each price) is what lets the engine sequence the
day (e.g. "single prints from B period", "poor high built in H/I"), not just count.

**Claude Code prompt (new study):**

> I have a Sierra Chart ACSIL project containing custom export studies that write data
> files to `C:\gekko\export` roughly every 30 seconds (look at the existing studies that
> write `four-hundred-rotation.vbp.md` and `mgi_static_levels.json` for the established
> patterns: timer-driven export, atomic write via temp file + rename, markdown-with-CSV
> format). Create a new ACSIL study that exports the current session's TPO / Market
> Profile data to `C:\gekko\export\tpo.data.md`. Requirements: (1) markdown format with a
> `## Metadata` section (Session Date, Session RTH/ETH, TPO Period Minutes, Tick Size,
> Bin Size in ticks), a `## Summary` section (TPO POC Price, Value Area High/Low, IB
> High/Low from the first hour, Session High/Low), and a `## TPO Data` section containing
> a fenced csv block with columns `Price,TPOCount,Letters` — one row per price bin, price
> descending, `Letters` being the concatenated TPO period letters that traded at that
> price, quoted. (2) It must read the TPO data from the chart's Market Profile study
> (TPO letters/counts per price), not recompute from raw bars. (3) Export on the same
> ~30 s cadence and atomic-write pattern as the existing studies. (4) On session
> rollover, the file resets to the new session.

---

## 2. Enriched execution bars: volume, bid/ask volume, trade count (`feat-046`)

**What & why.** `execution_bar_data.rolling.csv` currently carries only OHLC, a leg VWAP,
and a pre-bucketed `DeltaIntensity` score — no per-bar volume, no raw delta, no trade
count. Adding raw `Volume,BidVolume,AskVolume,NumberOfTrades` lets the engine: confirm
absorption candidates numerically (heavy volume + no price progress at a candidate stack
— the "is price stalled here?" call currently punted entirely to the LLM), detect delta
divergence at borders, flag volume climax/exhaustion, and preserve delta magnitude that
the −3…+3 bucketing throws away. **Bonus:** once raw per-bar delta exists, *cumulative
delta* is computed engine-side from this file — no separate export needed.

**File type & format.** Edit the existing CSV. New header (keep existing columns, append
four):

```csv
DateTime,Open,High,Low,Close,LegVWAP,DeltaIntensity,Volume,BidVolume,AskVolume,NumberOfTrades
2026-07-09 10:58:48,29891.18,29898.75,29883.50,29893.81,0.00,-1.00,1842,1104,738,655
```

Same rolling ~250-bar window, same cadence. `AskVolume − BidVolume` convention must be
stated in the study (delta = ask-traded minus bid-traded).
⚠️ `lib/engine/parseExecBars.ts` hard-rejects on header mismatch — the parser must be
updated in the same deploy window as the study change.

**Claude Code prompt (edit existing study):**

> In my Sierra Chart ACSIL project, find the study that exports
> `C:\gekko\export\execution_bar_data.rolling.csv` (rolling ~250-bar CSV with header
> `DateTime,Open,High,Low,Close,LegVWAP,DeltaIntensity`). Extend it to append four
> columns after the existing ones: `Volume,BidVolume,AskVolume,NumberOfTrades` — total
> contract volume, bid-traded volume, ask-traded volume, and number of trades per bar,
> pulled from the chart's base data arrays (SC_VOLUME, SC_BIDVOL, SC_ASKVOL,
> SC_NUM_TRADES). Keep everything else identical: same filename, same rolling window,
> same ~30 s cadence, same atomic-write pattern, same date format. Volumes are whole
> numbers. The delta convention downstream is AskVolume minus BidVolume; add a header
> comment in the study source noting this.

---

## 3. Daily value-area history (`feat-047`)

**What & why.** The Balance Area doctrine — "begins when two days of overlapping value
occur and expands while subsequent days keep overlapping value" — is currently enforced
by a *manually anchored* profile in Sierra. A small CSV of per-day value areas lets the
engine detect and validate balance-area formation/expansion itself, flag when the manual
anchor has drifted from what the rule says, and give the LLM a concrete value-migration
narrative (value building higher/lower day over day) instead of a screenshot inference.

**File type & format.** New file `daily-value-areas.csv` — plain CSV, one row per
completed RTH session, most recent first, rolling ~20 sessions:

```csv
Date,POC,VAH,VAL,SessionHigh,SessionLow,SessionVolume
2026-07-23,29950.00,30010.00,29890.00,30044.00,29862.00,412345
2026-07-22,29812.00,29901.00,29744.00,29933.00,29701.00,398211
```

**Claude Code prompt (new study):**

> I have a Sierra Chart ACSIL project with custom export studies writing to
> `C:\gekko\export` every ~30 s (see the existing studies writing
> `balance-area.vbp.md` and `execution_bar_data.rolling.csv` for the timer/atomic-write
> patterns). Create a new ACSIL study for a daily chart (or one that iterates completed
> RTH sessions on an intraday chart) that exports
> `C:\gekko\export\daily-value-areas.csv`: header
> `Date,POC,VAH,VAL,SessionHigh,SessionLow,SessionVolume`, one row per *completed* RTH
> session, most recent first, rolling 20 sessions. POC/VAH/VAL are the volume-profile
> point of control and 70% value area computed per session (use Sierra's Volume by Price
> study per session, or compute from per-session volume-at-price). Dates ISO
> `YYYY-MM-DD`. Prices 2 decimals, volume whole number. The current in-progress session
> is excluded. Same export cadence and atomic-write pattern as the existing studies.

---

## 4. HTF bars CSV (`feat-048`)

**What & why.** The 30-min/90-day planning chart ships as a PNG only, and
`meta.htfTrend` is a pure vision read. Numeric HTF bars make trend state, swing
highs/lows, rotation extent, and measured ATR computable and verifiable — the same
treatment `ripStatus` got for the execution timeframe.

**File type & format.** New file `htf_bar_data.rolling.csv` — plain CSV, 30-min bars,
rolling 90 days (~2,100 rows), same shape as the enriched execution CSV:

```csv
DateTime,Open,High,Low,Close,Volume,BidVolume,AskVolume
2026-07-24 09:30:00,29891.18,29942.75,29883.50,29927.00,48231,23110,25121
```

**Claude Code prompt (new study):**

> In my Sierra Chart ACSIL project (custom export studies writing to `C:\gekko\export`
> every ~30 s — mirror the timer and atomic-write patterns of the study exporting
> `execution_bar_data.rolling.csv`), create a new ACSIL study to attach to my 30-minute
> HTF chart. It exports `C:\gekko\export\htf_bar_data.rolling.csv`: header
> `DateTime,Open,High,Low,Close,Volume,BidVolume,AskVolume`, one row per 30-min bar,
> chronological, rolling 90 calendar days. DateTime format `YYYY-MM-DD HH:MM:SS`, prices
> 2 decimals, volumes whole numbers. Include the current partial bar as the last row.
> Same cadence and atomic-write pattern as the existing exports.

---

## 5. Delta split on the structural profiles (`feat-049`)

**What & why.** Delta profiles exist only for the execution-timeframe half/full
rotation. Adding a delta column to the 400-pt rotation and balance-area profiles shows
*who built* each HVN/LVN — an HVN built on heavy negative delta reads very differently
as a magnet than one built on balanced two-way trade — and lets `lvnDetection` /
`magnetCheck` carry a delta annotation per node.

**File type & format.** Edit the two existing `.vbp.md` exports
(`four-hundred-rotation.vbp.md`, `balance-area.vbp.md`): the fenced CSV block gains one
column, `Price,Volume` → `Price,Volume,Delta` (delta = ask volume − bid volume per bin):

```csv
Price,Volume,Delta
30554.00,3,-1
30552.00,26,8
```

⚠️ `lib/engine/parseProfile.ts` must be updated in lockstep (tolerate/require the third
column). The half/full rotation *delta* profiles stay as they are.

**Claude Code prompt (edit existing studies):**

> In my Sierra Chart ACSIL project, find the studies that export
> `C:\gekko\export\four-hundred-rotation.vbp.md` and
> `C:\gekko\export\balance-area.vbp.md` (markdown volume-profile exports whose fenced
> csv block has columns `Price,Volume`). Extend both so the csv block becomes
> `Price,Volume,Delta`, where Delta is the bin's ask-traded volume minus bid-traded
> volume from the same volume-at-price data the Volume column comes from. Keep the
> Metadata and Summary sections, bin sizes, price ordering, filenames, cadence, and
> atomic-write pattern exactly as they are. Whole numbers for Volume and Delta.

---

## 6. VWAP standard-deviation bands (`feat-050`)

**What & why.** `mgi_static_levels.json` exports VWAP midlines (`vwap24`, weekly,
monthly) but not their SD bands. VWAP ±1σ/±2σ are natural structure for the entry
standoff, stop buffers, and target rungs, and cost almost nothing to add.

**File type & format.** Edit the existing JSON — add one object (2-decimal prices):

```json
"vwapBands": {
  "vwap24":  { "plus1": 0.00, "plus2": 0.00, "minus1": 0.00, "minus2": 0.00 },
  "weekly":  { "plus1": 0.00, "plus2": 0.00, "minus1": 0.00, "minus2": 0.00 },
  "monthly": { "plus1": 0.00, "plus2": 0.00, "minus1": 0.00, "minus2": 0.00 }
}
```

Additive JSON change — the gekko ingest stores the blob as jsonb, so nothing breaks;
`lib/engine/mgiPriority.ts` / level plumbing then picks the bands up as new MGI levels.

**Claude Code prompt (edit existing study):**

> In my Sierra Chart ACSIL project, find the study that exports
> `C:\gekko\export\mgi_static_levels.json` (a JSON file with `current`, `daily`, `atr`,
> `weekly`, `monthly`, and `vRange` sections; the daily section includes `vwap24` and
> the weekly/monthly sections include `vwap`). Extend it with a top-level `vwapBands`
> object containing `vwap24`, `weekly`, and `monthly` sub-objects, each with `plus1`,
> `plus2`, `minus1`, `minus2` — the ±1 and ±2 standard-deviation band prices of the
> corresponding VWAP study on the chart. Read the bands from the VWAP studies' subgraphs
> rather than recomputing. Keep every existing field, the filename, cadence, and
> atomic-write pattern unchanged. Prices 2 decimals; if a band is unavailable, emit 0.00.

---

## 7. Profile anchor metadata (`feat-051`)

**What & why.** The rotation and balance-area profiles are manually anchored, but the
exports don't say *where*. Exporting each profile's anchor datetime/price lets the
engine validate the anchors (cross-check against the daily value-area history from
item 3), compute how much of the 400-pt rotation has traversed, and flag a stale anchor
in the briefing instead of silently analyzing the wrong structure.

**File type & format.** Edit all four `.vbp.md` exports — three lines added to the
existing `## Metadata` section:

```markdown
## Metadata
- **Profile Name**: VBP
- **Anchor DateTime**: 2026-07-18 09:30:00
- **Anchor Price**: 29614.50
- **Bars In Profile**: 1214
```

Additive markdown change; `lib/engine/parseProfile.ts` extends to capture the new keys.

**Claude Code prompt (edit existing studies):**

> In my Sierra Chart ACSIL project, find the studies that export the four
> volume-profile markdown files to `C:\gekko\export`: `four-hundred-rotation.vbp.md`,
> `balance-area.vbp.md`, `half-rotation-delta.vbp.md`, `full-rotation-delta.vbp.md`.
> Each has a `## Metadata` section. Add three lines to it in each study:
> `- **Anchor DateTime**: YYYY-MM-DD HH:MM:SS` (the timestamp of the first bar included
> in the profile), `- **Anchor Price**: <price>` (that bar's open), and
> `- **Bars In Profile**: <count>`. Derive these from the profile study's actual start
> bar/anchor on the chart, not a hardcoded value. Change nothing else — same csv
> columns, filenames, cadence, atomic writes.

---

## 8. RTH-only balance-area profile (`feat-052`) — lower priority

**What & why.** If the structural profiles blend overnight and RTH trade, value areas
differ meaningfully from RTH-only value, and the balance/acceptance doctrine is
conventionally RTH-value-based. An RTH-only variant of the balance-area profile lets the
engine compare the two: nodes that persist in both are structurally stronger; nodes that
exist only overnight are suspect. Skip if the existing profiles are already RTH-only —
confirm that first, and record the answer in item 7's metadata (add a
`- **Session**: RTH|ETH` line) either way.

**File type & format.** New file `balance-area-rth.vbp.md`, identical format to
`balance-area.vbp.md` (metadata + summary + fenced `Price,Volume[,Delta]` CSV), computed
over the same anchored range but RTH sessions only.

**Claude Code prompt (new study, cloned from existing):**

> In my Sierra Chart ACSIL project, find the study that exports
> `C:\gekko\export\balance-area.vbp.md` (markdown volume profile: Metadata + Summary +
> fenced csv of `Price,Volume`). First tell me whether its volume-at-price data includes
> overnight/ETH trade or RTH only. If it includes ETH, create a variant study exporting
> `C:\gekko\export\balance-area-rth.vbp.md` with the identical format and the identical
> anchor, but restricted to RTH session hours (09:30–16:15 ET for NQ) — either by
> reading from an RTH-session Volume by Price study or by filtering bars by session
> time. Add `- **Session**: RTH` to its Metadata (and `- **Session**: ETH` to the
> original study's metadata). Same cadence and atomic-write pattern.

---

## Prerequisite: the prompt–data sync gate (`feat-053`) — DONE

Every item above changes what data flows into the analysis, and PR #79's cleanup showed
how easily the prompts and the data drift apart. Before any item lands, the verification
suite carries a gate — `tests/prompt-data-sync.test.ts`, run by `npm test` inside
`./init.sh` — and **feat-045…052 all depend on it**:

1. **Registry completeness.** `docs/engine-ownership.md` § "Bundle exports" maps every
   manifest field to its consumer and model surface. A new export with no registry row,
   a stale row, a missing module, or an engine-fact key the table doesn't surface (or
   vice versa) fails the suite. Adding an export forces the decision of who owns it and
   where the model sees it, in the same change.
2. **Fact-path resolution.** Every engine-fact path named in the prompt builders and
   doctrine prose must resolve against the payload actually computed from the
   `chart-data/` fixtures — renames can't leave stale prose pointers.
3. **Vision exclusivity.** The screenshot-only instructions are paired with the numeric
   capability that obsoletes them: when feat-045 lands a TPO fact key, the "TPO single
   prints" vision read must leave the prompt; when feat-048 lands HTF facts, the
   `meta.htfTrend` pure-vision read must change; when feat-046 lands bar volume, stall
   confirmation moves engine-side. Each conditional also asserts the instruction stays
   *present* while the capability is absent.
4. **Size budgets.** Cached prefixes and the fixture user prompt have committed
   character budgets — new data must be projected/summarized into `factsPayload`, not
   dumped, or the budget must be consciously bumped in the diff.

Practical consequence for items 1–8: expect the gate to go red mid-implementation —
that is it working. The failure messages say what to update (registry row, prompt line,
budget) alongside the export itself.

## Deferred / not planned

- **Fill the zeroed MGI fields (`onh/onl/ibh/ibl`)** — investigated; the zeros in the
  sample were an artifact of export timing, not a study bug. No action.
- **Time & sales / DOM snapshot for the eval-task** — a fast-moving, large export in a
  different class than the 30 s bundle system; revisit only if the eval-task's live
  reads prove insufficient after items 1–2 land.
