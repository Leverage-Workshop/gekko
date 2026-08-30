# Profile-vision validation — 2026-08-30

**Status: run.** Supersedes the `docs/profile-vision-bench-2026-08-22.md` scaffold, which was
never executed.

This is a **correctness validation**, not the full bake-off feat-131 originally specified. The
operator scrapped the matrix sweep on 2026-08-30 in favour of "a few tests with the top
candidates to make sure it works correctly." Two facts made that the right call:

1. **Budget.** The OpenRouter balance was **$9.87**. The specified sweep — 5 models × 6 render
   variants × 12 dates × 2 profiles × 3 samples = 432 calls/model — prices at **$52–$100**.
   Even one frontier model alone exceeded the balance.
2. **The label set cannot resolve what the sweep would have measured.** The 12 golden test
   dates carry **15 labels total** (13 `lvn`, 2 `hvn`, **0 extremes**), only **3** marked
   primary, and 10 of the 12 dates label only ONE of the two profiles. "Primary agreement
   ≥ 0.70" is arithmetically "3 out of 3". Precision is uninterpretable by construction.

## What was run

| | |
|---|---|
| Variant | `base` only (the 6-variant bake-off was not run) |
| Source | `golden` — 12 test dates × 2 profiles |
| Samples | 1 (so **self-agreement was not measured**) |
| Prompt revision | `vision-2026-08-30.1` (feat-132: 18 criteria, golden few-shot) |
| Calls | 24 per model + smoke |
| Total spend | **$5.90** (balance $9.87 → $3.96) |

## Results

| Model | Effort | Recall | Primary agr. | Calls ok | Cost | Latency |
|---|---|---|---|---|---|---|
| **`openai/gpt-5.6-sol`** | **low** | 40% | **67%** (2/3) | 24/24 | **$0.81** | **537s** |
| `openai/gpt-5.6-sol` | default (medium) | 40% | **67%** (2/3) | 24/24 | $1.27 | 1068s |
| `google/gemini-3.1-pro-preview` | default (medium) | **47%** | 33% (1/3) | 24/24 | $1.88 | 876s |
| `anthropic/claude-sonnet-5` | default (high) | 33% | 0% (0/3) | 24/24 | $1.76 | 1338s |
| `qwen/qwen3.8-27b` | default | — | — | **0/2** | — | failed |
| `lib/engine/lvnDetection.ts` (detector) | — | 67% | — | — | $0 | — |

`qwen/qwen3.8-27b` was **eliminated at the smoke stage**: 0 of 2 calls returned an object
(one 180s timeout, one "No object generated"), even with routing pinned to endpoints that
advertise `structured_outputs`. The open-weights slot is empty.

## Reading the recall number honestly

Every model scores below the detector's 67% recall. That comparison is **confounded three
ways**, and the raw number understates the read:

**1. The detector is not capped at 8 nodes.** It predicts **230 more nodes than there are
labels**; the vision read is capped at 8 per profile and predicts ~172 more. On the three
dates where the detector clearly wins it emits **10, 20 and 22** nodes against a case median
of one label. On the two dates where it is sparse (7 and 4 nodes) **the vision read beats
it**. Precision is 3–4% for *both* — each produces ~25× more nodes than there are labels.

**2. Named-profile binding penalises a correct price found on the sibling profile.** The
corpus names a **price**; which profile it is visible on is a labelling detail.

| Date | Label | Found | Scored |
|---|---|---|---|
| 2026-03-17 | `5d: 6745` | **6745.75** on the 4-hour | miss |
| 2026-06-16 | `5d: 7636` | **7637.25** on the 4-hour | miss |

**3. Recall is kind-sensitive.** Scoring is per node family, so reading the right price and
calling it `hvn-edge` instead of `lvn` scores zero.

### Miss distance — the metric that is not confounded

Distance from each label to the nearest predicted node, ignoring the profile binding.
`*` = within tolerance (ES 5 pts, NQ 20 pts).

| Date | Tol | `gpt-5.6-sol` medium | `gpt-5.6-sol` low |
|---|---|---|---|
| 2026-02-17 | 5 | 0.00\*, 0.25\* | 0.00\*, 0.25\* |
| 2026-02-20 | 5 | 1.25\* | 0.88\* |
| 2026-03-06 | 20 | 3.00\* | 0.75\* |
| 2026-03-16 | 5 | 2.50\* | 5.00\* |
| 2026-03-17 | 5 | 0.75\*, 8.25 | 0.63\*, 16.25 |
| 2026-03-18 | 5 | 3.00\* | 2.75\* |
| 2026-03-20 | 20 | **81.75** | **69.00** |
| 2026-06-16 | 5 | 1.25\*, 14.13 | 1.88\*, 14.25 |
| 2026-07-10 | 5 | 4.50\* | 8.00 |
| 2026-07-20 | 5 | 9.25 | 9.88 |
| 2026-08-04 | 20 | 3.50\* | 2.50\* |
| 2026-08-11 | 5 | 0.63\* | 0.50\* |
| **Within tolerance** | | **11/15 (73%)** | **10/15 (67%)** |

The read is **locating prices accurately** — typical miss 0.5–3 points on ES against a 5-point
tolerance. It is not hallucinating levels.

**One genuine misread: 2026-03-20 (NQ).** Label 24735; nearest node **81.75 points away**
(69.00 at low effort). The detector found it at 4.50. This is a real failure, not a scoring
artifact, and it is on one of the dates the operator flagged as weak.

## Effort: `low` is the pick

| | recall | primary agr. | miss ≤ tol | cost | latency |
|---|---|---|---|---|---|
| medium (provider default) | 40% | 67% | 11/15 | $1.27 | 1068s |
| **low** | 40% | 67% | 10/15 | **$0.81** | **537s** |

Identical on both headline metrics, one marginal case worse on miss distance (2026-07-10,
4.50 → 8.00), **36% cheaper and 2× faster**. An isolated timing probe on one profile put the
gap higher still — 48.7s → 12.9s and $0.0589 → $0.0290 per call.

Latency is dominated by **reasoning tokens, not prompt size**: removing both few-shot images
changed wall time by nothing (48.7s → 49.6s). The uncached few-shot prefix is a ~$0.01/call
cost drag worth fixing later, but it is not a latency problem.

## Recommendation

```
profile_vision_model_id      openai/gpt-5.6-sol
profile_vision_model_effort  low
profile_vision_samples       3
```

Wired as `RECOMMENDED_PROFILE_VISION` (`lib/job-plan/profile-vision/recommended.ts`) and
offered in /settings behind a **Use recommended** control. It is deliberately **not** the
config fallback: `PROFILE_VISION_DEFAULTS.profile_vision_model_id` stays `null`, because a
null model id is a *safety property* (read OFF, planner degrades with the
`profile_nodes_unavailable` banner, R14) rather than a preference. Making a real model the
fallback would start paid vision calls in any environment whose `config` row predates the
`profile_vision_config` migration.

`gpt-5.6-sol` wins on the metric that matters most to the planner — **primary agreement**,
which drives the entry anchor — and is simultaneously the cheapest and fastest candidate.
`gemini-3.1-pro-preview` leads on raw recall (47%) but halves primary agreement (33%).

> Aside, outside this feature: `openai/gpt-5.6-sol` is AA 60.9 at $1/$5 against the
> `openai/gpt-5.6-terra` the briefing path runs on today (AA 56.6, $2/$12). Smarter and 2.4×
> cheaper on the production path. Untested for briefings — flagged, not recommended.

## Enabled — operator decision, 2026-08-30

The operator enabled the read after the self-agreement gap was closed:

```
profile_vision_model_id      openai/gpt-5.6-sol
profile_vision_model_effort  low
profile_vision_samples       3
```

Written to the live `config` row. **R15 is left `ratified: false`** in
`lib/job-plan/rules.ts`: enabling is an operator decision taken with the proposed
numbers unmet, not a claim that they were met. No thresholds were invented on the
operator's behalf.

**Self-agreement: 81%** — measured after the fact on 4 dates (2026-02-17,
2026-08-11, 2026-03-20, 2026-07-10) at the true production configuration
(`samples: 3`, low effort), 24/24 calls valid, $0.52. This is the gate that
matters most for the consensus: the read sends each image 3 times and
`consensus.ts` keeps only nodes appearing in a majority, so an unstable model
yields a thin or empty read regardless of how well it scores on recall.
**81% clears the R15 bar of ≥ 0.80** — the one proposed threshold that passes.

Running cost: ~6 calls per job-plan run (2 profiles × 3 samples) ≈ **$0.17/run**.

To revert: set `profile_vision_model_id` to NULL in /settings. R14 then applies —
plans build with the `profile_nodes_unavailable` banner.

## R15 verdict — NOT MET

R15 asks for recall ≥ 0.8, primary agreement ≥ 0.7, self-agreement ≥ 0.8, and beating the
detector on both sources.

| Gate | Target | Observed | |
|---|---|---|---|
| recall | ≥ 0.80 | 0.40 | **fail** |
| primary agreement | ≥ 0.70 | 0.67 (2/3) | **fail** (by one date) |
| self-agreement | ≥ 0.80 | **0.81** (samples 3, 4 dates) | **pass** |
| beats detector | both sources | no (fixtures not run) | **fail** |

**The proposed R15 numbers are not met.** The operator enabled the read anyway
(see *Enabled* above) — a decision the rule was always meant to leave open, since
`rules.ts` records R15 as "proposed, not ratified" and the plan lists "ratified
numbers are first guesses" as a known risk. What this run establishes:

- The pipeline **works end to end** — 24/24 calls schema-valid on three of four models, prompt
  revision `vision-2026-08-30.1`, no `superRefine` rejections.
- The read **locates prices accurately** (median miss ~2.5 pts on a 5-pt ES tolerance).
- `gpt-5.6-sol` at `low` effort is the configuration to use **if and when** the read is enabled.

R15 cannot be fairly judged on this label set. Before re-testing, the honest fixes are:
score against the profiles the labels actually name (halves the calls and makes precision
mean something), relax the named-profile binding to a price match, and add `extreme`-family
labels — the set currently has none, so the criteria covering exhaustive nodes, tapers and
ledges are **completely unmeasured**.

## Harness fixes this run required

The bench had never been run against a live model. Four things had to be fixed first:

1. **Sparse exports crashed the parser** (feat-132) — feat-118's Sierra exporter omits
   zero-volume rows; 4 of 12 test dates died in `goldenCases` before any call.
2. **60s timeout** — reasoning models take 30–60s per profile; `claude-sonnet-5` blew it and
   the bench reported "failed read" when the model was merely slow. Now 180s + `--timeout`.
3. **Failures were counted, never explained** — a schema refusal and a `superRefine` rejection
   are different problems. The report now prints a failure table with per-call counts.
4. **Provider routing** — OpenRouter spreads one model id across endpoints that do not all
   support `structured_outputs`. `requireParameters` now pins routing on the bench *and* the
   live job-plan path.
