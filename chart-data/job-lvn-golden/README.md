# Job LVN/HVN golden set

Ground truth for the profile vision bench (feat-124) and the R15 exit criterion.
Two halves:

- **Repo half (feat-120, this directory's `labels.json` + `split.json`):** operator
  labels transcribed from `docs/jba-research/lvn-corpus.md` section A1 — every prep row
  that names a price.
- **Operator half (feat-119, not yet landed):** per-date `five-day-rolling.vbp.md` /
  `four-hour-rolling.vbp.md` / `overnight.vbp.md` Sierra replay exports + a `replay.json`.
  Dates land incrementally; feat-124's bench scores whatever folders have profiles and
  logs the count it skipped.

## Per-date layout

```
<YYYY-MM-DD>/
  labels.json                 # feat-120 (here now)
  replay.json                 # feat-119 (operator) — { replayAt, instrument, sessionTemplate, note }
  five-day-rolling.vbp.md     # feat-119 (operator)
  four-hour-rolling.vbp.md    # feat-119 (operator)
  overnight.vbp.md            # feat-119 (operator), only the dates that cite it
```

## labels.json

An array of `{ instrument, profile, kind, priceLow, priceHigh, primary, corpusRef, verbatim }`:

- `profile`: `5d` | `4h` | `overnight` | `any`. `any` when the transcript does not name the
  lookback (scored leniently — a hit on either profile counts); the named profile otherwise
  (scored strictly).
- `kind`: `lvn` | `hvn-edge` | `hvn-core` | `exhaustive-node` | `taper-tail`.
- a band (`priceLow < priceHigh`) when Job quotes one ("6816 to 18", "682 to 6806"); equal
  low/high for a point.
- `primary: true` only where Job says primary / deepest / most prominent.
- `corpusRef`: the A1 row number; `verbatim`: a short quote.
- NQ prices spoken without the thousands digit are expanded per the corpus reading notes
  ("the 960s" = 24960).

## Design decision: one instrument per date

feat-119 exports **one** chartbook profile per date folder, so each date carries a single
instrument's labels (`instrumentOf(date)` derives it from `replay.json` when present, else
from the label price magnitude — NQ ≥ 10000, ES below). Several A1 rows name both an ES and
an NQ price for the same read; the golden date keeps the instrument with the richer read and
the dropped analogue stays in the corpus. Consequently a label's `corpusRef` is unique
**within its date**, and not every A1 price is transcribed — the set is a validated ground
truth, not an exhaustive transcription. The three few-shot dates are fixed in `split.json`
(`2026-02-13` NQ deepest-LVN-on-5-day, `2026-08-07` ES primary-LVN-above-JBA-low, `2026-06-02`
ES exhaustive-node-on-top + LVN-under-HVE) and the test dates are never tuned on.
