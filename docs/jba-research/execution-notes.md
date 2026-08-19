# Execution Notes

Evidence log for the **execution** side of the method — how a plan gets traded once the session is
live. Companion to [Execution Process](./execution-process.md), which is the derived rule set.

Planning is *where and what if*; execution is *which, when, and how much*. The prep videos answer the
first and are deliberately silent on the second.

**Corpus: 9 trade replays (~5.4 hrs), 2 education videos, 3 course PDFs.** All in `replays/` and
`reference/`.

**Tagging:** `[stated]` · `[inferred]` · `[operator]` · `[corroborated]`.

| Date | Replay | What it shows |
| --- | --- | --- |
| 04-08 | JBA low bid for continuation | Full trade: 5 lots, stop below distribution, scale to runner |
| 04-24 | Rebid and DOM discussion | Entry after compression change; explicit stop reasoning and risk cap |
| 04-30 | Reoffer to ONL then rebid from VAL/HVE | **POC-shift framework**; 5→3→2→1 scale-out; admitted mismanagement |
| 05-04 | JBA high reoffer & ONL rebid | Sim-traded; two setups, one failed; add taken off; "strike one" |
| 05-19 | ES PW low fail, RP change of auction | Refresh/pull reading at a level, bar by bar |
| 05-28 | RP, Pivot, LVN bid/rebid | **Velocity-logic flatten rule**; LIFO on adds; failed long then re-long |
| 06-26 | Rebid scenarios and interaction | **Liquidity Zones**; starter positions; "test until it fails" |
| 06-30 | Skip-volume discussion | The **opponent framing**, fully articulated; entry trigger stated plainly |
| 07-17 | Exhaustive node at edge of range | Cleanest single-trade anatomy; profile-completion test |

Reference material: `reference/dominator-2.0.txt`, `reference/dom.txt`, `reference/time-and-sales.txt`
(course PDFs), plus `dominator-2-0-deep-dive.txt` and `ofl-101-time-and-sales.txt` transcripts.

---

## The headline: there IS a trigger, and it is a two-part sequence

The earlier scaffold said every rule was a filter and nothing was a trigger. The replays close that.
The trigger is consistently the same two-part event at a pre-marked level:

1. **The opponent stops defending** — the offer (for a long) stops refreshing, thins, pulls, "shies
   away", goes "allergic" to the zone. On his pull-stack display this shows as the numbers turning
   colour. `[stated, 8/9 replays]`
2. **Your side then takes the level** — the bid steps *above* the price where the offer had been
   refreshing, and holds it.

06-30 states it directly: the bid must step above where the offer shied away and pulled back in;
that flip is what triggers an entry. 07-17 shows the same sequence at one price: offer off the 87s,
stacking appears on the bid at 84, "strength from the bid side and weakness from the offer."

**Step 1 alone is not enough.** In 06-30 the offer went light but the bid never took the level, and
the position came off for a scratch. Absence of the opponent is necessary, not sufficient.

**Corollary — never enter while the opponent is active.** *"I definitely don't want to be entering
when my opponent is active."* (05-04) The pause at a target mid-move is for gauging absorption, not
for joining the move.

---

## The opponent framing

The single most repeated idea in the corpus, and the organising principle for execution.

> If you're long, your opponent is the bid — so read the tape as though you were looking for a short.
> (06-30, paraphrased)

You watch the side that would have to fail for you to be wrong. Long → watch the offer to enter,
then watch the bid to manage. It reappears as "watch your offer" dozens of times, and he defines it
explicitly in 06-26: orders stepping in, maintaining dominance, and an inability to get back above
the levels where they had been refreshing. `[stated, A]`

---

## The DOM attention protocol

A concrete, repeated workflow that resolves how the DOM actually gets used. `[stated, A]`

1. **Away from a level: don't look at the DOM.** *"Structure precedes execution."* (04-08, and the
   phrase recurs in the Dominator deep dive.) He speeds replays up 2–10× through these stretches
   precisely because there is nothing to watch.
2. **Approaching a level: switch to the DOM.** 04-24 — eyes on the execution chart until price nears
   the 5-minute mid, then flip to the DOM.
3. **Proximity gate:** he will not act from 10 points away. He wants to be *at* the level or on top
   of it before engaging. `[stated, 04-24]`
4. **Watch one price, not the ladder.** 07-17: no concern with the DOM except the 87s.
5. **Once in position, stop watching the DOM.** *"Your execution sequence from a DOM stance is said
   and done."* (04-08) Management moves to the profile and the execution chart.

This is the answer to the question the planning research could not settle: the effort read is not a
continuous input. It is consulted in a narrow window around a pre-marked level, and abandoned
afterwards.

---

## Stops

**Structural, and sized in points.** `[stated]`

- 04-08: stop below the distribution; ~20 points on NQ, explicitly *"adjusting for volatility"*.
- 04-24: stop below the recent swing low. He rejected the more logical structural level because it
  implied ~25 points of risk — **an explicit risk cap overriding structure.**
- 05-04: with the JBA high at 72¾, *"there should be no risk above the 73s"* — the stop sits just
  beyond the level being leaned on, and the next structure up (the G line) is named as the
  alternative he does not want to hold through.
- 04-30: a fixed stop price named and held while the thesis stayed intact.

**The stop can be a behaviour, not only a price.** 07-17: don't cut the trade unless refreshing
reappears at the 87s or in the low 80s. `[stated, n=1]`

**Stop-run tolerance is conditional.** 05-04: run out of the level and back in → re-entry is viable.
Run out and *settle* beyond it → don't fight it. `[stated]`

---

## Size and scaling

Concrete numbers, stated on camera. `[stated]`

- **Full clip is 7 contracts** (NQ). 04-08 he put on 5 — deliberately under full size.
- **04-08:** 5 on → 4 off in pieces → 1 runner.
- **04-30:** 5 on → 3 off at the first target → then more → 1 runner into the final target.
- **Starter positions:** 06-26 — a full position at the first sign is refused; a starter is fine, to
  be built on. 07-17 — outside a zone, *"naturally it's going to be smaller size."*
- **Size scales with location quality**, not conviction alone: full size is an edge-of-zone
  privilege; mid-zone and outside-zone setups get starters.

**Mandatory partials at structure.** 07-17: on re-entering the zone he takes something off *"every
single time"*, regardless of what the DOM says. 06-30: consider taking something off at each
roadblock. The runner is what carries to the far target.

---

## Adds

The most consistent sub-rule set in the corpus, and stricter than anything in the planning material.

- **Adds go on pullbacks into a respected reference**, not on strength. `[stated, A]`
- **An add must work immediately or it comes off.** 05-04: *"I want it to work immediately or I want
  it off."* 05-28: an add that is not going inverse but is *not making progress* still comes off.
- **LIFO** — last in, first out. The most recent add is always the first exit. `[stated, ×2]`
- **After a burst, invert the roles:** take the original position off and treat pullbacks as adds
  (05-28).

He twice calls his own add management a **mismanagement** on review — once where taking the add off
cost him a trade that would have worked. A member pushes back that the in-the-moment decision was
correct; he concedes the distinction between process and outcome. Worth preserving: **the rule is
"add must perform now", and he applies it even when it costs him.**

---

## Exits, and the flatten rule

**Velocity-logic / acceleration → flatten immediately.** `[stated, A]` The clearest hard rule in the
whole corpus. When price accelerates out of a zone and skips volume, he flattens on the spot rather
than managing — *"the job is done"* (05-04), *"hit the flatten button"* then verify the log is clear
before reassessing (05-28).

Two mechanical reasons given: a velocity-logic event **removes working brackets**, and a cash account
is unprotected through it where a prop account is not.

Other exit conditions:
- **The leg's read is complete.** 04-08: once price reached the RP, that leg's read was off.
- **POC returns to where it started** — 07-17 names the prior POC as the ultimate target and says to
  take it off the table on the shift.
- **Don't hold through data.** 06-30, stated plainly.
- **Early weakness = take something off:** building a node and then coming back through an LVN.

---

## Trade thesis vs. stop — they are separate

Used constantly and kept distinct. The stop is where risk comes off; the **thesis** is a structural
condition that can be alive or dead independently. 05-28 repeats *"trade thesis is not off"* while
underwater, and separately identifies where it *is* off. 04-24: a new low under the recent low would
make the thesis off and flip the target to the IB low. `[stated, A]`

---

## The POC-shift framework

The main execution filter the planning research never saw. `[stated, 04-30 primary; 07-17 corroborates]`

- POC is tracked on the 30-minute candle, on the TPO period (A period, B period), and on the RTH
  profile.
- **POC at an extreme** = crowded → expect a push away and a shift to the next logical location.
  **POC central** = two-way trade.
- *"Logical next place to put POC is where it was."* — the prior POC is a target.
- POC position is used as a **hold filter** on an open position (04-30: POC on high on B period, keep
  the runner).
- A **POC flip** is what opens the gate: 07-17 — the flip plus an exhaustive look is the engage
  condition; 04-30 — he entered before the flip and calls that preemptive.

**Profile-completion test.** *"If we're building volume, she ain't done."* (07-17) A distribution
still building is not counterable. Completion needs a POC shift plus either an exhaustive node or a
parabolic taper. Two LVNs behind = something has changed.

---

## Which level matters

Asked directly in 05-28 with several candidates stacked: **the one that responds.** 06-30 gives the
same answer for rotations — the right one is the one that finds continuation. Confluence raises
attention; it does not rank levels in advance. `[stated, ×2]`

Related, 06-26: **there is no fixed number of tests before a level fails.** It fails when the
resting activity removes itself from the book — *"until it fails."*

---

## Tools named in execution that planning never mentioned

| Tool | What it does | Source |
| --- | --- | --- |
| **Dominator / Dominator 2.0** | Arrows marking anomalous buy/sell aggression, session-aware — current activity judged against the *same period* on prior days rather than a 24h roll | PDF + deep dive |
| **Pull stack** | DOM-derived display of pulling/stacking; colour encodes it — blue = pulled, white/red = weakness on that side. Set to **4-tick compression to match the DOM** | 05-04, 07-17 |
| **Tape reader** | Aggregated aggression gauge; "dwindling" / "tapering" reads as effort dying | most replays |
| **Delta map** | Leg-to-leg delta with an "exhausted bubble" signature | 06-26 |
| **Liquidity Zone (LZ)** | Marks absorption with a transacted lot count (e.g. 578) | 06-26 |
| **Pinch / inverse pinch** | Dot markers; appear near exhaustion | 04-30, 07-17 |
| **V range** | The Implied Vol Range study already in the Gekko engine | 06-26 |

**Dominator 2.0, precisely** (PDF + deep dive): it flags disproportionate buy- or sell-side strength
by pace, size and intensity, but calibrated **against the same session window on prior days** —
because morning, midday and end-of-day have different normal distributions. Session start is set to
the RTH open specifically to exclude the ~1 hour of data-release activity before it. It requires ~20%
of the zone's volume to complete before printing, and **un-prints if the anomaly stops being met**.
Recommended settings pair a volume threshold with a lookback window (e.g. 6250 volume / 2-hour;
7500 / 30-min). Larger volume settings → fewer prints, longer excursion; shorter windows → more
prints, less extension.

Its stated purpose is exactly the gap the planning process left open: *dominator print + structural
confluence = risk managed.* It is an **initiation detector meant to be used only at a structural
reference.**

---

## Reads that invert by location

A recurring theme worth isolating, because a naive implementation would get it backwards.

- **Buy delta at a low** = aggressive buyers crossing the spread → supportive. **The same signature
  at a high** = stacking with nobody lifting → absorption, and a liquidation risk. (04-08)
- **Negative delta with price rising** = passive bids being sold into and holding → absorption, and
  bad for the sellers. He teaches this at length in 04-24.
- **Within a distribution:** the ideal short is the upper high-volume edge; the ideal long is the
  lower. Mid-distribution is two-way trade.

---

## Corrections to the pre-replay hypotheses

| Earlier claim | Status |
| --- | --- |
| "No trigger exists in the material" | **Wrong.** The offer-leaves-then-bid-takes-it flip is the trigger, stated repeatedly. |
| "The effort read needs continuous order flow" | **Wrong.** It is consulted only in a narrow window at a level, then dropped. |
| "Stops are structural, not fixed-distance" | **Partly wrong.** Structural *and* capped in points — he rejected a structural stop for being ~25 pts. |
| "Never full size mid-zone" | **Confirmed and sharpened** — starters outside/mid zone, full size at edges. |
| "Reoffer until it stops" | **Confirmed** — and "stops" means being stopped out, not one failed attempt. |
| "Targets are pause points" | **Confirmed**, plus mandatory partials at structural re-entry. |

---

## New data and studies this would need

Per the operator's instruction to assume new data collection and new studies as necessary.

**Data not currently in the bundle:**
1. **Full-depth DOM snapshots** — the entry trigger is a change in resting liquidity at one price.
   Requires book state over time (MBP-10 at minimum, MBO ideally), not bars.
2. **Trade prints with aggressor side** — for tape-reader analogues and sweep detection.
3. **Per-session volume distributions by clock window** — Dominator 2.0's whole premise. Needs
   history bucketed by *time-of-session*, not rolling 24h.

**Studies that would have to be built:**
- **Refresh/pull detector** at a given price: is resting size replenishing after fills, or vanishing?
  This is the single highest-value primitive — the trigger depends on it.
- **Session-relative aggression anomaly** (a Dominator analogue), calibrated per session window.
- **POC-shift tracker** across the 30-min candle, TPO period and RTH profile, emitting shift events.
- **Profile-completion classifier** — building vs. done, exhaustive node, parabolic taper.
- **Liquidity-zone detector** with absolute lot counts *and* a regime-relative normalisation, since
  06-26 makes the point that a raw count is meaningless without the current environment as a baseline.

He endorses this kind of work directly in 06-26 when asked which liquidity zone is most prominent:
the answer requires back-end study across continuous contracts with volume-based rollover.

---

## Still open

- **"POSA"** (06-26) — named as a way to build into a position; unresolved garble.
- **"Primary OVN"/"OBV"** — appears alongside LVN and may be a distinct object or a caption garble.
- **Default risk** — referenced as a fixed personal quantity ("your default risk") but never numbered
  beyond the ~20-25 pt NQ observations.
- **Bracket practice** — he manually places protection after a partial in 05-04 but does not run
  brackets on ES in sim; unclear what the live default is.
- **Daily loss limit** — "DLL" mentioned once in passing (04-08), never explained.
