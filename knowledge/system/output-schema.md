# Output Schema

Output is **structured JSON, not markdown**. The single source of truth for the shape is the Zod
contract in `knowledge/schema/briefing.schema.ts` — the `analyze-task`, `update-task` and
`eval-task` generate objects against those schemas (`generateObject`), and the Next.js UI renders
tables and the terrain map from the returned object. This file is the human-readable mirror of that
contract; if the two ever disagree, the Zod schema wins.

The old free-text markdown templates are **retired** — replaced by the structured objects below:
the Morning Briefing became `Briefing`, the Gem's "Update" prompt became `BriefingUpdate`
(feat-038), and the CSV terrain map is engine-owned. The model supplies perception and judgment;
the engine supplies all computed fields (e.g. `rr` from `riskReward.ts`, validated terrain
borders).

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
    currentPosition: string[],        // >=2 bullets: price location vs multi-timeframe structure + Rip status
    structuralArchitecture: string[], // >=2 bullets: active acceptance zones / void zones (Elevator Shafts)
    orderFlowContext: string[],       // >=2 bullets: delta initiative; MUST carry the Active Pattern Scan verdict
    keyInflections: { level: number, why: string }[]   // why each level matters right now (max 2)
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
  entries: { label, price, trigger }[],   // exactly ONE: Entry A (Ideal) / Entry A (Fade)
  stops:   { label, price, invalidation }[], // exactly ONE protective stop
  targets: { label, price, description }[], // label: 'T1' | 'T2' | 'T3'; T3 must be Trench/Wall
  rr: number              // computed by riskReward.ts — not invented by the model
}
```

- `terrain.zones[]` must be **contiguous** (no gaps): the bottom of zone N equals the top of zone
  N+1. The engine assembles and validates these borders.
- Target rung semantics (from the Gem's Strategic Alignment table). The **full T1 → T2 → T3
  ladder is mandatory** whenever distinct engine borders exist in the trade direction, and each
  objective carries **exactly one entry (Entry A) with one protective stop** (primary: Ideal;
  secondary: Fade — never an Entry B / add-on / breakout rung) — fewer targets only when the
  map genuinely offers no further rung:
  - **T1 (Tactical)** — the first obstacle / immediate S/R in the trade direction.
  - **T2 (Objective)** — the next acceptance border (the standard target).
  - **T3 (Campaign Max)** — the full traverse of the HTF distribution / a major HTF MGI at an LVN.
    T3 must land on a Valley (Trench) or Shelf (Wall) at the NEAR edge of the void being traversed —
    never a Magnet (see Magnet Prohibition in `system/constraints.md`), and never a level that can
    only be reached by crossing a second void.

## `BriefingUpdate` (output of `update-task` — the "Run Update" button)

The Gem's "Update" prompt as a structured contract: a lighter re-read between full briefings. It
regenerates the **Strategic Alignment** (primary / secondary / danger zones) against the previous
briefing, prefixed by an **Immediate Tactical Read**.

```
BriefingUpdate = {
  meta: BriefingMeta,     // same meta block as Briefing
  tacticalRead: {
    location,             // 1-line: current zone + immediate borders above/below
    ripStatus,            // 1-line narrative read: "Holding as support" / "Breached" / "Flipped to resistance"
    initiative            // 1-line: who has control based on current delta/telemetry
  },
  primary:   Objective,   // fresh — same Objective shape as Briefing
  secondary: Objective,
  dangerZones: { area: string, why: string }[]
}
```

- There is **no `overview` or `terrain`** in the update: those carry forward from the previous
  briefing. Persistence composes a full `Briefing` (parent overview/terrain + fresh alignment)
  before storing, so downstream consumers always see a complete briefing.
- The previous briefing is embedded in the update prompt as inherited context; objectives should
  stay consistent with its terrain unless fresh engine facts contradict it (flag the drift in the
  rationale when they do).
- `tacticalRead.ripStatus` is the narrative read; `meta.ripStatus` stays the code-owned engine
  condition, exactly as in `Briefing`.

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
  qualitative confirmation cues). The initiative gate is code-enforced in
  `lib/eval/validateEval.ts` and is COUNT-only (the window mean plays no part): an ENTER is
  demoted to WAIT when the counter side out-prints the entry side with at least 3 extreme bars in
  the recent window — unless the contradiction is an absorbed flush: counter-extreme prints with
  price still holding the area (the last bar has NOT closed beyond the earlier window's accepted
  closes in the flush direction), in which case the ENTER stands. Extreme counts are expected to
  carry the flush color right when an absorption entry confirms; only price closing out of the
  area turns them into counter-initiative.
