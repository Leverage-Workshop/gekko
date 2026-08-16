# JBA Research

Research notes on the OrderFlow Labs premarket prep videos, toward a possible **alternative
analysis mode** for Gekko built on the Job Balance Area (JBA) framework.

**This is research, not a feature.** Nothing here is wired into the engine, and there is no
`feature_list.json` entry for it yet. These documents exist so the analysis survives the session
that produced it.

## Contents

| File | What it is |
| --- | --- |
| [`jba-analysis-process.md`](./jba-analysis-process.md) | **The deliverable.** 26 rules across six phases reconstructing the planning method, plus negative rules, a phrasebook and a worked example |
| [`jba-prep-video-notes.md`](./jba-prep-video-notes.md) | **The evidence log.** Per-video findings, resolved and open questions, and the corrections made along the way |
| `transcripts/` | Raw auto-caption transcripts for the nine videos, named `YYYY-MM-DD_<youtube-id>.txt` |

Keep the split: **evidence lands in the notes first, then the process is updated.** A rule whose
provenance has evaporated is not worth having.

Both documents are also published as artifacts (private):
[process](https://claude.ai/code/artifact/8438bfb9-b04a-41cb-a4db-b296749303e1) ·
[notes](https://claude.ai/code/artifact/46957b20-7ea1-4784-ae9c-62337ad78cd2).

## Corpus

Nine videos, 2026-06-02 → 2026-08-11. Includes one CPI day (06-10) and one jobs-report day (08-07);
no FOMC, opex or holiday session yet.

## Pulling more transcripts

```bash
python3 docs/jba-research/pull-transcripts.py <videos.json> --browser chrome
```

Takes the JSON list exported from YouTube (objects with `url` and `date`), writes
`transcripts/YYYY-MM-DD_<id>.txt`, and skips anything already downloaded — safe to re-run after
an interruption.

**Run it locally, with cookies.** YouTube hard-blocks anonymous caption pulls once a single IP has
fetched a few dozen — `HTTP 429` plus "Sign in to confirm you're not a bot", and backoff does not
clear it. A logged-in browser profile avoids this. Frame extraction needs a local run for the same
reason.

`priority-videos.json` holds the 16 highest-value dates identified by cross-referencing the corpus
gaps against the 2026 economic calendar and the Feb–Mar 2026 correction:

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
