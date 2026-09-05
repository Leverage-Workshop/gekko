# Dominator 2.0 calibration log

Operator's own Dominator 2.0 settings on the NQ execution chart, tracked per Job's rule: **frequency
first, then hit rate, and only then move a dial** (see
[`../dominator-2-0-explained.md`](../dominator-2-0-explained.md#choosing-your-settings-by-efficacy-not-by-taste)).
This folder holds the screenshots, the exports, the extracted event list, the scoring scripts, and the
read. **The settings review with per-Dominator verdicts is
[`report-2026-09-05.md`](./report-2026-09-05.md).** This file is the method and data record.

## Settings (as of 2026-09-05)

Chart session 08:30:00 to 08:29:59 CST, i.e. anchored at the RTH open as Job recommends. Every
setting prints point-on-high / point-on-low in one colour per setting.

| Colour | Volume | Window | Screenshot |
| --- | --- | --- | --- |
| White | 7250 | 60 min | [`2026-09-05-white-7250v-60min.png`](./2026-09-05-white-7250v-60min.png) |
| Magenta | 7250 | 30 min | [`2026-09-05-magenta-7250v-30min.png`](./2026-09-05-magenta-7250v-30min.png) |
| Cyan | 6750 | 30 min | [`2026-09-05-cyan-6750v-30min.png`](./2026-09-05-cyan-6750v-30min.png) |
| Yellow | 5250 | 60 min | [`2026-09-05-yellow-5250v-60min.png`](./2026-09-05-yellow-5250v-60min.png) |
| Red | 4500 | 60 min | [`2026-09-05-red-4500v-60min.png`](./2026-09-05-red-4500v-60min.png) |

Hue tracks weight on purpose: the heaviest setting is the brightest, the two 30-minute settings sit
in the cool half. Before 2026-09-05 the five shared three near-identical colours (two oranges, two
purples, one yellow) and could not be told apart at dot size.

Window covered: RTH 2026-08-20 (partial) through 2026-09-05 10:20 CST. Eleven full sessions.

## The data

`data/` holds two kinds of Sierra *Write Bar and Study Data To File* exports:

| File | What it is | Used for |
| --- | --- | --- |
| `data/<volume> Volume <window> Min.txt`, five files | **The hidden volume-bar (DND) charts themselves**, one per setting: volume bars with start time to the millisecond, OHLCV, one `Buy Aggression, Sell Aggression` pair. full Globex sessions, 44 trading days 2026-07-07 to 2026-09-04 (52 calendar dates including Sunday evenings); overnight bars are about an hour long each | **Primary.** Exact bar intervals, so the moment a print is certainly known is exact |
| `data/9_5_26.txt` | The 5-minute display chart with all five studies overlaid, 22 sessions from 2026-08-06, 08:30 to 13:55 CST | Secondary. Confirms the column order and cross-checks the DND events |

The two 7250 files share one DND chart (identical bars), which settles the column order in the
5-minute file: the pair order there is 7250v60, 7250v30, 6750v30, 5250v60, 4500v60, confirmed by
matching prints (22 of 23, 27 of 28, 30 of 30, 42 of 42, 44 of 44).

Scripts, run from the repo root:

```bash
node docs/jba-research/dominator-calibration/score-dnd.mjs      # primary: events.csv + every table below
node docs/jba-research/dominator-calibration/score-prints.mjs   # secondary: prints.csv from the 5-min overlay
node docs/jba-research/dominator-calibration/extract-prints.mjs # fallback: dots from screenshots
```

## Facts about the print itself

- **The print price is the bar extreme plus or minus exactly 5 points**, on all 1,761 print bars
  across the five files. A sell print is its bar's high plus 5, a buy print its bar's low minus 5.
  Subtract it before using the print as a level.
- **The study re-prints on consecutive bars while the anomaly holds.** Runs reach 10 bars. A run
  is one *event*; the counts and scores below are per event, not per bar.
- **The 5-minute overlay under-counts.** It showed 23 of 25 day-session events for 7250v60 and 42
  of 52 for 5250v60 on the shared window, because two events inside one 5-minute bar collapse to
  one. The DND files are the record.
- **The stamped time is the bar's start.** In the DND files the bar's end is the next bar's start,
  so "the print is certainly known" is pinned to the end of the event's first bar. Whether the arrow
  appears earlier, during the bar, is still unobserved.
- **Median DND bar length** in the day session is about 6 minutes for the 7250 bars, 4 for the
  4500 bars, about half that in the first hour and double after noon. Overnight a bar runs about
  an hour, so overnight scoring is one bar per window and too coarse to trust.
- **Windows never cross the 16:00 to 17:00 halt.** Events whose window would are dropped.

## Counts, 44 trading sessions, day session 08:30 to 14:00 CST

| Setting | Events | Buy | Sell | Per session | Longest gap | Sessions with none | Shares one DND chart with |
| --- | --- | --- | --- | --- | --- | --- | --- |
| White 7250v 60min | 65 | 24 | 41 | 1.48 | 4 | 12 | 7250v 30min |
| Magenta 7250v 30min | 81 | 44 | 37 | 1.84 | 2 | 10 | 7250v 60min |
| Cyan 6750v 30min | 91 | 43 | 48 | 2.07 | 3 | 12 | nothing |
| Yellow 5250v 60min | 112 | 39 | 73 | 2.55 | 2 | 5 | nothing |
| Red 4500v 60min | 114 | 43 | 71 | 2.59 | 1 | 2 | nothing |

All five clear Job's frequency filter. The 60-minute settings still lean sell, about 5 to 3, over a
sample that is no longer down-leaning (the earlier 3 to 1 was mostly the August sample).

Events of one setting with a same-side event of another starting within 10 minutes:

| | 7250v60 | 7250v30 | 6750v30 | 5250v60 | 4500v60 |
| --- | --- | --- | --- | --- | --- |
| 7250v60 (of 65) | | 24 | 23 | 36 | 30 |
| 7250v30 (of 81) | 24 | | 48 | 20 | 18 |
| 6750v30 (of 91) | 22 | 49 | | 22 | 25 |
| 5250v60 (of 112) | 38 | 21 | 22 | | 50 |
| 4500v60 (of 114) | 31 | 20 | 26 | 52 | |

Two echo pairs: the two 30-minute settings share about 55 to 60 percent of their events, the two
light 60-minute settings about 45 percent.

## What happens after a print

Reference is the close of the event's first bar, taken at that bar's end. Windows are wall-clock
minutes after that. MFE is the furthest price went in the print's direction, MAE the furthest
against it, medians in points. Baseline is every day-session bar treated the same way.

| Setting | 60-min MFE | 60-min MAE | Ratio | Closed in print direction | July / Aug+ ratio |
| --- | --- | --- | --- | --- | --- |
| 7250v 60min | 94.8 | 50.8 | 1.87 | 63% | 1.84 / 2.01 |
| 7250v 30min | 49.3 | 64.3 | 0.77 | 50% | 0.78 / 0.66 |
| 6750v 30min | 39.3 | 65.5 | 0.60 | 45% | 0.73 / 0.51 |
| 5250v 60min | 78.0 | 49.3 | 1.58 | 62% | 1.53 / 1.83 |
| 4500v 60min | 77.0 | 50.8 | 1.52 | 60% | 1.33 / 1.50 |
| Baseline | 60.5 | 60.5 | 1.00 | 50% | |

The split by window length is the headline and it holds in both halves of the sample: **after a
60-minute-window print the push keeps going; after a 30-minute-window print it turns.**

Since the print is not the entry, the more useful table is how far the push has left, when it
peaks, and how far it comes back afterwards (60-minute window, day session):

| Setting | Push left after the print | Peaks after | Comes back | Comes all the way back |
| --- | --- | --- | --- | --- |
| 7250v 60min | 95 pts | 44 min | 71 pts | 45% |
| 7250v 30min | 49 pts | 19 min | 82 pts | 61% |
| 6750v 30min | 39 pts | 17 min | 91 pts | 64% |
| 5250v 60min | 78 pts | 36 min | 77 pts | 51% |
| 4500v 60min | 77 pts | 36 min | 92 pts | 53% |

Read: a 30-minute-window print says the push has about 40 to 50 points and 15 to 20 minutes left,
and then the turn is bigger than what remained. A 60-minute-window print says the push has 80 to
95 points and 35 to 45 minutes left; it comes all the way back only half the time within the hour.

**Measured from the last bar of the run instead** (operator ask, 2026-09-05: waiting 40 points and
20 minutes after the first print is not much of a signal). Most events are one bar, so first and
last coincide for 78 to 90 percent of them. The multi-bar runs are where it differs:

| Setting | Events that are 1 bar / 2 / 3+ | Multi-bar run lasts | Push left after the LAST bar, multi-bar runs | Peaks after | Comes back |
| --- | --- | --- | --- | --- | --- |
| 7250v 60min | 51 / 7 / 7 | 31 min | 90 pts | 36 min | 101 pts |
| 7250v 30min | 58 / 10 / 13 | 31 min | 27 pts | 6 min | 91 pts |
| 6750v 30min | 70 / 9 / 12 | 28 min | 33 pts | 0 min | 71 pts |
| 5250v 60min | 103 / 4 / 5 | 17 min | 107 pts | 42 min | 85 pts |
| 4500v 60min | 102 / 8 / 4 | 9 min | 118 pts | 36 min | 105 pts |

Read: on the 60-minute settings, waiting for the string to end costs nothing, because the push
still has 90 to 120 points in it when the arrow stops re-printing. On the 30-minute settings the
end of the string *is* the turn: the extreme is in within 0 to 6 minutes and 27 to 33 points, and
the turn afterwards is two to three times that. The 30-minute multi-bar runs are n 21 and 22, so
treat the minutes as indicative, but the direction of the difference matches the single-bar
events. Single-bar 30-minute events still have 39 to 49 points and 17 to 24 minutes to go from the
bar's end.

The studies print live (operator, 2026-09-05), so the arrow is visible during the bar; measuring
from the bar's end is the conservative choice.

Other splits worth knowing, all at 60 minutes:

- **Opening half hour.** 7250v60 and 5250v60 prints between 08:30 and 09:00 extend a median 155
  points and close in the print's direction 69 to 75 percent of the time (n 20 and 26). Do not
  fade those. 4500v60's opening prints are much weaker (ratio 1.21).
- **After 14:00.** Every setting is at or below baseline, and 7250v60's afternoon prints reverse
  (ratio 0.55, 41 percent). The afternoon is not the same instrument.
- **Agreement between settings is the strongest filter in the data.** A 60-minute-window print with
  no other setting agreeing within 10 minutes has no edge (7250v60 solo 0.60 on n 14; 5250v60 solo
  0.87 on n 37; 4500v60 solo 0.82 on n 44). With one or more agreeing: 1.3 to 2.2 and 59 to 72
  percent. Roughly 40 percent of 4500v60's events are solo.
- **Buy and sell both carry the pattern** on the 60-minute settings (buy 1.1 to 1.7, sell 1.5 to
  2.0). On the 30-minute settings both sides turn.

## Recommendations

See [`report-2026-09-05.md`](./report-2026-09-05.md) for the per-setting verdicts and the
recommended configuration (three DND charts, retire 6750v30 in favour of a 6250v 2-hour test,
4500v60 optional, agreement between settings as the filter).

## Still to do

- **Score against structure.** Join each event to the session's MGI levels from `raw_bundles`
  (`mgi_static_levels.json`) and to the LVN corpus, then score only prints that landed at a level:
  did the push stall there, and did the turn come off it.
- **Overnight** is scored in `score-dnd.mjs` (Asia 17:00 to 02:00, Europe 02:00 to 08:30) but at
  one bar per window it is indicative only; see the report.
- Re-export and re-run `score-dnd.mjs` at the next bi-weekly cycle before changing anything else.
