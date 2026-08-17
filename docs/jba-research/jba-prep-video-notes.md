# JBA Prep Video Notes

Working notes on OrderFlow Labs premarket prep videos — extracting the repeatable structure
behind the plans, toward a rule-based analysis process.

**Corpus: 25 videos, 2026-02-13 → 2026-08-11.** The derived process lives in a separate document —
[JBA Analysis Process](./jba-analysis-process.md). These notes are the evidence log behind it.

The second batch (16 videos) was selected by cross-referencing corpus gaps against the 2026
economic calendar and the Feb–Mar 2026 correction — see `priority-videos.json`.

| Date | Context | Note |
| --- | --- | --- |
| 02-13 | **CPI day** | Two JBAs split by a level; "deepest LVN on the 5-day rolling" |
| 02-17 | post-Presidents Day | Below G line; stepped out of the JBA and back in |
| 02-20 | **Opex** | "Still haven't left this zone" |
| 03-02 | Mon, early selloff | **"Yellow light" caution zone**; short-bias throughout |
| 03-06 | **NFP, recorded pre-release** | Deliberately simplified: "let's keep it real simple" |
| 03-16 | Mon pre-FOMC, mid-selloff | **Contract roll** ("the M contract"); two-way trade framing |
| 03-17 | FOMC day 1 | "Bottom of auto plot"; 5-day rolling high-volume edge |
| 03-18 | **FOMC decision day** | JBA **shifted overnight**; "Today's FOMC day" — final sentence |
| 03-19 | day after FOMC | **He fixed a broken G line**; JBA branching/expansion forecast |
| 03-20 | **Quad witching** | "A lot of MGI right here"; four-week rolling |
| 05-26 | post-Memorial Day | Overlapping JBA zones forming; 30K as magnet |
| 06-02 | | Wide balance, JBA edges named numerically |
| 06-10 | **CPI day** | Shortest of batch 1; G line ≈ JBA low on both |
| 06-15 | Mon pre-FOMC, calm | **No overlapping JBAs** — price between zones |
| 06-16 | FOMC day 1 | Shortest in corpus (~130 words); "once this JBA forms" |
| 06-17 | **FOMC decision day** | References EOD recap; pure two-way-trade plan |
| 06-18 | **post-FOMC + quad witching** | Quad moved to Thu (Juneteenth Fri); "tomorrow's a bank holiday" |
| 06-22 | Mon post-quad | Terse; G line as the pivot for both branches |
| 07-07 | | **ES and NQ explicitly divergent** |
| 07-10 | | Heavy confluence stack; "purgatory" band |
| 07-20 | | Longest. Two-way trade doctrine, split zone |
| 07-23 | | Below G line + below JBA — short-bias case |
| 08-04 | | RP as change-detector; two entry bands per instrument |
| 08-07 | **NFP day** | Corroborates the 08-11 roles |
| 08-11 | | Original video |

---

## The headline finding: the method is event-agnostic

Fourteen of the 25 videos fall on a scheduled event. **Eleven never name it at all.**

| Date | Event | Does he say it? |
| --- | --- | --- |
| 02-13 | CPI | **nothing** |
| 03-06 | NFP (recorded 7:37 ET, *before* the print) | **nothing** |
| 08-07 | NFP | **nothing** — only "little pump here" |
| 06-10 | CPI | one word: "had some **data** here" |
| 03-17 | FOMC day 1 | **nothing** |
| 03-18 | **FOMC decision** | "Today's FOMC day." — the **final sentence**, after the plan |
| 03-19 | day after FOMC | **nothing** |
| 06-16 | FOMC day 1 | **nothing** |
| 06-17 | **FOMC decision** | **nothing** |
| 06-18 | post-FOMC **+ quad witching** | "Tomorrow's a bank holiday" — forward-looking only |
| 03-20 | **Quad witching** | **nothing** |
| 02-20 | Opex | **nothing** |
| 02-17 | post-Presidents Day | **nothing** |
| 05-26 | post-Memorial Day | describes the holiday session's *price action* only |

The two FOMC decision days settle it. On 03-18 the event earns one sentence, placed *after* the
entire plan, and attached to range width — *"So you can see we have potential for a wide range.
Today's FOMC day."* On 06-17 it isn't mentioned at all. Two quad-witching sessions (03-20, and
06-18 where expiration moved to Thursday because Juneteenth fell on the Friday) mention expiry zero
times between them.

**Read as:** events are already priced into the structure he reads. Overnight positioning, the
zones, the profile — those carry the information. Naming the catalyst adds nothing to a plan built
from levels. When an event does get a mention it modifies *expected range*, never the plan's shape.

This closes the largest open question in the earlier notes, and it closes it in the direction that
makes implementation **simpler**: no event-day branch is needed. A JBA-mode analysis does not need
an economic calendar.

One nuance worth keeping: **03-06 is the only video in 70 recorded before its 8:30 release**
(7:37 ET). His response to a pending catalyst was to *simplify*, not to hedge — *"going to keep it
very simple"*, *"not much more I'm looking for today"*, *"I know nothing crazy today."* Fewer
levels, one binary. That is a real behavioral adaptation, and it is the opposite of adding caveats.
`[n=1]`

---

## Method and its limits

**Source:** YouTube auto-captions via `yt-dlp`. See `pull-transcripts.py` — run it locally with
browser cookies; anonymous pulls get hard-blocked after a few dozen (HTTP 429 + bot check).

**Hard limit:** the transcript gives the *action sequence* but not the *structural roles*. He speaks
over a chart and points at it — "the 804 **up here**", "this LVN **right through here**".

| What | Recoverability from transcript alone |
| --- | --- |
| Branches and action sequence | ~90% |
| Prices spoken as numbers | ~85% — thousands digit often dropped |
| Levels named but not priced | 0% from transcript, trivial from bar data |
| **Which level plays which structural role** | **~0% from one video** |

**Tagging:** `[stated]` · `[inferred]` · `[operator]` · `[corroborated]`.

**Corroboration substantially solves the role problem at n=25.** What one video leaves implicit,
another states outright. 08-07 confirms the 08-11 geometry; 03-17 defines "auto plot" as having a
bottom; 03-06 says a reference is "essentially the JBA low." A corpus is self-correcting in a way a
single video is not — which lowers how much the frame-extraction work matters.

### The garble set (must be normalized before any counting)

| Term | Rendered as |
| --- | --- |
| G line | `G line`, `Gline`, `G-line`, `Gine`, **`Genie line`**, **`she line`** |
| LVN | `LVN`, `LBN`, `VM`, `OBN`, `OVN` |
| MGI | **`NGI`** |
| VWAP | `VWOP` |
| RTH | `TH`, `teach` |

A garbled *term* vanishes from a regex count leaving no gap behind, unlike a garbled *number*.
Worse, it invites over-reading: from "the cell VM" alone I once reconstructed "the sell LVN" and
wrote up a finding that LVNs carry an expected side. They don't — the phrase was "this LVN."

---

## The level hierarchy, as actually used (n=25)

| Reference | Mentions | Videos | Role |
| --- | ---: | :---: | --- |
| **G line** (weekly open) | 88 | 18/25 | **Primary bias gate** |
| Overnight high / low | 62 | 18/25 | Session probe levels |
| **JBA** high/low | 60 | 24/25 | The frame — targets and structure |
| Weekly pivot | 54 | 14/25 | Target, secondary gate |
| A/B extensions | 31 | 13/25 | Extension targets off the weekly pivot |
| LVN | 29 | 18/25 | Where entries live |
| Two-way trade / purgatory | 23 | 11/25 | Explicit no-directional-trade regime |
| RP (Rolling Pivot) | 14 | 10/25 | Secondary gate / change-detector |
| Auto plot | 12 | 9/25 | A **zone** with a top and bottom — see below |
| **Stop-loss** | **0** | **0/25** | Never, in any video |

The G line's dominance is now unambiguous: 88 mentions, and it appears in every video where price is
anywhere near it. Its absence in the three August videos remains explained by price sitting at the
2A weekly extension.

### Auto plot is a zone, not a level `[corroborated]`

Batch 1 left "auto plot high" undecoded. Batch 2 resolves the shape if not the construction:

- 03-17: *"slipping through the night until we find **the bottom of auto plot**"*
- 03-19: *"prominent LVN down here at **the bottom of auto plot** as well around 346 to 320"*
- 03-20: *"**B autoplot** just below us"* (bottom of autoplot)
- 03-02: *"**Autoplot low** 1B on ES and NQ did its work overnight"*
- 02-17: *"we have the **autoplot low** right here"*

It has a top and a bottom, it acts as support/resistance, and it stacks in confluence with the 1B
and with LVNs. Consistent with the operator's read that it is **the other balance-area type** — the
value-overlap construct — running alongside the JBAs. He uses both simultaneously.

### Volume profiles come in a stack of lookbacks `[stated]`

Named across the corpus: **4-hour rolling** (08-04, 02-17), **5-day rolling** (03-17, 03-20, 02-13),
**four-week rolling** (03-20), **last week's volume profile** (03-16), and the **overnight profile**
(06-18). LVNs and high-volume edges are cited from a specific one each time, and the timeframe is
part of the reference — *"the deepest LVN on the 5-day rolling"* (02-13) implies LVNs are **ranked
by depth** within a profile.

---

## Concepts new in batch 2

### 1. JBAs are dynamic — they form, expand, split and branch

The biggest gap in the batch-1 picture, which treated zones as static geometry.

- **They form:** 06-16 — *"once this JBA forms, I want to see this 7615 area bid"*. He plans against
  a zone that does not yet exist.
- **They expand, and he forecasts where:** 03-19 — *"I do expect it to expand. And in that expanding,
  I'd be looking for low portion of the JBA to be right around here, 6640 to 45."* Also 06-17
  (*"this is going to expand to 500 area"*), 06-18 (*"currently 7559, but that will expand
  potentially into the mid 60s"*), 03-06, 02-17.
- **They branch when price leaves:** 03-19 — *"we're also outside of the wide JBA. So **anytime that
  happens, we tend to branch off, create a couple**… I would expect us not to really spend a whole
  lot of time back into here, but if we do, we have to respect it."*
- **They can shift overnight:** 03-18 — *"It did shift in the night. So 6818 is the top."* The
  published doctrine says zones re-evaluate at RTH open; this says otherwise, or the definition of
  "session" is wider than RTH.
- **They overlap, or fail to:** 05-26 *"building some overlapping JBA zones"*; 06-15 *"we don't have
  any overlapping JBAs. The other one's way down there"*; 02-13 *"a nice little standalone JBA"*.

**Consequence for implementation:** a JBA export is not a static daily level set. Zone identity,
formation state and expected expansion are all part of the read, and he trades against zones that
haven't formed yet.

### 2. Setups are conditioned on where a zone was when it formed `[stated]`

06-17: *"I'd be open to a rebid scenario top of JBA's **as long as we're above the RP when that
formed**."* The validity of an entry depends on the zone's formation context, not just current
price. This is the most structurally demanding rule in the corpus.

### 3. The "yellow light" caution zone `[stated, n=1]`

03-02: *"we're currently auctioning below the 6830s. And so that's into that **caution area, that
yellow light there** between 6830 and 6771."* A named, colour-coded band on his chart distinct from
a JBA — a region where the read is degraded rather than a level to trade against. Related to
"purgatory" but he uses a separate name and it appears to be drawn, not inferred.

### 4. He deliberately simplifies, substituting references

03-06: *"putting that reference here, it's **essentially the JBA low**, but let's **keep it real
simple**. Just say previous day's low."* Where two references nearly coincide he collapses them to
the one that is easier to watch. An extraction that treats every named level as structurally
distinct will over-count.

### 5. Acceptance is never faded — stated as a rule

03-17: *"if we are holding above previous day's high, **don't want to fight that. I only want to
fight that as a reoffer if we come back inside.**"* Also 03-19 (*"It can get a little hairy
underneath previous week's low, FYI. Don't want to get too fancy trying to counter that"*), 06-17
(*"below the 80's, off we go. Or at least I won't be trying to counter it"*), 05-26 (*"would need to
have it come back into that zone before countering, otherwise get on board with it"*).

Batch 1 had this as `C`. It is now `A` — stated in four separate videos, and it is the clearest
recurring negative rule in the corpus.

### 6. Stop-run awareness `[stated, n=1]`

05-26: *"Sweep through the 30K can trigger some stops from these highs."* He models other
participants' stops as fuel — while still never stating one of his own.

### 7. Data quality is not guaranteed — his own levels can be wrong

03-19 opens: *"First things first, **I fixed the G line.** I'm not sure why my D&D chart changed the
session times, but it threw me off."* A configuration fault silently moved a Tier-1 level for at
least one prior session.

This vindicates the lookback-settings warning: historical exports will not match what was on screen
unless settings are pinned *and* known-good. It also means a corpus scored against re-exported
levels will disagree with the videos on some dates for reasons that have nothing to do with the
method.

### 8. Contract roll changes the series `[stated, n=1]`

03-16: *"this is the **M contract**"* — the March→June roll, during expiration week. Any backtest
joining these dates to continuous data needs the same roll convention he uses, or the level
arithmetic will silently drift by the roll gap.

### 9. He names MGI out loud

03-20: *"24485 half and RP right here and the Gline. **A lot of NGI right here**"* — "NGI" is the
caption's rendering of **MGI**. His own term for the stacked level set is the same one the Gekko
doctrine already uses, and here it is used exactly as a confluence-density measure.

### 10. Recurring idiom for regime uncertainty

*"Not out of the weeds"* (02-13, 03-02), *"not out of the woods"* (07-10). Marks a state where the
directional read is withheld pending a specific level being reclaimed.

---

## Carried forward from batch 1, now better supported

| Finding | Was | Now |
| --- | --- | --- |
| Never states a stop-loss | `A` (0/9) | **`A` (0/25)** — not one instance in six months |
| Two-way trade / purgatory | `A` | **`A`** — 23 mentions, 11/25 videos |
| Failure to progress is a signal | `C` (n=1) | **`B`** — 03-18: *"we've seen this a lot of times where we press down, we refresh some inventory and then we don't really take out the overnight low"* |
| Never fades acceptance | `C` | **`A`** — stated in 4 videos |
| Entries are bands | `A` | **`A`** — holds across all 25 |
| ES planned first, then NQ | `A` | **`A`** — no exceptions in 25 |
| Short-bias template | inferred | **observed** — the March block is short-biased throughout |

The short-bias gap is closed. 03-02, 03-06, 03-19, 03-20 and 02-17 all run the template downward
(*"reoffer that aggressively"*, *"lean into that for a press into the 600s"*, *"we want to begin
pressing in this direction towards previous week's low"*), and it is structurally identical to the
long case with the roles mirrored. **No separate short-side rule set is needed.**

---

## The Job Pivot deep dive — construction, from the author

Source: `reference/job-pivots-deep-dive.txt` (~29 min, externally transcribed). **Incomplete** — it
cuts off mid-sentence and the Balance Zone section, promised twice, is never reached. Everything
below concerns the *pivot*, which the JBAs are built from.

### The pivot has three components `[stated]`

1. **The pivot** — derived from the volume profile; "a certain amount of volume was needed in order
   to create that and protect that."
2. **The value zone** around it — **70% of that volume**.
3. **The targets** — "the expansion points from that value zone."

**The targets are stacked multiples of the value-zone width.** In his words: "we could start
stacking that zone, that distance… moving out in either direction… we get this compounding effect."

So `1A` is one value-zone width above the value zone, `2A` two, `1B`/`2B` the same below. This makes
the A/B ladder **computable** rather than an opaque study output — and it explains the running joke
about needing "a 12B" on an expansion day.

### Which resolves the "dynamic zone" question — the operator's reading was right

I had written the zone behaviour up as emergent (forming, expanding, branching, shifting overnight)
and given it rule status. The author describes something much more mundane:

> "The distance between the targets… vary based upon the activity. So it's consistently adapting
> based upon the actual volume traded throughout the day in and day out sessions… there's no
> arbitrary sense of where the inventory is. And so it's constantly updating."

It is **recomputation as new session volume arrives**, not zone behaviour to be modelled. The
operator's hypothesis — that separate overnight and RTH session pivots recompute, and "expansion" is
just the new pivot resolving the overlap differently — fits every observation I had collected, and
fits the prep videos' own language better: 03-06 says the JBAs will "expand a little bit here **at
the open**", which is exactly when a new RTH session pivot would enter the calculation.

It also explains something I had flagged as unexplained — that he forecasts expansion targets with
confidence ("into the mid 60s", "the 500 area"). The basis isn't intuition. It's arithmetic he can
do from the value-zone width.

**Consequence, and it is the operator's point:** for a point-in-time analysis this changes almost
nothing. You take the zones as they stand at the moment of the briefing. It matters only when
scoring a plan across an RTH boundary, where the edges a premarket plan referenced may no longer be
the edges in force.

### The weekly Job Pivot `[stated]`

Built on **the prior week's volume profile**; "indicates a controller bias for the current week."
Same components — value zone and targets — at a wider timeframe. One handling difference matters:

> "With a wider timeframe, what you get is more fluctuation around its own… On a weekly aspect, you
> have to view this as a **zone**. It's a wider zone. It's going to take some digestion around."

Intraday targets get tagged to the tick; weekly ones are areas. Any scoring should use a tolerance
band on weekly references and a tight one on session references.

### Mechanical vs emotional — the regime classifier, and a partial answer to the effort read

The clearest new framework in the deep dive, and it bears directly on what I had called the
unbridgeable gap.

- **Mechanical:** price pushes into an MGI level, the expected response occurs, it pauses.
- **Emotional:** the response does not occur — "not only does it not occur, instead of it pausing,
  it accelerates." His conclusion: "there's no point in countering this. There's another player at
  hand and we're just slapping through some levels."
- "For the most part we're going to have a lot of mechanical activity."

I had written that the traverse-vs-expansion fork was decided purely by DOM and Time & Sales tempo
and therefore unreachable from bar data. **That was too strong.** This classifier is stated in terms
of *level interaction* — does price pause at MGI or slice through it — which is substantially
measurable from 1-minute bars. The DOM read sharpens the call in real time; it is not the only input.

### Three nuances of the open `[stated]`

A decision framework the prep videos use implicitly and never spell out:

| Open location | Read |
| --- | --- |
| At top of pivot value, above pivot, not extended | Productive/bullish — but **don't buy it**; gauge the interaction first |
| Directly at the pivot | Must gauge the volume build around the pivot itself |
| Well outside range (at/beyond 1A/2A), inventory far away | Expect that inventory to be tested — but **don't fade immediately**; wait for a return inside a zone of initiation "that way I have structure to lean upon" |

**The pivot acts as a magnet** — off the open and through midday, and the same is said of other MGI
"such as 24-hour VWAP, the IB high/low, overnight high/low, previous day high/low, **the weekly
open**." When price is in the vicinity: "let's complete the auction up to that to gauge and assess
response."

### Traverse value, defined precisely `[stated]`

> "If we are to step outside of a target, we can't progress. Instead, we step back inside. We seek
> the opposite target."

Step outside value → fail to progress → return inside → that is rejection → target the traversal to
the other side. This is a single rule, and it is what my separate "failed break re-entry" and
"failure to progress" plays were both describing. They should be merged.

### Areas of initiation stop trends `[stated]`

Areas of initiation are LVNs — where price "jams out of there," leaving little volume. A directional
move ends when those are **breached back through**: "that's where something can be changing. First
we expect balance. Balance can lead to continuation." Targets themselves tend to land at high-volume
nodes built on the current session.

### Compression precedes expansion, and the only risk statement in the corpus

"If we get a lot of compression, then simply what that means is… prepare for expansion." No fixed
threshold — he defers to the ATR study and relative volume for how much expansion to expect.

Then, notably: **"If you're not comfortable with the read, reduce size or pause, allow for a move to
begin."** This is the first and only position-sizing guidance anywhere in the corpus. It does not
contradict the never-states-a-stop finding — that finding is about the prep videos, and this is
teaching material — but it does mean the *method* has risk management; the preps simply aren't where
it lives.

### Exhaustion has three named tells `[stated]`

1. **Profile:** a spike with volume build, then a traverse back across — "it moves away and
   aggressively," leaving a small build above. Expect that player back in command, targeting the
   pivot and traversing the zone.
2. **LVN return.**
3. **Leg-to-leg delta:** large one-sided delta making no progress, then a "pull stack flip" — offer
   stepping down, aggressive orders underneath the buy delta, then acceleration.

### Two corrections to the record

**MGI means "Market Generated Information."** Stated outright: *"MGI is market generating
information… The pivot is also a piece of MGI."* The repo has it as **"Macro Geography
Intelligence"** at `lib/engine/mgiPriority.ts:2`. That is a doc/comment fix outside this research
branch's scope — flagged, not applied.

**The studies are a multi-author stack, and the prep videos may not be by this speaker.** He refers
to *"Leo in the Autoplot section"* as someone else's material, and says *"I know that **Cap**
discusses this as well in **his morning preps**"* — plus "Cap has been great enough to put some of
the stats into the Discord." If the morning preps are Cap's, then the prep-video speaker is not the
Job-studies author, and attribution in these notes needs correcting. **Worth confirming with the
operator.**

He also states the whole thing is deliberately fractal: *"I view the weekly pivots, the balance
zones, autoplot and so forth as a top-down approach… as a fractal"*, and the pivots are "a smaller
fractal" of autoplot.

---

## Still open

- **How a JBA is constructed from pivot ranges** — the deep dive gives the *pivot's* construction
  (value zone = 70% of volume; targets = stacked value-zone widths) but **cuts off before the
  Balance Zone section**. How overlapping pivot ranges resolve into a JBA is still unknown. Getting
  the rest of that video is now the single highest-value item.
- ~~What determines expansion magnitude~~ **Resolved:** targets are stacked multiples of the pivot's
  value-zone width, recomputed as volume updates. The forecasts are arithmetic, not intuition.
- **The "yellow light" zone's construction** — drawn or computed, and how it differs from purgatory.
- **The effort read** — traverse vs. expansion is still never verbalized in any of the 25. It
  belongs to execution, not prep. This is now firmly a structural property of the source, not a
  sampling gap.
- **"PAC up high"** (02-13), **"previous week's fiery high"** (03-17) — unresolved garbles.
