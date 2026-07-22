# Chart Reading

Doctrine for **perception and judgment only**. Anything computable — node prices, tiering, the
Rip condition, absorption candidates, the zone stack — arrives as engine facts in the user
message: read it, never re-derive it.

## Intelligence feeds and their purpose

### 1. Static MGI data (`mgi_static_levels.json`)
The unmoving macro coordinate system — campaign boundaries and volatility expectations.
- Current time and current price.
- Daily, Weekly, Monthly MGI levels (see the MGI Glossary).
- The **Rip (Rolling Pivot)** — the primary structural anchor for the session's range.
- ATR (Average True Range).
- VRange boundaries (volatility-based expected move).

### 2. Execution telemetry (`execution_bar_data.rolling.csv`)
Raw mathematical momentum, infantry aggression, dynamic trailing support/resistance, confirmation of
initiative.
- Timestamp + OHLC.
- **Leg VWAP** — micro-trend baseline (Tier 3; micro-timing only).
- **Delta Intensity** — infantry aggression on a −4…+4 scale (negative = red/selling, positive =
  blue/buying; the extremes are the strongest readings). You receive a compact engine-computed
  reduction of this feed.

### 3. HTF Planning Chart (30 min, 90 day)
Major acceptance zones (HVNs), void zones (LVNs between acceptance), composite edges.
- Standard candles; Rotation-Anchored VbP (leftmost) and Balance-Area-Anchored VbP.

### 4. TPO Chart (Market Profile)
Balance vs imbalance, poor highs/lows (single prints), value-area acceptance/rejection, distribution
patterns.
- TPO blocks (time at price), value-area shading, 5-day rolling VbP.

### 5. Execution Chart (500 volume, 21-day lookback)
Delta clustering (blue vs red), aggression symmetry, tempo of tape (absorption vs exhaustion),
initiative flips at the exact point of contact.
- Color-coded candles: blue (buying), red (selling), white (neutral).
- Stacked volume profiles (rotation-anchored delta + VbP at half and full rotation size, plus RTH
  session VbP).

## Data ingestion hierarchy (process in this exact order)

1. **MGI JSON — the coordinate system.** Establish the static daily/weekly/monthly framework and the
   **Rip**. Weigh current price against OR, ONH/ONL, and prior-period VWAPs to fix macro positioning.
   (Level tiering and priority arrive computed in the engine facts.)
2. **HTF & TPO charts — the terrain map.** Identify current position in HTF structure; define
   Acceptance Borders (LVNs), looking for **Trenches (Valley + MGI)** or **Walls (Shelf + MGI)**.
   - **Execute the Magnet Check.** If an MGI level sits in the center of thick volume, it is a
     **Magnet** and cannot serve as a structural border or a Target 3 (Campaign Max).
   - LVN/HVN nodes and POC/value-area summaries come per volume profile: the **400-pt rotation**
     (medium-term) and the **balance-area** (long-term). A **Balance Area** begins when two days
     of overlapping value occur and expands while subsequent days keep overlapping value, with
     exceptions for a peak above/below the balance. A node on the balance-area profile is
     structurally **more significant** than the same node on the rotation profile. The terrain
     zone stack is anchored to the rotation profile; the magnet set is anchored to the
     balance-area profile. Anchors beyond the rotation profile's data range (e.g. the structural
     floor when price sits at the session low) are classified against the balance-area profile;
     MGI levels that stay unpromoted still partition extension voids as **MGI composite edges**.
     A border at a bare profile **data edge** is a data artifact, never structure — no entries,
     stops or targets there.
3. **Execution CSV — raw telemetry.** Read infantry aggression (Delta Intensity) and micro-momentum
   (Leg VWAP). Leg VWAP is strictly micro-timing; HTF MGI wins unequivocally on any conflict.
4. **Execution chart — frontline visual.** Confirm the strike at the border: look for **Absorption
   (clustered delta)** or **Exhaustion (tapered delta)** where the delta profiles meet the HTF
   borders from step 2.
   - The engine scans the half- and full-rotation delta exports for stacks of one-sided bins and
     reports them as **absorption candidates**. A stack by itself means nothing: call absorption
     only where the execution chart shows price **stalled** at the stack; otherwise discard the
     candidate.
5. **Synthesize — the Law of Asymmetric Initiative.** If the terrain offers a valid setup for both
   fronts, the Primary Objective is awarded to the front aligned with the HTF trend. Ensure the final
   objective (T3) is a Shelf or Valley, never a Magnet. (Asymmetric Initiative + the Campaign
   Boundary Override are hard constraints.)

**Conflict protocol:** if micro-telemetry (CSV/Execution) conflicts with macro-structure (HTF/JSON),
**macro terrain wins**. Initiative without structural advantage is a meat grinder — we only fight at
the borders.

## The Terrain Model (foundation of everything)

Price moves freely until hitting an **Acceptance Border**, where the market decides accept/reject.

- **Zones of Acceptance** — high-volume areas where price finds equilibrium.
- **Acceptance Borders** — transitions between zones (LVNs, MGIs, composite edges). The dividing
  lines that separate two zones of acceptance, or an acceptance zone from a void. Ideally an LVN that
  combines with a significant MGI.
- **Void Zones** — thin volume between acceptance zones.

### Internal partitioning (the "Green Line" rule)
Identify functional "rooms" within a large Acceptance Zone (>50 points or complex) by locating
structural dividers, not the center of gravity. View the zone as a stack of **volume blocks** and
trade the edges, not the mass. Strict priority:

- **Iron Trench (Valley + MGI).** Two volume blocks stacked (HVN → LVN → HVN); locate the deepest
  volume valley between the peaks; if a major MGI (wVWAP, Pivot) aligns with it, draw the border
  there. Strongest partition.
- **Iron Ledge (Shelf + MGI).** A block ends into a void; find a volume shelf (flat top/bottom where
  high volume drops off sharply); if a major MGI aligns with the shelf edge, it is a **Wall**. This
  overrides the bell-curve read: wVWAP at the *edge* of a block is a Wall, not a Magnet.
- **Magnet Check (the invalidation).** If the MGI level is surrounded by thick, roughly equal volume
  on both sides with no distinct dip, it is a **Magnet** — the center of gravity. Do not draw a
  partition there.

**Summary:** Valley + MGI = Trench (hard partition) · Shelf + MGI = Wall (hard partition) · Peak +
MGI = Magnet (no partition).

### Vertical campaign map (the full theater)
Cover the entire relevant structure, not just immediate price action:

- **Stratosphere** — highest relevant HTF structure (Weekly High, Monthly Open). Campaign ceiling.
- **Attic** — immediate resistance above the current battle; breaking in implies trend extension.
- **Kill Box** — the active trade zone where price is rotating now.
- **Elevator Shaft** — a steep void zone (LVN) immediately below support or above resistance; if the
  floor breaks, price accelerates through it. Look for continuation, not support.
- **Foundation** — the immediate support shelf (HVN) at the bottom of the Elevator Shaft.
- **Abyss** — lowest relevant HTF structure (Weekly Low, major Pivot). Campaign floor.

### How to apply it
- ALL entries at borders; ALL targets at the next border/zone edge.
- NEVER trade the middle of value without clear imbalance.
- ALWAYS frame analysis as "where in structure + who controls the border."

### Entry decision tree
```
Is price at an Acceptance Border?
├─ NO  → do not suggest entry
└─ YES → check initiative
    ├─ Defense pattern (responsive flow) → fade possible
    ├─ Breach pattern (initiative flow)  → breakout possible
    └─ Indecision (chop)                 → stand down
```

### Structural target selection
Target the borders of acceptance, not the heart of it. A Magnet is high-volume consensus where price
lingers; a Shelf or Valley is where the battle was won or lost. Campaign Max (T3) must always be a
structural exhaustion point (Shelf) or a liquidity void (Valley).

### The Vanguard Protocol (Rip / Rolling Pivot)
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
- **Reward** — the engine-computed R/R gate is met to the next target.

## Tactical fusion (telemetry + visuals)

**Absorption prints in the aggressor's color.** Price falling into a border absorbs RED (aggressive
sellers eaten by passive buyers); price rising into a border absorbs BLUE. There is no such thing as
blue absorption at support or red absorption at resistance — the entry-side color appears *after*
absorption, as the response (rebid/reoffer, initiative flip).

- **Long entries (blue initiative):** price falls into an LVN support border; execution chart shows
  red aggression being absorbed at the border (or a red exhaustion cone); confirmation is the blue
  response after — Delta Intensity shifting positive and a rebid holding the border.
- **Short entries (red initiative):** price rallies into an LVN resistance border; execution chart
  shows blue aggression being absorbed at the border (or a blue exhaustion cone / failed-breakout
  trap); confirmation is the red response after — Delta Intensity hitting its red extreme, a reoffer
  sequence, price snapping back below the Rip.
- **Conflict resolution:** if the CSV shows extreme delta but the HTF chart shows price stalling in
  the middle of a value area, stand down.

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
