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

Transcripts were pulled with:

```bash
yt-dlp --skip-download --write-auto-subs --sub-langs en --sub-format json3 \
  -o "<id>.%(ext)s" "https://www.youtube.com/watch?v=<id>"
```

YouTube rate-limits this — retry with backoff. Video/audio bytes are blocked from datacenter IPs
but captions are not; frame extraction needs a local run with browser cookies.

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
