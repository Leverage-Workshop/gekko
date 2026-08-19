# JBA Analysis Process

A rule-based reconstruction of the premarket planning method used in the OrderFlow Labs prep
videos, derived from 25 transcripts spanning 2026-02-13 → 2026-08-11.

**Version 4 (n=25 prep videos + the author's complete Job Pivot deep dive).** Evidence, per-video findings and open questions live in the companion
[JBA Prep Video Notes](./jba-prep-video-notes.md).

**Confidence:** `A` = stated in 5+ videos · `B` = stated in 2–4 · `C` = single instance or inferred.
Rules are not equally established — treat `C` as a hypothesis to test, not a finding.

**Scope: one instrument.** The source videos plan ES and NQ together and cross-reference them
constantly — lead/lag, divergence, using one as a confirmation gate for the other. That material is
deliberately **excluded** here so the process runs on a single instrument without a second symbol to
track. The evidence for it is preserved in the companion notes under cross-instrument findings, and
can be reinstated as an optional overlay if it is ever wanted.

**Source column.** Links point at the passage each rule was drawn from.

- **Deep-dive links are timestamped** (`@m:ss`) and land a few seconds early.
- **Prep-video links are not timestamped.** The 25 prep transcripts were flattened to plain prose
  before this column existed, and the caption timings were not retained. Those videos run 1.5–3.5
  minutes, so the video link is close to the moment anyway — but if exact timestamps are wanted,
  re-running `pull-transcripts.py` locally restores them into `transcripts/.raw/`.
- A dash means the rule rests on an **absence** rather than a statement.

---

## Vocabulary this process assumes

| Term | What it is |
| --- | --- |
| **JBA** | Job Balance Area — the box where daily Job Pivot **value zones overlap on a rolling 5-day lookback**. Rolls forward daily; treated as a value zone in its own right |
| **Pivot** | Volume-profile-derived line in the sand, with a **value zone** = 70% of that volume around it |
| **G line** | The **weekly open**. Tier 1. Captions garble it; it is the primary bias gate |
| **RP** | Rolling Pivot. Secondary gate and change-detector |
| **1A / 2A / 1B / 2B** | Targets stacked outward in **multiples of the pivot's value-zone width** — `A` above, `B` below. Computable, not opaque |
| **LVN** | Low-volume node, cited from a named profile and ranked by depth. Where entries live. Captioned "LVN", "LBN", "VM", "OBN" |
| **Auto plot** | The larger balance construct (Leo's material). JBAs are tighter and **subdivide autoplot's interior** |
| **Profile stack** | Rolling profiles at 4-hour, 5-day and four-week lookbacks, plus last week's and the overnight profile |
| **Yellow light** | A drawn caution band where the read is degraded — distinct from purgatory |
| **Rebid / reoffer** | Pullback entry, long / short respectively |
| **Traverse** | Price crosses the zone to trade the far side |
| **Two-way trade** | Regime declaration: no directional bias, play the edges only — he calls the shape a Gaussian curve |
| **Mechanical / emotional** | Whether price *pauses* at MGI (mechanical) or *accelerates through* it (emotional). MGI = Market Generated Information |

---

## Phase 0 — Orient: top-down, left-to-right

The method's own organising principle, stated twice in the deep dive. Every prep video follows it,
and it is why they open on weekly references and narrow from there.

- **Top-down** — start at the weekly aspect and move down and in. Higher-timeframe MGI and pivots
  frame what intraday activity means. `A`
- **Left-to-right** — *where did price come from?* Did it just reject from above, or from below? The
  read is path-dependent, and the same price carries a different meaning depending on the approach. `A`

## Phase 1 — Build the frame

No direction yet. Establish geometry first; everything downstream references it.

| # | Rule | Conf | Source |
| ---: | --- | :---: | --- |
| 1 | **Locate the active JBA** — top, bottom, width. | `A` | [02-20](https://youtu.be/yjv7fJnkwTA) · [03-06](https://youtu.be/5EAXvm36rbA) |
| 2 | **Locate adjacent JBAs** above and below. These become targets once a boundary goes. | `B` | [07-20](https://youtu.be/66ryWxqne8k) |
| 3 | **Locate the weekly open** and its position relative to the JBA edges. | `A` | [03-02](https://youtu.be/zRU22muRdlI) · [03-19](https://youtu.be/h4oc2xoEMlY) |
| 4 | **Locate the RP.** | `B` | [06-10](https://youtu.be/uvanT97KEpk) · [06-17](https://youtu.be/Y400TUvIH_A) |
| 5 | **Locate weekly references** — weekly pivot and its extension targets (1A/2A up, 1B/2B down), weekly VWAP. | `A` | [Job Pivots DD @1:41](https://youtu.be/CoKoCpLYnC8?t=98) · [07-07](https://youtu.be/X0NpbKM2KUA) · [02-13](https://youtu.be/deqIr8DaydA) |
| 6 | **Locate session references** — ONH, ONL, PDH, PDL, prior week high/low/value, prior month low. | `A` | [02-13](https://youtu.be/deqIr8DaydA) · [02-20](https://youtu.be/yjv7fJnkwTA) |
| 7 | **Locate internal structure** — LVNs and high-volume edges, each from a *named* profile in the stack (4-hour, 5-day, four-week, last week's, overnight). Rank LVNs by depth within a profile. | `A` | [02-17](https://youtu.be/TAn4ly-3MDw) · [03-16](https://youtu.be/1h_JeSgR9_A) |
| 8 | **Locate auto plot's top and bottom** — the second balance-area type, which stacks in confluence with the A/B extensions and with LVNs. | `B` | [03-17](https://youtu.be/KNxA1k-RL94) · [03-19](https://youtu.be/h4oc2xoEMlY) |
| 9 | **Mark every confluence** — two or more references within a few points. Confluence sets narrative priority: lead with the tightest stack. He calls a dense stack "a lot of MGI". | `A` | [03-20](https://youtu.be/_X30tjUvddc) · [07-10](https://youtu.be/XItRia6NPbQ) |
| 10 | **Take zone edges as of now, and know they roll.** A JBA is the overlap of daily Job Pivot value zones across a **rolling 5-day window**, so each new session drops the oldest pivot and adds a new one and the box recomputes. Nothing organic to model. For a point-in-time plan this changes nothing; it matters only when carrying levels across a session boundary, or when reproducing history — where the lookback must be pinned to 5 days. | `A` | [Job Pivots DD @29:51](https://youtu.be/CoKoCpLYnC8?t=1788) |
| 11 | **Gauge the JBA against the 5-day and 4-hour rolling profiles** to find where the overlap sits relative to actual volume. | `B` | [Job Pivots DD @30:54](https://youtu.be/CoKoCpLYnC8?t=1851) · [03-20](https://youtu.be/_X30tjUvddc) |
| 12 | **Place the JBA inside autoplot.** Autoplot is the larger balance; JBAs subdivide its interior and will not traverse the whole of it. | `B` | [Job Pivots DD @33:14](https://youtu.be/CoKoCpLYnC8?t=1991) |
| 13 | **Collapse near-coincident references.** Where two levels nearly overlap he names the simpler one and trades it — "essentially the JBA low, but let's keep it real simple, just say previous day's low." Treating both as distinct over-counts the structure. | `B` | [03-06](https://youtu.be/5EAXvm36rbA) |


## Phase 2 — Set bias

| # | Rule | Conf | Source |
| ---: | --- | :---: | --- |
| 14 | **The primary gate is the nearest live weekly reference.** Above → long bias, below → short bias. - Use the **weekly open** when price is near it. `A` - When price has extended past it, fall through to the **weekly pivot and its extension targets**. `B` - **Never gate on a weekly level price has left behind.** | `C` | [03-19](https://youtu.be/h4oc2xoEMlY) · [06-10](https://youtu.be/uvanT97KEpk) |
| 15 | **The RP confirms.** Building below it means *something has changed* — demote or invert the read. | `B` | [08-04](https://youtu.be/jvSf2rtihWY) |
| 16 | **A setup can be conditioned on the zone's formation context** — "open to a rebid at top of the JBA as long as we're above the RP when that formed." Validity depends on where price was when the zone built, not only where it is now. | `C` | [06-17](https://youtu.be/Y400TUvIH_A) |
| 17 | **Price inside a narrow band between two references means no directional bias.** Declare two-way trade and play the edges only. | `A` | [02-13](https://youtu.be/deqIr8DaydA) · [02-17](https://youtu.be/TAn4ly-3MDw) |
| 18 | **A narrow zone implies escape** from one end during the session, direction unspecified. | `C` | [07-20](https://youtu.be/66ryWxqne8k) |
| 19 | **Expansion targets are arithmetic.** Where a zone will expand to is derivable from the pivot's value-zone width, which is why he forecasts it confidently. Plan against zones that have not formed yet on the same basis. | `B` | [Job Pivots DD @2:20](https://youtu.be/CoKoCpLYnC8?t=137) |
| 20 | **Classify the tape as mechanical or emotional.** Price pauses at MGI → mechanical, the level set is tradeable as written. Price accelerates *through* MGI without responding → emotional: "there's no point in countering this." Do not fade an emotional tape. | `B` | [Job Pivots DD @9:31](https://youtu.be/CoKoCpLYnC8?t=568) |
| 21 | **Read the open against the pivot.** Opening above pivot near the top of value is productive but not a buy — gauge the interaction. Opening at the pivot demands a volume-build read. Opening well outside range implies the distant inventory gets tested, but only after price returns inside a zone of initiation, "that way I have structure to lean upon." | `B` | [Job Pivots DD @9:31](https://youtu.be/CoKoCpLYnC8?t=568) |


## Phase 3 — Locate entry bands

| # | Rule | Conf | Source |
| ---: | --- | :---: | --- |
| 22 | **Entries are bands, not points.** The band is the width of the structure it is drawn on — an LVN's span, a zone edge's thickness — so it scales with the instrument and the feature, not a fixed point count. | `A` | [03-17](https://youtu.be/KNxA1k-RL94) · [07-23](https://youtu.be/j3B0BuFxT_E) |
| 23 | **Bands form at** an LVN, a JBA edge, a high-volume edge, or a confluence of two references. | `A` | [06-15](https://youtu.be/LnFBIc8V168) · [06-18](https://youtu.be/kSTzKPQFCC4) |
| 24 | **Entries sit inside the zone or at its edge; targets are the frame** — the opposite JBA boundary, the adjacent JBA, or a weekly target. | `A` | [08-07](https://youtu.be/TpIyLl3_aVY) · [08-11](https://youtu.be/G-4-sVT_uok) |
| 25 | **Entry is always a pullback into the band** — rebid for longs, reoffer for shorts. Never a breakout chase at the band itself. | `A` | [Job Pivots DD @0:29](https://youtu.be/CoKoCpLYnC8?t=26) · [03-19](https://youtu.be/h4oc2xoEMlY) · [08-11](https://youtu.be/G-4-sVT_uok) |
| 26 | **A band carries no fixed direction.** Held → entry with bias. Accepted through → entry *against* the prior bias, from the same price. | `B` | [08-04](https://youtu.be/jvSf2rtihWY) |


## Phase 4 — Select the play

Seven observed plays, in rough order of frequency. The last is the author's own formulation and
subsumes what earlier versions of this document listed separately as "failed break re-entry" and
"failure to progress" — both were describing it: *"if we are to step outside of a target, we can't
progress. Instead, we step back inside. We seek the opposite target."*

| Play | Trigger | Target | Conf |
| --- | --- | --- | :---: |
| **Rebid / reoffer to boundary** | pullback into a band that holds | opposite JBA boundary | `A` |
| **Look above/below and fail** | probe beyond ONH/ONL that fails to hold | back across the zone | `A` |
| **Expansion / acceptance** | build above/below a boundary and hold | adjacent JBA, weekly target | `A` |
| **Two-way trade from the edges** | price inside a narrow inter-reference band | the band's own edges | `A` |
| **Traverse value** | steps outside a target, cannot progress, returns inside | **the opposite target** | `A` |
| **Testing value from outside** | exits value, returns inside | the outside look is a fail — lean between the two references and push across the zone | `A` |
| **Testing value from inside** | pushes from centre toward an edge and finds exhaustion | the edge, leaning on the exhaustion or a structural component | `B` |

## Phase 5 — Output shape

| # | Rule | Conf | Source |
| ---: | --- | :---: | --- |
| 27 | **One primary lean, stated first**, conditional branches after it. | `A` | [08-04](https://youtu.be/jvSf2rtihWY) |
| 28 | **Never state a stop, size, or R/R.** Invalidation is carried by the branch structure. | `A` | — *(an absence: no video states it)* |
| 29 | **Targets are named structures** — never round numbers or measured moves. | `A` | [05-26](https://youtu.be/rAwVpIPlpro) · [06-18](https://youtu.be/kSTzKPQFCC4) |
| 30 | **Everything is conditional** — "if/then", "want to see", "I'd expect". No predictions. | `A` | [02-13](https://youtu.be/deqIr8DaydA) · [02-17](https://youtu.be/TAn4ly-3MDw) |
| 31 | **Close with the acceleration read** where relevant: what happens if the boundary gives. | `B` | [03-19](https://youtu.be/h4oc2xoEMlY) · [07-20](https://youtu.be/66ryWxqne8k) |


---


## Negative rules — what the method never does

- **Never trades through purgatory** — the band between two close references. `A`
- **Never chases.** Every entry is a pullback into a pre-marked band. `A`
- **Never states a stop-loss *in the prep format*.** Zero across all 25 videos and six months —
  but the method does have stops. The deep dive places them structurally, leaning on a look of
  exhaustion or a structural component rather than a fixed distance: "you should have a look of
  exhaustion or some sort of structural component in order to lean on up there." `A`
- **Never assigns a level a permanent direction.** `B`
- **Never counters a one-sided move** without exhaustion. `B`
- **Never fades acceptance.** Once price is holding beyond a level, that level is only tradeable
  again if price comes *back inside* — "don't want to fight that; I only want to fight that as a
  reoffer if we come back inside." `A`
- **Never fades a hold-back-inside.** If price looks outside value, returns, and holds — "nothing in
  my right mind is telling me to short that." `A`
- **Never anticipates.** "No need to bid… no need to anticipate. Allow it to move, show its
  hand." `B`
- **Never carries full size through the middle of a zone.** "Nobody wants to be full size in the
  middle of a balance zone. We patiently wait to exploit the edges." Resting in value with no setup
  and no move toward an edge is a **pause**, not a trade. `A`

---

## Phrasebook

The register is as consistent as the structure. Output that follows the rules but not the language
will not read as his.

| Phrase | Means |
| --- | --- |
| "want to see…" | the conditional setup, not a prediction |
| "get on board with that" | take the trade once the condition confirms |
| "look above / below and fail" | failed probe beyond a session extreme — a fade trigger |
| "can't find any activity" | no acceptance beyond the level; expect re-entry |
| "build above / below" | acceptance — the expansion branch |
| "gauge continuation" | wait and assess rather than act |
| "treat this mechanically" | balance regime; play the levels, not a narrative |
| "get a little loose" / "off to the races" / "flush out" / "B-line to" | acceleration after acceptance |
| "plenty of meat on the bone" | room remains to the next target |
| "don't want to step in front of a train" | do not counter one-sided initiative |

---

## Worked example — 2026-08-11, one instrument

How the phases resolve on a real session.

| Phase | Resolution |
| --- | --- |
| **1 — Frame** | JBA upper 7804, lower ~7720s, next JBA below. Mid-zone LVN 7779–82. PDL as session reference |
| **2 — Bias** | Inside the zone, not exited → balance regime, "treat this very mechanically until it changes" |
| **3 — Bands** | 7779–82 (mid-zone LVN) — a 3-point band, inside the zone |
| **4 — Play** | Rebid to boundary: bid the band, target the upper boundary at 7804, expect re-offer there |
| **5 — Output** | Primary lean stated first; PDL branch after it; expansion case last. No stop |

The secondary branch reads straight off rule 26 — PDL holds → traverse up to 7804; PDL accepted
through → down to the lower boundary and possibly the next JBA. Same level, both directions,
decided by acceptance.

---

## Event days need no special handling

Fourteen of the 25 source videos fall on a scheduled event — two FOMC decisions, four CPI/NFP
releases, two quad-witching sessions, an ordinary opex, and two post-holiday sessions. **Eleven
never name the event at all.**

The two FOMC decision days are the proof: 03-18 gives it one sentence placed *after* the finished
plan and attached only to range width ("we have potential for a wide range. Today's FOMC day"), and
06-17 does not mention it once. Neither quad witching gets a word about expiry.

**So: no event-day branch, and no economic calendar.** Events are treated as already expressed in
the overnight structure. Where an event is acknowledged it adjusts *expected range*, never the
plan's shape. `A`

The one observed adaptation runs opposite to intuition. On the single video recorded *before* its
release (03-06, 7:37 ET against an 8:30 print) he **simplified** — fewer levels, one binary, "let's
keep it real simple." A pending catalyst reduces the number of references in play rather than adding
caveats. `C`

---

## When the auction changes

"As soon as we're no longer respecting this zone." That is the stated trigger — a zone stops being
the frame the moment price stops honouring its edges, at which point the level set is rebuilt rather
than adjusted. `B`

---

## Data, studies and exports this process needs

What the 31 rules above actually require, split by whether Gekko already has it. Export filenames
follow the existing bundle convention — files dropped in the Sierra export folder, watched by
`scripts/uploader.ts`, mapped to an ingest field in `lib/uploader/bundle.ts`.

### Already shipping

| Need | Where it comes from |
| --- | --- |
| Weekly open (the bias gate) | `mgi_static_levels.json` → `weekly.wkOpen`, already Tier 1 in `mgiPriority.ts` |
| Rolling Pivot (RP) | `mgi_static_levels.json`, tiered as the Rip |
| Weekly pivot | `mgi_static_levels.json` (Weekly Job Pivot, Tier 1) |
| Weekly VWAP, session VWAPs | `mgi_static_levels.json` |
| ONH/ONL, PDH/PDL/PDC, IB levels | `mgi_static_levels.json` |
| Prior week high/low, prior week value | `mgi_static_levels.json` |
| Prior day value area (RVAH/RVAL/RPOC) | `daily-value-areas.csv` |
| LVN/HVN nodes on two profiles | engine facts — rotation and balance-area profiles |
| Bar data | `htf_bar_data.rolling.csv`, `execution_bar_data.globex.csv` |

**The single most load-bearing input is already in place.** The weekly open gates direction in every
rule in Phase 2 and it needs no new work.

### New exports required

| Need | Rule(s) | What the export must carry |
| --- | --- | --- |
| **JBA zones** | 1, 2, 10 | Top and bottom of the active zone **plus the adjacent zones above and below** — rule 2 targets them once a boundary goes. Not just the zone price is currently inside |
| **Zone formation context** | 16 | When each zone formed, and where price sat relative to the RP at that moment. Rule 16 conditions a setup on it, so current edges alone are insufficient |
| **Auto plot zones** | 12 | Top and bottom. JBAs subdivide autoplot's interior, so the containment relationship needs both |
| **Weekly pivot value zone + A/B ladder** | 5, 19 | The pivot's value zone (70% of volume) and the stacked targets 1A/2A/1B/2B. The pivot itself ships; the ladder does not. Derivable from the value-zone width if that is exported |
| **Profile stack** | 7 | LVNs and high-volume edges from each named lookback — 4-hour rolling, 5-day rolling, four-week rolling, last week's, and the overnight profile. Two profiles ship today; the method cites five |
| **LVN depth ranking** | 7 | "Deepest LVN" is his term for the primary one. Depth must be a field, not inferred from the node list |

### Configuration that must be pinned

- **JBA lookback = 5 days.** Configurable in the study; 5 is what he runs. Any historical
  reproduction that uses a different lookback produces different zones.
- **Value zone = 70% of volume** around the pivot.
- **Session definition** — the JBA re-evaluates at the RTH open, so the export's session boundary
  must match the one the analysis assumes.

### Not needed

- **No economic calendar.** The method is event-agnostic; eleven of fourteen event days in the corpus
  never name the event. (The *execution* process has one rule that does want a release schedule —
  see its requirements section.)
- **No second instrument.** This process is single-instrument by design.
- **No order-book data.** Everything above is levels and profiles. Level 2 is an execution
  requirement, not a planning one.

---

## What this process cannot supply

Every play resolves to a band and a target. **None of them tells you whether price traverses the
zone or expands through it.**

Per the study's own published doctrine, that fork is decided by tempo, pace and volume build at the
edge — read live through DOM, Time & Sales and execution tooling. Slowing effort at the edge implies
a traverse; effort that stays heavy implies expansion. It is the single most consequential decision
in the method, and it is **never verbalized in any of the nine videos**, because for him it happens
at the moment of execution rather than during prep.

The prep defines *where* and *what if*. The effort read decides *which*. Any implementation gets the
first half from this document and must source the second half from live order flow.
