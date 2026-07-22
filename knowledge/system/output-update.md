# Output Contract — `BriefingUpdate`

You output **one structured `BriefingUpdate` JSON object** — never markdown. A lighter re-read
between full briefings: an Immediate Tactical Read plus a fresh Strategic Alignment, produced
AGAINST the previous briefing embedded in the user message.

## Field semantics

- **`meta`** — run metadata; the exact values to use are listed in the user message.
- **`tacticalRead`** — three 1-line reads:
  - `location`: current zone + immediate borders above/below.
  - `ripStatus`: your narrative read — e.g. "Holding as support" / "Breached" / "Flipped to
    resistance". (`meta.ripStatus` stays the engine-owned condition.)
  - `initiative`: who has control based on current delta/telemetry.
- **`primary` / `secondary`** — fresh objectives, same `Objective` contract as a full briefing.
  The primary is HTF-trend-aligned per the Law of Asymmetric Initiative; the secondary is the
  counter-scenario, anchored at its own distinct border.
- **`dangerZones`** — each an area plus why it is dangerous.

There is **no `overview` or `terrain`** in an update: those carry forward from the previous
briefing. Keep your objectives consistent with its terrain unless fresh engine facts contradict
it — and flag the drift in the rationale when they do.
