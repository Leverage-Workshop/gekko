# Job Planning Task — Implementation Plan

Produced 2026-08-20 via `/plan-with-codex` (Claude plan + independent Codex analysis +
adversarial Codex review; disagreements resolved against the repo). Revised same day after a
**full review of all 25 prep transcripts** — the level-production procedure and the reference
inventory below are distilled from the whole corpus, not a sample — and then corrected after
a **third Codex round that independently read all 25 transcripts** and audited the
distillation against them (its counterexamples are cited inline below).

**Honest scope statement** (from that audit): this task is a *reduced, NQ-local planner in
Job's method* — it replicates his level-and-branch construction from the inputs it has. It
is not a complete replication of any given prep: several preps depend on ES leadership,
Autoplot structure, discretionary prior-session zones, and response-timing judgment that the
MVP deliberately excludes. Those exclusions are listed where they occur.

Status: **plan only — nothing implemented.**

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

## The level-production procedure (distilled from all 25 preps)

This is the core logic the planner implements — how the actual watch-levels and branches are
produced each morning. Every step is observable in the corpus; dates cite example preps.

### Reference inventory

What the preps actually name, ordered roughly by citation frequency, with sourcing status:

| Reference | Used as | Source today |
| --- | --- | --- |
| **G line = the weekly open** (operator-confirmed 2026-08-20) | The single most-load-bearing line: bid/offer pivot, acceleration gate ("below the G line, off to the races") — frequently coincides with a JBA edge. Session-template-sensitive (03-19: "I fixed the G line… my chart changed the session times") | **Already exported** — MGI `weekly.wkOpen` |
| **JBA box edges** ("top/bottom of the JBAs") + the LVN **splitting adjacent boxes** (02-13 "6840 splits these two JBAs") | Two-way-trade boundaries, traverse targets, continuation gates | Planned `job-study.json` |
| **Weekly Job Pivot + weekly target ladder** (1A/1B/2A/2B "on the weekly") | Pivot = bias/balance anchor when near; ladder rungs = continuation destinations and occasionally the active edge (08-04 "pressing the 2A", 07-23 "beeline to the 1B") | Pivot in MGI; ladder planned `job-study.json` |
| **Daily Job Pivot + daily value zone/targets** (06-15 "I want to see this pivot right here around 7565 bid" — distinct from the G line and weekly structure; the deep dive is primarily about this study) | Session bias line, magnet, hold/fail anchor. Target citations must disambiguate daily vs weekly ladders — the preps say "on the weekly" precisely because both exist | Planned `job-study.json` `dailyPivots[]`; the procedure must define which historical daily pivots stay actionable (deep dive: untested pivots remain relevant) |
| **Overnight high/low** | The universal trigger reference: "look above/below and fail" | MGI (0.00 placeholder gotcha), `overnightSession` engine fact |
| **Previous day's high/low** | Edge-of-structure trigger, esp. when coinciding with a JBA edge (03-06 "it's essentially the JBA low, but let's keep it real simple — just say previous day's low") | MGI |
| **LVN / HVN / high-volume edge on the 5-day rolling profile** (02-13 "deepest LVN on the 5-day rolling"; "primary LVN"; 06-02 "exhaustive node on top of the profile") | Entry anchors, response gauges, confluence promoters | **NOT exported at this lookback — new** (engine `lvnDetection` exists, needs a 5-day rolling VbP export) |
| **LVN on the 4-hour rolling profile** (08-04 "this LVN on the 4-hour rolling"; deep-dive 31:43 gauges JBA against it) | Short-horizon entry anchors | **NOT exported — new** (same engine, 4-hour rolling VbP export) |
| **RP** (03-06 "first magnet back into the RP"; 08-04 "walk the dog on the RP") | Intraday hold/fail line and magnet | Exported **if** "RP" = the Rip (likely transcription); operator to confirm vs the daily Job Pivot |
| **Autoplot high/low/edges** (03-17 "finds the bottom of autoplot and bids out of it like crazy") | The larger-fractal frame above JBA (deep-dive: "Job pivots are a tighter time frame" than Autoplot) | **NOT exported — new, tier-2** (separate OFL study) |
| **Previous week's high/low; previous week's value high/low** (07-07 "hanging above last week's value area low") | Zone edges and continuation destinations | pwHigh/pwLow in MGI; **pw value area NOT exported — new** |
| **Previous month's low / VAH / VAL; weekly + monthly VWAP; round numbers** (05-26 "NQ's right at 30K — expect it to act like a magnet") | Destinations and magnets | MGI (round numbers trivially derived) |
| **Overnight-profile nodes** (03-02 "a nice little exhausted node out of that [overnight tag]"; 06-18 "even in the overnight profile we have a real nice node") | Fresh evidence: where the overnight session found response | **NOT safely computable from exec bars** (volume-per-bar ≠ volume-at-price — third-round Codex finding); source from the 4-hour rolling VbP export, which spans the overnight |
| **POC / distribution center / accepted-distribution boundaries** (06-18 "rotate back into the POC of this distribution", "the bulk of this mix"; 02-13/03-16/07-10 "this distribution" as the operative container) | Rotation destination and container edges — distinct semantics from LVN/HVN edges | POC in the planned VbP exports; distribution *boundaries* need a ratified definition (not automatic) |
| **Prior-session discretionary structure**: zones of initiation, "off yesterday's activity" levels (06-10 "seek 7412 off of yesterday's activity"; 03-18 "where we initiated from, the 6787 area") | Reoffer/rebid anchors the standard MGI set does not name | **Gap** — partially recoverable as LVNs on the 4-hour rolling (initiation = fast low-volume departure), but parity is unproven; flagged for ratification |
| **Four-week rolling profile structure** (03-20 "a large tip tail on the four-week rolling") | HTF excess/tail evidence | **NOT exported** — tier-2 alongside Autoplot |

### Step 1 — assemble and cluster the reference set

Collect all references above, then **merge everything within a small tolerance into named
confluence bands**. The preps almost never quote a tick; they quote bands whose limits are
the clustered members: "the 81 to 85 area" (03-17: high-volume edge + previous day's high),
"the 49 to 51 area — weekly pivot overlaps JBA high" (06-02), "RP and bottom-of-JBA overlap
at 6637¾" (03-20), "a lot of MGI right here" (03-20). Confluence **promotes** a band — but it
is one promoter among several, not the ranking (third-round correction): lone references are
routinely primary on profile prominence ("primary LVN right here around the 7758 to 60 area —
this is where I want to see rebid", 08-07), recent defense (03-06 "we've been defending the
6771 left and right"), or higher-timeframe weight (06-17's 1A zone). Ranking inputs =
{confluence, source significance, profile prominence, recent defense, origin}. The clustering
mechanics (tolerance units, transitivity cap, band anchor, per-source weights) are a step-3
ratification item, not engineering defaults. (The banding pattern mirrors Gekko's terrain
compositor — the planner reuses the pattern, not the terrain code.)

### Step 2 — select the ACTIONABLE set by walking outward from price

The plan typically watches **a small nearest-first set per side** (usually 1–2 bands, but not
a hard cap — 03-18 arms three lower bid areas at once: "the 860 to 820 area… the weekly pivot
at 24666… and 24518 — if we auction into any of those") plus the current zone's edges:

- Inside a JBA box: the two box edges (and any splitting LVN) anchor the actionable set;
  ("play the edges", 02-13, 06-17).
- The overnight extremes are the **default trigger candidates** for look-and-fail — usually
  armed, not always (06-16 and 08-04 build plans with no overnight-extreme branch at all).
- Previous day's high/low joins the set when it sits at the structure's edge.
- **Nearest-first is gated by structural quality**: a poorly-formed near edge is skipped for
  better structure (03-20 "I don't necessarily like the bottom of this build on this 5-day
  rolling"; 07-23 refuses the nearest bid without "a fail and exhausted look").

**Distance demotes emphasis; roles change on arrival** (third-round correction of an earlier
absolute). What the corpus supports: a far pivot never *outranks* near structure for the
immediate plan, and can be absent entirely — 06-15: "we don't have any overlapping JBAs, the
other one's way down there naturally" (plan built from the session pivot, the overnight high
and the weekly 1A); 03-16 (NQ): "G line is way down here" and it drops out. But a far
reference is not destination-only: it is a destination **that becomes a decision point if
reached** — 08-04: "down here 28,882, which I'm not sure we'll get today, but if we do…
looking for bid underneath"; 06-15's G line is both the target of the downside branch and the
expected bid on arrival. The planner therefore gives every reference a **contextual role**
(`actionable-now` / `actionable-if-reached` / `destination`), not a static list membership.
"Within reach" is an engineering proxy (planner calls `computeVolatilityScale` directly on
the bundle's HTF bars; null → plain-points fallback) and its threshold is a ratification
item — the corpus does not itself rank by volatility-normalized distance.

### Step 3 — read the origin (left-to-right)

From the overnight session and prior day: what was looked at and failed (03-20 sweep-and-fail
logic), what was defended repeatedly (03-06 "we've been defending the 6771 left and right"),
where the overnight response printed an exhausted node, which references have **already
interacted** (06-17 "open to a rebid scenario if we haven't already interacted with this"),
**approach failures** — price could not even reach a reference (07-10 "we can't make any
progress to the overnight low"), and which side of the RP / G line / box edge price is
**holding right now**. All origin facts are **overnight-observed** — computed from snapshot
data with ratified windows and stamped `asOf` — never asserted live states; that keeps the
premarket/live boundary clean. This is `classifyContext`'s origin dimension; it feeds the
*primary lean*.

### Step 4 — emit branches from the play grammar

The grammar covers the **price-location outcomes at a reference** — the dominant structure of
every prep. It is *not* a closed description of everything the preps do (third-round
correction): approach-failure, response-timing, exhaustion evidence and ES conditioning also
shape branches, listed after the table.

| Condition at band | Branch | Example |
| --- | --- | --- |
| Band **holds** (bid/offer arrives at it from inside) | Traverse: target the opposite edge / next band inward, "gauge continuation" there | 06-22 "pullback into the G line for bid… press above the overnight high" |
| **Look beyond & fail** (sweep a reference, re-enter) | Join the rotation back across the zone; lean on the failed reference | 06-17 "look for a fail outside the 7581s to get on board with the rebid"; 07-07 "look below the overnight low and fail, get on board as a long" |
| **Build/hold beyond** (acceptance outside) | Continuation: conditional stage chain outward; explicit don't-counter until price is back inside | 05-26 "escape and build above the 64s — I'd need it back inside that zone before countering, otherwise get on board" |
| **Approach failure** (can't even reach the reference) | Fade near the stalled side, target back across | 07-10 "if we press down and we can't make any progress to the overnight low, I want to get long down near that area"; 03-02 "if they just cannot find any interest under there, that speaks for a push back into the weekly pivot" |
| **Mid-zone, no test** | Two-way trade declaration between the named edges; stand down in the middle | 07-10 "kind of purgatory there"; deep-dive 35:44 "nobody wants to be full size in the middle" |

Branch qualifiers the grammar alone doesn't capture (each an explicit, ratifiable field):

- **Response timing**: the same geometry re-plans if the expected response doesn't arrive
  early (06-22 "if that doesn't happen pretty early on in the session… I'm going to be
  flipping, leaning against top of that JBA"; 07-20 "in the event we don't, say in the next
  30 minutes…"). Branches may carry a response-deadline qualifier; premarket it is emitted as
  a stated condition, never evaluated.
- **Exhaustion/formation evidence** can activate or prioritize a branch (06-18's exhaustive
  node; deep-dive "it moves away, and aggressively").
- **Cross-market conditioning** (ES) — excluded from MVP, see the scope statement; on days it
  matters it is an activation *prerequisite*, not a confidence tweak (07-23 "ES will need to
  be back above the 7485 for me to counter").

Each branch carries: direction, trigger band, trigger condition, a **destination chain of
conditional stages** — often 2–4, each stage a gauge-response checkpoint where the reference
may hold, reoffer, or gate further continuation, not a flat target array (06-22 chains
overnight high → weekly pivot → 7576 build gate → 7615; 06-10 chains overnight high → 7412 →
7471; 03-19's weekly pivot is destination, expected reoffer, *and* continuation gate in one
branch) — and the don't-clause. Acceleration vocabulary ("rubber meets the road", "off to the
races", "beeline", "slippery") marks a stage as *don't-counter* **and** names the beeline
destination (07-20 "if we take that out, beeline to the 2B at 7439"; 07-23 "below that G
line, beeline to the 1B") — the two always travel together.

### Step 5 — state the primary lean first, prune the rest

The primary lean is the branch consistent with the **overnight-observed holding state,
weighted by origin** (repeated defense, what was just rejected, formation timing — 06-17
conditions a rebid on being "above the RP when that formed"); every other branch stays
conditional. **Branch pruning is part of the procedure**: the preps present a few selected
scenarios, never every band × condition combination — the planner emits only branches
grounded in an observed origin fact or an explicitly watched band, and the precedence table
caps the emitted set. Output shape = one lean + the conditional ladder (see the 08-11 example
in Goal). Zero prose beyond that.

**Known structural gap — cross-market lead:** the preps plan ES first and condition NQ on it
(08-04 "if ES bids from the 48 range, I'll look for NQ at the 29,200 LVN"; 07-20 "even if ES
fails at the overnight high I'd expect NQ to catch bid"), and on some days ES state is an
**activation prerequisite** for an NQ branch (07-23). Gekko is NQ-only, so the MVP loses this
dimension — that is a real reduction in fidelity on those days, per the scope statement, not
a minor confidence modifier. An ES feed is a possible later input, not MVP scope.

**JBA boxes are provisional premarket:** the preps expect the boxes to *reform/expand at the
open* (06-16 "once this JBA forms, I want to see 7615 bid"; 06-17; 03-06 "we can probably
expect them to expand a little here at the open"). Box edges are therefore flagged
provisional and never quoted as a tick. The transcripts give no expansion formula — Job
anticipates specific boundaries from visible underlying structure (03-19 "I do expect it to
expand… right around 6640 to 45") — so any "expansion allowance" is a **UI uncertainty band
only** and never participates in deterministic triggers; a trigger fires on the exported box
edge or not at all.

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

   The corpus review adds these companion exports (same exporter or siblings, per the
   reference inventory above):
   - a **5-day rolling** and a **4-hour rolling** volume profile in the existing `.vbp.md`
     export format, so `parseProfile` + `lvnDetection` produce the "primary/deepest LVN"
     and high-volume-edge anchors unchanged;
   - **previous week's value area** (pwVAH/pwVAL) alongside the existing pwHigh/pwLow;
   - the daily "RP" as a named level **only if** it turns out not to be the Rip.
   The G line needs nothing: it is the weekly open, already exported as MGI `weekly.wkOpen`.
   Autoplot edges are tier-2: valuable for the top-down frame, separate study, not MVP.

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
     Plus the two outputs the level-production procedure defines: the clustered **confluence
     bands** (step 1) and the **role-assigned reference set** (step 2 — `actionable-now` /
     `actionable-if-reached` / `destination`; far structure demotes in emphasis but keeps its
     on-arrival role). Origin facts are overnight-observed with `asOf` stamps — the module
     never asserts live states.
     Every dimension carries machine-readable evidence and an `asOf` scope
     (overnight-observed vs RTH-conditional). Data-quality status is a **separate field**,
     never a pseudo-state. Disagreements between weekly/JBA/daily reads are exposed, never
     collapsed into a single "bias".
   - `buildPlan.ts` — play generation + explicit precedence table → `JobPlan`, implementing
     steps 4–5 of the level-production procedure: branches from the five-condition grammar
     (hold-traverse / look-and-fail / build-beyond-continuation / approach-failure /
     mid-zone two-way) **pruned to those grounded in an observed origin fact or a watched
     band** — never the full band × condition product. Each branch: stance (rebid/reoffer/
     continuation/stand-down), reference band (never a fabricated tick), activation
     evidence, invalidation, a **destination chain of conditional stages** (each stage a
     gauge-response checkpoint that may hold, reoffer, or gate continuation — a small graph,
     not a flat target array), optional response-deadline and evidence qualifiers, an
     explicit "don't", and the rule IDs that fired. Open-location contingencies are **not a
     second schema**: each branch carries an `appliesWhenOpen` applicability (above/inside/
     at-pivot/below/far-outside value), so the RTH-open dimension conditions branch
     selection instead of duplicating the plan tree. The primary lean is the branch matching
     the overnight-observed holding state weighted by origin. Precedence: invalid/stale input → no
     plan; mid-box stand-down beats weak directional context; confirmed initiative beats
     responsive fades; failed-look + re-entry enables traversal; weekly context re-orders
     priority but never manufactures an entry. The persisted plan is **immutable**; a
     post-open "resolution" is a future, separate, linked artifact. No synthesized
     "confidence" field — explicit sufficiency flags only.

   Rules are named pure predicates with stable rule IDs and a single exported
   `PLANNER_REVISION`; no runtime doctrine markdown, no generic rule-catalog abstraction.
   Human-readable rule docs, if wanted, are generated from code/tests.

5. **Own schema + own table.** `knowledge/schema/job-plan.schema.ts` (`JobPlan`: meta,
   geometry refs, context, plays[] — each with staged destinations, qualifiers and
   `appliesWhenOpen` — standDownReasons[], warnings[]).
   `job_plans`: `id`, `bundle_id` FK **ON DELETE RESTRICT** + index (audit trail; RESTRICT
   turns the pre-existing cleanup select/delete race into a loud failure instead of silent
   loss), `trading_day date`, `trigger_reason`, `status` (`ready|insufficient`) with a CHECK
   that `ready` ⇒ `plan` non-null, `planner_revision`, `input_fingerprint` (sha256 over the
   exact downloaded bytes the run consumed + `PLANNER_REVISION`; per-source hashes stored in
   the plan meta so a later Storage overwrite is detectable. This makes reproducibility
   *auditable*, not guaranteed — behavior also depends on code discipline around
   `PLANNER_REVISION` bumps),
   `run_id` **unique** (identity = one row per trigger.dev run; retries upsert their own
   row, distinct operator presses are distinct rows — this replaces the rejected
   `(bundle_id, rule_version)` key). Write contract: the row is inserted only **after**
   computation completes; the trigger.dev run id is stable across attempt retries; an
   upsert may replace a prior attempt's row wholesale except that an `insufficient` result
   never overwrites a persisted `ready` one; `created_at` is the persisting attempt's time.
   Remaining columns: `plan jsonb`, `warnings jsonb`, `created_at`. RLS
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
   checked in. Scope per the reference inventory: pivots/values/targets/boxes (plus RP if
   distinct from the Rip); sibling `.vbp.md` exports for the **5-day rolling** and
   **4-hour rolling** profiles; **pwVAH/pwVAL** added wherever pwHigh/pwLow are exported
   today. (The G line is the weekly open — already in MGI, nothing to export.) Atomic
   write; `schemaVersion`; verified against several known chart days (values eyeballed
   against the studies on screen). **Snapshot archive spec** (third-round finding — the
   evidence strategy depends on it): one immutable folder per trading day on the Windows
   side, containing the FULL export cycle (`job-study.json` + MGI + exec/HTF CSVs + all
   `.vbp.md` profiles) captured once premarket, keyed `YYYY-MM-DD`, never overwritten;
   operator labels expected outcomes when a day is used for ratification; a held-out subset
   is reserved for out-of-sample shadow evaluation. Archiving only `job-study.json` would
   not support origin, node-selection, or coherence testing.
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
   failed-look/fresh-initiative/edge-vs-middle, exportedAt↔MGI skew tolerance, response
   deadlines), precedence order, the **confluence-clustering mechanics** (tolerance units,
   transitivity cap, band anchor, per-source significance weights), and the origin
   definitions (last crossed boundary / last rejected excursion / approach failure /
   already-interacted / holding, incl. which bar source owns each fact — exec volume bars vs
   30-min HTF bars answer different questions and the in-progress last bar of each is
   excluded from acceptance windows). **Blocking precondition: resolve the RP identity**
   (question 3) — clustering, origin and precedence cannot be ratified while a major
   recurring line is unidentified. Also in scope: **LVN-parity validation** — check on
   archived days that `lvnDetection` over the 5-day/4-hour rolling exports selects the same
   "primary/deepest LVN" and high-volume edges the preps name; parity is an assumption until
   measured, and detector tuning is a ratification outcome, not a code default. Each
   decision gets a rule ID. Evidence: archived snapshots + transcripts (graded), replays for
   sequencing.
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
   cards with staged destinations and open-applicability, stand-down reasons, warnings,
   insufficient-state rendering, **and failed-run surfacing**: a non-retryable abort writes
   no `job_plans` row, so the card must read the trigger.dev run outcome (the existing
   `use-triggered-run` pattern) and show the remediation message — otherwise an aborted run
   looks like "nothing happened".
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
- **LVN semantic parity**: running the existing detector over new 5-day/4-hour exports does
  not guarantee it selects the levels Job calls "primary/deepest LVN" or the same
  high-volume edges — validated in step 3, never assumed.
- **Prior-session discretionary structure** ("off yesterday's activity" levels, zones of
  initiation, distribution boundaries) may not be recoverable from the planned inputs at
  all; where it isn't, the plan on those days is knowingly reduced (scope statement).
- **Scope creep into live execution**: this task is premarket planning. Holding/building/
  initiative live-detection beyond what the snapshot supports, alerting, and trade
  management are explicitly out.

## Open questions (operator)

1. Does the JBA study expose its boxes (and constituents) to cross-study reads, or must
   overlap be computed TS-side? (Determines whether the ratification item on overlap
   semantics is needed at all.)
2. Value-zone/target subgraph availability: does the Job Pivots study expose the full A/B
   ladder, or only a few rungs — and should the exporter cap the ladder (e.g. ±3 zones)?
3. **Is the preps' "RP" the Rip** (already exported) or the daily Job Pivot? The transcripts
   are ambiguous ("first magnet back into the RP", "walk the dog on the RP") and the line is
   operational in many preps (08-04 "the moment we begin to auction and build below the RP,
   something has changed"). **Blocking for step 3** — ratification cannot proceed around an
   unidentified major reference.
4. Autoplot: is exporting its edges worth a tier-2 follow-up, or is the weekly-pivot frame
   enough for the top-down pass?
5. Cross-market lead: accept the NQ-only loss of the ES-leads-NQ conditioning for the MVP
   (recommended), or plan an ES feed?
6. Are premarket runs the only trigger (scheduled ~before RTH open), or also on-demand
   during the session like the analyze button? (Affects whether `openBranches` need an
   "already open" degradation.)
7. Ratification decisions listed in step 3 (thresholds, origin definitions, precedence) —
   these are operator calls, not engineering defaults. The corpus already pins the shape of
   most of them (band tolerance, "within reach" distance, expansion allowance on premarket
   box edges); the numbers remain yours.

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
- **Third round — transcript audit** (Codex independently read all 25 preps + the deep dive
  against the distilled procedure): confirmed the G-line-=-weekly-open identification is
  corpus-consistent with no contradicting passage, and the weekly-ladder-as-destination
  claim. Corrected, with quoted counterexamples, five overclaims: the grammar was not closed
  (approach-failure added as a fifth condition; response-timing/exhaustion/ES became explicit
  qualifiers), "distance demotes, never promotes" was too absolute (roles change on arrival —
  `actionable-if-reached` added), destination chains are conditional stage graphs rather than
  1–2 flat rungs, confluence count is not the ranking, and "nearest overnight extreme always
  armed" / "1–2 bands per side" were softened to defaults. It also surfaced the
  overnight-nodes-from-exec-bars error (volume bars carry no volume-at-price; sourced from
  the 4-hour rolling export instead), the missing daily-pivot/POC/initiation-zone inventory
  rows, the openBranches schema duplication (merged into per-branch `appliesWhenOpen`), the
  branch-cardinality pruning rule, the run_id write contract, the snapshot-archive spec, and
  failed-run surfacing. All folded in; the honest-scope statement at the top is its "reduced
  Job-inspired planner" conclusion, adopted verbatim in spirit.
