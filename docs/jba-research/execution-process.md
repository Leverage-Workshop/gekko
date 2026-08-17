# Execution Process

The rule set for **acting on** a JBA plan once the session is live. Companion to
[Execution Notes](./execution-notes.md), which is the evidence log behind it.

The planning document ([JBA Analysis Process](./jba-analysis-process.md)) produces a level set,
branches, and a primary lean. This document is meant to produce the rest: which branch is live, when
to act, where to lean, and how much.

**Version 0 — scaffold. No trade-replay videos analyzed yet.**

Every rule below is carried over from the prep corpus and the Job Pivot deep dive, and is therefore
a **hypothesis about execution inferred from planning material**. None has been observed in an
actual trade. Treat the whole document as provisional until replays land.

**Confidence:** `A` = stated in 5+ sources · `B` = 2–4 · `C` = single instance or inferred. Same
scale as the planning doc, but note that a rule can be `A` in the *planning* corpus and still be
unverified as *execution* behaviour.

---

## Phase E1 — Is the plan still live?

1. **Which branch has the session taken?** The plan is a set of conditionals; the first execution
   task is resolving which one the market chose. `B`
2. **Is the zone still being respected?** The stated auction-change trigger: "as soon as we're no
   longer respecting this zone." A zone that stops holding its edges invalidates the frame the plan
   was built on — rebuild rather than adjust. `B`
3. **Mechanical or emotional?** Price pauses at MGI → the level set is tradeable as written. Price
   accelerates through MGI without responding → do not counter anything. `B`

## Phase E2 — At the level

4. **Arrival is not entry.** Wait for the response at the level: "allow the response to show." `B`
5. **Never anticipate** — "no need to bid… allow it to move, show its hand." `B`
6. **Gauge absorption at the level** before acting. `B`
7. **Control follows acceptance.** Price below a level with no build above means control is not
   above it, regardless of where price sits. `B`
8. **A pause at a target is not an entry in the direction of the move.** Mid-move pauses are for
   gauging absorption and looking for a counter-scalp, not for joining. `C`

## Phase E3 — Confirmation

9. **Require something to lean on.** An entry needs a look of exhaustion or a structural component
   behind it; without one there is no trade, because there is no stop. `B`
10. **Exhaustion has three tells** — profile shape (spike, build, traverse back), LVN return, and a
    leg-to-leg delta pull-stack flip. `B`
11. **Cross-instrument confirmation gates counters** — carried from planning; a counter-trend entry
    wants the other instrument agreeing. `B`

## Phase E4 — Size and stop

12. **Structural stop, not fixed distance.** Lean on the exhaustion or structure identified in E3.
    Zone edges are not automatically the stop. `B`
13. **Never full size in the middle of a zone.** Full size is an edge-of-zone privilege. `B`
14. **Reduce size or pause when the read is uncomfortable**, particularly in compression. `C`
15. **Resting in value with no setup is a pause**, not a small trade. `B`

## Phase E5 — Management

16. **A level gets repeated attempts** — "reoffer that zone until it stops." One failed attempt does
    not retire a level; being stopped does. `C`
17. **Targets are pause points** and therefore natural exits or partials. `B`

---

## What this document does not yet contain

The gap is the entire point of analyzing replays. Nothing above is a **trigger** — every rule is a
filter or a constraint, and filters do not tell you when to click.

Specifically missing:

- The entry trigger itself.
- Whether the mechanical/emotional call is made from price response or from order flow, and how
  early it can be made.
- Post-entry management: scaling, partials, stop movement, early exits.
- Actual stop distances relative to the structure leaned on.
- What "until it stops" means as a count of attempts.
- Behaviour when the plan is simply wrong, which the prep branches never cover.

Until replays fill those in, this document describes the *conditions under which a trade is
permitted*, not how one is taken.
