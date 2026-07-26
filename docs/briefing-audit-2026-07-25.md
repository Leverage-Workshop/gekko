# Briefing Audit — 2026-07-25 16:37 PDT Run

Investigation of the manual briefing generated 2026-07-25 23:37 UTC (LangSmith trace
`019f9ba4-03dc-7000-8000-00424c5f593d`, project **Gekko**), prompted by the operator
complaint: *"the objectives are ~25 points apart — with all the extra data the model
should be more discriminate in what it picks for zones, boundaries and objectives."*

## TL;DR

1. **The new data never reached the model.** The bundle carried **no TPO export, no
   daily value-area history, and no HTF bar data** — the engine logged all three as
   warnings and shipped `tpo: null`, `valueMigration: null`, `htfStructure: null`.
   Root cause: the uploader runs from a **stale Windows checkout**
   (`C:\Users\caleb\source\repos\gekko` @ `55b0abd`, PR #82 — eleven PRs behind
   `main` @ `74dccc9`, PR #93). Its ingest manifest predates feat-046/048/049, so it
   silently skips `tpo.data.md`, `daily-value-areas.csv` and
   `htf_bar_data.rolling.csv` even though Sierra is writing all three into
   `C:\gekko\export` (verified fresh at 16:45 PDT).
2. **The two objectives are a forbidden straddle wearing two name tags.** Primary
   BUY 28465.5 → T1 28499.5; secondary SELL 28499.5 → T1 28465.5. Each entry is the
   other's first target — one contested 34-pt band traded from both sides, exactly
   the "ONE undecided scenario, not two objectives" pattern the prompt prohibits.
   It survives because validation only checks the numeric ≥25-pt entry gap, which
   34 pts clears.
3. **The secondary anchors on a level the engine explicitly demoted.** OR Low
   28499.5 / 24 VWAP 28498.46 are `kind: "mgi", hard: false, reason: "no local
   block/void structure to promote"` — bare MGIs with no volume confluence, which
   doctrine says are *never* borders ("no entries"). But `engineAnchorPrices()`
   includes every `terrain.levels` verdict regardless of kind, so the validator
   blessed it as a legitimate anchor.
4. **The briefing ran on `google/gemini-3.6-flash`.** `config.model_id` (and
   `triage_model_id`) were set to Gemini Flash on 2026-07-22, replacing
   `openai/gpt-5.6-terra`. A speed-tier model doing the full doctrine synthesis is
   a plausible contributor to letter-vs-spirit rule gaming.

## What the run actually looked like

- **Trace:** root `analyze-task` → `openrouter.chat`, 24.2 s, 40,246 input /
  5,346 output tokens (2,342 reasoning), model `google/gemini-3.6-flash`.
- **Context:** price 28468.25, sitting 2.75 pts above the Tier-1 ONL/Rip composite
  border (28465.5 / Rip 28453.91). Rip status Green ("DO NOT FADE"). The prompt's
  Campaign Boundary Check told the model to explicitly evaluate the override at
  this border — it did, and flagged a Controlled Flush & Reload.
- **Output objectives:**
  - Primary: **long 28465.5** (ONL), stop 28431, T1 28499.5, T2 28606.75, T3 28747.75.
  - Secondary: **short 28499.5** (OR Low / 24 VWAP), stop 28515, T1 28465.5,
    T2 28432.5, T3 28299.
- **Entry gap:** 34 pts, opposite directions → passes the
  `MIN_OPPOSING_ENTRY_SEPARATION_PTS = 25` hard gate by 9 pts.

### Why this is still one scenario, not two

The doctrine text in the user prompt is explicit: *"An opposite-direction straddle
('short the reoffer / long the hold') bracketing one contested zone is ONE undecided
scenario, not two objectives — even when the two entries sit at nominally different
nearby borders."* This briefing is that pattern verbatim:

- The secondary's rationale is literally the primary's failure case ("if reload
  buyers fail to sustain momentum") — not a counter-scenario anchored at structure
  defining its own trade.
- Primary T1 = secondary entry; secondary T1 = primary entry. The whole plan lives
  inside the 28465.5–28499.5 band, with the 28522–28558 HVN magnet (the model's own
  #1 danger zone) sitting 22 pts above the short entry — the short is initiated
  almost directly beneath a magnet it warns against.
- Proper distinct anchors existed in the engine output: hard borders at 28606.75
  (OR High, AAA), 28436.75/28432.5 (VRange Low/PDL, Tier-1 AAA), 28299 (IBL). A
  counter-short belongs at the failed ceiling (28606.75) or, if the reload thesis
  dies, the breakdown structure below — not at a soft MGI 31 pts overhead.

## Root causes

### RC-1: Stale uploader checkout starves the engine of the new exports (primary)

Every `raw_bundles` row in Supabase — including bundle
`0b042487-95c6-4aaa-86ee-8d36adfc33fb` used by this run — has
`tpo_data_ref = daily_va_ref = htf_csv_ref = NULL`, while `rotation_vbp_ref` /
`exec_csv_ref` are populated. Engine warnings in the traced payload:

```
"bundle has no numeric TPO export — TPO facts not computed"
"bundle has no daily value-area history — value migration not computed"
"bundle has no HTF bar data — HTF structure not computed"
```

The uploader process (`npm run uploader`, Windows PID 257056, started 16:37:07 PDT)
runs from `C:\Users\caleb\source\repos\gekko`, whose HEAD is
`55b0abd` ("Upload bundles on demand", PR #82). That checkout's ingest manifest has
9 file fields — it predates:

| Missing field | Feature | Export file (present in `C:\gekko\export`) |
|---|---|---|
| `tpo_data` | feat-046 | `tpo.data.md` (fresh 16:45 PDT) |
| `daily_va` | feat-048 | `daily-value-areas.csv` (fresh 16:22 PDT) |
| `htf_csv` | feat-049 | `htf_bar_data.rolling.csv` (fresh 16:45 PDT, 214 KB) |

Consequences in this run:

- `meta.htfTrend` fell back to **"Vision-only read"** (screenshot-only trend call) —
  feat-049's whole point was to replace that.
- No value-migration facts (feat-048), no TPO structure (feat-046).
- Of the four recent data features, only **feat-050** (delta split + node build
  quality) arrived, because it rides inside the existing `rotation_vbp` /
  `balance_area_vbp` files.

Note the enriched execution CSV (feat-047) also flows through the old `exec_csv`
field, so its extra columns arrive — but only three of the six new data streams
were live for this briefing.

### RC-2: Validation enforces the letter (25 pts), not the rule (distinct scenarios)

`assertDistinctObjectiveAnchors` in `lib/analyze/validateBriefing.ts` compares only
`|primaryEntry − secondaryEntry| ≥ 25`. Nothing checks:

- whether the two objectives' **target ladders interlock** with each other's entries
  (the tell-tale straddle signature: primary T1 ≈ secondary entry and vice versa);
- whether the secondary's anchor is a **hard** border (`hard: true` /
  trench/wall verdict) versus a demoted bare MGI.

A model under pressure to always ship a secondary (required: "never omit entries,
stops or targets") will find the nearest level that clears 25 pts. 28499.5 was the
first candidate that fit — so that is what it shipped.

### RC-3: `engineAnchorPrices()` blesses demoted MGIs as entry anchors

`lib/analyze/engineFacts.ts` builds the anchor set from **all** `terrain.levels`
verdicts, including `kind: "mgi", hard: false` levels whose own `reason` field says
"no local block/void structure to promote". The system prompt says a bare MGI with
no volume confluence is *never* a border and gets no entries; the validator says it
is a fine anchor. The model followed the validator, not the doctrine.

### RC-4 (contributing): model downgraded to Gemini Flash

`config` row (updated 2026-07-22 18:50 UTC): `model_id = triage_model_id =
google/gemini-3.6-flash`. The main analysis model had previously been
`openai/gpt-5.6-terra` (chosen after Anthropic schema-size rejections). Flash-tier
models are the most likely to satisfy hard constraints minimally rather than honor
prose doctrine. If the Flash switch was a triage-cost experiment, it leaked into
the primary briefing path.

## Recommendations

Ordered by leverage:

1. **Update the Windows uploader checkout** (`git pull` in
   `C:\Users\caleb\source\repos\gekko`, restart `npm run uploader`) and re-run a
   briefing. This alone turns on TPO facts, value migration, and code-owned HTF
   structure. Consider whether the uploader should run from the WSL repo (single
   checkout) with `GEKKO_EXPORT_DIR=/mnt/c/gekko/export` to remove the two-repo
   drift class entirely.
2. **Add a drift guard.** Options, cheapest first: (a) uploader logs its git SHA and
   sends it as a bundle field; ingest warns when it doesn't recognize expected
   fields; (b) engine warnings about missing bundle inputs should surface on the
   dashboard/briefing UI, not just inside the traced payload — this run *told us*
   three inputs were missing and nobody saw it.
3. **Close the straddle loophole in validation** (`validateBriefing.ts`):
   - Reject when opposite-direction objectives interlock — e.g. primary's T1 within
     ~5 pts of the secondary's entry **and** secondary's T1 within ~5 pts of the
     primary's entry. That is the geometric definition of "one contested zone,
     two name tags" and would have caught this briefing regardless of the 34-pt gap.
   - Optionally require the two entries to sit in **different engine zones**.
4. **Split the anchor set by strength.** Keep bare MGIs (`hard: false`, `kind:
   "mgi"`) valid for *targets* (waypoints), but exclude them from *entry* anchors —
   or demote an entry on one to a hard validation failure instead of no warning at
   all. This aligns `engineAnchorPrices()` with the "bare MGI is never a border"
   doctrine.
5. **Restore a reasoning-tier model for analyze.** Revisit `config.model_id`
   (currently `google/gemini-3.6-flash`); keep Flash for triage if that was the
   intent, but the doctrine-synthesis step showed letter-over-spirit behavior on
   this run. Re-test the same bundle on `openai/gpt-5.6-terra` once RC-1 is fixed —
   evaluating model quality is only meaningful after the data starvation is cured.
6. **After RC-1 is fixed, re-audit.** The complaint ("should be more discriminate
   with all that extra data") cannot be judged yet: the model never saw the extra
   data. Re-run and compare objective anchoring with `htfStructure`,
   `valueMigration`, and `tpo` populated.

## Follow-up — 16:51 PDT re-run after uploader update

The operator pulled the Windows uploader checkout and re-ran the briefing
(bundle `0fdd60d9-994e-400c-8af2-55293d506b0f` 23:51:17 UTC, LangSmith trace
`019f9bb0-d2cc-7000-8000-01420f1bfec3`).

**RC-1 is fixed.** The bundle carries `tpo_data_ref`, `daily_va_ref` and
`htf_csv_ref`; engine warnings are empty; the payload ships populated `tpo`
(2026-07-24 RTH: POC 28443, VA 28355–28558, IB 28299–28622), `valueMigration`
(20 sessions: POC drift down 125 pts/day over 5 sessions, 3 consecutive
lower-value days, price inside prior value) and `htfStructure` (2,959 bars,
trend DOWN on lower swing highs/lows, 451.75-pt rotation, ATR 104.66).
`meta.htfTrend` is now grounded in the code-owned numbers instead of
"Vision-only read".

**RC-2/RC-3/RC-4 are confirmed unfixed — the model reproduced the exact same
straddle.** Primary long 28465.5 (stop 28425, T1 28499.5, T2 28583.75 PM VAL,
T3 28606.75); secondary short 28499.5 (stop 28515, T1 28465.5, T2 28436.75,
T3 28299). Same interlocking geometry (each entry is the other's T1), same
34-pt gap sliding past the 25-pt gate, and the secondary still anchors on OR
Low / 24 VWAP — which this run's terrain again marks `kind: "mgi", hard:
false, "no local block/void structure to promote"`. Model was again
`google/gemini-3.6-flash`.

Net: more data did not change the objective selection. The remaining fixes are
structural — the straddle-interlock validation check (rec 3), the entry-anchor
strength split (rec 4), and the model-tier revisit (rec 5).

## Follow-up 2 — 16:56 PDT re-run on `openai/gpt-5.6-terra`

Same bundle-fresh data, model switched to Terra (LangSmith trace
`019f9bb5-1d92-7000-8000-02ae4bbda3f3`). The straddle is gone and every claim
spot-checked is faithful to the engine payload.

**Objectives:** Primary **short 28583.75 PM VAL** (stop 28622, T1 28465.5,
T2 28436.75, T3 28299) — HTF-trend-aligned, with the Campaign Boundary Override
*explicitly rejected*: "ONL was tested, but no exhaustion, failed-breakout trap,
or confirmed absorption exists." Secondary **long 28453.91 Rip** (stop 28436.75,
T1 28522, T2 28583.75, T3 28606.75) — the floor-defense counter-scenario at its
own structure. Entry separation 129.84 pts; no target/entry interlock.

**Verified against the payload:**

- The override rejection is data-grounded: both engine `absorptionCandidates`
  (blue 28479.75–28489.5, red 28466.75–28476.5) carry `stall.confirmed: false`,
  and the briefing cites those exact bands and refuses to "invent absorption at
  ONL". Flash, on materially the same signal, declared a "Controlled Flush &
  Reload detected" and built its primary on it.
- Level discrimination is exactly what the operator asked for: 28522 HVN used as
  a magnet/T1 waypoint and explicitly "not a campaign target"; bare OR Low
  28499.5 skipped entirely; the 28254 data edge called out in dangerZones as
  "not structure; never anchor a decision there".
- The new data is load-bearing: `meta.htfTrend` quotes the code-owned swing/ATR
  numbers (4.3-ATR rotation, 2.3 ATR below 28706.25), and orderFlowContext
  carries the valueMigration facts (POC drift −125 pts/day, three lower-value
  days, price inside prior value → "contested repair, not clean initiative").
- Both ladders are full T1→T2→T3 on distinct engine borders; the secondary stop
  sits beyond the far side of the ONL/Rip composite.

**One nuance that changes a recommendation:** Terra's primary entry PM VAL
28583.75 is itself a `hard: false` bare-MGI verdict ("no local block/void
structure to promote") — the same verdict class as the OR Low anchor flagged in
the Flash runs. The difference: PM VAL is a Tier-1 monthly level and the
engine's `nearestTier1Above`, so it is doctrinally defensible ("Tier-1 campaign
borders strictly dictate Primary/Secondary planning"). Recommendation 4 as
originally stated (hard-exclude `hard: false` MGIs from entry anchors) **would
have rejected this good briefing** — if adopted at all it must be tier-aware
(exclude only non-Tier-1 bare MGIs) or advisory-only.

**Conclusion:** the A/B is clean. Same prompt, same data: Flash gamed the 25-pt
letter of the separation rule twice; Terra honored the doctrine's intent with no
validation change. This was a model-quality failure, not a guardrail gap. The
straddle-interlock check remains a cheap backstop (it catches both Flash
briefings and does not trip on Terra's — its T1/entry pairs are 11.6 and
61.75 pts apart with entries 130 pts apart), but it is optional hardening, not a
prerequisite. The load-bearing fix is keeping `config.model_id` on a
reasoning-tier model.

## Evidence index

- LangSmith run: `019f9ba4-03e5-7000-8000-00823c3ad10b` (`openrouter.chat`) —
  inputs carry the three engine warnings; output is the straddle briefing.
- Supabase `raw_bundles` (latest 8 rows): all `has_tpo/has_daily_va/has_htf_csv =
  false`, `has_rot/has_exec = true`.
- Supabase `config` (id 1): `model_id = google/gemini-3.6-flash`, updated
  2026-07-22 18:50 UTC.
- Windows uploader: PID 257056 `npm run uploader` in
  `C:\Users\caleb\source\repos\gekko`, HEAD `55b0abd` (PR #82); manifest lists 9
  file fields vs 12 on `main`.
- Export folder `C:\gekko\export`: all 12 bundle files present, `tpo.data.md` /
  `htf_bar_data.rolling.csv` mtime 16:45 PDT, `daily-value-areas.csv` 16:22 PDT.
- Engine payload for the run: `tpo: null`, `valueMigration: null`,
  `htfStructure: null`; OR Low / 24 VWAP verdicts `kind: "mgi", hard: false,
  reason: "no local block/void structure to promote"`.
