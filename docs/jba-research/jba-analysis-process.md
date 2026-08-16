# JBA Analysis Process

A rule-based reconstruction of the premarket planning method used in the OrderFlow Labs prep
videos, derived from 25 transcripts spanning 2026-02-13 → 2026-08-11.

**Version 2 (n=25).** Evidence, per-video findings and open questions live in the companion
[JBA Prep Video Notes](./jba-prep-video-notes.md).

**Confidence:** `A` = stated in 5+ videos · `B` = stated in 2–4 · `C` = single instance or inferred.
Rules are not equally established — treat `C` as a hypothesis to test, not a finding.

---

## Vocabulary this process assumes

| Term | What it is |
| --- | --- |
| **JBA** | Job Balance Area — zone where session pivot ranges overlap. Dynamic: forms, expands, branches, and can shift overnight |
| **G line** | The **weekly open**. Tier 1. Captions garble it; it is the primary bias gate |
| **RP** | Rolling Pivot. Secondary gate and change-detector |
| **1A / 2A / 1B / 2B** | Extension targets off the **weekly pivot** — `A` positive, `B` negative, digit = multiple |
| **LVN** | Low-volume node, cited from a named profile and ranked by depth. Where entries live. Captioned "LVN", "LBN", "VM", "OBN" |
| **Auto plot** | A second balance-area type running alongside the JBAs — has a top and a bottom, acts as S/R |
| **Profile stack** | Rolling profiles at 4-hour, 5-day and four-week lookbacks, plus last week's and the overnight profile |
| **Yellow light** | A drawn caution band where the read is degraded — distinct from purgatory |
| **Rebid / reoffer** | Pullback entry, long / short respectively |
| **Traverse** | Price crosses the zone to trade the far side |
| **Two-way trade** | Regime declaration: no directional bias, play the edges only |

---

## Phase 1 — Build the frame

No direction yet. Establish geometry first; everything downstream references it.

1. **Locate the active JBA** — top, bottom, width. `A`
2. **Locate adjacent JBAs** above and below. These become targets once a boundary goes. `B`
3. **Locate the weekly open** and its position relative to the JBA edges. `A`
4. **Locate the RP.** `B`
5. **Locate weekly references** — weekly pivot and its extension targets (1A/2A up, 1B/2B down),
   weekly VWAP. `A`
6. **Locate session references** — ONH, ONL, PDH, PDL, prior week high/low/value, prior month
   low. `A`
7. **Locate internal structure** — LVNs and high-volume edges, each from a *named* profile in the
   stack (4-hour, 5-day, four-week, last week's, overnight). Rank LVNs by depth within a
   profile. `A`
8. **Locate auto plot's top and bottom** — the second balance-area type, which stacks in confluence
    with the A/B extensions and with LVNs. `B`
9. **Mark every confluence** — two or more references within a few points. Confluence sets
   narrative priority: lead with the tightest stack. He calls a dense stack "a lot of MGI". `A`
10. **Record each zone's state, not just its edges** — forming, formed, expanding, overlapping,
   standalone, or left behind. Zones form mid-session, expand (he forecasts the new edge), branch
   into several when price exits, and can shift overnight. A zone is not static daily
   geometry. `A`
11. **Collapse near-coincident references.** Where two levels nearly overlap he names the simpler one
    and trades it — "essentially the JBA low, but let's keep it real simple, just say previous day's
    low." Treating both as distinct over-counts the structure. `B`

## Phase 2 — Set bias

12. **The primary gate is the nearest live weekly reference.** Above → long bias, below → short
   bias.
   - Use the **weekly open** when price is near it. `A`
   - When price has extended past it, fall through to the **weekly pivot and its extension
     targets**. `B`
   - **Never gate on a weekly level price has left behind.** `C`
13. **The RP confirms.** Building below it means *something has changed* — demote or invert the
    read. `B`
14. **A setup can be conditioned on the zone's formation context** — "open to a rebid at top of the
     JBA as long as we're above the RP when that formed." Validity depends on where price was when
     the zone built, not only where it is now. `C`
15. **Price inside a narrow band between two references means no directional bias.** Declare
    two-way trade and play the edges only. `A`
16. **A narrow zone implies escape** from one end during the session, direction unspecified. `C`
17. **Anticipate zone change.** Plan against a JBA that has not formed yet, forecast where a forming
     zone will expand to, and expect a zone to branch into several once price leaves it. `A`

## Phase 3 — Locate entry bands

18. **Entries are bands, not points** — roughly 2–5 ES points, 20–30 NQ points. `A`
19. **Bands form at** an LVN, a JBA edge, a high-volume edge, or a confluence of two
    references. `A`
20. **Entries sit inside the zone or at its edge; targets are the frame** — the opposite JBA
    boundary, the adjacent JBA, or a weekly target. `A`
21. **Entry is always a pullback into the band** — rebid for longs, reoffer for shorts. Never a
    breakout chase at the band itself. `A`
22. **A band carries no fixed direction.** Held → entry with bias. Accepted through → entry
    *against* the prior bias, from the same price. `B`

## Phase 4 — Select the play

Six observed plays, in rough order of frequency.

| Play | Trigger | Target | Conf |
| --- | --- | --- | :---: |
| **Rebid / reoffer to boundary** | pullback into a band that holds | opposite JBA boundary | `A` |
| **Look above/below and fail** | probe beyond ONH/ONL that fails to hold | back across the zone | `A` |
| **Expansion / acceptance** | build above/below a boundary and hold | adjacent JBA, weekly target | `A` |
| **Two-way trade from the edges** | price inside a narrow inter-reference band | the band's own edges | `A` |
| **Failed break re-entry** | exits zone, finds no activity, re-enters | far boundary | `B` |
| **Failure to progress** | cannot reach an expected level | fade back the other way | `B` |

## Phase 5 — Cross-instrument pass

23. **Plan ES first, then NQ.** `A`
24. **State the relationship explicitly** — same template, or divergent. `B`
25. **A counter-trend trade requires confirmation from the other instrument**, plus exhaustion. `B`
26. **Expect lead/lag** — NQ "walks the dog"; an ES bid gives NQ its rotation. `B`

## Phase 6 — Output shape

27. **One primary lean, stated first**, conditional branches after it. `A`
28. **Never state a stop, size, or R/R.** Invalidation is carried by the branch structure. `A`
29. **Targets are named structures** — never round numbers or measured moves. `A`
30. **Everything is conditional** — "if/then", "want to see", "I'd expect". No predictions. `A`
31. **Close with the acceleration read** where relevant: what happens if the boundary gives. `B`

---

## Negative rules — what the method never does

- **Never trades through purgatory** — the band between two close references. `A`
- **Never chases.** Every entry is a pullback into a pre-marked band. `A`
- **Never states a stop-loss.** Zero across all 25 videos and six months. `A`
- **Never assigns a level a permanent direction.** `B`
- **Never counters a one-sided move** without exhaustion *and* cross-instrument agreement. `B`
- **Never fades acceptance.** Once price is holding beyond a level, that level is only tradeable
  again if price comes *back inside* — "don't want to fight that; I only want to fight that as a
  reoffer if we come back inside." `A`

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

## Worked example — 2026-08-11 ES

How the phases resolve on a real session.

| Phase | Resolution |
| --- | --- |
| **1 — Frame** | JBA upper 7804, lower ~7720s, next JBA below. Mid-zone LVN 7779–82. PDL as session reference |
| **2 — Bias** | Inside the zone, not exited → balance regime, "treat this very mechanically until it changes" |
| **3 — Bands** | 7779–82 (mid-zone LVN) — a 3-point band, inside the zone |
| **4 — Play** | Rebid to boundary: bid the band, target the upper boundary at 7804, expect re-offer there |
| **5 — Cross** | NQ same template: rebid ~29,800 → 29,949, ONL 29,680 as the session reference |
| **6 — Output** | Primary lean stated first; PDL branch after it; expansion case last. No stop |

The secondary branch reads straight off rule 17 — PDL holds → traverse up to 7804; PDL accepted
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
