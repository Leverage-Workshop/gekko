# Gem vs Gekko Briefing Comparison — 2026-07-18 bundle (price at the session low)

**Date:** 2026-07-18 · **Trigger:** the day's manual morning briefing (briefing
`fc652935-e6e9-4059-8817-6057f85e275e`, bundle `16328ee0-8139-4341-8491-e8e470bf09b1`, model
`openai/gpt-5.6-terra`) proposed a primary short with an entry at **29587** — a price that
coincides with no MGI level. The operator ran the same session through the original Gem
(Gemini 3.1 Pro, extended thinking) and got a materially better report. Gem output and thinking
steps are preserved in `chart-data/comparison-examples/example2/`; the `data/` folder holds the
09:39:45 export bundle (the DB briefing's exact input). The Gem consumed the next export
(09:40:13, price 29592.50 vs 29605.25, Rip 29929.94 vs 29931.06) — 28 s later, structurally
identical, so the comparison is apples-to-apples.

**Scenario this exercises (new vs 07-14):** price sitting *at the session low*, i.e. at the
bottom edge of the rotation profile's data range, with the real structural floor (PDL 29567.50,
VRange −2 29565.25, VRange −3 29521.75) *below* the rotation profile's data.

---

## 1. The two outputs, side by side

### Terrain

Gem (5 zones, all MGI-anchored, campaign bounded to the relevant theater):

| Border | Level |
|---|---|
| 30389.25 | VRange +3 (Stratosphere ceiling) |
| 30062.50 | ONH |
| 29929.94 | Rip |
| 29639.25 | IBL (Elevator Shaft ceiling) |
| 29567.50 | PDL (foundation shelf, with VRange −2 29565.25 as one composite) |
| 29521.75 | VRange −3 (Abyss floor) |

Engine on the 09:39:45 data (10 zones): working borders IBH 29977.50 → OR Low 29912.50 → PDH
29895.75 → VRange Low 29847 → PDC 29785.75 → MonthlyVWAP/ONL 29745.50 → IBL 29639.25 — then
**29587** (the rotation profile's bottom data bin, promoted to a border by `assembleZones`)
— then one 677-pt "Abyss void" straight to PW Low 28909.75.

The engine's two failures on this scenario:

- **A phantom border at the data edge.** 29587 is the session low — the last bin the rotation
  profile has data for — not structure. The briefing model, required to anchor entries on
  engine borders, built its primary entry there ("Abyss trigger").
- **The real floor vanished.** PDL 29567.50 and VRange −2/−3 are anchor levels
  (`selectAnchorLevels` includes daily + Tier-1), but `classifyBorder` reads local volume from
  the **rotation profile only**, and they sit below its edge → "anchor outside the volume
  profile range" → plain unpromoted coordinates, swallowed whole by the void zone. The
  balance-area profile (30094 → 28910) **has volume data across all of them** and was never
  consulted. The briefing then asserted "below 29587 there is no acceptance until PW Low" —
  a data-availability artifact stated as market structure.

### Objectives

| | Gem | DB briefing |
|---|---|---|
| Primary | **LONG** 29592.50 (flush-reload at PDL/−2 shelf), stop 29555, **T1 29639.25 (IBL) → T2 29699.11 (wVWAP) → T3 29745.50 (ONL)**, plus Entry B add-on at the IBL reclaim | **SHORT** 29587 ("accept below the session low"), stop 29639.25, single target PW Low 28909.75 |
| Secondary | **SHORT** — Entry A fade at **IBL 29639.25**, Entry B break below −2, **T1 PDL → T2 −2 → T3 −3 29521.75** | LONG reclaim at OR Low 29912.50 (300+ pts overhead), single target IBH |

The Gem invoked the **Campaign Boundary Override** (instructions.md constraint 7): an extended
red move into a Tier-1 campaign border (PDL/VRange −2) with a confirmed Controlled Flush &
Reload flips the primary to the structural reversal — hence long primary, IBL-fade short as
contingency. Our model could not even see the border the override hinges on.

### What the Gem's thinking steps show

1. **MGI levels are borders per se.** Its terrain is pure MGI scaffolding (Rip, ONH, IBL, PDL,
   VRange extensions); volume is used to *validate* (Magnet Check on T3: confirmed ONL 29745.50
   is a shelf, the magnet sits higher near vwap24/PDC) — never as a gate that can erase a
   Tier-1 level from the map.
2. **The session low is not structure.** 29587/29592 appears nowhere in its terrain — current
   price is simply *located* near the floor of the IBL→PDL Elevator Shaft.
3. **Campaign bounded to the relevant theater.** Ceiling VRange +3, floor VRange −3 — the
   volatility-based expected move — not PM/PW extremes ~600–900 pts away. (On 07-14, mid-range,
   it chose PW High/PW Low; "relevant" adapts to where the battle is.)
4. **Delta used for confirmation only.** Execution-chart delta clusters (−109/−87/−70 flipping
   to +43/+53) confirmed the flush-reload initiative flip. The delta *profiles* contributed no
   levels — consistent with playbook waypoint 4 (delta profiles confirm the strike at borders
   identified in Step 2; they never define structure).
5. **Full tactical ladder, both objectives.** Entry A + Entry B with separate stops, and
   T1/T2/T3 — the template treats these as mandatory; targets as close as 2.25 pts apart
   (PDL → −2) still get distinct rungs.

---

## 2. Findings

### G1. The terrain classifier is blind below (or above) the rotation profile's data range

`classifyBorder`/`localProfileAt` read only the rotation profile. Any anchor beyond its edge —
which is *always* the case for the structural floor when price trades at the session low —
returns "outside the volume profile range" and can never partition the map. The balance-area
profile covers the full theater and already ships in every bundle.

**Suggested change:** fall back to the balance-area profile for local-volume classification when
an anchor is outside the rotation profile's range (doctrine already ranks balance-area nodes as
*more* significant). Additionally, a hard partition should not be required for a Tier-1/daily
MGI level to split a void extension zone: an unpromoted coordinate inside a void should still
appear as a zone border (the Gem's "MGI composite edge" border class), so a 677-pt phantom void
cannot swallow the campaign floor.

### G2. The profile data edge is promoted to a border the model may trade

`assembleZones` inserts the profile edge as a border when the campaign extends beyond it (F1
sliver-guards aside). That is correct for zone bookkeeping but the edge then reaches the model
indistinguishable from real structure, and the prompt *requires* entries on engine borders.

**Suggested change:** tag data-edge borders (`data-edge` / distinct from trench/wall) and forbid
entries/stops/targets anchored to them in the prompt. With G1 fixed, the PDL/−2 border would
exist 20 pts below and take over the floor role naturally.

### G3. Objectives lost the mandatory tactical ladder

The Gem template requires Entry A + Entry B and T1 → T2 → T3 for both objectives. Our schema
was relaxed to `.min(1)` on entries/stops/targets (2026-07-17, OpenAI strict-mode fix) and the
prompt asks only for "at least T1" — so the model ships single-entry, single-target objectives.
On this bundle the short had no T2/T3 *available* (G1 erased the rungs), but the long side had
rungs (IBH, ONH/VRange High, PW High) and still got one target.

**Suggested change:** keep the schema floor at `.min(1)` (strict-mode constraint) but make the
prompt demand the full ladder whenever distinct engine borders exist in the trade direction, and
Entry A + Entry B (ideal + add-on / fade + break) per the Gem template. Optionally warn in
`validateBriefing` when an objective has fewer than 2 targets while ≥2 engine borders lie
between entry and the campaign extreme.

### G4. Campaign Boundary Override is unreachable when the border is invisible

The override exists in doctrine (`constraints.md`) and the model is told about it, but it keys
off "price at a Tier-1 campaign border with exhaustion/trap" — a condition the model can only
recognize if the terrain shows the border. G1 is the root cause; once fixed, consider one
prompt line making the check explicit when `currentPrice` is within tolerance of a Tier-1
border.

### What checked out fine

- **Rip/Vanguard**: engine Condition Red; Gem "Condition Yellow/Red territory" — agreement
  within the doctrine's own ambiguity at a boundary.
- **Delta telemetry, absorption discipline**: our pipeline already uses the delta profiles for
  absorption candidates only (confirmation-only, matching playbook waypoint 4); the briefing
  correctly rejected the unstalled sell-stack candidates. The 29587 entry did **not** come from
  the delta profiles.
- **R/R arithmetic, magnet prohibition** on the stored objectives: internally consistent.

## 3. Suggested priority

G1 explains both bad objectives (phantom short entry, missing PDL/−2 long) and the phantom-void
narrative; G2 is its small companion; G3 is a cheap prompt/validation win; G4 mostly falls out
of G1. Regression harness: re-run `computeEngineFacts` over
`chart-data/comparison-examples/example2/data/` after each fix and diff the zone stack against
the Gem's five-zone map above (floor partitions at IBL 29639.25 and PDL/−2, no border at 29587,
no undivided void to PW Low).
