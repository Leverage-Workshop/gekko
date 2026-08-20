# JBA Analysis Process

A rule-based reconstruction of the premarket planning method used in the OrderFlow Labs prep
videos, derived from 25 transcripts spanning 2026-02-13 → 2026-08-11.

**Version 5 (n=25 prep videos).** Consolidated from 31 rules to 15: deep-dive-only rules removed,
duplicate rules merged. Evidence, per-video findings and open questions live in the companion
[JBA Prep Video Notes](./jba-prep-video-notes.md).

**Confidence:** `A` = stated in 5+ videos · `B` = stated in 2–4 · `C` = single instance or inferred.
Rules are not equally established — treat `C` as a hypothesis to test, not a finding.

**Scope: one instrument.** The source videos plan ES and NQ together and cross-reference them
constantly. That material is deliberately **excluded** here so the process runs on a single
instrument. The evidence is preserved in the companion notes under cross-instrument findings.

**Source: the prep videos only.** Rules the author states in his Job Pivot deep dive but never
applies in a prep video have been removed — the deep dive teaches how the *studies* are built, which
is background, not process. What it contributes to construction survives in the vocabulary table and
in the pinned configuration below. Deep-dive links remain on the two rules the prep videos
independently corroborate.

**Source column.** Links point at the passage each rule was drawn from. Deep-dive links are
timestamped (`@m:ss`) and land a few seconds early; prep-video links are not — the transcripts were
flattened before this column existed and the caption timings were lost. Those videos run 1.5–3.5
minutes, so the bare link is close enough. A dash means the rule rests on an **absence**.

---

## Vocabulary this process assumes

| Term | What it is |
| --- | --- |
| **JBA** | Job Balance Area — the box where daily Job Pivot **value zones overlap on a rolling 5-day lookback**. Rolls forward daily; treated as a value zone in its own right |
| **Pivot** | Volume-profile-derived line in the sand, with a **value zone** = 70% of that volume around it |
| **G line** | The **weekly open**. Tier 1, and the most-cited single reference in the corpus — but it gates direction only while price is near it (rule 5). Captions garble it |
| **RP** | Rolling Pivot. Secondary gate and change-detector |
| **1A / 2A / 1B / 2B** | Targets stacked outward in **multiples of the pivot's value-zone width** — `A` above, `B` below. Computable, not opaque |
| **LVN** | Low-volume node, cited from a named profile and ranked by depth. Where entries live. Captioned "LVN", "LBN", "VM", "OBN" |
| **Auto plot** | The larger balance construct (Leo's material). JBAs are tighter and **subdivide autoplot's interior** |
| **Profile stack** | Rolling profiles at 4-hour, 5-day and four-week lookbacks, plus last week's and the overnight profile |
| **Yellow light** | A drawn caution band where the read is degraded — distinct from purgatory |
| **Rebid / reoffer** | Pullback entry, long / short respectively |
| **Two-way trade** | Regime declaration: no directional bias, play the edges only — he calls the shape a Gaussian curve |
| **Mechanical / emotional** | Whether price *pauses* at MGI (mechanical) or *accelerates through* it (emotional). MGI = Market Generated Information |

The phases below run **top-down**: weekly aspect first, narrowing inward. That is the order every
prep video follows, and it is why the frame is built before any direction is set.

---

## Phase 1 — Build the frame

No direction yet. Establish geometry first; everything downstream references it.

| # | Rule | Conf | Source |
| ---: | --- | :---: | --- |
| 1 | **Locate the JBA and its neighbours** — top, bottom and width of the active zone, plus the adjacent zones above and below. The neighbours become targets once a boundary goes. | `A` | [02-20](https://youtu.be/yjv7fJnkwTA) · [03-06](https://youtu.be/5EAXvm36rbA) · [07-20](https://youtu.be/66ryWxqne8k) |
| 2 | **Locate the reference set** — the four classes tabulated below. | `A` | *(see table)* |
| 3 | **Collapse, then rank by confluence.** Near-coincident references are **one level**, named the simplest way — "essentially the JBA low, but let's keep it real simple, just say previous day's low." That single level is **stronger** for having several references agree on it, and the plan leads with the tightest stack: he calls it "a lot of MGI". Naming both over-counts the structure; ignoring the agreement under-weights it. | `A` | [03-06](https://youtu.be/5EAXvm36rbA) · [03-20](https://youtu.be/_X30tjUvddc) · [07-10](https://youtu.be/XItRia6NPbQ) |
| 4 | **Gauge the JBA against the 5-day and 4-hour rolling profiles** — where the overlap sits relative to actual volume. | `B` | [Job Pivots DD @30:54](https://youtu.be/CoKoCpLYnC8?t=1851) · [03-20](https://youtu.be/_X30tjUvddc) |

### The reference set (rule 2)

| Class | What to locate | Conf | Source |
| --- | --- | :---: | --- |
| **Weekly** | Weekly open and its position relative to the JBA edges; weekly pivot and its extension ladder (1A/2A up, 1B/2B down); weekly VWAP | `A` | [03-02](https://youtu.be/zRU22muRdlI) · [03-19](https://youtu.be/h4oc2xoEMlY) · [07-07](https://youtu.be/X0NpbKM2KUA) · [Job Pivots DD @1:41](https://youtu.be/CoKoCpLYnC8?t=98) |
| **Rolling Pivot** | The RP — secondary gate and change-detector | `B` | [06-10](https://youtu.be/uvanT97KEpk) · [06-17](https://youtu.be/Y400TUvIH_A) |
| **Session** | ONH, ONL, PDH, PDL, prior week high/low/value, prior month low | `A` | [02-13](https://youtu.be/deqIr8DaydA) · [02-20](https://youtu.be/yjv7fJnkwTA) |
| **Internal** | LVNs and high-volume edges, each from a *named* profile in the stack. Rank LVNs by **depth** within their profile — the deepest is the primary one | `A` | [02-17](https://youtu.be/TAn4ly-3MDw) · [03-16](https://youtu.be/1h_JeSgR9_A) |
| **Larger balance** | Autoplot's top and bottom. JBAs subdivide its interior, so a JBA target never sits beyond autoplot's edge | `B` | [03-17](https://youtu.be/KNxA1k-RL94) · [03-19](https://youtu.be/h4oc2xoEMlY) |

## Phase 2 — Set bias

| # | Rule | Conf | Source |
| ---: | --- | :---: | --- |
| 5 | **The primary gate is the nearest *live* weekly reference.** Above → long bias, below → short bias. Use the **weekly open** while price is near it; once price has extended past it, fall through to the **weekly pivot and its extension targets**. Never gate on a weekly level price has left behind — proximity is a required argument, not a refinement. | `C` | [03-19](https://youtu.be/h4oc2xoEMlY) · [06-10](https://youtu.be/uvanT97KEpk) |
| 6 | **The RP confirms.** Building below it means *something has changed* — demote or invert the read. | `B` | [08-04](https://youtu.be/jvSf2rtihWY) |
| 7 | **Price inside a narrow band between two references means no directional bias.** Declare two-way trade, play the edges only, and take nothing through the middle — the middle is purgatory. | `A` | [02-13](https://youtu.be/deqIr8DaydA) · [02-17](https://youtu.be/TAn4ly-3MDw) |
| 8 | **A setup can be conditioned on the zone's formation context** — "open to a rebid at top of the JBA as long as we're above the RP when that formed." Validity depends on where price was when the zone built, not only where it is now. | `C` | [06-17](https://youtu.be/Y400TUvIH_A) |

## Phase 3 — Locate entry bands

A band is the entry area. Three things are true of it and nothing else is.

| # | Rule | Conf | Source |
| ---: | --- | :---: | --- |
| 9 | **A band sits on a structure and inherits its width.** The structures are an LVN, a JBA edge, a high-volume edge, or a collapsed confluence. Width is the span of that feature — never a fixed point count — so it scales with the instrument. | `A` | [03-17](https://youtu.be/KNxA1k-RL94) · [06-15](https://youtu.be/LnFBIc8V168) · [06-18](https://youtu.be/kSTzKPQFCC4) · [07-23](https://youtu.be/j3B0BuFxT_E) |
| 10 | **Entry is always a pullback into the band** — rebid for longs, reoffer for shorts. Never a chase at the band itself. | `A` | [Job Pivots DD @0:29](https://youtu.be/CoKoCpLYnC8?t=26) · [03-19](https://youtu.be/h4oc2xoEMlY) · [08-11](https://youtu.be/G-4-sVT_uok) |
| 11 | **A band carries no fixed direction.** Held → entry with bias. Accepted through → entry *against* the prior bias, from the same price. No level is permanently a buy or a sell. | `B` | [08-04](https://youtu.be/jvSf2rtihWY) |

## Phase 4 — Select the play

Four plays. Earlier versions listed seven; three of them — "look above/below and fail", "traverse
value" and "testing value from outside" — were the same play at different references, and the
transcripts use one verbal formula for all three: *"look above the overnight high and fail, come back
in"*, *"look below yesterday's low fail"*, *"look below that, come back in"*.

| Play | Trigger | Target | Conf |
| --- | --- | --- | :---: |
| **Rebid / reoffer to boundary** | pullback into a band that holds | opposite JBA boundary | `A` |
| **Failed excursion** | price steps beyond a reference — session extreme, zone edge or target — cannot progress, and comes back inside | the **opposite** side of the zone, leaning on the reference it just failed at | `A` |
| **Expansion / acceptance** | build above/below a boundary and hold | adjacent JBA, weekly target | `A` |
| **Test from inside to the edge** | pushes from the centre toward an edge and finds exhaustion | the edge, leaning on the exhaustion or a structural component | `B` |

Two-way trade is not listed here. It is a **regime**, declared in rule 7, and the play it licenses is
"rebid / reoffer to boundary" run against the narrow band's own edges.

## Phase 5 — Output shape

| # | Rule | Conf | Source |
| ---: | --- | :---: | --- |
| 12 | **One primary lean, stated first**, conditional branches after it. | `A` | [08-04](https://youtu.be/jvSf2rtihWY) |
| 13 | **Targets are named structures** — the opposite JBA boundary, an adjacent JBA, or a weekly target. Never round numbers, never measured moves. | `A` | [05-26](https://youtu.be/rAwVpIPlpro) · [06-18](https://youtu.be/kSTzKPQFCC4) · [08-07](https://youtu.be/TpIyLl3_aVY) · [08-11](https://youtu.be/G-4-sVT_uok) |
| 14 | **Everything is conditional** — "if/then", "want to see", "I'd expect". No predictions. | `A` | [02-13](https://youtu.be/deqIr8DaydA) · [02-17](https://youtu.be/TAn4ly-3MDw) |
| 15 | **Close with the acceleration read** where relevant: what happens if the boundary gives. | `B` | [03-19](https://youtu.be/h4oc2xoEMlY) · [07-20](https://youtu.be/66ryWxqne8k) |

---

## Negative rules — what the method never does

Only what is **not** already stated positively above. (Rules 7, 10 and 11 carry the negatives about
purgatory, chasing and permanent direction; they are not repeated here.)

- **Never fades acceptance.** Once price is holding beyond a level, that level is only tradeable
  again if price comes *back inside* — "don't want to fight that; I only want to fight that as a
  reoffer if we come back inside." `A`
- **Never fades a hold-back-inside.** If price looks outside value, returns, and holds — "nothing in
  my right mind is telling me to short that." `A`
- **Never counters a one-sided move** without exhaustion. "Don't want to step in front of a
  train." `B`
- **Never anticipates.** "No need to bid… no need to anticipate. Allow it to move, show its
  hand." `B`
- **Never carries full size through the middle of a zone.** "Nobody wants to be full size in the
  middle of a balance zone. We patiently wait to exploit the edges." Resting in value with no setup
  and no move toward an edge is a **pause**, not a trade. `A`
- **Never states a stop, size or R/R** — zero across all 25 videos and six months. Invalidation is
  carried by the branch structure instead. This is a property of the *prep format*, not of the
  method: stops exist, placed structurally against a look of exhaustion or a structural component
  rather than at a fixed distance. `A`

---

## Phrasebook

The register is as consistent as the structure. Output that follows the rules but not the language
will not read as his.

| Phrase | Means |
| --- | --- |
| "want to see…" | the conditional setup, not a prediction |
| "get on board with that" | take the trade once the condition confirms |
| "look above / below and fail" | failed excursion — the fade trigger |
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

The secondary branch reads straight off **rule 11** — PDL holds → up to 7804; PDL accepted through →
down to the lower boundary and possibly the next JBA. Same level, both directions, decided by
acceptance.

---

## Event days need no special handling

Fourteen of the 25 source videos fall on a scheduled event — two FOMC decisions, four CPI/NFP
releases, two quad-witching sessions, an ordinary opex, and two post-holiday sessions. **Eleven
never name the event at all.** 03-18 gives FOMC one sentence, placed *after* the finished plan and
attached only to range width; 06-17 does not mention it once.

**So: no event-day branch, and no economic calendar.** Events are treated as already expressed in
the overnight structure; where acknowledged at all, an event adjusts *expected range*, never the
plan's shape. `A`

The one observed adaptation runs opposite to intuition: on the single video recorded *before* its
release (03-06, 7:37 ET against an 8:30 print) he **simplified** — fewer levels, one binary. `C`

## When the auction changes

"As soon as we're no longer respecting this zone." A zone stops being the frame the moment price
stops honouring its edges, at which point the level set is **rebuilt rather than adjusted**. `B`

---

## Data, studies and exports this process needs

What the 15 rules above actually require, split by whether Gekko already has it. Export filenames
follow the existing bundle convention — files dropped in the Sierra export folder, watched by
`scripts/uploader.ts`, mapped to an ingest field in `lib/uploader/bundle.ts`.

### Already shipping

| Need | Where it comes from |
| --- | --- |
| Weekly open | `mgi_static_levels.json` → `weekly.wkOpen`, already Tier 1 in `mgiPriority.ts` |
| Rolling Pivot (RP) | `mgi_static_levels.json`, tiered as the Rip |
| Weekly pivot | `mgi_static_levels.json` (Weekly Job Pivot, Tier 1) |
| Weekly VWAP, session VWAPs | `mgi_static_levels.json` |
| ONH/ONL, PDH/PDL/PDC, IB levels | `mgi_static_levels.json` |
| Prior week high/low, prior week value | `mgi_static_levels.json` |
| Prior day value area (RVAH/RVAL/RPOC) | `daily-value-areas.csv` |
| LVN/HVN nodes on two profiles | engine facts — rotation and balance-area profiles |
| Bar data | `htf_bar_data.rolling.csv`, `execution_bar_data.globex.csv` |

Rule 5 needs **distance to each weekly reference**, not just the levels — the gate falls through to
the next reference once price has left one behind, so proximity has to be computed, not assumed.

### New exports required

| Need | Rule(s) | What the export must carry |
| --- | --- | --- |
| **JBA zones** | 1 | Top and bottom of the active zone **plus the adjacent zones above and below** — rule 1 targets them once a boundary goes. Not just the zone price is currently inside |
| **Weekly pivot value zone + A/B ladder** | 2 (Weekly), 5 | The pivot's value zone (70% of volume) and the stacked targets 1A/2A/1B/2B. The pivot itself ships; the ladder does not. Derivable from the value-zone width if that is exported |
| **Profile stack** | 2 (Internal) | LVNs and high-volume edges from each named lookback — 4-hour rolling, 5-day rolling, four-week rolling, last week's, and the overnight profile. Two profiles ship today; the method cites five |
| **LVN depth ranking** | 2 (Internal), 9 | "Deepest LVN" is his term for the primary one. Depth must be a field, not inferred from the node list. Band width (rule 9) is the node's span, so the export needs the LVN's extent, not a single price |
| **Auto plot zones** | 2 (Larger balance) | Top and bottom. JBAs subdivide autoplot's interior, so the containment relationship needs both |
| **Zone formation context** | 8 | When each zone formed, and where price sat relative to the RP at that moment. ⚠️ Rule 8 is a `C` — single instance. This export should not be built before the rule is corroborated |

### Configuration that must be pinned

- **JBA lookback = 5 days.** Configurable in the study; 5 is what he runs. Any historical
  reproduction that uses a different lookback produces different zones.
- **Value zone = 70% of volume** around the pivot.
- **Session definition** — the JBA re-evaluates at the RTH open, so the export's session boundary
  must match the one the analysis assumes.

### Not needed

- **No economic calendar.** The method is event-agnostic. (The *execution* process has one rule that
  does want a release schedule — see its requirements section.)
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
in the method, and it is **never verbalized in any prep video**, because for him it happens at the
moment of execution rather than during prep.

The prep defines *where* and *what if*. The effort read decides *which*. Any implementation gets the
first half from this document and must source the second half from live order flow — see
[`execution-process.md`](./execution-process.md).
