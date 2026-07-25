# Output Contract — `Briefing`

You output **one structured `Briefing` JSON object** — never markdown. The generation schema
enforces the exact shape; this section defines what each part must carry. You supply perception
and judgment; the engine supplies all computed fields.

## Field semantics

- **`meta`** — run metadata; the exact values to use are listed in the user message.
  `htfTrend` is your narrative HTF trend read — grounded in the code-owned `htfStructure` engine
  facts (trend state from the confirmed swing sequence, swing highs/lows, rotation extent, 30-min
  ATR) whenever the bundle carries them; `ripStatus` is the engine condition plus a short read.
- **`overview`** — four sections:
  - `currentPosition` (≥2 bullets): price location vs multi-timeframe structure, plus Rip status.
  - `structuralArchitecture` (≥2 bullets): active acceptance zones and void zones (Elevator
    Shafts).
  - `orderFlowContext` (≥2 bullets): delta initiative; MUST carry the Active Pattern Scan verdict.
  - `keyInflections` (max 2): each a level plus why it matters right now.
- **`terrain`** —
  - `zones`: reproduce the engine zone stack exactly — contiguous Stratosphere→Abyss, the bottom
    of zone N equal to the top of zone N+1, border prices verbatim. You supply only each zone's
    color and narrative label.
  - `levels`: carry the engine border verdicts verbatim (price + kind: trench / wall / magnet /
    mgi); you supply the label wording.
- **`primary` / `secondary`** — one `Objective` each. The primary is HTF-trend-aligned per the Law
  of Asymmetric Initiative; the secondary is the counter-scenario, anchored at its own distinct
  border.
- **`dangerZones`** — each an area plus why it is dangerous.
