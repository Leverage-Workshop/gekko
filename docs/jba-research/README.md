# JBA Research

Research notes on the OrderFlow Labs premarket prep videos, toward a possible **alternative
analysis mode** for Gekko built on the Job Balance Area (JBA) framework.

**This is research, not a feature.** Nothing here is wired into the engine, and there is no
`feature_list.json` entry for it yet. These documents exist so the analysis survives the session
that produced it.

## Contents

| File | What it is |
| --- | --- |
| [`jba-analysis-process.md`](./jba-analysis-process.md) | **The deliverable.** 31 rules across five phases reconstructing the planning method, plus negative rules, a phrasebook and a worked example |
| [`jba-prep-video-notes.md`](./jba-prep-video-notes.md) | **The evidence log.** Per-video findings, resolved and open questions, and the corrections made along the way |
| [`execution-process.md`](./execution-process.md) | **The execution deliverable.** 39 rules across seven phases for acting on a plan once the session is live — v1, grounded in 9 trade replays |
| [`execution-notes.md`](./execution-notes.md) | **Evidence log for execution.** Replay-by-replay findings, tool inventory, and the data/studies an implementation would need |
| `transcripts/` | Raw auto-caption transcripts for the 25 prep videos, named `YYYY-MM-DD_<youtube-id>.txt` |
| `replays/` | 9 trade-replay transcripts (~5.4 hrs), the execution evidence base |
| `reference/` | Job Pivot deep dive, Dominator 2.0 deep dive, OFL 101 Time & Sales, and the DOM / Time & Sales / Dominator course PDFs |

Keep the split: **evidence lands in the notes first, then the process is updated.** A rule whose
provenance has evaporated is not worth having.

**Two tracks.** *Planning* (where and what if) is complete at n=25 plus the deep dive. *Execution*
(which, when, how much) is now evidenced at n=9 replays plus the Dominator and DOM material.

**The execution trigger is a two-part flip at a pre-marked level:** the opponent stops defending
(resting size stops refreshing and pulls), and then your side takes the level (the bid steps above
where the offer had been refreshing, and holds). Step one alone is necessary but not sufficient.

That trigger rests on a primitive no bar dataset contains — whether resting size at a price is
replenishing after fills or vanishing. **Level 2 in Sierra Chart supplies it**, so the blocker is
gone; what remains is building the detector.

**Both process documents carry a "Data, studies and exports" section** listing what they need,
split into what already ships in the bundle, what needs new exports, what has to be built as a
study, and what is personal configuration rather than data. The two requirement sets are
deliberately separate — planning needs no order-book data and no economic calendar; execution needs
both (the calendar for one rule only).

**Scoring plans against price data is parked.** The incidental caveats it would need are still
recorded where they arose — contract roll on 03-16, levels rolling across a session boundary, weekly
references needing a tolerance band — but no scoring work is planned or in progress.

All four documents are also published as artifacts (private):
[planning process](https://claude.ai/code/artifact/8438bfb9-b04a-41cb-a4db-b296749303e1) ·
[planning notes](https://claude.ai/code/artifact/46957b20-7ea1-4784-ae9c-62337ad78cd2) ·
[execution process](https://claude.ai/code/artifact/bcebab65-9d8f-4ba8-8e31-16e4b85c896c) ·
[execution notes](https://claude.ai/code/artifact/010913d6-4d0e-4f14-9b19-754087079ebd).

## Corpus

25 videos, 2026-02-13 → 2026-08-11, in two blocks:

- **The original nine**, 2026-06-02 → 2026-08-11 — the basis of every rule in the process doc.
  Includes one CPI day (06-10) and one jobs-report day (08-07).
- **The 16 priority videos** listed in `priority-videos.json`, pulled since — two full FOMC cycles,
  quad witching, the March correction block, and the pre-release NFP recording.

All 25 are analyzed; both documents reflect the full corpus.

**Headline finding: the method is event-agnostic.** Fourteen of the 25 videos fall on a scheduled
event — two FOMC decisions, four CPI/NFP releases, two quad-witching sessions, an ordinary opex and
two post-holiday sessions. **Eleven never name the event at all.** The 03-18 FOMC decision gets one
sentence, placed after the finished plan and attached only to range width; the 06-17 decision gets
nothing. Neither quad witching mentions expiry.

So a JBA-mode implementation needs **no event-day branch and no economic calendar**. The one
observed adaptation runs opposite to intuition: on the single video recorded *before* its release,
he simplified — fewer levels, one binary.

The batch also closed the short-bias gap: the March correction block runs the template downward,
structurally identical with the roles mirrored, so no separate short-side rule set is needed.

**The author's complete Job Pivot deep dive** (`reference/`) supplies the construction the prep
videos assume:

- A pivot from the volume profile, a **value zone = 70% of that volume**, and **targets stacked
  outward in multiples of that value-zone width** — which is what 1A/2A/1B/2B are.
- **A JBA is the box where daily pivot value zones overlap on a rolling 5-day lookback.** The
  lookback is configurable; 5 days is what he runs. Because the window rolls, the box recomputes
  daily — that is all "expansion" means, and nothing organic needs modelling.
- **Autoplot is the larger balance; JBAs subdivide its interior.**
- The **top-down, left-to-right** framework that every prep video follows: weekly aspect first,
  narrowing inward, and always accounting for which side price arrived from.
- **Mechanical vs emotional** — does price pause at MGI or accelerate through it — which is largely
  readable from bar data.

It also qualifies the zero-stops finding: stops and sizing are absent from the *prep format*, not
from the method. The deep dive places stops structurally and states the sizing rule outright —
nobody carries full size through the middle of a balance zone.

## Pulling more transcripts

```bash
python3 docs/jba-research/pull-transcripts.py <videos.json> --browser chrome
```

Takes the JSON list exported from YouTube (objects with `url` and `date`), writes
`transcripts/YYYY-MM-DD_<id>.txt`, and skips anything already downloaded — safe to re-run after
an interruption.

**Prefer a local run with cookies.** YouTube hard-blocks anonymous caption pulls once a single IP
has fetched a few dozen — `HTTP 429` plus "Sign in to confirm you're not a bot", and backoff does
not clear it. A logged-in browser profile avoids this. Frame extraction still needs a local run.

**Without cookies**, pass `--browser none --player-clients android,tv,web`. The default web client
fails the bot check on a datacenter IP, but the `android` client still serves captions; the script
tries each client in turn and takes the first that produces a file. This is how the 16 priority
videos were pulled from a remote container, and it survived all 16 without a single failure. It
depends on client-specific behaviour that YouTube can change without notice — if it stops working,
fall back to the cookied local run rather than adding more clients.

Verify short transcripts rather than assuming truncation: several prep videos are genuinely 60–90
seconds. Compare the last caption timestamp in `transcripts/.raw/<id>.en.json3` against the video's
duration — if they match, the pull is complete.

`priority-videos.json` holds the 16 highest-value dates identified by cross-referencing the corpus
gaps against the 2026 economic calendar and the Feb–Mar 2026 correction (**all 16 now downloaded**):

- **Two full FOMC cycles** — Mar 16-20 (mid-selloff, and Mar 20 is quad witching) and Jun 15-18
  (calm). Same event shape in opposite regimes, so differences are attributable to regime.
- **2026-03-06** — the only data-day video in 70 recorded *before* its 8:30 release (7:37 ET).
  Every other one is recorded after, which is why the method never plans around a pending event.
- **Short-bias coverage** — the March block sits inside the correction. The current corpus is
  8-of-9 long-bias, so every short-side rule is inferred rather than observed.
- Opex vs quad witching, two post-holiday sessions, and five Mondays (against one today).

## Two known traps

Both were hit in practice while building this, and both fail *silently*:

1. **Role assignment is not recoverable from a single transcript.** He speaks over a chart and
   points at it. Transcript-only extraction produces plausible, complete, **wrong** structure rather
   than visible gaps. Corroboration across videos mitigates this; a single video does not.
2. **Garbled terms vanish from counts and invite over-reading.** Auto-captions render "LVN" as
   "LVN", "LBN" and "VM". A garbled term leaves no gap behind the way a garbled number does — and
   reconstructing one into a claim produced a finding that had to be retracted.

## Relationship to existing doctrine

- A **JBA** is built from overlapping *session pivot ranges*. The balance area already in
  `knowledge/doctrine/chart-reading.md` is built from overlapping *daily value areas*. Two distinct
  studies from the same author — not a drift to reconcile. He appears to run both.
- The method's primary bias gate is the **weekly open**, which already ships as `weekly.wkOpen` and
  is already tiered Tier 1 in `lib/engine/mgiPriority.ts`. No new plumbing required.
- The only genuinely new input a JBA mode would need is the **zone boundary export** from the Sierra
  study — one more file alongside `mgi_static_levels.json`, riding the existing uploader path.

## Open

- Whether the Job study can export JBA zone boundaries for historical dates (and whether it exposes
  adjacent zones, not just the active one).
- Two undecoded chart references: "auto plot high" and one unresolved study output.
- Five rules currently rest on a single video and need more instances before they can be trusted.
