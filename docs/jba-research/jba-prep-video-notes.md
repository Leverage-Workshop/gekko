# JBA Prep Video Notes

Working notes on OrderFlow Labs premarket prep videos — extracting the repeatable structure
behind the plans, toward a rule-based analysis process.

**Corpus: 9 videos, 2026-06-02 → 2026-08-11.** The derived process lives in a separate document — [JBA Analysis Process](./jba-analysis-process.md). These notes are the evidence log behind it.

| Date | ID | Len | Note |
| --- | --- | --- | --- |
| 06-02 | `D7sEQ7dYisk` | 2:23 | Wide balance, JBA edges named numerically |
| 06-10 | `uvanT97KEpk` | 1:35 | Shortest. **CPI day.** G line ≈ JBA low on both instruments |
| 07-07 | `X0NpbKM2KUA` | 2:28 | **ES and NQ explicitly divergent** |
| 07-10 | `XItRia6NPbQ` | 2:41 | Heavy confluence stack; "purgatory" band |
| 07-20 | `66ryWxqne8k` | 3:38 | Longest. Two-way trade doctrine, split zone |
| 07-23 | `j3B0BuFxT_E` | 1:51 | Below G line + below JBA — the short-bias case |
| 08-04 | `jvSf2rtihWY` | 2:12 | RP as change-detector; two entry bands per instrument |
| 08-07 | `TpIyLl3_aVY` | 2:02 | **Jobs-report day.** Same levels as 08-11; corroborates the 08-11 roles |
| 08-11 | `G-4-sVT_uok` | 2:05 | Original video |

---

## Method and its limits

**Source:** YouTube auto-captions via `yt-dlp` (`--write-auto-subs --sub-format json3`). Reliable;
needs retries under rate limiting. Video bytes are blocked from this environment, captions are not.

**Hard limit:** the transcript gives the *action sequence* but not the *structural roles*. He speaks
over a chart and points at it — "the 804 **up here**", "this LVN **right through here**".

| What | Recoverability from transcript alone |
| --- | --- |
| Branches and action sequence | ~90% |
| Prices spoken as numbers | ~85% — thousands digit often dropped |
| Levels named but not priced | 0% from transcript, trivial from bar data |
| **Which level plays which structural role** | **~0% from one video** |

The failure mode is silent: transcript-only extraction yields plausible, complete, **wrong**
structure. On video 08-11 I placed the entry LVN at the lower zone boundary and read the plan as
edge-to-edge. It was a *mid-zone* LVN targeting the upper boundary.

**Tagging discipline:** `[stated]` · `[inferred]` · `[operator]` · `[corroborated]` (confirmed by a
different video in the corpus).

**Important update — corroboration partly solves the role problem.** With n=9, roles that one video
leaves implicit are often stated outright in another. 08-07 says plainly: *"primary LVN right here
around the 7758 to 60 area, that's just above the JBA lows"* and *"press up across this JBA and then
balance out at the upper portion of that"* — which independently confirms the 08-11 reading that
7804 is the upper JBA boundary and the entry LVN sits inside the zone. **A corpus is self-correcting
in a way a single video is not.** That materially lowers how much the frame-extraction work matters.

---

## Reference: what a JBA is

From the study author's own definition (he wrote the Job studies and the math).

> The Job Pivot Balance Zones visually represent areas where the **session pivot ranges overlap**
> for a predetermined timeframe… 1) key structural levels which may serve as support and
> resistance; 2) expected range; 3) areas where the market may extend on a multi-day timeframe.

- Built from overlapping **session pivot ranges**, not value areas — a different construct from the
  value-overlap balance area in the Gekko doctrine. Two studies, not a drift to reconcile.
- **Re-evaluates at each RTH open**, stable intraday. No repaint; safe to backtest.
- Grouping depends on **lookback settings** — historical exports only match his screen if pinned.

| Observation at the zone edge | Expected outcome |
| --- | --- |
| Slowing tempo, pace, volume build | **Traverse** — price crosses to the other side |
| Pace, tempo, volume build stay **heavy** | **Expansion** — breakout, go with it |

---

## The level hierarchy, as actually used

Counts across all nine transcripts (regex, so approximate):

| Reference | Mentions | Videos | Role |
| --- | ---: | :---: | --- |
| **G line** = weekly open | 33 | 6/9 | **Primary bias gate** |
| Overnight high / low | 38 | 8/9 | Session probe levels — the most-traded references |
| **JBA** high/low | 22 | 8/9 | The frame — targets and structure |
| Weekly pivot | 13 | 5/9 | Target, occasionally gate |
| Continuation | 12 | 9/9 | Only word in every single video |
| Weekly pivot extensions (1A/2A/1B/2B) | 11 | 5/9 | Extension targets off the weekly pivot |
| **RP** (Rolling Pivot) | 7 | 5/9 | Secondary gate / change-detector |
| LVN | 7 | 6/9 | Where entries live — see garble note below |
| Two-way trade | 8 | 4/9 | Explicit no-trade / fade-the-edges regime |
| **Stop-loss** | **0** | **0/9** | — |

### The weekly open ("G line") is the primary bias gate — not the weekly pivot

This is the biggest revision from video 1. The recurring binary in every June–July video is
**above/below the G line**:

- 06-10 `[stated]`: *"if we get above the G line, I want to seek overnight high… If we maintain
  below the G line, then I want to get on board with that on pullbacks for continuation."*
- 07-07 `[stated]`: *"as long as we're holding the G line, I want to see us find continuation to
  that upside… If we find ourselves underneath the G line, naturally I'd expect us to gravitate
  into the direction of the weekly pivot."*
- 07-23 `[stated]`: *"Beneath the G line and underneath the JBAs. So I want to lean against this 81
  to 85 area for continuation."*

**Confluence sets priority, and he says so.** 06-10: *"you notice the G line on both is basically at
the bottom of the JBA's as well, and we're above the RP. **This is why I'm talking about this
first**."* Same in 06-02 (*"the weekly pivot, which overlaps JBA high, which is 7551"*), 07-10
(*"auto plot high, previous week's high, JBA high, everything right here"*), 07-20 (*"right at the G
line… slightly above the overnight low"*).

### RESOLVED — the G line is the **weekly open** `[operator]`

A Tier 1 MGI, same tier as the weekly pivot. My earlier guess (daily Job Pivot) was wrong.

**Confirmed independently from the corpus.** A weekly open is constant within a week and changes
between weeks. The transcripts behave exactly that way:

| Week | Videos | Instrument | G line quoted | Verdict |
| --- | --- | --- | --- | --- |
| Jul 6–10 | 07-07, 07-10 | NQ | 29,930 both | constant within week ✓ |
| Jul 20–24 | 07-20, 07-23 | ES | 7485 both | constant within week ✓ |
| Jun 8–12 | 06-10 | ES | 7368 | differs across weeks ✓ |

Two same-week pairs agree to the point; across weeks the value moves. That's weekly-open behavior
and nothing else's.

**It is already in the pipeline.** `weekly.wkOpen` ships in `chart-data/mgi_static_levels.json`, and
`lib/engine/mgiPriority.ts:158` already classifies it `{ label: 'Week Open', tier: 1 }`. The
doctrine already says so too — `glossary.md:66`: *"Weekly Open is a very strong magnet."*
**The primary bias gate of his entire method is plumbed, tiered correctly, and requires zero new
work.**

*(One near-miss to note so it doesn't get mistaken for evidence: the repo's snapshot happens to
carry `wkOpen = 29930.25`, matching the videos' 29,930 — but that snapshot is the week of Jul 27–31,
a different week. Coincidence, not corroboration. The within-week constancy above is the real test.)*

### The August disappearance is explained — and it sharpens the rule

33 mentions across June–July, **zero** in 08-04, 08-07, 08-11. Not drift, and not day-of-week
(08-04 and 08-11 are Tuesdays, same as 06-02 and 07-07 which do mention it). **Price was extended
away from the weekly open:**

- 08-04 `[stated]`: *"we're pressing the **2A on the weekly**… 2A up here 7648"*
- 08-07 `[stated]`: *"right here I want to see this bid **just below the 2A on the weekly**"*

Since the A/B targets hang off the **weekly pivot**, this is sharper than it first looked: all three
August videos are working inside the *weekly pivot* framework, not the weekly open one. 08-04 and
08-07 quote its 2× extension; 08-11 quotes the pivot itself (*"we're above the weekly pivot"*).
Price had extended roughly two multiples off the pivot — far from the week's open, which drops out
of the narrative entirely.

**Refined rule:** the bias gate is not "the weekly open" — it's **the nearest live weekly
reference**. Weekly open when price is near it; the weekly pivot and its extension targets once
price has extended past it. `[inferred, n=3]`

### Decoded: the A/B extension targets

"1A", "2A", "1B", "2B" are **targets derived from the weekly pivot** `[operator]` — `A` the positive
(upside) extensions, `B` the negative, the digit being the multiple. So `2A` = the 2× positive
extension off the weekly pivot.

*(Superseded reading: I had these as Weekly IB extensions, mapping to `Weekly IB Ext 1x–4x` in the
glossary. Wrong anchor — they hang off the pivot, not the initial balance. The glossary's IB
extensions are a separate construct.)*

- 07-07: *"continuation to that upside into direction 7658, 1A on the weekly"* — upside
- 07-20: *"B line to the 2B down here, 7439"* — downside
- 08-04: *"we're pressing the 2A on the weekly… 2A up here 7648"* and *"work our way down to the
  1B, which 7567"* — both directions in one video, unambiguous

---

## Concepts not present in video 1

### 1. Two-way trade / "purgatory" — an explicit no-directional-trade regime

When price sits between two close references, he names the band and refuses to trade through it.

- 07-10 `[stated]`: *"Building and holding above the 7591, I don't want to fight that between that
  and 7600. Kind of **purgatory** there."*
- 07-07 `[stated]`: *"between 7585 and 7562, so the G line and the top of this JBA, I could see some
  **two-way trade**."*
- 07-20 `[stated]`: *"treat this zone we came from as **two-way trade play from the edges**."*
- 08-07 `[stated]`: *"Between 51 and 58, a lot can happen there. I mean, it's a tight zone."*

The rule: **inside a narrow band between two references, trade the edges or don't trade.** This is a
genuine negative rule and video 1 gave no hint of it.

### 2. Zone width predicts escape

07-20 `[stated]`: *"that zone is pretty finite. I would expect this to escape that area from either
end and so at some point press today."* Narrow zone → expansion expected, direction unspecified.

### 3. The same level flips role on acceptance

08-04 `[stated]`, the clearest instance: *"down here at 7626… the high volume edge to the bottom of
the JBA. **Looking for bid there.** If we're building below the 7624s, then we got a lot that we can
liquidate… I would **lean against that 26 area for reoffer**."*

Same price. Held → long entry. Accepted below → short entry. This is the core mechanic and it means
a level cannot be extracted with a fixed direction attached.

### 4. Entries are always bands, never points

Every entry across nine videos is a band: "20 to 24", "68 to 72", "81 to 85", "44 to 48", "24 to
26", "58 to 60", "680 to 700", "79 to 82", "864 to 844". **Roughly 2–5 ES points, 20–30 NQ
points.** Highly extractable and completely consistent.

### 5. Cross-instrument confirmation gates counter-trend trades

- 07-23 `[stated]`: *"we would need to absolutely show a fail and exhausted look down below this G
  line, **and ES will need to be back above the 7485** for me to counter."*
- 07-20 `[stated]`: *"even if ES push up and failing a little bit at overnight high I would expect
  NQ to catch bid."*
- 08-04 `[stated]`: *"if ES pulls down a little bit further, then I'll be looking for **NQ to walk
  the dog on the RP**."*
- 07-07 `[stated]`: *"ES is doing the exact opposite of what NQ is doing right here."*

They are planned as a **pair with lead/lag**, not independently. Video 1's "very similar with NQ"
understated this badly.

### 6. The RP is the change-detector

08-04 `[stated]`: *"The moment that we begin to auction and **build below the RP, I'm going to sense
that something has changed**."* This is the closest thing in the corpus to a definition of the
"until it changes" condition video 1 left dangling.

### 7. Failure to make progress is itself a signal

07-10 `[stated]`: *"If we press down and we **cannot make any progress to the overnight low**, then
I want to get long down near that area."* Not reaching an expected level is a trigger, not a
non-event.

### 8. Acceleration vocabulary marks the expansion case

"get a little loose" (06-02, ×2), "off to the races" (07-20), "off we go" (07-10, 08-07), "B line
to" (07-20), "flush out" (08-07, ×2), "unwind", "liquidate and clean up". These consistently follow
acceptance beyond a boundary — the linguistic tell for the expansion branch.

### 9. Garbled terms undercount silently — the LVN case

07-20 @ [1:56](https://www.youtube.com/watch?v=66ryWxqne8k&t=112s), captioned as "the cell VM", is
**"this LVN"** `[operator]`: *"…continuation ultimately up into the weekly pivot. But right here at
**this LVN** that could be a pretty large hurdle to get over."*

So an LVN overhead is acting as resistance — consistent with every other LVN in the corpus, which
are plain structural references taking their direction from where price approaches them. Nothing
new about LVNs themselves.

**The extraction lesson is the finding.** Auto-captions render the term "LVN", "LBN", and "VM"
across nine videos. Corrected count: **7 mentions across 6/9 videos**, up from the 6/5 first logged.
Unlike a garbled *number* — which reads as obviously broken — a garbled *term* silently vanishes
from any regex count and leaves no gap behind. Two consequences for a corpus built from these:

1. Frequency tables need a term-normalization pass, and the garble set has to be discovered by hand
   from the first several videos.
2. **A garbled term invites over-reading.** Working from "the cell VM" alone, I read it as *"the
   sell LVN"* and wrote up a finding that LVNs carry an expected side. They don't — the phrase was
   just "this LVN". Low-confidence audio should be quoted, flagged, and left alone rather than
   reconstructed into a claim.

### 10. He runs *both* balance-area types

If "auto plot high" is the other balance area's high (see below), then his chart carries the JBA
*and* the value-overlap construct simultaneously. The two are not alternatives for him — the JBA
supplies the frame, the other type supplies additional structural highs/lows. Relevant because
Gekko currently implements only the second one. `[operator, uncertain]`

### 11. Internal structure comes from a 4-hour rolling profile

08-04 `[stated]`: *"this LVN on the **4-hour rolling**."* First time the profile source is named.

### 12. News days are not a separate regime — the corpus already contains two

Checked against the 2026 release calendars after the fact:

| Video | Event that morning | What he says about it |
| --- | --- | --- |
| **06-10** | **CPI** (May data, 8:30 ET) | *"Overnight, we just go flat. Um **had some data here**, and now we're just churning out some of yesterday's range."* |
| **08-07** | **Jobs report** (July NFP, 8:30 ET) | *"Good morning, **little pump here**."* — never names the release |

Both prep videos are recorded after the 8:30 ET print, so the reaction is already on the chart.
**Neither changes the process.** The data gets one clause describing its *price effect* — flat, or a
pump — and then the standard template runs unmodified: frame, gate, bands, plays. No volatility
caveat, no reduced size, no "wait for the dust to settle", no mention of the number itself.

Read as: a release is an input to structure, not a regime of its own. Worth testing against **FOMC**,
which is structurally different — the 2:00 pm ET decision lands *after* the prep, so that video has
to plan a session with a known event ahead of it rather than behind it. No FOMC day in the sample
yet. `[n=2]`

### 13. Plans carry across sessions

06-02: *"as I said last night the EOD recap"*; 07-20: *"talked about the morning prep with the week
prep."* There is a **weekly prep and an EOD recap** in addition to these. The morning video is one
node in a chain, which means some referents genuinely aren't in it.

---

## Watch list — resolved

| # | Question | Answer |
| --- | --- | --- |
| 1 | Is the bias gate always the weekly pivot? | **No — it's the weekly open**, with the pivot and its extension targets as fallbacks when price extends away. |
| 2 | Plays beyond the three seen? | **Yes** — two-way/purgatory, failure-to-progress, role-flip on acceptance. |
| 3 | Does he ever state a stop? | **Never. Zero across 9 videos.** The one "stop" is "not only stop there". |
| 4 | Days that don't fit? | **None so far.** 07-07 divergence, 07-23 short-bias, and two news days (06-10 CPI, 08-07 NFP) all run the standard template. FOMC/opex/holiday still untested. |
| 5 | What triggers "the zone changed"? | **Building below the RP** (08-04) — closest to explicit. |
| 6 | Is the traverse/expansion effort read verbalized? | **Not once.** Assumed throughout. Still the highest-value gap. |
| 7 | Does he reference the next JBA out loud? | Yes — 06-02 "split zone", 07-20 adjacent zones. |
| 8 | Instrument order / divergence? | **ES always first**, NQ second, always cross-referenced. Divergence called out explicitly. |

## Still open

- ~~What is the G line?~~ **Resolved: the weekly open, Tier 1.** Already in the engine.
- ~~Why does it disappear in August?~~ **Resolved: price was at the 2A weekly extension**, far from
  the weekly open. Produced the fallback-gate rule.
- **"Auto plot high"** — 07-10 @ [0:03](https://www.youtube.com/watch?v=XItRia6NPbQ&t=0s):
  *"we have auto plot high, previous week's high, JBA high, everything right here."* Probably the
  high of the **other** balance-area type — the value-overlap construct, not the JBA
  `[operator, uncertain]`. Either way it functions as an important high in a confluence stack.
- **No FOMC-day, opex, or holiday session** in the sample. (Earlier note said no news day at all —
  wrong, see below. CPI and NFP days *are* covered.)
- **The effort read** — traverse vs. expansion is never verbalized. It may simply not be in these
  videos at all, in which case it has to come from live order flow.

---

# Synthesis

The rule-based process derived from these findings now lives in its own document:

### → [JBA Analysis Process](./jba-analysis-process.md)

26 rules across six phases, plus negative rules, a phrasebook and a worked example, each tagged
`A`/`B`/`C` by how many videos support it.

**These notes remain the evidence log** — per-video findings, corrections, resolved and open
questions. The process document is the deliverable derived from them. When a new video changes a
rule, record the evidence here first, then update the process.
