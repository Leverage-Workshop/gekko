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
- VRange — implied-volatility geography from the session open and VIX, NOT traded acceptance:
  **VRange Upper/Lower** are the inner mean-reversion lines (they behave like value-area edges and
  flip to support/resistance when broken with conviction), and the **VRange 1x Zone** near/far
  levels are the two edges of one shaded band at the full expected session move — an inflection
  band price may never reach, and the band is the object, not either edge alone.

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

### 5. Execution Chart (volume bars, 21-day lookback)

The per-bar volume is exporter metadata the operator controls in Sierra Chart — the configured
value is stated in each run's data message, never here.
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
   - The HTF **trend read is code-owned** when the bundle carries the 30-min bar export:
     `htfStructure` supplies the trend state from the confirmed swing sequence, the recent swing
     highs/lows, the defining rotation and the measured 30-min ATR (with ATR-normalized
     swing distances) — the HTF screenshot adds distribution shape only, never the trend call.
     The **defining rotation is the last CONFIRMED swing span, not the current range**: pivots
     confirm 2.5 h late and its two legs can come from different sessions, so it ships with a bar
     time per leg and must be narrated dated whenever a leg predates the live session.
   - **Execute the Magnet Check.** If an MGI level sits in the center of thick volume, it is a
     **Magnet** and cannot serve as a structural border.
   - LVN/HVN nodes and POC/value-area summaries come per volume profile: the **400-pt rotation**
     (medium-term) and the **balance-area** (long-term). A **Balance Area** begins when two days
     of overlapping value occur and expands while subsequent days keep overlapping value, with
     exceptions for a peak above/below the balance. Fewer levels resolve on the balance-area
     profile — more volume has transacted, so it is often a blob — but the ones that do are the
     **most important structure on the map**: a balance-area promotion is **AAA**, a
     rotation-only promotion is **A** (like PM-H vs PW-H — both matter, the senior one more).
     A zone border requires **confluence**: an MGI level (or cluster) coinciding with volume
     structure on either profile. Clustered MGI merging into one composite band makes that band
     MORE significant. A bare MGI with no volume confluence is **never a border** — MGI in the
     middle of a void is a waypoint for target rungs, not a partition. The zone stack keeps only
     campaign-scale dividers: crowded rotation-grade borders consolidate to the strongest of the
     neighborhood (the rest remain levels), because the terrain maps where MAJOR moves start and
     end, not every micro rotation. The magnet set is anchored to the balance-area profile. A
     border at a bare profile **data edge** is a data artifact, never structure — no entries,
     stops or targets there.
3. **Execution CSV — raw telemetry.** Read infantry aggression (Delta Intensity plus the raw
   per-bar flow columns: delta = ask − bid volume, trade count) and micro-momentum (Leg VWAP).
   The engine reduces the raw columns to cumulative delta, divergence at the fresh extreme and
   climax prints. The bars print a fixed per-bar volume (the configured size is stated in each
   run's data message; the in-progress last bar may show less) — weigh participation by bar count
   at a price, trade count and delta magnitude, never by the flat Volume column. Leg VWAP is
   strictly micro-timing; HTF MGI wins unequivocally on any conflict.
4. **Execution chart — frontline visual.** Confirm the strike at the border: look for **Absorption
   (clustered delta)** or **Exhaustion (tapered delta)** where the delta profiles meet the HTF
   borders from step 2.
   - The engine scans the half- and full-rotation delta exports for stacks of one-sided bins and
     reports them as **absorption candidates**, each carrying a code-owned **stall confirmation**
     computed from the enriched execution bars (bars that traded at the stack, volume and trades
     there, net price progress). A stall-confirmed candidate IS absorption; an unconfirmed one has
     no stall visible in the rolling bar window (possibly aged out, not refuted) — the bar data,
     not the screenshot, decides the stall.
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
