# Execution Process

The rule set for **acting on** a JBA plan once the session is live. Companion to
[Execution Notes](./execution-notes.md), the evidence log behind it.

The planning document ([JBA Analysis Process](./jba-analysis-process.md)) produces a level set,
branches and a primary lean. This document produces the rest: which branch is live, when to act,
where to lean, and how much.

**Version 1 (n=9 trade replays + 2 education videos + 3 course PDFs).** Every rule below is now
grounded in observed trading, not inferred from planning material.

**Confidence:** `A` = stated in 5+ sources · `B` = 2–4 · `C` = single instance or inferred.

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

## Phase E2 — Approach

5. **Away from a level, do not watch the DOM.** Structure precedes execution; there is nothing to
   read until price arrives. `A`
6. **Switch to the DOM only on approach**, and only for the one price in question — not the whole
   ladder. `A`
7. **Proximity gate: be at the level, not near it.** Ten points away is not actionable. `B`
8. **Do not counter into a level on the way there.** Let price arrive first. `B`

## Phase E3 — The trigger

9. **Wait for your opponent to stop defending.** For a long: the offer stops refreshing, thins, and
   pulls. This is necessary but **not sufficient**. `A`
10. **Require your side to take the level.** The bid must step *above* where the offer had been
    refreshing, and hold it. That flip is the entry. `A`
11. **Never enter while the opponent is active.** `A`
12. **It must go your way immediately.** No immediate accommodation → the read was wrong. `B`
13. **A pause at a target is not an entry in the direction of the move** — it is where you gauge
    absorption, and if anything where you look for a counter-scalp. `B`
14. **A Dominator print only counts at a structural reference.** Print + structural confluence is the
    combination; the print alone is not a setup. `B`
15. **Prefer being late to being first.** *"Make sure you're not the first one to the party."* A
    missed move goes to the next zone; do not chase into the middle. `B`

## Phase E4 — Size and stop

16. **Size scales with location.** Full size is an edge-of-zone privilege. Mid-zone, outside-zone, or
    unconfirmed setups get a **starter** to be built on. Full clip observed at 7 contracts on NQ,
    with 5 a normal working size. `B`
17. **Stop is structural but capped in points.** Place it just beyond the level being leaned on — but
    if that implies more risk than the cap (~20–25 pts NQ observed), take the tighter stop or pass. `B`
18. **The entry needs something to lean on.** No exhaustion or structure behind it means no stop,
    which means no trade. `B`
19. **A stop can be a behaviour**: cut if refreshing reappears at the level you leaned on. `C`
20. **Stop-run tolerance:** run out and back in → re-entry viable. Run out and *settle* beyond → do
    not fight it. `B`

## Phase E5 — Management

21. **Once in position, stop watching the DOM.** Management is on the profile and execution chart. `A`
22. **Switch which side you watch.** Now read your opponent as the side you would need for the exit. `A`
23. **Take mandatory partials at structure** — every structural re-entry or roadblock, regardless of
    what the tape says. Leave a runner. `A`
24. **Adds go on pullbacks into a respected reference**, never on strength. `A`
25. **An add must work immediately or come off** — including when it is flat but not progressing. `B`
26. **LIFO**: the most recent add is always the first out. `B`
27. **After a burst, invert:** take the original position off and treat pullbacks as adds. `C`
28. **Track the trade thesis separately from the stop.** A position can be underwater with the thesis
    intact, and can be scratched with the thesis alive. `A`

## Phase E6 — Exit

29. **Velocity-logic / acceleration out of a zone → flatten immediately**, then verify the log is
    clear before reassessing. Do not manage through it; brackets may not survive it. `A`
30. **Exit when the leg's read is complete**, not when the chart looks finished. `B`
31. **The prior POC is a target** — take it off the table on the shift back. `B`
32. **Take something off on early weakness**: building a node then coming back through an LVN. `B`
33. **Do not hold through a scheduled data release.** `C`

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

## What this process still cannot supply

The trigger is now known, but it rests on a primitive no bar dataset contains: **is resting size at
this price replenishing after fills, or vanishing?** Everything in Phase E3 depends on it.

That makes order-book data the gating requirement for any implementation — book state over time, not
bars. The Execution Notes list the specific data and studies this implies, including a refresh/pull
detector, a session-relative aggression anomaly in the Dominator mould, a POC-shift tracker and a
profile-completion classifier.
