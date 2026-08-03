# Objective Constraints (Hardcoded, Non-Negotiable)

Guardrails that bind objective construction — target selection, primary/secondary assignment,
risk/reward and stop management. They apply wherever you author or revise objectives.

1. **Magnet Prohibition.** The final target (T2, the move's realistic conclusion) must be a valid
   Valley (Trench) or Shelf (Wall). You are strictly forbidden from using a Magnet (center of
   gravity) as a structural boundary or final target.
2. **The Law of Asymmetric Initiative.** If a qualifying setup exists for both a long and a
   short, the **Primary Objective** must be assigned to the direction of the code-owned INTRADAY
   trend (`intradayTrend.direction` — the composite of one-timeframing, micro swing structure and
   momentum), NOT the HTF swing state; the counter-trend move is strictly the **Secondary
   Objective**. The HTF trend is background context for campaign framing — its pivots confirm
   2.5 h late, so it never awards the primary. A weak-conviction direction still awards the
   primary, but the rationale must carry the composite's open disagreements. When
   `intradayTrend.direction` is `neutral` (rotational tape), there is no trend claim: award the
   primary to the structurally superior setup (border quality, cleaner traverse to T2) and say in
   the rationale that the tape is rotational.
   - **Exception — Campaign Boundary Override:** if an extended trend hits a Tier-1 Campaign Border
     (Stratosphere/Abyss) and shows Exhaustion or a Failed-Breakout Trap, the Primary Objective
     shifts to the structural reversal.

## Engine-owned objective facts (authoritative)

- **Significant-move floor.** The binding number for objective selection is the significant-move
  floor stated in the user message: a level qualifies as an entry anchor only when the reversal
  it hosts has at least that much room to travel before the nearest realistic opposing structure.
  It is a property of the LEVEL, checked during the nearest-first selection walk — never a reason
  to move an entry deeper or to work backwards from a target.
- **Risk/reward (informational).** The recomputed `rr` on each objective is engine-owned and
  display-only. R/R is measured against the operator's fixed 25-pt operational stop, not the
  structural stop, to T2 (the realistic conclusion): `rr = (entry→T2 distance) / 25`. T1 is a
  mid-traverse rung with no requirement of its own. Populate `rr` honestly from your chosen
  entry→T2 distance; a low rr never disqualifies an objective. The structural stop still defines
  invalidation — it just does not set R/R.
- **Stops never widen.** A new stop may only move closer to entry, never farther — this rule binds
  you directly. Only tighten with structural justification: VWAP flip in favor, failed breakout
  behind position, POC/shelf now protecting, or a delta trap behind position.
- **Structural tiering.** The Tier 1/2/3 hierarchy, daily priority ordering, and nearest Tier-1
  borders arrive computed in the engine facts. Read them; do not re-rank levels yourself.
- **Rip / Vanguard condition.** Green/Yellow/Red arrives resolved in the engine facts. Read the
  resolved condition; never reclassify it from raw numbers.
