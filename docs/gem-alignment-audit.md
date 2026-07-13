# Gem-Docs ↔ Code Alignment Audit

**Date:** 2026-07-13 · **Trigger:** PR #37 found doctrine functionality changed in translation to
code (Condition Red was fed a 20-bar *mean* delta ≤ −3 — effectively unreachable — where the
Vanguard Protocol says "red initiative building, Delta Intensity −3/−4"; fixed to count-based
extreme prints). This audit reviewed **all** functionality in the original Gem documents
(`gem-files/instructions.md`, `gem-files/tactical-companion-playbook.md`, the four cheat sheets)
against the code (`lib/engine`, `lib/analyze`, `lib/eval`, `lib/briefing`, `knowledge/`) for any
other such drift.

Method: three parallel review passes (structural engine, telemetry/tactics engine, LLM-side
knowledge/prompts/validators), every flagged candidate then verified directly in source.

Findings fall into three groups:

- **A — Misalignments, fixed** in this change (A1 reviewed and waived by the operator).
- **B — Judgment-call deviations, flagged not changed** (doctrine calls for the operator, PR #37
  "Flagged, not changed" style).
- **C — Verified fine / intentional adaptations**, documented so they aren't re-litigated.

---

## A. Misalignments

### A1. "Stops never widen" enforcement is dead code — WAIVED (operator ruling: no change)

`lib/engine/riskReward.ts` implements the check (`stopWidened`, `priorStop` param), but no caller
anywhere passes `priorStop` — `lib/analyze/validateBriefing.ts` calls
`objectiveRiskReward(objective, { rrMin })` without it, so `stopWidened` is always false and the
advertised "widened stops" warning can never fire. Gem rule #2 ("Never allow stops to move farther
from entry") is therefore model-owned today, not engine-enforced.
**Disposition:** waived — deliberately left unwired. `knowledge/system/constraints.md` was
corrected to stop claiming engine enforcement (see A7). Wiring it up later means fetching the
prior briefing's active `entry_levels` stops and threading `priorStop` through
`validateBriefing.ts`.

### A2. Delta-sign-before-ENTER was prompt-only — FIXED

Gem (`instructions.md`): "Explicitly verify that CSV Delta > 0 for longs, or Delta < 0 for shorts
before suggesting ENTER." The engine computes `deltaTelemetry.sign`, the eval prompt repeats the
rule, but `enforceEvalFacts` (`lib/eval/validateEval.ts`) never checked it — a model ENTER against
the sign persisted silently. Since this system's philosophy is that computable gates are
code-owned (the proximity gate already is), the check now lives in code: an ENTER whose direction
contradicts the engine sign is demoted to WAIT with a warning (`neutral` passes; the raw model
answer stays auditable in `raw_model_json`).

### A3. Elevator Shaft could never appear above the Kill Box — FIXED

Doctrine (`tactical-companion-playbook.md`, Vertical Campaign Map): an Elevator Shaft is a steep
void "immediately **below support or above resistance**." `terrainZones.positionZones` assigned
`elevator-shaft` only to the zone below the Kill Box; a void immediately above was always labeled
Attic. The upper slot now mirrors the lower: void → Elevator Shaft, acceptance → Attic.

### A4. T1/T2 target-rung semantics dropped in translation — FIXED

The Gem's Strategic Alignment table defines all three rungs — T1 Tactical = "First Obstacle /
Immediate S/R", T2 Objective = "Next Acceptance Border / Standard Target", T3 Campaign Max =
"Full Traverse of HTF Distribution / Major HTF MGI at LVN" — but only T3's Trench/Wall rule
survived into `knowledge/`; the model had to guess T1/T2 meaning from bare labels. The rung
definitions are now in `knowledge/system/output-schema.md` and the analyze prompt's
data-ownership block.

### A5. Key Inflection Points unbounded — FIXED

The Gem template has exactly Level 1 + Level 2 (ADHD profile: "Highlight max 2 key areas per
response"). `knowledge/schema/briefing.schema.ts` had `keyInflections: z.array(...)` unbounded —
and the schema drives `generateObject`, so nothing constrained the model. Now `.min(1).max(2)`.

### A6. Orphan "Rip Wall" doctrine term — FIXED

`lib/briefing/highlight.ts` emphasized the compound term "Rip Wall", which is defined nowhere in
`knowledge/` or `gem-files/` (the glossary has "Rip" and "Wall" separately). Removed.

### A7. constraints.md claimed enforcement that never runs — FIXED

`knowledge/system/constraints.md` stated the no-widen rule is "Enforced by
`lib/engine/riskReward.ts` (`stopWidened` against the prior briefing)" — false (see A1). Reworded
to say the check exists in the engine but is not wired into the pipeline, so the model must hold
the rule itself. The other "Enforced by" claims were re-verified: R/R gate (recomputed in
`validateBriefing.ts` — true), Leg-VWAP tiering (`mgiPriority.ts` — true), Rip thresholds
(`ripStatus.ts`, wired count-based via `engineFacts.ts` — true).

### A8. Stratosphere/Abyss capped at the volume profile's own price range — FIXED

Doctrine: Stratosphere = "the **highest relevant HTF structure** (e.g., Weekly High, Monthly
Open)", Abyss = the lowest; the campaign map covers "the **entire** relevant structure."
`terrainZones.assembleZones` used the rotation profile's own min/max as the campaign floor and
ceiling, silently dropping Tier-1 levels beyond the profile range. The campaign extremes now
anchor to the **outermost of the profile extremes and the Tier-1 HTF envelope**; when the
campaign extends past the profile, the profile edge itself becomes a border (it is a composite
edge) and the extension zone — having no volume data — classifies as void. Non-positive export
placeholders (e.g. ONH/ONL as `0.00`) never anchor. On the current fixture day this widens the
theater from the 400-pt rotation range to 28227.75–30975.50.
Doctrine's "Major Composite Edges" Tier-1 member is thereby modeled *implicitly*: the profile
edges participate as campaign borders rather than as named MGI levels.

### A9. ATR High/Low promoted to Tier 1 beyond doctrine — FIXED

Doctrine's Tier-1 list is "Weekly/Monthly levels, VRange extremes, Major Composite Edges,
ONH/ONL" — no ATR. `mgiPriority.ts` had classified the ATR projections Tier 1, making them
partition anchors, campaign borders, and `nearestTier1Above/Below` candidates. Demoted to Tier 2
(volatility context). VRange stays Tier 1 as doctrine lists it.
**Within scope but unchanged:** PDH/PDL/PDC, IBH/IBL, OR High/Mid/Low stay Tier 2. Doctrine's
tier rule leaves them unclassified (its Tier 2 nominally names only "the Rip and Session VWAPs"),
and the consequence doctrine actually polices — that they are **not** campaign borders — already
holds; Tier 3 (Leg-VWAP micro-timing) would be wrong.

---

## B. Flagged, not changed (doctrine calls)

- **B1. Green-Line partition trigger (>50-pt / "wide or complex" zone) is not implemented.**
  Doctrine partitions a zone only "when a Primary Acceptance Zone is wide (>50 points) or
  complex"; `terrainZones.selectAnchorLevels` classifies every Tier-1 + Rip anchor
  unconditionally — the 50-pt gate exists nowhere. The module deliberately favors recall (a
  missed border is unrecoverable downstream; an extra one is prunable), so narrow zones may carry
  more partitions than doctrine prescribes. Adding the gate would suppress partitions inside
  zones ≤ 50 pts wide.
- **B2. Magnet geometry drifts both directions.** Doctrine's Magnet Check is pure shape — "thick,
  roughly **equal** volume on both sides with no distinct dip." The code never compares
  left/right symmetry (each flank independently ≥ 0.55× local peak), and it additionally requires
  proximity (≤ `DEFAULT_MAGNET_TOLERANCE`) to the balance-area POC/VAH/VAL/HVN set — so a
  geometrically-magnet level away from that set stays a plain `mgi` border (it is not invalidated
  as a target).
- **B5. An R/R-gate miss persists as a warning, not a reject.** The Gem's "Require minimum
  3:1 … for any setup" reads hard; `validateBriefing.recomputeObjective` warns and persists.
  Advisory-only pipeline may prefer warn-and-persist — operator call whether to hard-fail.
- **B6. Rip "closes below" is an instantaneous snapshot.** `ripStatus` compares the live bundle
  price to the Rip with a ±0.25 (one-tick) band — no bar-close semantics, and a price up to one
  tick below the Rip still reads Green. The exec CSV carries closes if close-based semantics are
  ever wanted.
- **B7. `meta.htfTrend` is an unchecked model string** — yet it is the linchpin of the Law of
  Asymmetric Initiative (primary-objective direction). The engine computes no HTF trend to
  validate it against. (The Law itself staying LLM judgment matches the original all-LLM Gem;
  flagged because the string is now load-bearing and unverifiable.) Related: neither the Law nor
  the Campaign Boundary Override, nor the T3-on-Trench/Wall rule, nor entries-at-borders are
  *validator*-enforced — they are prompt/doctrine-owned, as in the original Gem. T3/entry checks
  against engine facts would be cheap hardening if wanted.

(B3/B4 were promoted to fixes A8/A9 by operator ruling.)

---

## C. Verified fine / intentional adaptations

- **Condition Red (the PR #37 item)** is fixed and correctly wired: `engineFacts` passes the
  count-based `recentRedExtremeCount` into `computeRipStatus`; the mean is display-only.
- **Bolding all prices in the UI** (`highlight.ts`) matches `instructions.md` line 43 ("Bold all
  references to price levels…"); the ADHD "max 2" rule governs Key Inflection Points — now
  enforced by A5.
- **The Gem's "Update" prompt is reinstated as `update-task` (feat-038)** — an Immediate
  Tactical Read plus a fresh Strategic Alignment (primary/secondary/danger zones) regenerated
  against the previous briefing, persisted as a `briefings` row with `kind='update'` whose
  overview/terrain carry forward from the parent. The eval "no entry near" response regained
  its "Run an Update for a full tactical read" hand-off (`lib/eval/prompt.ts`). (Historical
  note: between the structured-output rewrite and feat-038, no update task existed and analyze
  runs stood in for it.)
- **Exhaustion shapes and the named multi-leg patterns** (Three-Push Exhaustion Trap, Controlled
  Flush & Reload) are not engine-detected; they remain LLM-visual judgment with the chart PNGs
  attached — the same architecture as the original Gem. The engine's absorption module is
  additive (candidates-only on the delta-profile bins; the prompt tells the model to confirm
  price actually stalled).
- **"3:1" is de-numbered in knowledge prose deliberately** — single-sourced as
  `DEFAULT_RR_MIN = 3.0` / `config.rr_min`, with `tests/doctrine-drift.test.ts` banning numeric
  restatement in prose.
- **Daily MGI Priority ranks 4–5 (RVAH/RVAL, RPOC) are absent** because
  `mgi_static_levels.json` does not export them (data-constrained; noted in `mgiPriority.ts`).
  Likewise the glossary's GVAH/GVAL/GPOC, PDMid/IBMid, RTH VWAP/Mids, Weekly IB + extensions,
  PW Close/VAH/VAL/POC, CW value area, PM-Cl/PM-Op/PM-POC, and VRange ±1/±4 are unmodeled —
  extend the export before extending the code.
- **The 20-pt eval proximity threshold and the staleness gate** are code-era additions (the Gem's
  "near" was qualitative); documented, config-plumbing planned for the threshold.
- **The two-profile split** (rotation anchors the terrain; balance-area anchors the magnet set)
  and the Balance Area definition are post-Gem doctrine added in feat-037, not drift.
