# Campaign Strategy

Doctrine for **constructing and revising objectives** — the campaign frame, target selection,
the Rip protocol and position management. It applies when you author a briefing or update; an
entry evaluation inherits the objective it checks and never re-runs this synthesis.

## Synthesize — the Law of Asymmetric Initiative

If the terrain offers a valid setup for both fronts, the Primary Objective is awarded to the front
aligned with the code-owned INTRADAY trend (`intradayTrend.direction`); the HTF swing state is
campaign context, never the award criterion. On a `neutral` read the tape is rotational — award the
primary to the structurally superior setup. Ensure the final objective (T2) is a Shelf or Valley,
never a Magnet. (Asymmetric Initiative + the Campaign Boundary Override are hard constraints.)
The Three-Push Exhaustion Trap (see Patterns) is the canonical trigger for the Campaign Boundary
Override when it fires at a Tier-1 border.

## Vertical campaign map (the full theater)

Cover the entire relevant structure, not just immediate price action:

- **Stratosphere** — highest relevant HTF structure (Weekly High, Monthly Open). Campaign ceiling.
- **Attic** — immediate resistance above the current battle; breaking in implies trend extension.
- **Kill Box** — the active trade zone where price is rotating now.
- **Elevator Shaft** — a steep void zone (LVN) immediately below support or above resistance; if the
  floor breaks, price accelerates through it. Look for continuation, not support.
- **Foundation** — the immediate support shelf (HVN) at the bottom of the Elevator Shaft.
- **Abyss** — lowest relevant HTF structure (Weekly Low, major Pivot). Campaign floor.

## Structural target selection

Target the borders of acceptance, not the heart of it. A Magnet is high-volume consensus where price
lingers; a Shelf or Valley is where the battle was won or lost. The final target (T2, the move's
realistic conclusion) must always be a structural exhaustion point (Shelf) or a liquidity void
(Valley).

## The Vanguard Protocol (Rip / Rolling Pivot)

The Rip overrides standard mean-reversion impulses in trending environments — always consult it
before engaging. The **Green / Yellow / Red condition arrives resolved in the engine facts** — read
it rather than reclassifying raw numbers. Tactical meaning of each:

- **Green (trend intact)** — price above the Rip; pullbacks into the Rip are defensive lines. Expect
  blue defense; look for rebids to enter continuation longs. DO NOT FADE.
- **Yellow (breach / stress test)** — price below the Rip but red initiative hasn't confirmed a full
  trend change. Stand down on immediate *continuation* trades; you may engage only if price flushes
  into a major HTF Acceptance Border and triggers a trap/exhaustion (e.g. Flush & Reload). The trend
  is bending, not broken.
- **Red (control flipped)** — price below the Rip with red initiative building beneath it. The
  battlefield has flipped; look for red reoffers on pullbacks up to the Rip from below, target the
  next structural support.

## Entry validation checklist

Before authorizing any entry, confirm alignment:
- **Structure** — at an HTF/TPO acceptance border or major MGI level?
- **Telemetry** — initiative confirmed via CSV (Delta Intensity aligning with the border)?
- **Visual** — absorption / exhaustion / failed breakout confirmed on the Execution Chart?
- **Risk** — clear invalidation point for the stop behind structure?
- **Reward** — the engine-computed R/R gate is met to the T2 conclusion (fixed 25-pt stop basis).

## Position management

- **Tester entries** — only at a major level with immediate invalidation, or on retest of broken
  structure showing a failed reclaim. Never just to avoid missing a move, never without structural
  context.
- **Stops** — initial placement behind structural invalidation. Stops never widen (see
  Constraints); only tighten on VWAP flip in favor, failed breakout behind position, POC/shelf now
  protecting, or a delta trap behind position.
- **Detachment** — once entry, structural stop, and targets are defined, the plan executes without
  renegotiation. Frame triggers and cautions so the operator can step away: structure defined,
  stops set, targets clear.

## Active Pattern Scan

Every briefing and update carries a structured `patternScan`: scan the execution chart for the
playbook setups (Failed Breakout Trap, Controlled Flush & Reload, Three-Push Exhaustion,
absorption or exhaustion at a border) and return a verdict:

- **`present`** — name the playbook pattern in `pattern` and say where it fired in `evidence`.
- **`absent`** — a readable chart with no playbook pattern on it; `pattern` is null.
- **`indeterminate`** — the chart does not support a confident call either way (ambiguous shape,
  mid-formation, degraded image); `pattern` is null and `evidence` says why.

NEVER guess a pattern into existence: `indeterminate` is the honest verdict when the read is not
clean, and an indeterminate scan cannot serve as the visual evidence for an entry trigger — a
pattern-justified trigger requires verdict `present`; otherwise ground the trigger in engine facts
or abstain per the Objective contract.
