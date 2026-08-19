# Execution Process

The rule set for **acting on** a JBA plan once the session is live. Companion to
[Execution Notes](./execution-notes.md), the evidence log behind it.

The planning document ([JBA Analysis Process](./jba-analysis-process.md)) produces a level set,
branches and a primary lean. This document produces the rest: which branch is live, when to act,
where to lean, and how much.

**Version 1.1 (n=9 trade replays + 2 education videos + 3 course PDFs).** Every rule below is now
grounded in observed trading, not inferred from planning material.

**Confidence:** `A` = stated in 5+ sources · `B` = 2–4 · `C` = single instance or inferred.

**Scope: one instrument, no absolute magnitudes.** The replays are traded on ES and NQ and quote
concrete point counts and contract sizes. Those are calibration, not rules — they belong to an
instrument, an account and a volatility regime, and none of them transfers. This document states
every quantity **relative** to the instrument's own structure or to your own fixed maximum. The
observed numbers are preserved in the companion notes.

**Source column.** Every rule links to the passage(s) it was drawn from, deep-linked to a few
seconds before the moment. Links land *slightly early* by design — the match is on a short window of
caption lines, so expect up to ~15s of lead-in on a replay and up to ~1 min on the deep dives, where
the transcript blocks are longer. Two sources are shown where a rule has them; the notes carry the
rest. A dash means the rule rests on an **absence** rather than a statement.

---

## Vocabulary this process assumes

| Term | What it is |
| --- | --- |
| **Your opponent** | The side that must fail for you to be right. Long → the offer on entry, the bid on management |
| **Refreshing** | Resting size replenishing after fills at a price — the opponent still defending |
| **Pulling / shying away / allergic** | Resting size vanishing without being filled — the opponent leaving |
| **Pull stack** | DOM-derived pulling/stacking display; colour-coded, set to 4-tick compression to match the DOM |
| **Dominator 2.0** | Session-aware aggression-anomaly detector; prints only at ~20% zone-volume completion and un-prints if the anomaly lapses |
| **Liquidity Zone (LZ)** | Absorption marker carrying a transacted lot count |
| **Velocity-logic event** | Acceleration out of a zone that skips volume; working brackets can be removed |
| **Trade thesis** | The structural condition the trade rests on — tracked separately from the stop |
| **POC shift** | The volume point of control moving within a period — tracked on the 30-min candle, the TPO period and the RTH profile |

---

## Phase E1 — Is the plan live?

| # | Rule | Conf | Source |
| ---: | --- | :---: | --- |
| 1 | **Resolve which branch the session took.** The plan is conditionals; execution starts by deciding which one the market chose. | `B` | [04-24 @6:44](https://youtu.be/JMWo4IpN8yA?t=401) · [04-24 @18:10](https://youtu.be/JMWo4IpN8yA?t=1087) |
| 2 | **Is the zone still respected?** A zone that stops holding its edges invalidates the frame — rebuild rather than adjust. | `B` | [Job Pivots DD @36:33](https://youtu.be/CoKoCpLYnC8?t=2190) |
| 3 | **Is the profile done?** *"If we're building volume, she ain't done."* A distribution still building cannot be countered. Completion requires a **POC shift** plus either an **exhaustive node** or a **parabolic taper**. Two LVNs behind also signals change. | `B` | [07-17 @26:14](https://youtu.be/glG8-dCLba0?t=1571) · [07-17 @4:22](https://youtu.be/glG8-dCLba0?t=259) |
| 4 | **Mechanical or emotional?** Price pausing at MGI → the level set is tradeable as written. Price accelerating through MGI without responding → counter nothing. | `B` | [Job Pivots DD @8:28](https://youtu.be/CoKoCpLYnC8?t=505) · [Job Pivots DD @13:47](https://youtu.be/CoKoCpLYnC8?t=824) |


## Phase E2 — Read the POC

The main execution filter, tracked on three horizons at once: the 30-minute candle, the TPO period
(A period, B period…) and the RTH profile.

| # | Rule | Conf | Source |
| ---: | --- | :---: | --- |
| 5 | **POC at an extreme means crowded.** Expect a push away from it and a move toward the next logical location. | `B` | [04-30 @0:22](https://youtu.be/5124WmFuurg?t=19) · [04-30 @0:25](https://youtu.be/5124WmFuurg?t=22) |
| 6 | **POC central means two-way trade.** No directional commitment while it sits mid-distribution. | `B` | [04-30 @20:20](https://youtu.be/5124WmFuurg?t=1217) · [04-30 @20:25](https://youtu.be/5124WmFuurg?t=1222) |
| 7 | **The prior POC is the next logical target.** Where POC was is where it tends to go back to. | `B` | [04-30 @4:07](https://youtu.be/5124WmFuurg?t=244) |
| 8 | **A POC flip is the gate, not the trigger.** Engaging before the flip is early — he names his own entry "preemptive" when he does it. Combine the flip with an exhaustive look before acting. | `B` | [04-30 @4:39](https://youtu.be/5124WmFuurg?t=276) · [04-30 @4:44](https://youtu.be/5124WmFuurg?t=281) |
| 9 | **Hold on POC, not on price.** An open position stays on while POC remains on the favourable side of its period; a shift against is the cue to reduce. | `C` | [04-30 @16:38](https://youtu.be/5124WmFuurg?t=995) · [04-30 @12:33](https://youtu.be/5124WmFuurg?t=750) |
| 10 | **Use volume bars, not time bars, to anticipate the shift** — time spent is volume built, and volume is what moves POC. | `C` | [04-30 @14:53](https://youtu.be/5124WmFuurg?t=890) |


## Phase E3 — Approach

| # | Rule | Conf | Source |
| ---: | --- | :---: | --- |
| 11 | **Away from a level, do not watch the DOM.** Structure precedes execution; there is nothing to read until price arrives. | `A` | [04-08 @5:36](https://youtu.be/u-S6Rvj7hIY?t=333) · [06-30 @9:46](https://youtu.be/FrSP2kDoJvs?t=583) |
| 12 | **Switch to the DOM only on approach**, and only for the one price in question — not the whole ladder. | `A` | [04-24 @3:41](https://youtu.be/JMWo4IpN8yA?t=218) |
| 13 | **Proximity gate: be at the level, not near it.** If closing the remaining distance would take another leg of its own, there is nothing to read yet — wait for arrival. | `B` | [04-24 @4:10](https://youtu.be/JMWo4IpN8yA?t=247) · [04-24 @4:17](https://youtu.be/JMWo4IpN8yA?t=254) |
| 14 | **Do not counter into a level on the way there.** Let price arrive first. | `B` | [04-08 @4:59](https://youtu.be/u-S6Rvj7hIY?t=296) |


## Phase E4 — The trigger

| # | Rule | Conf | Source |
| ---: | --- | :---: | --- |
| 15 | **Wait for your opponent to stop defending.** For a long: the offer stops refreshing, thins, and pulls. This is necessary but **not sufficient**. | `A` | [04-30 @10:12](https://youtu.be/5124WmFuurg?t=609) · [06-30 @22:50](https://youtu.be/FrSP2kDoJvs?t=1367) |
| 16 | **Require your side to take the level.** The bid must step *above* where the offer had been refreshing, and hold it. That flip is the entry. | `A` | [06-30 @14:04](https://youtu.be/FrSP2kDoJvs?t=841) · [04-30 @25:21](https://youtu.be/5124WmFuurg?t=1518) |
| 17 | **Never enter while the opponent is active.** | `A` | [05-04 @40:09](https://youtu.be/9iNMcMoI9nk?t=2406) |
| 18 | **It must go your way immediately.** No immediate accommodation → the read was wrong. | `B` | [05-04 @15:16](https://youtu.be/9iNMcMoI9nk?t=913) · [06-30 @13:57](https://youtu.be/FrSP2kDoJvs?t=834) |
| 19 | **A pause at a target is not an entry in the direction of the move** — it is where you gauge absorption, and if anything where you look for a counter-scalp. | `B` | [Job Pivots DD @7:38](https://youtu.be/CoKoCpLYnC8?t=455) |
| 20 | **A Dominator print only counts at a structural reference.** Print + structural confluence is the combination; the print alone is not a setup. | `B` | [Dominator DD @14:54](https://youtu.be/87iRywxnwj4?t=891) |
| 21 | **Prefer being late to being first.** *"Make sure you're not the first one to the party."* A missed move goes to the next zone; do not chase into the middle. | `B` | [05-28 @11:05](https://youtu.be/bFU1dXf5uw8?t=662) |


## Phase E5 — Size and stop

| # | Rule | Conf | Source |
| ---: | --- | :---: | --- |
| 22 | **Size scales with location.** Full size is an edge-of-zone privilege. Mid-zone, outside-zone, or unconfirmed setups get a **starter** to be built on. Full clip is a fixed personal maximum; routine working size sits meaningfully below it, and a starter is a fraction of that again. | `B` | [04-08 @21:24](https://youtu.be/u-S6Rvj7hIY?t=1281) · [06-26 @22:59](https://youtu.be/l4xvVNTE_H8?t=1376) |
| 23 | **Stop is structural but capped.** Place it just beyond the level being leaned on — but hold a fixed personal maximum risk per trade, and if the structural stop implies more than that, take the tighter stop or pass on the trade entirely. The cap overrides the structure. | `B` | [04-24 @16:53](https://youtu.be/JMWo4IpN8yA?t=1010) |
| 24 | **The entry needs something to lean on.** No exhaustion or structure behind it means no stop, which means no trade. | `B` | [Job Pivots DD @34:40](https://youtu.be/CoKoCpLYnC8?t=2077) |
| 25 | **A stop can be a behaviour**: cut if refreshing reappears at the level you leaned on. | `C` | [07-17 @13:52](https://youtu.be/glG8-dCLba0?t=829) |
| 26 | **Stop-run tolerance:** run out and back in → re-entry viable. Run out and *settle* beyond → do not fight it. | `B` | [05-04 @9:30](https://youtu.be/9iNMcMoI9nk?t=567) · [05-04 @9:36](https://youtu.be/9iNMcMoI9nk?t=573) |


## Phase E6 — Management

| # | Rule | Conf | Source |
| ---: | --- | :---: | --- |
| 27 | **Once in position, stop watching the DOM.** Management is on the profile and execution chart. | `A` | [04-08 @11:23](https://youtu.be/u-S6Rvj7hIY?t=680) · [04-08 @11:48](https://youtu.be/u-S6Rvj7hIY?t=705) |
| 28 | **Switch which side you watch.** Now read your opponent as the side you would need for the exit. | `A` | [06-30 @29:53](https://youtu.be/FrSP2kDoJvs?t=1790) · [05-04 @25:56](https://youtu.be/9iNMcMoI9nk?t=1553) |
| 29 | **Take mandatory partials at structure** — every structural re-entry or roadblock, regardless of what the tape says. Leave a runner. | `A` | [07-17 @18:37](https://youtu.be/glG8-dCLba0?t=1114) · [07-17 @18:24](https://youtu.be/glG8-dCLba0?t=1101) |
| 30 | **Adds go on pullbacks into a respected reference**, never on strength. | `A` | [05-28 @13:26](https://youtu.be/bFU1dXf5uw8?t=803) |
| 31 | **An add must work immediately or come off** — including when it is flat but not progressing. | `B` | [05-04 @15:16](https://youtu.be/9iNMcMoI9nk?t=913) |
| 32 | **LIFO**: the most recent add is always the first out. | `B` | [06-26 @44:02](https://youtu.be/l4xvVNTE_H8?t=2639) · [05-04 @15:34](https://youtu.be/9iNMcMoI9nk?t=931) |
| 33 | **After a burst, invert:** take the original position off and treat pullbacks as adds. | `C` | [05-28 @23:56](https://youtu.be/bFU1dXf5uw8?t=1433) · [05-28 @23:59](https://youtu.be/bFU1dXf5uw8?t=1436) |
| 34 | **Track the trade thesis separately from the stop.** A position can be underwater with the thesis intact, and can be scratched with the thesis alive. | `A` | [05-28 @9:57](https://youtu.be/bFU1dXf5uw8?t=594) · [07-17 @14:49](https://youtu.be/glG8-dCLba0?t=886) |


## Phase E7 — Exit

| # | Rule | Conf | Source |
| ---: | --- | :---: | --- |
| 35 | **Velocity-logic / acceleration out of a zone → flatten immediately**, then verify the log is clear before reassessing. Do not manage through it; brackets may not survive it. | `A` | [05-28 @17:22](https://youtu.be/bFU1dXf5uw8?t=1039) · [05-28 @24:44](https://youtu.be/bFU1dXf5uw8?t=1481) |
| 36 | **Exit when the leg's read is complete**, not when the chart looks finished. | `B` | [04-08 @19:56](https://youtu.be/u-S6Rvj7hIY?t=1193) · [04-08 @19:58](https://youtu.be/u-S6Rvj7hIY?t=1195) |
| 37 | **The prior POC is a target** — take it off the table on the shift back. | `B` | [07-17 @22:22](https://youtu.be/glG8-dCLba0?t=1339) · [07-17 @22:19](https://youtu.be/glG8-dCLba0?t=1336) |
| 38 | **Take something off on early weakness**: building a node then coming back through an LVN. | `B` | [06-30 @29:22](https://youtu.be/FrSP2kDoJvs?t=1759) |
| 39 | **Do not hold through a scheduled data release.** | `C` | [06-30 @4:52](https://youtu.be/FrSP2kDoJvs?t=289) |


---

## Negative rules

- **Never trade breakouts** — specifically, never the move that *creates* the exhaustive node. `A`
- **Never counter a distribution that is still building.** Wait for the POC/value shift. `B`
- **Never fade acceptance**; a level is tradeable again only from back inside. `A`
- **Never chase.** Every entry is a pullback into a pre-marked band. `A`
- **Never carry full size through the middle of a zone.** `A`
- **Never enter against an active opponent.** `A`
- **Never anticipate** — let it move and show its hand. `B`

---

## Which level matters

Asked directly with several stacked candidates: **the one that responds.** For rotations: the one
that finds continuation. Confluence raises attention; it does not rank levels in advance. `B`

And there is **no fixed number of tests before a level fails** — it fails when the resting activity
removes itself from the book. `C`

---

## Reads that invert by location

Implementing these naively will get them backwards.

| Signature | At a low | At a high |
| --- | --- | --- |
| Heavy buy delta | Aggressive buyers crossing the spread — supportive | Stacking with nobody lifting — absorption, liquidation risk |
| Negative delta with price rising | Passive bids absorbing market sells — bad for sellers | — |
| Position in distribution | Ideal long at the lower high-volume edge | Ideal short at the upper edge; middle is two-way trade |

---

## Data, studies and exports this process needs

**Level 2 is available in Sierra Chart, which removes the one blocker.** Earlier drafts of this
document said the trigger rested on a primitive no dataset contained. That is no longer true — market
depth is exactly the primitive, and it is in hand. What follows is what the 39 rules require.

Export filenames follow the existing bundle convention: files in the Sierra export folder, watched by
`scripts/uploader.ts`, mapped to an ingest field in `lib/uploader/bundle.ts`.

### The critical primitive

**Rule 15 and 16 — the entry trigger — reduce to one question at one price: is resting size
replenishing after fills, or vanishing?**

Everything else in Phase E4 is downstream of that. It cannot be computed from bars at any resolution,
because a bar cannot distinguish a level that absorbed 500 lots and reloaded from one that absorbed
500 lots and emptied. It requires **book state over time**:

| Field | Why |
| --- | --- |
| Resting size per price level, sampled or event-driven | The raw quantity being tracked |
| Additions and cancellations, separately | "Pulling" is cancellation; "refreshing" is replenishment after a fill. Netting them destroys the distinction |
| Fills at that price with aggressor side | Distinguishes absorbed-and-reloaded from simply-not-hit |
| Timestamps at the resolution the book actually changes | Refresh/pull is a sub-second behaviour |

Sierra records market depth when depth recording is enabled. **Confirm the depth history retained is
deep enough and long enough** before building on it — the studies below need history, not just live
state.

### Studies to build

| Study | Feeds | What it must emit |
| --- | --- | --- |
| **Refresh/pull detector** | rules 15, 16, 25 | Per price level: a refreshing/pulling/neutral classification and a confidence. The highest-value single artefact — it *is* the trigger |
| **Opponent-side state** | rules 15–17, 28 | Same detector, but reported for the side that matters given position and direction. Long → offer before entry, bid after |
| **POC tracker** | Phase E2 (rules 5–10) | POC per period on three horizons — 30-min candle, TPO period, RTH profile — as a time series, with shift events. Position within the distribution (extreme vs central), not just the price |
| **Profile-completion classifier** | rule 3 | Building vs done; exhaustive node; parabolic taper; "two LVNs behind". This is the counter-trade gate |
| **Velocity / volume-skip detector** | rule 35 | Acceleration that transacts through prices thinly or not at all. Drives an immediate flatten, so it needs to be fast and it needs to be right |
| **Session-relative aggression anomaly** | rule 20 | A Dominator analogue if the study's own output cannot be exported: pace, size and intensity judged against **the same clock window on prior days**, not a 24-hour roll |
| **Liquidity-zone detector** | context | Absorption with a transacted lot count, **normalised to the current regime** — a raw count is meaningless without a baseline, which he says outright |

### Exports needed

| Export | Notes |
| --- | --- |
| **Dominator 2.0 prints** | The study is already owned. Export arrow prints with timestamp, side, price, and which setting produced them — he runs several settings simultaneously and colour-codes by setting |
| **Pull stack state** | If the existing study can export rather than only render. Its 4-tick compression is set to match the DOM; that setting has to travel with the data |
| **POC series** per period and horizon | See tracker above |
| **Depth history** | Whatever Sierra's recorded depth format is, at a retention long enough to build and validate the detector |
| **Volume-based bars** | Rule 10 — volume bars anticipate the POC shift better than time bars. The execution export is already volume-based; confirm the bar size matches what the rules assume |

### Configuration, not data

These are personal settings the process refers to but cannot derive:

- **Full clip** — the personal maximum position size.
- **Working size and starter size** as fractions of it.
- **Maximum risk per trade** — the cap that overrides structural stop placement (rule 23).
- **Daily loss limit** — referenced once in the corpus, never quantified.

### One thing the planning process does not need but this one does

**A scheduled-release calendar**, for rule 39 alone (do not hold through a data release). The
planning research established that the method is event-agnostic and needs no calendar; execution has
exactly one rule that wants one. Worth noting so the two requirement sets are not merged carelessly.

### Sequencing

The detector is the whole project. Build it first, validate it against the replays — every one of
them narrates the book at a named price, in order, with the outcome visible — and only then wire the
rest. The replays are effectively a labelled test set for this exact primitive, which is unusual and
worth exploiting.
