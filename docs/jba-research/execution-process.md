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

1. **Resolve which branch the session took.** The plan is conditionals; execution starts by deciding
   which one the market chose. `B`
2. **Is the zone still respected?** A zone that stops holding its edges invalidates the frame — rebuild
   rather than adjust. `B`
3. **Is the profile done?** *"If we're building volume, she ain't done."* A distribution still
   building cannot be countered. Completion requires a **POC shift** plus either an **exhaustive
   node** or a **parabolic taper**. Two LVNs behind also signals change. `B`
4. **Mechanical or emotional?** Price pausing at MGI → the level set is tradeable as written. Price
   accelerating through MGI without responding → counter nothing. `B`

## Phase E2 — Read the POC

The main execution filter, tracked on three horizons at once: the 30-minute candle, the TPO period
(A period, B period…) and the RTH profile.

5. **POC at an extreme means crowded.** Expect a push away from it and a move toward the next logical
   location. `B`
6. **POC central means two-way trade.** No directional commitment while it sits mid-distribution. `B`
7. **The prior POC is the next logical target.** Where POC was is where it tends to go back to. `B`
8. **A POC flip is the gate, not the trigger.** Engaging before the flip is early — he names his own
   entry "preemptive" when he does it. Combine the flip with an exhaustive look before acting. `B`
9. **Hold on POC, not on price.** An open position stays on while POC remains on the favourable side
   of its period; a shift against is the cue to reduce. `C`
10. **Use volume bars, not time bars, to anticipate the shift** — time spent is volume built, and
    volume is what moves POC. `C`

## Phase E3 — Approach

11. **Away from a level, do not watch the DOM.** Structure precedes execution; there is nothing to
   read until price arrives. `A`
12. **Switch to the DOM only on approach**, and only for the one price in question — not the whole
   ladder. `A`
13. **Proximity gate: be at the level, not near it.** If closing the remaining distance would take
    another leg of its own, there is nothing to read yet — wait for arrival. `B`
14. **Do not counter into a level on the way there.** Let price arrive first. `B`

## Phase E4 — The trigger

15. **Wait for your opponent to stop defending.** For a long: the offer stops refreshing, thins, and
   pulls. This is necessary but **not sufficient**. `A`
16. **Require your side to take the level.** The bid must step *above* where the offer had been
    refreshing, and hold it. That flip is the entry. `A`
17. **Never enter while the opponent is active.** `A`
18. **It must go your way immediately.** No immediate accommodation → the read was wrong. `B`
19. **A pause at a target is not an entry in the direction of the move** — it is where you gauge
    absorption, and if anything where you look for a counter-scalp. `B`
20. **A Dominator print only counts at a structural reference.** Print + structural confluence is the
    combination; the print alone is not a setup. `B`
21. **Prefer being late to being first.** *"Make sure you're not the first one to the party."* A
    missed move goes to the next zone; do not chase into the middle. `B`

## Phase E5 — Size and stop

22. **Size scales with location.** Full size is an edge-of-zone privilege. Mid-zone, outside-zone, or
    unconfirmed setups get a **starter** to be built on. Full clip is a fixed personal maximum;
    routine working size sits meaningfully below it, and a starter is a fraction of that again. `B`
23. **Stop is structural but capped.** Place it just beyond the level being leaned on — but hold a
    fixed personal maximum risk per trade, and if the structural stop implies more than that, take
    the tighter stop or pass on the trade entirely. The cap overrides the structure. `B`
24. **The entry needs something to lean on.** No exhaustion or structure behind it means no stop,
    which means no trade. `B`
25. **A stop can be a behaviour**: cut if refreshing reappears at the level you leaned on. `C`
26. **Stop-run tolerance:** run out and back in → re-entry viable. Run out and *settle* beyond → do
    not fight it. `B`

## Phase E6 — Management

27. **Once in position, stop watching the DOM.** Management is on the profile and execution chart. `A`
28. **Switch which side you watch.** Now read your opponent as the side you would need for the exit. `A`
29. **Take mandatory partials at structure** — every structural re-entry or roadblock, regardless of
    what the tape says. Leave a runner. `A`
30. **Adds go on pullbacks into a respected reference**, never on strength. `A`
31. **An add must work immediately or come off** — including when it is flat but not progressing. `B`
32. **LIFO**: the most recent add is always the first out. `B`
33. **After a burst, invert:** take the original position off and treat pullbacks as adds. `C`
34. **Track the trade thesis separately from the stop.** A position can be underwater with the thesis
    intact, and can be scratched with the thesis alive. `A`

## Phase E7 — Exit

35. **Velocity-logic / acceleration out of a zone → flatten immediately**, then verify the log is
    clear before reassessing. Do not manage through it; brackets may not survive it. `A`
36. **Exit when the leg's read is complete**, not when the chart looks finished. `B`
37. **The prior POC is a target** — take it off the table on the shift back. `B`
38. **Take something off on early weakness**: building a node then coming back through an LVN. `B`
39. **Do not hold through a scheduled data release.** `C`

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
