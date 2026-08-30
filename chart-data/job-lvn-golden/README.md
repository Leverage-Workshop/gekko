# Job LVN/HVN golden set

Ground truth for the profile vision bench (feat-124) and the R15 exit criterion.
Two halves:

- **Repo half (feat-120, this directory's `labels.json` + `split.json`):** operator
  labels transcribed from `docs/jba-research/lvn-corpus.md` section A1 — prep rows that
  name a price.
- **Operator half (feat-119, landed):** per-date `five-day-rolling.vbp.md` /
  `four-hour-rolling.vbp.md` Sierra replay exports + a `replay.json`. Every remaining date
  carries both profiles; feat-124's bench scores whatever folders have profiles
  (`scorable`) and logs the count it skipped.

The replay pass is what makes this ground truth rather than a transcription: where the
replayed profile disagreed with the transcript the **profile wins**, recorded in
`replay.json`'s `note.observed` and carried into `labels.json` (see *Replay corrections*).

## Per-date layout

```
<YYYY-MM-DD>/
  labels.json                 # feat-120, corrected by feat-119's replay
  replay.json                 # feat-119 (operator) — { instrument, sessionTemplate, note? { expects, observed }, replayAt? (ISO+offset, provenance only) }
  five-day-rolling.vbp.md     # feat-119 (operator)
  four-hour-rolling.vbp.md    # feat-119 (operator)
```

Only `YYYY-MM-DD` directories are golden dates. The operator stages the exporter's live
output in the golden root (`*.vbp.md`, `es/`, `nq/`); those are gitignored and ignored by
`listGoldenDates`. `overnight.vbp.md` is no longer part of the set — the three dates that
cited an overnight profile were dropped (below).

## labels.json

An array of `{ instrument, profile, kind, priceLow, priceHigh, primary, corpusRef, verbatim,
source? }`:

- `profile`: `5d` | `4h` | `overnight` | `any`. `any` when the transcript does not name the
  lookback (scored leniently — a hit on either profile counts); the named profile otherwise
  (scored strictly).
- `kind`: `lvn` | `hvn-edge` | `hvn-core` | `exhaustive-node` | `taper-tail`.
- a band (`priceLow < priceHigh`) when Job quotes one ("6816 to 18", "682 to 6806"); equal
  low/high for a point. An unquoted approximate ("low 40s") is recorded as the round **point**,
  never an invented band.
- `primary: true` only where Job says primary / deepest / most prominent (always an `lvn`).
- `corpusRef`: the A1 row number. `verbatim`: a **contiguous** quote from that A1 row (a test
  asserts it is a substring of the row). One A1 row may yield more than one label when it names
  more than one node (row 15's two high-volume edges), so `(corpusRef, band)` — not `corpusRef`
  alone — is unique within a date.
- NQ prices spoken without the thousands digit are expanded per the corpus reading notes
  ("the 960s" = 24960).
- `source`: `corpus` (default, omitted in the file) when the band is the transcript's own
  price; `replay` when feat-119's replayed profile disagreed and the operator's band
  replaced it. `corpusRef`/`verbatim` still cite the row the read came from either way —
  only the price is the operator's, so the A1 price assertions do not apply to a `replay`
  label. A `replay` label must be justified by that date's `replay.json` note (a test
  pins the exempt set, so a stray `source` cannot silently opt out of the price check).

## Design decision: one instrument per date

feat-119 exports **one** chartbook profile per date folder, so each date carries a single
instrument's labels — the schema enforces it, and `instrumentOf(date)` derives the instrument
from `replay.json` when present (the loader throws if it contradicts the labels) else from the
label price magnitude (NQ ≥ 10000, ES below). Several A1 rows name both an ES and an NQ price
for the same read; the golden date keeps the instrument with the richer read and the dropped
analogue stays in the corpus. Not every A1 price is transcribed — the set is a validated ground
truth, not an exhaustive transcription. The three few-shot dates are fixed in `split.json`
(`2026-02-13` NQ deepest-LVN-on-5-day, `2026-08-07` ES primary-LVN-above-JBA-low, `2026-06-02`
ES exhaustive-node-on-top + LVN-under-HVE) and the test dates are never tuned on.

## replay.json

One per date folder. `instrument` must agree with the labels (the loader throws otherwise);
`sessionTemplate` is the Sierra session template the chartbook replayed with. `replayAt` is
optional — the operator replays to the prep video itself, so the timestamp is provenance only.
`note` is the working field: `note.expects` is pre-filled with what the corpus says to look for
on that date (from `labels.json`) and the operator records in `note.observed` any difference
between that and what the replayed profile actually shows. A mismatching day is annotated here,
never force-fit.

## Replay corrections (feat-119)

The operator replayed all 20 feat-120 dates and recorded what each profile actually shows in
`replay.json`'s `note.observed`. Five dates were dropped and ten labels changed:

**Dropped** — `2026-03-02`, `2026-03-19`, `2026-06-15`, `2026-06-18`, `2026-07-07`. The first
four had no usable read on the replayed profile ("this is not a good one, don't include it");
`2026-06-18` cited only an overnight profile the operator is not exporting. Their folders and
`split.json` entries are gone, leaving **15 dates** (3 few-shot, 12 test).

**Profile pinned** — a lenient `any` (or a wrong named profile) became the lookback the node
actually sits on, so those dates now score strictly:

| Date | Was | Now | Operator note |
| --- | --- | --- | --- |
| 2026-02-17 | `any` (6840) | `4h` | "both on 4hr" |
| 2026-02-20 | `5d` (6888) | `4h` | "6888 lvn is on the 4-hour rolling, not the 5-day rolling" |
| 2026-03-16 | `any` (6745) | `5d` | "LVN is on 5-day rolling profile" |
| 2026-03-18 | `any` (6740–45) | `5d` | "LVN is on 5-day rolling profile" |
| 2026-06-02 | `any` ×3 | `5d` ×3 | "All on the 5-day rolling profile" |
| 2026-06-16 | `any` ×2 | `5d` ×2 | "Both on 5-day rolling profile" |

**Band corrected** (`source: 'replay'`) — the transcript's price is not where the node is:

| Date | Was | Now | Operator note |
| --- | --- | --- | --- |
| 2026-02-13 | 24960 | 24950 | "LVN is closer to 24930 or 24950s" — the 5-day trough bottoms at 24950–55; 24960 is a bump inside it |
| 2026-03-06 | 24700 | 24715 | "lvn is at ~24715 on 5-day rolling profile" |
| 2026-03-20 | 24485.5 `hvn-core` (row 20) | 24690–24780 `lvn` (row 21) | "That LVN wasn't good. There is a good one from 24690 to [24]780s on the 5-day rolling" — the wide shelf between the 24670–90 and 24820+ HVNs, which is row 21's "up into this LVN" |
| 2026-06-16 | 7607–7615 | 7602–7604 | "Second one is around 7602-7604" |
| 2026-07-10 | 7600 | 7531 | "Specified level is not good. Use 7531 on the 5-day rolling profile" |

The remaining dates (`2026-03-17`, `2026-07-20`, `2026-08-04`, `2026-08-07`, `2026-08-11`)
replayed as the corpus describes.
