# HTF swing-level delta divergence — base-rate control (2026-08-12)

Run during feat-102 ("HTF order flow — cumulative delta and swing-level divergence"), which
requires controlling any directional claim against the unconditional base rate before it
reaches the model. **Result: swing-level HTF delta divergence has no measurable edge, and the
only replicable direction is CONTINUATION — the opposite of what the "divergence" label
implies.** It replicates the 2026-08-07 day-level negative result rather than rescuing it.

## Dataset

The committed `chart-data/htf_bar_data.rolling.csv` (593 bars) is far too small — it yields 18
divergent swings across 8 cells. The study instead unioned three live bundles from Supabase
storage (`raw_bundles.htf_csv_ref` → `bundle-csvs`, project `qvhkqilizwozikpomxob`):

| | |
|---|---|
| Bars (in-progress final bar dropped) | **3,559** — 6.0x the repo fixture |
| Range | 2026-04-26 17:00 .. 2026-08-12 13:00 chart time |
| Coverage | 94 calendar days / 78 trading days / 74 complete RTH sessions |
| Median 30-min Wilder ATR(14) | 76.5 pts (p10 48.3 / p90 118.8) |

Union integrity: the rolling ~2,916-bar windows overlap, so the union is contiguous with no
gaps. Only 2 timestamps disagreed across exports — both the in-progress last bar of an older
export, correctly superseded. 592 of 593 rows match the repo fixture byte-for-byte (the
difference is again that file's in-progress bar).

**This is the largest HTF series obtainable from live storage.** The export is a 90-day rolling
window, so it does not grow past ~2,916 bars.

## Definitions

Ported from the codebase, not re-derived: `htfStructure.SWING_PIVOT_STRENGTH = 5` (strict
fractal); `barFlow.detectDivergence()` with `FRESH_FRACTION = 1/3`, `DELTA_TREND_EPSILON = 50`,
`PRICE_EPSILON = 0.25`; `parseHtfBars` delta convention `Ask − Bid`; `rthSessions` /
`overnightSession` for day clustering.

**No lookahead:** forward outcomes are measured from the **confirmation bar** (`pivot + 5`), not
the pivot bar. Pivots confirm 2.5 h late; measuring from the pivot would be lookahead bias and
would invalidate the study. Classification reads only bars at or before the pivot; ATR is
trailing-only.

Two divergence definitions were tested — **A**, the barFlow window port (W ∈ {20, 34, 68}), and
**B**, swing-to-swing (fresh extreme vs prior confirmed swing) — each with the literal `eps=50`
and a volume-scaled `eps=324` (the literal constant is calibrated on 750-volume execution bars
and is effectively 0 on 30-min HTF bars).

## Swing counts

| | count |
|---|---|
| Confirmed swing highs / lows | 206 / 216 |
| Classifiable | 421 |
| Divergent (primary spec: A, W=20, eps=50) | **89** = 50 bearish + 39 bullish |
| Non-divergent | 332 |
| Distinct trading days carrying the 89 events | 55 (max 4/day) |

## Conditional vs unconditional

"Win" = the fade thesis paid. Control = the same signed statistic at every bar.

| h (bars) | ~time | n | eff. n | divergent fade-win | unconditional | lift | day-clustered 95% CI |
|---|---|---|---|---|---|---|---|
| 4 | 2h | 89 | 89 | 42.7% | 49.4% | **−6.7pp** | [32.3, 53.8]% |
| 8 | 4h | 89 | 84 | 43.8% | 49.4% | **−5.6pp** | [33.3, 54.2]% |
| 16 | 8h | 89 | 70 | 42.7% | 49.4% | **−6.7pp** | [32.2, 54.2]% |
| 34 | ~1 session | 89 | 52 | 38.2% | 49.5% | **−11.3pp** | [26.8, 50.0]% |

Every CI contains the base rate; every lift is negative. Drift-adjusted effect sizes (the tape
rose +2,491 pts over the window, so the per-side unconditional mean is subtracted per event)
run −21.9 pts (−0.29 ATR) at h=4 to −84.6 pts (−1.11 ATR) at h=34, with median and 10%-trimmed
means agreeing — a stable continuation tilt, not an outlier artifact.

**The control that decides the feature.** The divergent group is a fresh price extreme *by
construction*, so the comparison that isolates the delta is divergent vs **delta-confirmed**
fresh extremes (definition B):

| h | divergent (n=63) | delta-confirmed (n=150) | diff (win pp) | diff (pts) |
|---|---|---|---|---|
| 4 | 44.4% / −17.2 | 54.0% / +4.3 | −9.6pp | −21.5 |
| 8 | 47.6% / −3.8 | 47.7% / −14.1 | −0.0pp | **+10.3** |
| 16 | 46.0% / −47.5 | 48.0% / −21.5 | −1.9pp | −26.0 |
| 34 | 42.9% / −65.7 | 40.5% / −48.8 | **+2.3pp** | −16.9 |

The sign flips between horizons. Hold "fresh extreme" fixed and the delta's own contribution is
small and inconsistent — the price extreme is doing the work, not the order flow.

## Significance

Day-blocked placebo (89 events on only 55 days) + ATR normalization + Holm across 4 horizons:
the whole-signal effect **fails at every horizon in both points and ATR**. ATR normalization
roughly halves the effect and kills its significance, which means much of the raw-points result
was divergent swings clustering in high-volatility stretches.

One cell survived Holm (delta-only, h=4, p=0.038, −0.33 ATR) and should not be believed:
adjacent h=8 is a flat null while h=34 is nowhere (a real microstructure effect does not vanish
at 4 h and return at 8 h); it never appeared in the ATR-normalized test; it points
**continuation**, i.e. it says the divergence reading is wrong; and it emerged from a 64-cell
grid run before the primary spec was named. Across the whole grid, **1 of 64 cells reached raw
p<0.05 — fewer than the 3.2 expected by chance.** 56 of 64 cells had negative lift, but those
cells share swings, so that shows the direction is stable, not that it is significant.

## Power — the reason this cannot be revisited by collecting more data

At n=89, only enormous effects are detectable: 14.7 pp win-rate lift, or 0.40 ATR at h=4 /
0.79 ATR at h=16 / 1.16 ATR at h=34. Divergent swings arrive at 1.14 per trading day:

| target | n needed | trading days |
|---|---|---|
| 5 pp win-rate lift | 800 | ~700 (~2.8 yr) |
| 0.25 ATR at h=16 | 898 | ~790 |
| 0.25 ATR at h=34 | 1,931 | ~1,700 (~6.8 yr) |

The live export is a ~90-day rolling window. Every percentage above carries a CI ~±11 pp wide;
forward windows overlap (effective n falls 89 → 52 at h=34); and the entire sample sits in one
up-trending regime, so nothing here generalizes to a down-trend or a range.

## Day-level replication (the known trap, re-checked)

| lookback | class | n | fade-win | base | lift |
|---|---|---|---|---|---|
| 3d, +1d | bearish (fresh day high, delta fails) | 24 | 45.8% | 52.1% | −6.2pp |
| 5d, +1d | bearish | 21 | 42.9% | 52.1% | −9.2pp |
| 3d, +1d | bullish (fresh day low, delta holds) | 6 | 16.7% | 47.9% | −31.3pp |

Same sign as swing level, same sign as the 2026-08-07 finding.

## Separate finding — multi-day cumulative delta is hazardous as a bare number

```
series price    : 27403.25 -> 29894.00   (+2,491 pts)
series cum delta:        0 -> -53,901 contracts
```

Price rose strongly while HTF cumulative delta fell. The running cumulative delta carried the
**opposite sign to realised price direction on 60 of 78 trading days (77%)**.
corr(ΔPrice, ΔCumDelta) decays 0.62 (1 bar) → 0.54 (34) → 0.46 (136): per-bar delta tracks its
own bar's move (near-tautological), but at multi-day scale the *level* is dominated by an
arbitrary start point — wherever the rolling export happens to begin. A model handed
"cumulative delta: −53,901" would plausibly narrate distribution into a tape that rose 2,491
points.

**Consequence for feat-102:** cumulative delta ships window-anchored and always paired with the
price change over that same window, never as a bare signed total, and the prompt documentation
states that its sign does not predict the sign of price change.

## What is safe to ship

```
delta at confirmed swing HIGH bars: n=206  median  +44   55% positive
delta at confirmed swing LOW  bars: n=216  median -121   36% positive
volume at swing highs: median 7,526   lows: 7,662   all bars: 4,866
```

Swings print ~55% more volume than a typical bar — real, checkable, non-directional. Per-swing
delta and volume annotation is the feature's actual deliverable.

## Decision

`divergence` is **computed by the engine and withheld from the prompt payload**, with a test
pinning the omission so it cannot silently start shipping. Dropping it from the engine entirely
was considered and rejected: keeping it computed and tested means a future study can license it
with a one-line change, and the field documents the negative result at the point of use.

Do not re-propose swing-level delta divergence as a directional or fade signal without new data
that clears the power table above.

## Reproduction

Scripts (deterministic, seed `20260812`) are archived under `scripts/studies/htf-delta-divergence/`.

`build_dataset.py` does NOT fetch — it unions CSVs already cached in its `data/` directory,
named `<bundle-id>.csv`. Download those first via the `gekko-db` skill
(`.claude/skills/gekko-db/SKILL.md`): read `raw_bundles.htf_csv_ref` for the three bundle ids
listed in the script's `SOURCES` (`0fdd60d9…`, `1c15934a…`, `ef221fc6…`) and pull each from the
`bundle-csvs` storage bucket. The `data/` cache and the 258 KB `union.csv` it produces are
deliberately not committed — the bundles are reproducible from storage.

```bash
python3 build_dataset.py            # data/<bundle-id>.csv -> union.csv (validates overlap agreement)
python3 swing_divergence_study.py   # 64-cell grid + base rates + power
python3 confirm.py                  # primary, like-for-like, multiplicity, split-half, day-level
python3 decompose.py                # drift-adjusted effect, 2x2, cumulative delta
python3 stress.py                   # robustness, placebo, stratified
python3 final_check.py              # day-blocked placebo, ATR normalization, Holm
```
