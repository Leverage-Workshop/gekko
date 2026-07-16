# Gem vs Gekko Briefing Comparison — 2026-07-14 bundle

**Date:** 2026-07-16 · **Trigger:** first real Windows-uploader briefing (briefing
`a64d81ab-1ac5-4152-9d6f-177deb124b12`, model `openai/gpt-5.6-terra`) felt off to the operator:
primary and secondary objectives landed almost on top of each other, the terrain map looked
bunched together, and the tactical overview was sparse. The operator ran the same export bundle
through the original Google Gem and got a materially better report. Both outputs, the input data
files, and the Gem's step-by-step thinking are preserved in
`chart-data/comparison-examples/2026-07-14/09-45/`.

**Method:** the deterministic engine (`computeEngineFacts`) was re-run locally over the exact
comparison-folder data files, so every engine number below is reproduced, not inferred. The DB
briefing was pulled from Supabase and compared side-by-side with the Gem report and, especially,
the Gem's thinking steps. (The DB briefing's bundle is a slightly later snapshot of the same
session — Rip 29747.22 vs 29746.74, Weekly VWAP 29624.66 vs 29624.62 — close enough that the
structural comparison is apples-to-apples; the engine reproduction below uses the exact
comparison-folder data.)

**Scope:** analysis only. No code was changed. Findings are ranked by how much of the observed
quality gap they explain.

> **Status update (2026-07-16):** F1–F6 are implemented on this branch (F7 — the model id —
> deliberately left as-is per the operator). Re-running the engine over this bundle now produces
> an 8-zone, 1,184-pt PW High→PW Low map with composite borders ("OR Mid / PDH / Rip / Monthly
> VWAP", "VRange Low / OR Low", "24 VWAP / Weekly VWAP"), IBH/IBL walls at 29815.75/29567.50,
> acceptance across the value area, and the thin-tail VRange −2/−3 trenches demoted. See
> `progress.md` and `decisions-log.md` for the parameter judgment calls.

---

## 1. The two outputs, side by side

Session context (identical for both): NQ at **29718**, price below the Rip (29746.74) with red
initiative (engine: Condition Red, recent red-extreme count 8; Gem: "Condition Red — Control
Flipped"). Both chose a primary short and a contingency long. The *direction* logic agrees
everywhere — the divergence is entirely in the **terrain** and the **structure available to hang
tactics on**.

### Terrain map

Gem (5 zones, campaign span **1,184 pts**, borders chosen from the visible HTF structure):

| Border | Level |
|---|---|
| 30094.00 | PW High (Stratosphere ceiling) |
| 29952.00 | Weekly Open |
| 29815.75 | IB High / OR High |
| 29567.50 | IB Low |
| 29303.50 | ONL |
| 28909.75 | PW Low (Abyss floor) |

Engine on the same data (11 zones, campaign span **2,747.75 pts**):

| Zone | Span (pts) | Class |
|---|---|---|
| 30975.50 → 29922.00 | 1,053.50 | void (off-profile; meanVol 5) |
| 29922.00 → 29921.75 | **0.25** | void |
| 29921.75 → 29919.00 | **2.75** | void |
| 29919.00 → 29746.74 | 172.26 | void |
| 29746.74 → 29743.41 | **3.33** | acceptance ("Attic") |
| 29743.41 → 29703.00 | 40.41 | void (**"Kill Box"**) |
| 29703.00 → 29624.62 | 78.38 | void (Elevator Shaft) |
| 29624.62 → 29422.50 | 202.12 | void |
| 29422.50 → 29379.50 | 43.00 | void |
| 29379.50 → 29304.00 | 75.50 | void |
| 29304.00 → 28227.75 | 1,076.25 | void (off-profile; meanVol 13) |

Two ways to read "bunched together", and both are real:

- **77.5%** of the map's vertical span (1,053.5 + 1,076.25 of 2,747.75 pts) is two empty
  mega-zones beyond the volume profile, because the campaign ceiling/floor anchored to PM High
  (30975.50) and PM Low (28227.75). Rendered, all the actual structure is compressed into the
  middle ~22% — the map *looks* bunched.
- The working borders themselves *are* bunched: three zones are 0.25–3.33 pts wide (unmerged
  near-duplicate levels), and the "Kill Box" is a 40-pt pocket instead of the Gem's ~248-pt
  active balance (IB Low → IB High).

### Objectives

| | Gem | DB briefing |
|---|---|---|
| Primary short entry | 29746.74 (Rip cluster) | 29743.41 (Monthly VWAP) |
| Primary stop | 29765.00 | 29756.00 |
| Primary T1 / T2 / T3 | 29689.75 (OR Low) / 29624.62 (Weekly VWAP) / **29567.50 (IB Low — a validated Wall at the edge of the distribution)** | 29703.00 (VRange Low) / 29624.66 (Weekly VWAP) / **29422.50 (VRange −2, reached only through the void)** |
| Secondary long entry | **29624.62 (Weekly VWAP)** — 122 pts from the primary entry | **29703.00 (VRange Low)** — **40 pts** from the primary entry, and equal to primary T1 |

The operator's "objectives too close together" complaint is the 40-pt gap in the right column.
The Gem had OR Low, IB Low, IB High etc. available as rungs and spread its ladder across them;
our model was **forbidden** from using any of those prices (see finding 2), so both objectives
got squeezed into the only three engine borders near price: 29743.41 / 29703 / 29624.6.

### What the Gem's thinking steps show it doing that our pipeline structurally cannot

1. **Cluster composition** — it treated PDH 29752.50 / OR Mid 29752.75 / Rip 29746.74 / Monthly
   VWAP 29743.41 as *one* composite border ("the Rip and PDH border cluster at
   29746.74/29752.50"), and Weekly VWAP 29624.62 / 24h VWAP 29640.52 as one support band.
2. **Session structure as the skeleton** — the map's working partitions were IB High/OR High
   (29815.75), IB Low (29567.50), OR Low (29689.75), Weekly Open, ONL. It verified each against
   the volume profile ("IB Low… functions as a valid Shelf (Wall)… volume drastically decreases
   below this level"; "29815.75 isn't a magnet, it's the upper Volume Shelf").
3. **Relevant campaign extremes** — ceiling/floor = PW High / PW Low, explicitly cross-checked
   against what the HTF chart actually shows ("price bars and volume profile going down to
   around 29040… verifying that the range 28909.75–30094.00 covers the full HTF profile").
4. **Acceptance read from volume** — it identified 29600–29850 as "massive volume… an acceptance
   zone", i.e. the region our engine classified as void.
5. **Pattern narrative** — Failed Breakout Trap at OR High → liquidation flush through the Rip →
   delta exhaustion near 29800. That narrative is what made its Tactical Overview feel dense.

---

## 2. Findings (ranked)

### F1. Terrain borders are never clustered — near-duplicate levels become separate hard partitions

`lib/engine/terrainZones.ts` promotes each MGI anchor independently and `assembleZones` uses the
raw prices as zone borders. On this bundle that produced trenches at 29746.74 **and** 29743.41
(3.33 pts apart) and walls at 29921.75 **and** 29919.00 (2.75 pts apart) — plus a 0.25-pt sliver
against the profile edge at 29922. The Gem's doctrine treats such clusters as one composite
border, and its report reads that way.

Downstream damage: degenerate zones, a 3.3-pt "acceptance Attic", a 40-pt "Kill Box", and a
model that must reproduce these borders verbatim (`validateBriefing.assertZoneContiguity` +
engine-border check), so the briefing inherits the fragmentation.

**Suggested change:** merge hard partitions within a tolerance (a few points — `magnetTolerance`
= 8 pts is already the proximity notion the engine uses) into a single composite border with a
combined label ("Rip / Monthly VWAP trench"), keeping the strongest verdict. Also drop or merge
partitions closer than one bin to the profile edge (the 29922/29921.75 sliver).

### F2. Session structure (Tier 2) is completely absent from the terrain — and therefore banned from entries/targets

`selectAnchorLevels` (`lib/engine/terrainZones.ts:178`) anchors on **Tier 1 + Rip only**. Tier 2
per `lib/engine/mgiPriority.ts` = PDH/PDL/PDC, IBH/IBL, OR High/Mid/Low, 24h VWAP. None of those
prices appear anywhere in the DB briefing — not as zones, not as `terrain.levels`, and the
analyze prompt (`lib/analyze/prompt.ts`) then instructs "Entries only at engine-verified
acceptance borders" and forces `terrain.zones` to the engine border set.

The Gem's entire tactical ladder ran on exactly these levels: Kill Box = IB Low → IB High, T1 =
OR Low, T3 = IB Low (a shelf it validated against the profile), failed-breakout catalyst at OR
High, stop placed above PDH/OR Mid. Our model literally could not express any of that. This is
the single biggest driver of both the bunched objectives and the sparse overview.

Note the tiering itself is doctrine-faithful (Tier 1 = campaign borders; Tier 2 = intraday
direction) — the drift is that in the Gem, Tier 2 levels still partition the *intraday* map and
serve as T1/entry/stop coordinates; in our engine "not Tier 1" became "does not exist".

**Suggested change:** include Tier-2 daily levels (at minimum IBH/IBL, OR High/Low, PDH/PDL) as
candidate anchors in `selectAnchorLevels`, still subject to the same local volume-geometry
promotion (so noise levels stay plain `mgi` coordinates and don't over-partition the map), and
surface non-promoted ones in `terrain.levels` as coordinates. Separately, relax the prompt so T1
("first obstacle / immediate S/R") and stops may sit on any engine-listed level, not only zone
borders — that matches the Gem's rung semantics.

### F3. Campaign extremes anchor to the outermost Tier-1 level — PM High/Low inflate the map ~2.3×

`assembleTerrain` (audit finding A8) sets the ceiling/floor to the outermost of profile extremes
and *all* Tier-1 prices — here PM High 30975.50 / PM Low 28227.75, both ~900+ pts beyond
anything on the chart. Doctrine (`knowledge/doctrine/chart-reading.md:110,116`) says
"**highest/lowest relevant HTF structure** (Weekly High, Monthly Open)"; the Gem chose PW High /
PW Low after checking them against the visible HTF profile. The "relevant" qualifier did not
survive into code, and the result is a map that is 77% empty and compresses the battlefield.

**Suggested change:** bound the campaign envelope by relevance — e.g. the innermost Tier-1 level
at or beyond each profile extreme (here: PW High 30094 above, PW Low 28909.75 below), rather
than the outermost overall. That reproduces the Gem's choice on this bundle deterministically.

### F4. Zone volume classification calls nearly everything void

`acceptanceFrac: 0.4` compares each zone's **mean** bin volume to the profile's **peak** bin
(`assembleZones`). On this bundle only the 3.33-pt sliver at the local HVN cleared it; the
29919→29746.74 zone (mean 462 vs peak 1334 → 0.35) came out void even though it contains the
rotation POC (29780) and most of the value area (VAH 29811 / VAL 29603) — the region the Gem
read as "massive volume… acceptance". A mean-vs-single-peak test is biased against wide zones
and any zone touching a sparse profile tail; combined with F1–F3 it produced an all-void map,
which also flattens the narrative the model can build ("everything is a void" ≈ nothing to say).

**Suggested change:** classify against a robust baseline — e.g. zone mean vs profile mean/median,
or the fraction of the zone's bins above a threshold — and/or exclude off-profile extension
zones from the comparison base. Sanity target: the value area of the anchoring profile should
essentially never classify as void.

### F5. T3 landed mid-void on a thin-tail "trench"; the Gem's T3 discipline lands on the near shelf

VRange −2 (29422.50) and −3 (29379.50) were promoted to trenches from the profile's sparse tail
(zone mean volumes 93/98 vs peak 1334 — the "blocks" flanking those valleys are tiny in absolute
terms). The DB briefing's primary T3 = 29422.50, a full-void traverse below 29624. The Gem
instead validated T3 = IB Low 29567.50 as the **Wall at the bottom edge of the current
distribution** and stopped there — "the target must be a valid Valley (Trench) or Shelf", with
the shelf at the *edge* of acceptance, not a level floating beyond it. Recall-favoring promotion
is a stated design choice (module header), but an absolute-volume floor for Trench/Wall
promotion would cut this class of false structure without hurting recall where it matters.

**Suggested change:** require a minimum absolute volume (fraction of profile mean) in the
flanking blocks before promoting Trench/Wall; consider prompt guidance that T3 should prefer the
near edge of the first major void over structures beyond it.

### F6. Sparse tactical overview — schema floor is zero, and the facts gave the model little to narrate

`Overview` (`knowledge/schema/briefing.schema.ts`) caps `keyInflections` at 2 (deliberate ADHD
rule — correct) but sets **no minimum** on `currentPosition` / `structuralArchitecture` /
`orderFlowContext`; the DB briefing produced two short bullets each. That actually matches the
Gem *template* (2 concise bullets per section) — the felt sparseness is content density, and it
traces back to F1–F4: the Gem's bullets name IB High failed-breakout traps, walls protecting IB
Low, and the Elevator Shaft to ONL; our model's fact set contained none of those coordinates and
an all-void map. Two smaller contributors are fixable independently:

- The analyze prompt tells the model to read charts "ONLY for perception the numeric data cannot
  give" and lists pattern shapes, but never asks for the Gem's **Active Pattern Scan** ("actively
  scan for playbook setups… explicitly call them out as high-conviction catalysts" —
  `gem-files/instructions.md`, waypoint 5). An explicit "name the active playbook pattern, or
  state none" instruction (feeding `orderFlowContext`) would restore the pattern narrative.
- `z.array(z.string()).min(2)` on the three prose sections would enforce the Gem template's
  floor cheaply.

### F7. Not a code defect, but a comparison variable: the model

`config.model_id` has been `openai/gpt-5.6-terra` since 2026-07-11; the DB briefing was generated
by it. The Gem runs on Gemini **with an iterative code-interpreter loop** (eight Python passes:
sorting levels, verifying R/R, checking zone contiguity) before writing a word. Our architecture
deliberately moves that computation into the deterministic engine — which is sound, but it means
briefing quality is bounded by what the engine hands over; F1–F5 are exactly where the handover
falls short of what the Gem computes for itself. Worth re-running this same bundle after any
terrain fixes, and separately A/B-ing model_id (CLAUDE.md's stated default is
`anthropic/claude-sonnet-5`), before attributing residual gaps to the model.

---

## 3. What checked out fine

- **Rip/Vanguard condition** — engine said Condition Red (price −28.74 below Rip, 8 recent red
  extremes); the Gem independently concluded "Condition Red (Control Flipped)". Exact agreement.
- **Delta telemetry** — Leg VWAP 29754.56 above price, DeltaIntensity pinned at −4: both sides
  read it identically.
- **Direction & Asymmetric Initiative** — both outputs: primary short, contingency long.
- **R/R gate** — both enforce 3:1; both primary entries clear it (Gem 3.12:1, DB 3.21).
- **Magnet handling** — the balance-area magnet set (POC 29950, VAH 30062, VAL 29474, HVNs
  29942/29404) is single-sourced and none of the DB briefing's targets violate the Magnet
  Prohibition.
- **Stops** — comparable placement and tightness (29756 vs 29765 above the same cluster).
- **Overview order-flow honesty** — the DB briefing correctly rejected the 29756–29769 absorption
  candidate ("did not stall price… traversed"), exactly the candidate-vs-confirmed discipline the
  prompt demands.

## 4. Suggested priority

F2 (Tier-2 levels in the terrain) and F1 (border clustering) explain most of "objectives too
close together"; F3 (campaign extremes) explains most of "map too bunched"; F4 explains the
all-void read; F6 is the cheap overview win. F5 and F7 are follow-ups. A natural regression
harness already exists: this comparison bundle — after each fix, re-run the engine over
`chart-data/comparison-examples/2026-07-14/09-45/data/` and diff the zone stack against the
Gem's five-zone map.
