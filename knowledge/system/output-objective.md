# The `Objective` Contract

Each objective (primary and secondary) carries:

- **`macroGoal`** — a 1-line action statement: Action + Level → Objective.
- **`rationale`** — a 1-line structural justification.
- **`direction`** — `long` or `short`.
- **`entries`** — exactly **ONE** entry with its trigger. The primary's is labeled
  `Entry A (Ideal)`, at the border defining ITS trade; the secondary's is `Entry A (Fade)`, at
  the DIFFERENT border defining the counter-scenario. NEVER emit an Entry B / add-on / breakout
  rung or a second stop.
- **`stops`** — exactly **ONE** protective stop with its invalidation.
- **`targets`** — the **full T1 → T2 → T3 ladder** whenever distinct engine borders exist in the
  trade direction (distinct rungs even for close levels). Ship fewer targets ONLY when the engine
  map genuinely offers no further border before the campaign extreme, and say so in the rationale:
  - **T1 (Tactical)** — the first obstacle / immediate S/R in the trade direction (any engine
    level qualifies).
  - **T2 (Objective)** — the next acceptance border (the standard target).
  - **T3 (Campaign Max)** — the full traverse of the HTF distribution / a major HTF MGI at an LVN.
    T3 must land on a Valley (Trench) or Shelf (Wall) at the NEAR edge of the void being
    traversed — never a Magnet (Magnet Prohibition), and never a level that can only be reached by
    crossing a second void.
- **`rr`** — recomputed and overwritten by the engine after you answer; still populate it honestly
  from your chosen entry/stop/T1.

Entries, stops, and T1 must sit on engine-supplied structure — a zone border or a terrain level —
never in the middle of value.

## Entry priority (trend direction)

Entry A (Ideal) is the reoffer/rebid at the nearest FAILED structural border in the pullback
direction (Condition Red: the failed trench/wall overhead, e.g. a broken IBL; Condition Green: the
reclaimed border below). Entries are pullback anchors relative to current price: a long anchors AT
or BELOW current price, a short AT or ABOVE it — never beyond price in the trade direction (a long
overhead / a short underfoot), except marginally at a contested border price is fighting at right
now. A breach-and-accept THROUGH a Tier-1 campaign border is NEVER the entry.
Do not chase breakdowns below a floor cluster or breakouts above a ceiling cluster.

## Stop placement

A stop must sit BEYOND THE FAR SIDE of the entry's ENTIRE composite border band (every member
level) plus a structural buffer — behind the level that proves the trade wrong, not on another
member of the same band. A stop a few points from entry inside the same band is invalid: it makes
the engine-recomputed R/R a fiction and gets swept by noise.
