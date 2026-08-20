# Job Planning Task — Implementation Plan

Produced 2026-08-20 via `/plan-with-codex` (Claude plan + independent Codex analysis +
adversarial Codex review; disagreements resolved against the repo). Status: **plan only —
nothing implemented.**

## Goal

A **standalone analysis task** that replicates Job's (OrderFlow Labs) premarket **planning**
process: given the Job Pivot / Weekly Job Pivot / JBA study geometry and where price is
coming from, produce the same kind of plan his morning preps produce — one primary lean plus
a short conditional if/then ladder keyed to reference levels ("stay inside → balance; below
yesterday's low → seek the 7720s; rebid 7980–82 into the LVN → press the 8004s; build above →
attack prior week high; look-below-and-fail → rotate back across").

Operator constraints:

- Standalone task, shaped like the analyze-task (bundle → engine → persist → surface), but
  **zero carry-over of the existing prompt doctrine**.
- Reuses the existing infrastructure (bundle ingestion, Supabase, trigger.dev, uploader).
- New Sierra Chart exports are obtainable.
- **Lean, procedural/mechanical above all.** The prior attempt at prose rule documents
  (`docs/jba-research/jba-analysis-process.md`, `execution-process.md`) is disregarded; the
  raw transcripts/replays/deep-dive remain valid evidence.

The core design consequence, agreed by both reviewers: **the production planning path
contains no LLM call.** The plan is a deterministic function of exported study geometry plus
recent price path. Job's method — location vs value, box edges, failed looks, don't-fade-fresh-
initiative, stand down in the middle — is a small state classification plus a play table, and
an LLM in that loop adds nondeterminism, hallucinated levels, and exactly the doctrine-drift
failure mode this task exists to escape. An optional prose renderer (strictly from the
finished plan JSON, non-fatal, operator opt-in) can come later.

## Existing behavior (what we reuse, what we don't)

The analyze-task pipeline (`trigger/analyzeTask.ts` → `lib/analyze/analyzeBundle.ts`):
fresh-bundle handshake → `loadLatestBundle` (raw_bundles row + Storage objects) →
`computeEngineFacts` (~40 `lib/engine/` modules) → `generateObject` with a cached doctrine
prefix → `enforceCodeOwnedFacts` → persist `briefings` + refresh `entry_levels`.

**Reused**: trigger.dev task shape with injected deps, the ingest manifest/uploader/Storage
plumbing, `bundle_requests` handshake (with a fix, below), individual pure parsers
(`parseExecBars`, `parseHtfBars`), Supabase migration + `gekko-db` skill workflow, dashboard
run-button pattern.

**Not reused**: `knowledge/system/*` and `knowledge/doctrine/*` (no `job` entry in
`DoctrineTask`), the `Briefing` schema, `validateBriefing`, `persistBriefing`,
`computeEngineFacts` as a block, and — critically — **`entry_levels`**: a Job plan must never
insert or deactivate rows there, or it would silently retarget the eval-task's active set.

Verified constraints the plan must respect:

- `awaitFreshBundle` returns `void`, **discards the fulfilling `bundleId`** that
  `waitForFreshBundle` actually returns, and degrades to "latest bundle" on timeout
  (`trigger/freshBundle.ts`). One upload also fulfils **all** pending requests regardless of
  `reason`. Unchanged, this breaks a fail-closed task.
- Ingest `raw_bundles` write is `upsert(..., ignoreDuplicates: true)`
  (`app/api/ingest/route.ts`): a retried POST that carries a newly-present file under the
  same bundle id never records the new ref. Low impact at the ~15s export cadence (the next
  cycle is a new bundle id), but the task must treat "ref missing" as remediable, not corrupt.
- The cleanup predicate lives in SQL (`public.unused_bundles_before`, migration
  `20260718100000`), with `ON DELETE CASCADE` FKs from briefings/eval_results. Teaching
  "cleanup" about job_plans means **changing that function**.
- The uploader skips absent local files but throws at module init on a manifest field with no
  local filename mapping — manifest + uploader mapping must land together. The uploader runs
  from a **separate Windows checkout that drifts behind main**: new fields silently don't
  upload until it is pulled and restarted (known gotcha).
- MGI already exports `Job Pivot` and `Weekly Job Pivot` as single prices (feat-111) — usable
  as a cross-check, insufficient as the data source (no value zones, targets, history, boxes).

## Proposed approach

```
job-study.json (new Sierra export of the Job studies' own subgraphs)
  → strict parser + geometry normalization        (pure, fail closed)
  → context classification (orthogonal dimensions) (pure)
  → play generation + precedence → JobPlan doc     (pure)
  → job-plan-task (trigger.dev, no LLM)            (I/O shell)
  → job_plans table (own persistence, RLS)
  → minimal dashboard surface (mechanical rendering)
```

Key decisions and rationale:

1. **Export the studies' own outputs; don't reimplement them.** The pivot/value-zone/target
   construction is the study author's proprietary math. A new ACSIL exporter DLL reads the
   Job Pivots / Weekly Job Pivots / JBA studies cross-study (pattern already proven in this
   project) and emits one `job-study.json` (atomic temp-file + rename):
   - `meta`: contract, exchange TZ, `exportedAt`, `tradingDay`, tick size, `schemaVersion`,
     study settings (value %, lookback, session template)
   - `dailyPivots[]`: sessionDate, pivot, valueLow, valueHigh, `targets[{label, price}]`,
     complete-flag — covering at least the JBA lookback + 1 session
   - `weeklyPivots[]`: weekOf, pivot, valueLow, valueHigh, targets
   - `balanceAreas[]`: low, high, constituent sessions, lookback — **from the study if it
     exposes them**; only if it doesn't do we compute overlap in TS, and only after the
     operator ratifies overlap semantics (intersection vs envelope, transitive overlap,
     touching-boundary, aging) against golden Sierra screenshots.
   A TS reconstruction of the studies remains available later as an audit check, never the
   source.

2. **Bind the task to its bundle.** The job-plan task takes the `bundleId` that
   `waitForFreshBundle` returns and loads **that row by id** (new `fetchBundleById` dep) —
   never "latest". Timeout / missing request / unfulfilled → abort non-retryably with an
   operator-remediable message; a run triggered without a `bundleRequestId` (test runs) may
   use latest but stamps a prominent warning. This closes the false-freshness hole for this
   task without touching analyze/eval behavior.

3. **Fail closed, with an error taxonomy** (adversarial-review finding (a)):
   - `job_study_ref` missing → non-retryable abort; message names the two usual causes
     (exporter not deployed / Windows checkout behind) and says "request a fresh bundle".
   - Export present but schema/settings unsupported → non-retryable abort.
   - Geometry parses but is insufficient for a plan (e.g. prior session incomplete, skew
     between `exportedAt` and MGI `current.time` beyond tolerance) → **persist**
     `status='insufficient'` with reasons. No LLM ever "fills in" missing levels.

4. **Three pure modules, not six** (review finding: pipeline ceremony). One function per
   semantic boundary:
   - `parseJobStudy.ts` — strict parse + normalize + validate: tick alignment,
     `valueLow ≤ pivot ≤ valueHigh` (exact invariants confirmed against real exports first),
     monotonic de-duplicated targets, no future sessions, MGI Job Pivot cross-check within
     tick tolerance, size caps (bytes, array lengths) so a broken exporter can't DoS the task.
   - `classifyContext.ts` — an **orthogonal dimensions object, not one enum**: price vs
     weekly value (below/lower-half/at-pivot/upper-half/above), vs JBA box(es)
     (inside-middle/at-lower-edge/at-upper-edge/outside-near/outside-extended, per box), vs
     current daily value zone, and **origin** (last crossed boundary, last rejected excursion,
     holding state) from the session-anchored exec bars, HTF bars for pre-session context.
     Every dimension carries machine-readable evidence and an `asOf` scope
     (overnight-observed vs RTH-conditional). Data-quality status is a **separate field**,
     never a pseudo-state. Disagreements between weekly/JBA/daily reads are exposed, never
     collapsed into a single "bias".
   - `buildPlan.ts` — play generation + explicit precedence table → `JobPlan`. Play cards:
     stance (rebid/reoffer/continuation/stand-down), reference zone (band, not a fabricated
     tick), activation evidence, invalidation, ordered destinations (pivot / targets /
     opposite box edge), an explicit "don't" (e.g. don't fade fresh initiative, nobody is
     full-size mid-box), and the rule IDs that fired. Precedence: invalid/stale input → no
     plan; mid-box stand-down beats weak directional context; confirmed initiative beats
     responsive fades; failed-look + re-entry enables traversal; weekly context re-orders
     priority but never manufactures an entry. `openBranches[]` are **immutable premarket
     contingencies** (open above/inside/at-pivot/below/far-outside value), never mutated
     after persistence; a post-open "resolution" is a future, separate, linked artifact.
     No synthesized "confidence" field — explicit sufficiency flags only.

   Rules are named pure predicates with stable rule IDs and a single exported
   `PLANNER_REVISION`; no runtime doctrine markdown, no generic rule-catalog abstraction.
   Human-readable rule docs, if wanted, are generated from code/tests.

5. **Own schema + own table.** `knowledge/schema/job-plan.schema.ts` (`JobPlan`: meta,
   geometry refs, context, plays[], openBranches[], standDownReasons[], warnings[]).
   `job_plans`: `id`, `bundle_id` FK **ON DELETE RESTRICT** + index (audit trail; RESTRICT
   turns the pre-existing cleanup select/delete race into a loud failure instead of silent
   loss), `trading_day date`, `trigger_reason`, `status` (`ready|insufficient`) with a CHECK
   that `ready` ⇒ `plan` non-null, `planner_revision`, `input_fingerprint` (sha256 over the
   exact downloaded bytes the run consumed + `PLANNER_REVISION` — defined, not decorative),
   `run_id` **unique** (identity = one row per trigger.dev run; retries upsert their own
   row, distinct operator presses are distinct rows — this replaces the rejected
   `(bundle_id, rule_version)` key), `plan jsonb`, `warnings jsonb`, `created_at`. RLS
   enabled, service-role-only policies like the existing tables; the page reads server-side.
   `unused_bundles_before` gains a `NOT EXISTS job_plans` guard **in the same migration**.
   `gekko-db` skill updated in the same PR (repo rule).

6. **Evidence discipline** (review finding (e)): the 25 prep transcripts and 9 replays are
   **graded qualitative evidence** for rule design — they name selected levels and explicit
   don'ts but cannot supply exact geometry, target ladders, or acceptance timing. Golden
   fixtures come from **real `job-study.json` snapshots**: the exporter lands first and a
   snapshot archive starts accumulating immediately, so rule ratification and shadow testing
   run against actual study output (this also fixes the phase-ordering inversion where the
   data contract and the rule corpus would otherwise never meet until the end).

## Implementation steps

Each step ≈ one `feature_list.json` entry (id assigned when picked up; next free is
feat-117), own branch + PR per repo rules.

1. **Sierra Job-study exporter + snapshot archive** — no repo TS changes.
   Files: new ACSIL exporter (own DLL, Windows side), `chart-data/job-study.json` sample
   checked in. Atomic write; `schemaVersion`; verified against several known chart days
   (values eyeballed against the studies on screen). Start archiving daily snapshots.
   Dependencies: none.

2. **Bundle plumbing** — `supabase/migrations/*_job_study_ref.sql` (nullable
   `raw_bundles.job_study_ref`) **and** the `unused_bundles_before` update in one migration;
   `lib/ingest/manifest.ts` (+ record shape), `lib/uploader/bundle.ts`
   (`LOCAL_FILENAMES_BY_FIELD.job_study`), fixture builders; `gekko-db` skill update.
   Deploy note in PR: Windows checkout must pull + restart the uploader; until then bundles
   simply lack the ref and the task fails closed with the right message.
   Dependencies: step 1 (filename contract).

3. **Rule ratification** — `docs/job-plan/` decision log (not model-facing): operator decides
   JBA overlap semantics (only if TS-computed), numeric thresholds (near/holding/building/
   failed-look/fresh-initiative/edge-vs-middle, exportedAt↔MGI skew tolerance), precedence
   order, and the origin definitions (last crossed boundary / last rejected excursion /
   holding, incl. which bar source owns each fact — exec volume bars vs 30-min HTF bars
   answer different questions and the in-progress last bar of each is excluded from
   acceptance windows). Each decision gets a rule ID. Evidence: archived snapshots +
   transcripts (graded), replays for sequencing.
   Dependencies: step 1 (snapshots exist). Can overlap step 2.

4. **Deterministic planner (pure)** — `lib/job-plan/`: `parseJobStudy.ts`,
   `classifyContext.ts`, `buildPlan.ts`, `types.ts`, `rules.ts` (named predicates +
   `PLANNER_REVISION`), `knowledge/schema/job-plan.schema.ts`. Tests per the Tests section.
   Dependencies: steps 1, 3.

5. **Task + persistence** — `supabase/migrations/*_job_plans.sql` (+ `gekko-db` skill);
   `trigger/jobPlanTask.ts` (`job-plan-task`, schemaTask, retry config mirroring analyze);
   `lib/job-plan/runJobPlan.ts` + `deps.ts` (`fetchBundleById`, `downloadObject`,
   `insertJobPlan` — injected, unit-testable); fresh-bundle binding by returned `bundleId`;
   error taxonomy; run metadata (status, planner revision, fingerprint, bundle wait outcome).
   No LLM, no `entry_levels`, no push.
   Dependencies: step 4.

6. **Surface** — `app/api/job-plans/run/route.ts` (mirrors `briefings/run` incl. bundle
   request with reason `job-plan`; same local-only security posture — documented), minimal
   page/card (`DESIGN.md` applies): context header (the dimensions + disagreements), play
   cards, open branches, stand-down reasons, warnings, insufficient-state rendering.
   Dependencies: step 5.

7. **Shadow evaluation** — run the planner over the accumulated snapshot archive
   (`scripts/` runner over fixtures, no task changes); operator grades context
   classifications and play cards against what Job's preps actually said on overlapping
   days; iterate thresholds via `PLANNER_REVISION` bumps. Exit criterion: operator signs off
   that states and plays match the method on a meaningful sample.
   Dependencies: steps 4–6.

8. **(Optional, later, operator opt-in)** — non-fatal LLM prose renderer strictly from the
   persisted `JobPlan` JSON (config-driven model id per repo rule; no charts, no raw market
   data, output never feeds execution/eval). Post-open branch-resolution task as a separate
   linked artifact. Deliberately out of MVP.

## Tests

- **Parser**: valid complete export; missing sections; duplicate/out-of-order targets; tick
  misalignment; future sessions; schema-version mismatch; MGI cross-check pass/fail; Sierra
  sentinel values; size-cap rejections. Fixtures from real snapshots (step 1) plus mutations.
- **Classification/plan units**: table-driven over every dimension value and transition —
  above/inside/below daily and weekly value; box edge/middle/outside; look-outside-then-
  reenter both sides; accepted initiative both sides; pivot magnet; traverse destinations;
  target-as-pause vs auto-fade; mid-box stand-down; weekly/daily conflict precedence;
  exact-boundary and tolerance behavior; multiple boxes. Positive, negative, boundary case
  per rule ID.
- **Invariants**: determinism (same input + revision ⇒ identical output); long/short
  symmetry where intended; destinations ordered in play direction; invalidation on the
  correct side of activation; mid-box context can never arm an unconditional edge play;
  confirmed initiative and a fade at the same fresh edge cannot coexist; no output price
  outside supplied geometry unless explicitly derived and labeled; missing core geometry can
  never yield `ready`.
- **Golden corpus**: archived `job-study.json` days with operator-graded expected context +
  plays; replay-derived sequencing cases only where contemporaneous data can be joined.
  Transcript-only cases stay annotations, not goldens.
- **Integration**: ingest→ref recorded; fresh-bundle request → task loads the **fulfilling**
  bundle id; missing export → non-retryable abort; retry idempotency on `run_id`;
  `briefings`/`entry_levels` untouched by a job-plan run; cleanup function excludes
  referenced bundles; UI renders ready and insufficient plans.

## Risks / edge cases

- **Cross-file snapshot coherence**: `job-study.json` and MGI/bars are read sequentially by
  the uploader and can straddle export cycles. Mitigated (skew tolerance check, atomic
  export write), not eliminated; a cycle-id across all exporters is the eventual fix if it
  bites.
- **Ingest retry hole** (`ignoreDuplicates: true`) can leave a bundle missing
  `job_study_ref`; superseded within one ~15s cycle, surfaced by the fail-closed error.
- **Cleanup select/delete race** is pre-existing; RESTRICT FK makes it loud for job_plans.
- **Deployment ordering**: migration → server manifest+uploader mapping (same PR) → DLL on
  the trading machine → Windows checkout pull + uploader restart → task PR. Task before
  uploader restart = every run fails closed (acceptable, message says why).
- **Domain invariants are assumptions until step 1 verifies them** (strict-pivot-inside-zone,
  label uniqueness, weekly `weekOf` across holiday weeks, zone-collapse-to-one-tick, JBA
  constituents exposure). The parser's strictness is calibrated to real output first.
- **Calendar/session traps**: Sunday Globex belongs to Monday's trading day; holiday-short
  weeks; contract rollover mixing geometry across contracts (parser requires one contract,
  matching the bundle's); DST.
- **Overfitting the annotator**: rules ratified from reconstructed stories rather than data —
  contained by the evidence-grading rule and shadow evaluation on out-of-sample days.
- **Scope creep into live execution**: this task is premarket planning. Holding/building/
  initiative live-detection beyond what the snapshot supports, alerting, and trade
  management are explicitly out.

## Open questions (operator)

1. Does the JBA study expose its boxes (and constituents) to cross-study reads, or must
   overlap be computed TS-side? (Determines whether the ratification item on overlap
   semantics is needed at all.)
2. Value-zone/target subgraph availability: does the Job Pivots study expose the full A/B
   ladder, or only a few rungs — and should the exporter cap the ladder (e.g. ±3 zones)?
3. Are premarket runs the only trigger (scheduled ~before RTH open), or also on-demand
   during the session like the analyze button? (Affects whether `openBranches` need an
   "already open" degradation.)
4. Ratification decisions listed in step 3 (thresholds, origin definitions, precedence) —
   these are operator calls, not engineering defaults.

## Claude / Codex review notes

- **LLM in the loop**: Claude initially proposed a thin LLM step (narrative + judgment
  fields); Codex argued for zero LLM in the production path. Resolved for Codex — the prep
  transcripts show the deliverable is a conditional ladder over levels, fully expressible
  from geometry; prose rendering is optional, later, non-authoritative.
- **Fresh-bundle handshake**: Codex found the false-freshness hole (`awaitFreshBundle`
  discards the fulfilling bundle id; any upload fulfils all requests). Verified in code;
  resolved by binding the job task to the fulfilling bundle id and tightening the error
  taxonomy, leaving analyze/eval behavior untouched.
- **Idempotency key**: Codex rejected `(bundle_id, rule_version)`; resolved to one row per
  trigger run (`run_id` unique) with `planner_revision` + a fully-specified
  `input_fingerprint` as reproducibility metadata, not identity.
- **Pipeline shape**: Codex flagged six-stage ceremony and a conflated state enum; resolved
  to three pure modules and an orthogonal context object with a separate data-quality
  status. "Confidence" dropped for explicit sufficiency flags.
- **Fixtures**: Codex showed transcript-only golden fixtures would manufacture precision the
  sources lack; resolved by re-ordering (exporter first), archiving real snapshots as the
  golden corpus, and demoting transcripts to graded qualitative evidence.
- **Cleanup/migration mechanics**: Codex correctly located the predicate in
  `unused_bundles_before` (SQL) and the uploader's module-init throw on unmapped manifest
  fields; both folded into steps 2 and 5. Claude added the Windows-checkout drift gotcha and
  the same-PR `gekko-db` skill rule, which Codex missed.
