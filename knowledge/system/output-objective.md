# The `Objective` Contract

Each objective (primary and secondary) carries:

- **`macroGoal`** — a 1-line action statement: Action + Level → Objective. Every price it
  states carries its structural identity per the Level Attribution rule below — name the MGI
  level(s) at that price, e.g. "Short the reoffer at 28212.5 (PDL / PW Low) → 28050 (VRange −2)".
- **`rationale`** — a 1-line structural justification.
- **`direction`** — `long` or `short`.
- **`entries`** — exactly **ONE** entry with its trigger. The primary's is labeled
  `Entry A (Ideal)`, at the border defining ITS trade; the secondary's is `Entry A (Fade)`, at
  the DIFFERENT border defining the counter-scenario. NEVER emit an Entry B / add-on / breakout
  rung or a second stop.
- **`stops`** — exactly **ONE** protective stop with its invalidation.
- **`targets`** — **ONE or TWO** rungs, nearest first, the conclusion LAST. Pick T2 first, then
  place T1 inside the traverse:
  - **T2 (Conclusion)** — your best structural estimate of where THIS move realistically concludes
    when it plays out reasonably well: the far side of the structure being traversed (an LVN return
    over a distribution concludes at the distribution's opposite side; a rotation off a failed
    border runs to the next acceptance area's far edge). NOT the homerun — the full HTF campaign
    traverse is narrative context, never a target rung; a T2 that requires everything to go right
    is mis-set. T2 must land on a Valley (Trench) or Shelf (Wall) at the NEAR edge of any void
    beyond it — never a Magnet (Magnet Prohibition), and never a level that can only be reached by
    crossing a second void.
  - **T1 (Tactical)** — an engine structure level BETWEEN entry and T2, ideally near the midpoint
    of the entry→T2 traverse — latitude toward whichever real border sits closest to that midpoint.
    The first obstacle a few points from entry is NOT T1 unless the map genuinely offers nothing
    deeper.
  The two-rung **T1 → T2** ladder is the expected shape whenever the engine map offers distinct
  structure between entry and T2. When it offers none, ship the **single-target variant**: one
  rung, labeled **T2** — it IS the conclusion and the R/R gate measures to it; never label a sole
  target T1 — and say in the rationale that no intermediate rung exists. Never emit a T3.
- **`rr`** — recomputed and overwritten by the engine after you answer; still populate it honestly
  per the Constraints formula: `(entry→T2 distance) / 25` — the fixed 25-pt operational stop,
  gating on the conclusion (your LAST listed target), never on your structural stop or T1.

Entries, stops, and T1 must sit on engine-supplied structure — a zone border or a terrain level —
never in the middle of value.

## Level attribution

Every price you state anywhere in an objective — `macroGoal`, `rationale`, entry `label` and
`trigger`, stop `invalidation`, target `description` — names the structure it sits on, in
parentheses right after the number. When the price is (or clusters with) MGI level(s), name them
with their engine labels — the composite border's member labels or the `mgiPriority.levels`
label: "28212.5 (PDL / PW Low)", "reoffer at 28201.43 (IBL / PW Low trench)". A composite border
names ALL its members. When the price is engine structure with no MGI member — an LVN/HVN node, a
balance-area border, a TPO level — name that structure instead: "28210 (LVN, balance-area
profile)", "28226 (poor low)". A bare price the operator must cross-reference against the terrain
map is a defect.

## Entry priority (trend direction)

Entry A (Ideal) is the reoffer/rebid at the nearest FAILED structural border in the pullback
direction (Condition Red: the failed trench/wall overhead, e.g. a broken IBL; Condition Green: the
reclaimed border below). Entries are pullback anchors relative to current price: a long anchors AT
or BELOW current price, a short AT or ABOVE it — never beyond price in the trade direction (a long
overhead / a short underfoot), except marginally at a contested border price is fighting at right
now. A breach-and-accept THROUGH a Tier-1 campaign border is NEVER the entry.
Do not chase breakdowns below a floor cluster or breakouts above a ceiling cluster.

A single-print scar or low-volume void adjacent to a border is a feature of the trade, not a veto:
single prints mark one-sided initiative and FAVOR entries in the direction of the move that created
them. When a structural border sits at the NEAR edge of a scar or void, that near-edge border IS the
fade anchor — the rally (or flush) back into it is the reoffer/rebid the entry trigger expresses.
Exiling the entry to the structure at the FAR side of the zone because the scar "might get repaired"
defers the trade instead of defining it (2026-07-27: a briefing's own key inflection authorized the
counter-short at the 28201.43 trench at the near edge of a single-print scar, then shipped the short
436 pts overhead at the far-side structure — unactionable).

The same near-edge principle governs fakeout-formed extremes. A High/Low MGI level (an IB
boundary, a session or overnight high/low, a prior-day/week/month extreme) is the PRINT of the
move that created it, and that move may have been a pre-reversal fakeout — a thin spike through
structure that immediately reversed, leaving the extreme at the far end of a thin low-volume
tail. An extreme formed that way rarely re-trades: the rebid/reoffer forms where the actual
action ended — the tail's near-edge acceptance boundary — not at the extreme print. The engine
runs this formation test FOR you: `fakeoutTails` in the engine facts lists every flagged
extreme with its `acceptanceEdge` LVN node and the tail evidence. A listed extreme IS
fakeout-formed — treat the finding as data, never re-derive or dispute it, and never counter it
with composite/balance-area acceptance (the trade-horizon profile governs where retests stall).
Anchor the fade at the listed acceptance edge, naming the node in the label (e.g. "28112
(taper-edge LVN)"), with the MGI extreme at the tail's end as the stop-side reference. An entry
at the extreme demands price traverse the whole tail again and usually goes unfilled
(2026-07-31: fade shipped at the IBL 28079.75 print at the far end of a ~30-pt tail; the retest
reversed at the ~28112 acceptance edge and never came within 40 pts of the entry). What stays
your judgment is only the exception: when the flush to the extreme is the trade you actually
want — a campaign border or major HTF cluster sits AT the extreme, or initiative shows the tail
being actively repaired — anchoring at the flagged extreme is legitimate, but the rationale
must say so explicitly; an entry at a flagged extreme without that justification is a defect.

## Stop placement

A stop must sit BEYOND THE FAR SIDE of the entry's ENTIRE composite border band (every member
level) plus a structural buffer — behind the level that proves the trade wrong, not on another
member of the same band. A stop a few points from entry inside the same band is invalid: it makes
the engine-recomputed R/R a fiction and gets swept by noise.
