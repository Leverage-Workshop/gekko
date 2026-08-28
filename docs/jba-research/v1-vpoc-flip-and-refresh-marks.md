# v1 — two studies to start with: the VPOC flip, and refresh marks on the DOM

Scoped down from [`execution-steps.md`](./execution-steps.md) at the operator's request
(2026-08-27): *"what I really need to be able to see just to start with is two things — the vpoc
flip, and order refreshing on the DOM."* Everything here is buildable next session from Sierra's
time & sales and per-bar volume-at-price; no depth API, no baseline database, no Dominator, no pull
stack. Sources: the replays and the ACSIL headers only.

---

## Study 1 — Period VPOC & Flip

**What Job does with it.** The developing volume POC of the current 30-minute period is his main
filter for *whether* a level can be engaged: POC at an extreme of the period is "crowded" and he
expects a push away; central is two-way trade; the shift back toward where it was is "the sign";
he calls entering before the shift "preemptive" and sizes down when trading against it
([04-30 @0:19](https://youtu.be/5124WmFuurg?t=19), [@4:08](https://youtu.be/5124WmFuurg?t=248),
[@4:39](https://youtu.be/5124WmFuurg?t=279), [@30:14](https://youtu.be/5124WmFuurg?t=1814),
[@35:14](https://youtu.be/5124WmFuurg?t=2114); [07-17 @2:04](https://youtu.be/glG8-dCLba0?t=124)).
Two things he says about reading it live: the first couple of minutes of a period are noise
([04-30 @32:45](https://youtu.be/5124WmFuurg?t=1965)), and the flip shows up at different times on
different compressions — his chart runs **4-tick compression** to match his DOM
([07-17 @6:18](https://youtu.be/glG8-dCLba0?t=378)).

**Chart.** The NQ execution chart (volume bars), `sc.MaintainVolumeAtPriceData = 1`.

**Computation.**

| | |
| --- | --- |
| Period | fixed 30-minute clock periods anchored to the RTH open (A, B, C…). Period membership is by bar *start* time — a volume bar that straddles a boundary belongs to the period it opened in. That is an approximation of up to one bar at each boundary; it is disclosed on the label, not hidden |
| Bins | `bin = floor(PriceInTicks / compression)`, integer ticks from `sc.VolumeAtPriceForBars` (`GetSizeAtBarIndex` / `GetVAPElementAtIndex`), never floating-point prices. Compression input, default **4** (the operator's NQ setting, not a universal rule) |
| Developing POC | the max-volume bin over the period's bars so far. **Tie rule:** keep the prior POC bin if it is still tied; otherwise the tied bin nearest the prior POC. Without this, ties print false flips |
| Position | `pos = (POC − periodLow) / (periodHigh − periodLow)` in 0..1; badge `POC LOW · crowded` (pos ≤ 0.2), `central · two-way` (0.2–0.8), `POC HIGH · crowded` (≥ 0.8) |
| **Flip** | developing POC crosses the developing range **midpoint** and lands at least one bin from its prior side — **after** the period has ≥ `V_min` volume (default: 20 % of the prior period's total; a plain minimum contracts input as fallback for A period). One definition, deterministic |
| Prior period | the previous period's final POC kept as a dotted line, labelled `Prior Period POC` — the "where it was" he looks back to; not labelled as a target |

**Outputs (subgraphs).** `POC` (price; line) · `Position` (0..1) · `Flip` (+1 = flipped up, −1 =
flipped down, on the bar it happened) · `PriorPOC` (dotted line) · `PeriodVolume`.

**Render.** POC line coloured by position (red-ish at the low extreme, green-ish at the high, grey
central); flip → a marker on the bar plus text `FLIP ▲ B period` ; badge text at the right edge of the
current bar. Optional second instance for the RTH session POC — same code, period = session.

**Inputs.** compression ticks (4) · period (30 min, anchored to RTH open) · `V_min` rule (% of prior
period, default 20; absolute fallback) · extreme thresholds (0.2 / 0.8) · colours.

**Deferred.** Rolling-N-minute mode; T&S-exact period boundaries; TPO (time) POC — a different object,
kept separate if it is ever added.

---

## Study 2 — Refresh Marks (two General Purpose DOM columns)

**What the operator asked for.** Two DOM columns that mark a price level when volume over a
threshold transacts there repeatedly, or when that activity is stepping in one direction; the mark
fades with time; and the level is a *band* of ticks, because on NQ the same fight spreads across
several ticks where on ES it sits on one.

**What Job means by refreshing**, so the mark is honest about what it shows. "Refreshing" is size at
a price being lifted and *coming back* — "stepping in to those orders, maintaining dominance, and
inability to get back above the prior levels where they were refreshing"
([06-26 @20:47](https://youtu.be/l4xvVNTE_H8?t=1247)); what he watches is "how it's moving and how
much interest is pulling in and out… are we actually refreshing?"
([06-26 @40:38](https://youtu.be/l4xvVNTE_H8?t=2438)). The companion signature on the tape is fills
that don't move price: "sweeps… but price is not moving at all and we're seeing replenishing… that's
potential absorption" (T&S 101 @2:49). And the thing that *ends* a mark is the offer stepping
down and protecting the next price — "stepping down, stepping down… the offer gets underneath,
begins to protect" ([04-24 @6:24](https://youtu.be/JMWo4IpN8yA?t=384)); "the offer stepping down
further into the 27s, that's where I pretty much know it's off"
([05-28 @10:18](https://youtu.be/bFU1dXf5uw8?t=618)).

**Data — T&S only, and why that is enough for v1.** `sc.GetTimeAndSales` returns every trade with
`Price`, `Volume`, `Type` (`SC_TS_ASK` = a buyer lifted the offer at that price, `SC_TS_BID` = a
seller hit the bid), millisecond time and a `Sequence`, **and every record carries `Bid`, `Ask`,
`BidSize`, `AskSize`** — the inside quote and its sizes (live, quote records of type
`SC_TS_BIDASKVALUES` also arrive between trades; in replay the sizes ride on the trade records —
`Studies.cpp` ~800–810). So at the price that is currently the best offer, the study can see a fill
*and then the ask size come back* without touching the depth API. That is a real refresh
observation, not a proxy. One tick away from the inside it cannot see size, so there the mark is
"repeated execution" only — and the cell says which.

**Bands.** Width = the DOM's own compression, read from
`sc.GetMarketDepthCombineIncrementInTicks(sc.ChartNumber)` so the column cells line up with the DOM
rows (NQ 4, ES 1); override input. Grid anchoring must match Sierra's combined rows — verify by
painting test labels at known prices once, and re-bin all cells if the increment changes intraday.

**Per band, per side, the state.**

| Field | Meaning |
| --- | --- |
| `runVolume` | volume of the current run of same-side fills in the band (ask column: `SC_TS_ASK` fills; bid column: `SC_TS_BID` fills) |
| `visits` | how many times price has come back to the band and traded there — a visit ends when price leaves the band, a new one starts on return (no millisecond episode logic) |
| `restored` | count of times, while the band held the best ask (bid), a fill at it was followed by the displayed size at the same price returning to ≥ `r_refresh ×` the pre-fill size — the refresh confirmation, available only at the inside |
| `heat` | 0..1, re-set to 1 on each qualifying fill, exponential decay with half-life `H` |
| `lastFill` | time of the last fill |

**Mark rule.** Paint the cell when `runVolume ≥ V_total` and `visits ≥ 2` (or `restored ≥ 1`) and
price has **not** accepted through the band — for the ask column, `N_clear` consecutive trades above
the band's upper edge clears it (the level was run, it is not defending); mirror for the bid column.

**Direction.** When a marked ask band's neighbour one row *closer to price* starts its own run while
the original is still hot, draw `▼` on the new cell — activity is migrating down, Job's "stepping
down and protecting". Mirror `▲` on the bid side. The chevron says the activity moved; T&S cannot
prove the same seller moved, and the cell does not claim it.

**Render (per cell).**

```
 ask column                       bid column
 ┌──────────────┐                 ┌──────────────┐
 │ 412 R ×3     │  <- volume,     │ 380 ×2       │
 └──────────────┘     R = refresh └──────────────┘
    background alpha = heat (fades to nothing);  ▼ / ▲ when stepping
```

`R` appears only when `restored ≥ 1` (size seen coming back at the inside); without it the cell is
repeated execution. Raw volume stays visible so thresholds can be calibrated by eye.

**Mechanism — confirmed with Sierra Chart engineering (support board, 2026-08-27 search).**
General Purpose columns 1 (bid) and 2 (ask) enabled on the Chart DOM / Trading DOM of the chart the
study is on. The study paints them through `sc.p_GDIFunction`, using
`sc.GetDOMColumnLeftCoordinate/RightCoordinate(DOM_COLUMN_GENERAL_PURPOSE_n)` for x and
`sc.RegionValueToYPixelCoordinate(price, sc.GraphRegion)` for y — exactly the path
`CalebTrades_AutomateZones.cpp` already uses to write text into General Purpose column 1 on this
machine. Sierra engineering's own statements:

- *"You can only draw in them using the Windows GDI"* and *"there is not a way to access any values
  in those columns"* — the General Purpose columns are drawing surfaces for ACSIL, nothing else
  ([thread 44036](https://www.sierrachart.com/SupportBoard.php?ThreadID=44036)).
- *"you cannot use subgraphs for that, you would need to use custom drawing (take a look at
  gdiexample.cpp)"* — said to a user building a **pulling/stacking-threshold highlighter in a DOM
  column**, who then shipped it with `GetAsk/BidMarketDepthStackPullValueAtPrice` + GDI
  ([thread 93622](https://www.sierrachart.com/SupportBoard.php?ThreadID=93622)).
- `GetDOMColumnLeftCoordinate/RightCoordinate` were added in v1620 precisely for this, alongside
  `GetCurrentTradedBidVolumeAtPrice/AskVolumeAtPrice`
  ([thread 29465](https://www.sierrachart.com/SupportBoard.php?ThreadID=29465)); the header also
  exposes `GetRecentBid/AskVolumeAtPrice` — Sierra's own per-price traded-volume counters, usable as
  a cross-check on the study's T&S accumulation.

Guards: if the column coordinates come back 0 (column not enabled), fall back to coloured rectangles
at price on the chart's right edge via `sc.UseTool`; there is one window handle per chart, so the
study draws only into the chart it is attached to — attach it to the Trading DOM's chart.

**Inputs.** band ticks (auto from DOM, override) · `V_total` (absolute contracts; separate saved
settings for NQ and ES — the corpus gives no transferable numbers) · `V_min` per fill to count ·
`r_refresh` (0.6) · half-life `H` (75 s) · `N_clear` (5 trades) · show chevrons · colours/alpha ·
log marked bands to file (for calibration).

**Deferred.** Depth-API replenishment beyond the inside; same-clock baselines; ratio thresholds
(v1 is absolute, visible, and logged so the numbers can be chosen from data); any link to a
state machine.

---

## What this does and does not give you

Together the two studies show, on one screen, the two things named: *has the crowd moved* (the
POC flip and where it sits), and *is the offer still there* (a hot `R` cell at the level that is
not clearing, versus a cell fading out or a `▼` walking down). They do not decide anything. The
sequence in `execution-steps.md` — arrive → defense → withdraw → take → accept — is what these two
displays are eventually read *against*; nothing in v1 depends on it.

## Built (2026-08-27) — source files and how to load them

Both studies are written, in `D:\SierraChart\ACS_Source`, each as its own DLL (they declare their
own `SCDLLName`, like the other Gekko studies). They have **not been compiled yet** — the build
happens inside Sierra Chart.

| File | Study name in Sierra | DLL |
| --- | --- | --- |
| `GekkoPeriodVpocFlip.cpp` | Gekko Period VPOC Flip | `Gekko Period VPOC Flip` |
| `GekkoRefreshMarks.cpp` | Gekko Refresh Marks (DOM columns) | `Gekko Refresh Marks` |

**Build:** Analysis ›› Build Custom Studies DLL ›› select one file ›› Build. Repeat for the other.
Compiler errors, if any, print in the Build window — send them back and they get fixed.

**Study 1 setup.** Add to the NQ execution chart. Inputs to check: *Period Anchor Time* = the RTH
open in the chart's time zone (default 08:30, Chicago); *Compression* 4. The badge at the last bar
reads `B · POC 21873.50 · LOW · crowded · pos 0.12 · vol 41k` and says `· warming` until the period
has traded its minimum volume (flips are suppressed until then). Hidden subgraphs `Position In
Range`, `Flip (+1/-1)` and `Period Volume` are there for alerts or other studies.

**Study 2 setup.** Add to the chart the Trading DOM is based on (Trade ›› Trading Chart DOM On, or
the Trading DOM window's chart). Enable the two General Purpose columns: Chart ›› Chart Settings ››
Chart DOM / Trade DOM columns ›› **General Purpose 1** (bid marks) and **General Purpose 2** (ask
marks). If they are not enabled the study paints the cells at the chart's right edge instead, so
it is visible either way. Global Settings ›› General Settings ›› Time and Sales: set the number of
records high enough for a few minutes of NQ. Cell text is `412 R x3 v` = decayed volume, `R` size
seen refreshing at the inside, `x3` visits, `v` activity stepped down into this row. Leave *Show
Unmarked Bands Dimly* on for the first sessions — it shows the raw numbers everywhere so *Mark
Volume* (default 300) can be set by eye; *Log Marked Bands To File* writes one CSV line per marked
band for the same purpose.

**Verify once, on a quiet moment:** that the ask/bid cells line up with the DOM rows (the study
assumes rows are centred on price and uses the DOM's combine increment as the band width; if the
grid looks offset by a row, set *Band Width In Ticks* explicitly and say so).

**Build order was:** Study 1 first (VAP only, no GDI, no T&S). Study 2 second, following the GDI
precedent in `CalebTrades_AutomateZones.cpp`.

**Reviewed.** Codex's pass on this v1 produced four corrections that are reflected above: volume bars
straddle clock boundaries (disclosed, bar-start membership); one deterministic midpoint-cross flip
plus a tie rule; T&S-only marks are "repeated execution" unless size restoration is actually seen —
hence the `R` flag from the record-level `AskSize`/`BidSize`, which Codex's review had not used;
and the chevron claims migration of activity, not of a participant.
