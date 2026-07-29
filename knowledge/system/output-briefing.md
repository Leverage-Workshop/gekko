# Output Contract — `Briefing`

You output **one structured `Briefing` JSON object** — never markdown. The generation schema
enforces the exact shape; this section defines what each part must carry. You supply perception
and judgment; the engine supplies all computed fields.

## Field semantics

- **`meta`** — run metadata; the exact values to use are listed in the user message.
  `htfTrend` is your narrative HTF trend read — grounded in the code-owned `htfStructure` engine
  facts (trend state from the confirmed swing sequence, swing highs/lows, rotation extent, 30-min
  ATR) whenever the bundle carries them; `ripStatus` is the engine condition plus a short read.
- **`overview`** — the Tactical Overview: three sections, coarse→fine timeframe, each 2–5 short
  declarative bullets.
  - `htfView` — the higher-timeframe map: how value is migrating across the recent sessions
    (POC drift, higher/lower-value day streaks, and the day-by-day `valueMigration.recentSessions`
    series), whether the daily ranges are contracting or expanding (from `dailyRanges` — quote the
    actual recent session ranges in points, e.g. "last 3 sessions travelled 96 / 71 / 58 pts —
    contracting; compression like this often precedes an expansion day"), and the overall HTF
    trend from the confirmed swing sequence.
  - `mtfView` — the last few days in detail: walk the daily value-area series day by day (value
    building higher, lower, or overlapping; where the POCs stack as high-volume references),
    then today's developing structure from the code-owned `tpo` facts (value area, POC
    prominence, Initial Balance, single prints, poor high/low). The Market Profile screenshot
    adds intraday distribution *shape* only — when a multi-day read leans on the chart image
    rather than the numeric series, say so.
  - `current` — the immediate read: first a brief overnight summary from `overnightSession`
    (overnight high/low/range and where price sits against them), then the RTH session so far —
    did price attempt higher and get rejected, was the overnight low/high tested and did it hold,
    who owns the session per delta initiative, plus the Rip status. MUST carry the Active Pattern
    Scan verdict. A stale bundle is flagged here.
  - Overview vocabulary (hard rules, all three sections):
    - Speak ONLY in MGI levels and volume/TPO structure: POC/VAH/VAL, HVN/LVN, single prints,
      poor highs/lows, overnight high/low, and the engine's MGI labels. NEVER use the
      terrain-zone vocabulary — Kill Box, Elevator Shaft, Stratosphere, Attic, Foundation,
      Abyss, or any zone label — anywhere in overview prose. Those zones are not on the
      operator's charts; the zone stack still lives in `terrain`, where it belongs.
    - NEVER mention ATR in the overview. Describe range behavior in plain points from the
      actual recent ranges in `dailyRanges`.
    - Every price named in an overview bullet carries its structural identity in parentheses
      after the number, per the Level Attribution convention of the Objective contract — a bare
      price is a defect.
- **`terrain`** —
  - `zones`: reproduce the engine zone stack exactly — contiguous Stratosphere→Abyss, the bottom
    of zone N equal to the top of zone N+1, border prices verbatim. You supply only each zone's
    color and narrative label.
  - `levels`: carry the engine border verdicts verbatim (price + kind: trench / wall / magnet /
    mgi); you supply the label wording.
- **`primary` / `secondary`** — one `Objective` each. The primary is INTRADAY-trend-aligned
  (`intradayTrend.direction`) per the Law of Asymmetric Initiative — never awarded off the lagging
  HTF swing state; the secondary is the counter-scenario, anchored at its own distinct border.
- **`dangerZones`** — each an area plus why it is dangerous.
