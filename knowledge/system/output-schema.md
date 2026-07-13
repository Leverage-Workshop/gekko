# Output Schema

Output is **structured JSON, not markdown**. The single source of truth for the shape is the Zod
contract in `knowledge/schema/briefing.schema.ts` — the `analyze-task` and `eval-task` generate
objects against those schemas (`generateObject`), and the Next.js UI renders tables and the terrain
map from the returned object. This file is the human-readable mirror of that contract; if the two
ever disagree, the Zod schema wins.

The old free-text Morning-Briefing / Update / CSV-terrain-map templates are **retired** — they are
replaced by the structured `Briefing` object below. The model supplies perception and judgment; the
engine supplies all computed fields (e.g. `rr` from `riskReward.ts`, validated terrain borders).

## `Briefing` (output of `analyze-task`)

```
Briefing = {
  meta: {
    createdAt,            // ISO timestamp
    triggerReason,        // e.g. "manual"
    currentPrice,
    htfTrend,             // narrative HTF trend read
    ripStatus             // resolved Vanguard condition (see ripStatus.ts)
  },
  overview: {
    currentPosition: string[],        // price location vs multi-timeframe structure + Rip status
    structuralArchitecture: string[], // active acceptance zones / void zones (Elevator Shafts)
    orderFlowContext: string[],       // current delta initiative; active absorption/exhaustion
    keyInflections: { level: number, why: string }[]   // why each level matters right now
  },
  terrain: {
    zones:  { color, top, bottom, label }[],  // contiguous Stratosphere->Abyss, engine-validated
    levels: { price, label, kind }[]          // kind: 'trench' | 'wall' | 'magnet' | 'mgi'
  },
  primary:   Objective,   // highest-probability setup (HTF-trend-aligned per Asymmetric Initiative)
  secondary: Objective,   // contingency / counter-trend
  dangerZones: { area: string, why: string }[]
}

Objective = {
  macroGoal,              // 1-line action statement: Action + Level -> Objective
  rationale,              // 1-line structural justification
  direction: 'long' | 'short',
  entries: { label, price, trigger }[],   // e.g. Entry A (Ideal), Entry B (Add-on)
  stops:   { label, price, invalidation }[],
  targets: { label, price, description }[], // label: 'T1' | 'T2' | 'T3'; T3 must be Trench/Wall
  rr: number              // computed by riskReward.ts — not invented by the model
}
```

- `terrain.zones[]` must be **contiguous** (no gaps): the bottom of zone N equals the top of zone
  N+1. The engine assembles and validates these borders.
- Target rung semantics (from the Gem's Strategic Alignment table):
  - **T1 (Tactical)** — the first obstacle / immediate S/R in the trade direction.
  - **T2 (Objective)** — the next acceptance border (the standard target).
  - **T3 (Campaign Max)** — the full traverse of the HTF distribution / a major HTF MGI at an LVN.
    T3 must land on a Valley (Trench) or Shelf (Wall) — never a Magnet (see Magnet Prohibition in
    `system/constraints.md`).

## `EvalResult` (output of `eval-task` — the "Check Entry" button)

A separate, lighter contract for an on-demand entry check at the current price.

```
EvalResult = {
  meta: { createdAt, currentPrice, nearEntry: boolean, zone? },
  status: 'ENTER' | 'WAIT' | 'NOT_VALID' | 'NO_ENTRY_NEAR',
  evaluatedLevel?: { label, price, direction },
  direction?: 'long' | 'short',
  trigger?: string,
  stop?: number,
  targets?: number[],
  reason: string
}
```

- `NO_ENTRY_NEAR` when price is not near any active entry from the prior briefing.
- `ENTER` / `WAIT` / `NOT_VALID` apply only when price IS near an active entry; the long/short
  ENTER/WAIT/NOT_VALID decision logic lives with the eval-task (see `doctrine/patterns.md` for the
  qualitative confirmation cues, and `system/constraints.md` for the colors=side rule: Delta > 0 for
  longs, Delta < 0 for shorts before any ENTER — code-enforced in `lib/eval/validateEval.ts`, which
  demotes an ENTER that contradicts the engine delta sign to WAIT).
