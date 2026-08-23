# Job Planning Task — Implementation Plan

Produced 2026-08-20 via `/plan-with-codex` (Claude plan + independent Codex analysis +
adversarial Codex review; disagreements resolved against the repo). Revised same day after a
**full review of all 25 prep transcripts** — the level-production procedure and the reference
inventory below are distilled from the whole corpus, not a sample — and then corrected after
a **third Codex round that independently read all 25 transcripts** and audited the
distillation against them (its counterexamples are cited inline below). **Revised
2026-08-22** after the operator answered every open question and ratified the planner's
numeric/definitional defaults — see "Operator decisions" and "Ratified rules" at the end;
the body below is updated to match (on-demand in-session runs, single instrument, JBA boxes
as chart drawings, RP = the Rip, Autoplot in scope). **Revised again 2026-08-22 (later)**:
profile LVN/HVN identification moves from the code-owned detector to an **LLM vision read
of purpose-rendered profile images** — see "Profile node identification (vision)" and the
corpus in `docs/jba-research/lvn-corpus.md`.

**Honest scope statement** (from that audit): this task is a *reduced, NQ-local planner in
Job's method* — it replicates his level-and-branch construction from the inputs it has. It
is not a complete replication of any given prep: several preps depend on ES leadership
(excluded **permanently** — operator decision 2026-08-22: the planner analyzes one instrument
and the process is instrument-agnostic), discretionary prior-session zones, and
response-timing judgment (emitted as a stated deadline, never evaluated). Those exclusions
are listed where they occur. Autoplot structure is *in* scope (operator: "I don't think it
would hurt to include it").

Status: **plan only — nothing implemented.**

## Goal

A **standalone analysis task** that replicates Job's (OrderFlow Labs) **planning**
process — run **on demand** (no schedule), usually shortly **after** the RTH open, from the
dashboard via a header **version picker** (`Gekko` | `Job`): given the Job Pivot / Weekly Job
Pivot / JBA study geometry and where price is coming from, produce the same kind of plan his
morning preps produce — one primary lean plus
a short conditional if/then ladder keyed to reference levels ("stay inside → balance; below
yesterday's low → seek the 7720s; rebid 7980–82 into the LVN → press the 8004s; build above →
attack prior week high; look-below-and-fail → rotate back across").

Operator constraints:

- Standalone task, shaped like the analyze-task (bundle → engine → persist → surface), but
  **zero carry-over of the existing prompt doctrine**.
- **On-demand only**, like the analyze button — no premarket schedule. Because the operator
  will mostly run it after the open, the **daily Job Pivot is fresh at run time and is a
  prominent level**, and origin facts include the live session, not just the overnight.
- **One instrument.** No ES-leads-NQ conditioning, ever; the MGI export gains the
  **instrument symbol** so per-symbol parameters (band tolerances) resolve in code.
- Reuses the existing infrastructure (bundle ingestion, Supabase, trigger.dev, uploader).
- New Sierra Chart exports are obtainable.
- **Lean, procedural/mechanical above all.** The prior attempt at prose rule documents
  (`docs/jba-research/jba-analysis-process.md`, `execution-process.md`) is disregarded; the
  raw transcripts/replays/deep-dive remain valid evidence.

The core design consequence, agreed by both reviewers: **the planning logic contains no
LLM call.** The plan is a deterministic function of exported study geometry, recent price
path, and one **perception input** — the profile node set. Job's method — location vs value,
box edges, failed looks, don't-fade-fresh-initiative, stand down in the middle — is a small
state classification plus a play table, and an LLM in *that* loop adds nondeterminism,
hallucinated levels, and exactly the doctrine-drift failure mode this task exists to escape.
The one LLM use (operator decision 2026-08-22, see "Profile node identification (vision)")
is upstream of the planner and is pure perception: reading LVNs / high-volume edges off a
rendered volume profile, the way Job reads them off his screen. Its output is validated
against the profile's own price grid, persisted as planner **input**, and covered by the
reproducibility fingerprint — the planner itself stays a pure function. An optional prose
renderer (strictly from the finished plan JSON, non-fatal, operator opt-in) can come later.

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
                                                      ┐
5-day / 4-hour rolling .vbp.md exports                │
  → renderProfile (data → SVG → PNG, pure)             │ profile node identification
  → N parallel vision calls per image (LLM)            │ (perception only; see section)
  → snap / validate / consensus → ProfileNodes (pure)  ┘
  → context classification (orthogonal dimensions) (pure)
  → play generation + precedence → JobPlan doc     (pure)
  → job-plan-task (trigger.dev)                    (I/O shell; the vision calls are its
                                                    only LLM use)
  → job_plans table (own persistence, RLS; ProfileNodes + image hashes persisted as input)
  → minimal dashboard surface (mechanical rendering; rendered profiles + nodes shown for grading)
```

## The level-production procedure (distilled from all 25 preps)

This is the core logic the planner implements — how the actual watch-levels and branches are
produced each morning. Every step is observable in the corpus; dates cite example preps.

### Reference inventory

What the preps actually name, ordered roughly by citation frequency, with sourcing status:

| Reference | Used as | Source today |
| --- | --- | --- |
| **G line = the weekly open** (operator-confirmed 2026-08-20) | The single most-load-bearing line: bid/offer pivot, acceleration gate ("below the G line, off to the races") — frequently coincides with a JBA edge. Session-template-sensitive (03-19: "I fixed the G line… my chart changed the session times") | **Already exported** — MGI `weekly.wkOpen` |
| **JBA box edges** ("top/bottom of the JBAs") + the LVN **splitting adjacent boxes** (02-13 "6840 splits these two JBAs") | Two-way-trade boundaries, traverse targets, continuation gates | Planned `job-study.json` — the boxes are **rectangles drawn on the chart** (operator, 2026-08-22): the exporter enumerates chart drawings and emits each rectangle's anchor prices; **no overlap/constituent computation anywhere** |
| **Weekly Job Pivot + weekly target ladder** (1A/1B/2A/2B "on the weekly") | Pivot = bias/balance anchor when near; ladder rungs = continuation **destinations only** (08-04 "pressing the 2A", 07-23 "beeline to the 1B") — never trigger anchors, ranked last (R2) | Pivot in MGI; ladder planned `job-study.json` (study draws at least ±3 rungs, possibly ±7 — operator confirms when the exporter is built; export whatever the study exposes) |
| **Daily Job Pivot + daily value zone/targets** (06-15 "I want to see this pivot right here around 7565 bid" — distinct from the G line and weekly structure; the deep dive is primarily about this study) | Session bias line, magnet, hold/fail anchor — **prominent at run time** because runs happen after the open and the pivot is fresh. Target citations must disambiguate daily vs weekly ladders — the preps say "on the weekly" precisely because both exist | Planned `job-study.json` `dailyPivots[]`; the procedure must define which historical daily pivots stay actionable (deep dive: untested pivots remain relevant) |
| **Overnight high/low** | The universal trigger reference: "look above/below and fail" | MGI (0.00 placeholder gotcha), `overnightSession` engine fact |
| **Previous day's high/low** | Edge-of-structure trigger, esp. when coinciding with a JBA edge (03-06 "it's essentially the JBA low, but let's keep it real simple — just say previous day's low") | MGI |
| **LVN / HVN / high-volume edge on the 5-day rolling profile** (02-13 "deepest LVN on the 5-day rolling"; "primary LVN"; 06-02 "exhaustive node on top of the profile") | Entry anchors, response gauges, confluence promoters | **NOT exported at this lookback — new** 5-day rolling `.vbp.md` export; nodes identified by the **vision read** (see "Profile node identification"), not `lvnDetection` |
| **LVN on the 4-hour rolling profile** (08-04 "this LVN on the 4-hour rolling"; deep-dive 31:43 gauges JBA against it) | Short-horizon entry anchors | **NOT exported — new** 4-hour rolling `.vbp.md` export; same vision read |
| **RP = the Rip** (operator-confirmed 2026-08-22; 03-06 "first magnet back into the RP"; 08-04 "walk the dog on the RP") | Intraday hold/fail line and magnet | **Already exported** (MGI Rip) |
| **Autoplot high/low** (03-17 "finds the bottom of autoplot and bids out of it like crazy") | The larger-fractal frame above JBA (deep-dive: "Job pivots are a tighter time frame" than Autoplot); operator: it is the high/low of the **traditional balance-area type** | **NOT exported — new, in MVP** (operator: include it; how to read it from the OFL study is TBD at exporter time) |
| **Previous week's high/low; previous week's value high/low** (07-07 "hanging above last week's value area low") | Zone edges and continuation destinations | pwHigh/pwLow in MGI; **pw value area NOT exported — new** |
| **Previous month's low / VAH / VAL; weekly + monthly VWAP; round numbers** (05-26 "NQ's right at 30K — expect it to act like a magnet") | Destinations and magnets | MGI (round numbers trivially derived) |
| **Overnight-profile nodes** (03-02 "a nice little exhausted node out of that [overnight tag]"; 06-18 "even in the overnight profile we have a real nice node") | Fresh evidence: where the overnight session found response | **NOT safely computable from exec bars** (volume-per-bar ≠ volume-at-price — third-round Codex finding); the vision read of the 4-hour rolling export (which spans the overnight) reports exhaustive nodes at the profile's extremes |
| **POC / distribution center / accepted-distribution boundaries** (06-18 "rotate back into the POC of this distribution", "the bulk of this mix"; 02-13/03-16/07-10 "this distribution" as the operative container) | Rotation destination and container edges — distinct semantics from LVN/HVN edges | POC in the planned VbP exports; distribution *boundaries* = the high-volume edges the vision read returns (`hvn-edge`), subject to the same validation |
| **Prior-session discretionary structure**: zones of initiation, "off yesterday's activity" levels (06-10 "seek 7412 off of yesterday's activity"; 03-18 "where we initiated from, the 6787 area") | Reoffer/rebid anchors the standard MGI set does not name | **Gap** — partially recoverable as departure-scar LVNs on the 4-hour rolling (the corpus's "zone of initiation" = the LVN an aggressive departure leaves, `lvn-corpus.md` B3); the vision prompt asks for exactly that shape, parity measured on the golden set |
| **Four-week rolling profile structure** (03-20 "a large tip tail on the four-week rolling") | HTF excess/tail evidence | **NOT exported** — tier-2 |

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
{confluence, source significance, profile prominence, recent defense, origin}. Profile
prominence is supplied by the vision read (`prominence` rank + `primary` flag per profile —
Job's "deepest meaning primary"), never recomputed from volume. The clustering
mechanics are **ratified** (R1/R1b/R2 below): plain points, **per instrument** — the quoted
bands above are ES quotes (Job preps ES first, then NQ, where the same bands read "the
660s"), so tolerances key off the instrument symbol in the MGI export. (The banding pattern
mirrors Gekko's terrain compositor — the planner reuses the pattern, not the terrain code.)

### Step 2 — select the ACTIONABLE set by walking outward from price

The plan typically watches **a small nearest-first set per side** (ratified R12: at most 2
armed bands per side plus the enclosing zone's edges, max 4 emitted branches — 03-18's three
lower bid areas "the 860 to 820 area… the weekly pivot at 24666… and 24518" is the
acknowledged outlier) plus the current zone's edges:

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
the bundle's HTF bars; null → plain-points fallback), ratified at **≤ 1.0 session sigma**
(R4) — the corpus does not itself rank by volatility-normalized distance.

### Step 3 — read the origin (left-to-right)

From the overnight session and prior day: what was looked at and failed (03-20 sweep-and-fail
logic), what was defended repeatedly (03-06 "we've been defending the 6771 left and right"),
where the overnight response printed an exhausted node, which references have **already
interacted** (06-17 "open to a rebid scenario if we haven't already interacted with this"),
**approach failures** — price could not even reach a reference (07-10 "we can't make any
progress to the overnight low"), and which side of the RP / G line / box edge price is
**holding right now**. All origin facts are **snapshot-observed** — computed from the
bundle's exec volume bars (timestamps → wall-clock windows; the in-progress bar never counts)
with the ratified definitions R5–R9 and stamped `asOf` — never asserted live states. Because
runs are on demand and usually after the open, the observation window covers the overnight
**and the session so far**; a run taken before the open simply has no session facts yet. This
is `classifyContext`'s origin dimension; it feeds the *primary lean*.

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
  30 minutes…"). Branches carry a **30-minute response deadline** from arrival at the
  trigger band, **emitted as a stated condition and never evaluated** (R11 — operator judges
  timing).
- **Exhaustion/formation evidence** can activate or prioritize a branch (06-18's exhaustive
  node; deep-dive "it moves away, and aggressively").
- **Cross-market conditioning** (ES) — excluded **permanently** (operator decision
  2026-08-22: one instrument, instrument-agnostic process); noted here only because on
  days it matters in the preps it is an activation *prerequisite*, not a confidence tweak
  (07-23 "ES will need to be back above the 7485 for me to counter") — the planner on
  those days is knowingly reduced.

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

The primary lean is the branch consistent with the **snapshot-observed holding state,
weighted by origin** (precedence of origin facts ratified in R12) (repeated defense, what was just rejected, formation timing — 06-17
conditions a rebid on being "above the RP when that formed"); every other branch stays
conditional. **Branch pruning is part of the procedure**: the preps present a few selected
scenarios, never every band × condition combination — the planner emits only branches
grounded in an observed origin fact or an explicitly watched band, and the precedence table
caps the emitted set. Output shape = one lean + the conditional ladder (see the 08-11 example
in Goal). Zero prose beyond that.

**Known structural gap — cross-market lead (permanent):** the preps plan ES first and
condition NQ on it (08-04 "if ES bids from the 48 range, I'll look for NQ at the 29,200 LVN";
07-20 "even if ES fails at the overnight high I'd expect NQ to catch bid"), and on some days
ES state is an **activation prerequisite** for an NQ branch (07-23). The planner analyzes
one instrument by operator decision — a real reduction in fidelity on those days, per the
scope statement. No ES feed is planned.

**JBA boxes are provisional before the open:** the preps expect the boxes to *reform/expand
at the open* (06-16 "once this JBA forms, I want to see 7615 bid"; 06-17; 03-06 "we can
probably expect them to expand a little here at the open"). Since runs normally happen after
the open the exported rectangles are usually already reformed; a run whose `exportedAt`
precedes the RTH open flags box edges provisional. The transcripts give no expansion formula
— Job anticipates specific boundaries from visible underlying structure (03-19 "I do expect
it to expand… right around 6640 to 45") — so any "expansion allowance" is a **UI uncertainty
band only** and never participates in deterministic triggers; a trigger fires on the exported
box edge or not at all.

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
   - `balanceAreas[]`: low, high (+ drawing id, anchor times) — **read from the chart
     drawings**: the JBA boxes are rectangles drawn on the chart, so the exporter enumerates
     chart drawings (`sc.GetChartDrawing` / user-drawn enumeration) and emits each
     rectangle's anchor prices. No overlap or constituent computation, Sierra- or TS-side.
   - `autoplot`: high, low — the traditional balance-area extremes from the OFL Autoplot
     study; read mechanism confirmed at exporter time.
   A TS reconstruction of the studies remains available later as an audit check, never the
   source.

   The corpus review adds these companion exports (same exporter or siblings, per the
   reference inventory above):
   - a **5-day rolling** and a **4-hour rolling** volume profile in the existing `.vbp.md`
     export format (`parseVbpProfile` reads them unchanged); the "primary/deepest LVN" and
     high-volume-edge anchors come from the **vision read** of their rendered images, not
     from `lvnDetection` (see "Profile node identification (vision)");
   - **previous week's value area** (pwVAH/pwVAL) alongside the existing pwHigh/pwLow;
   - the **instrument symbol** in the MGI export (per-symbol band tolerances, R1b).
   The G line needs nothing: it is the weekly open, already exported as MGI `weekly.wkOpen`.
   The RP is the Rip — already exported, nothing new. Autoplot high/low ship with the MVP.

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
     between any two of `job-study.json`/MGI/bar exports' `exportedAt` **> 5 minutes**, or
     `tradingDay` ≠ the bundle's session — R13) → **persist** `status='insufficient'` with
     reasons. No LLM ever "fills in" missing levels.

4. **Three pure modules, not six** (review finding: pipeline ceremony). One function per
   semantic boundary:
   - `parseJobStudy.ts` — strict parse + normalize + validate: tick alignment,
     `valueLow ≤ pivot ≤ valueHigh` (exact invariants confirmed against real exports first),
     monotonic de-duplicated targets, no future sessions, MGI Job Pivot cross-check within
     tick tolerance, size caps (bytes, array lengths) so a broken exporter can't DoS the task.
   - `classifyContext.ts` — an **orthogonal dimensions object, not one enum**: price vs
     weekly value (below/lower-half/at-pivot/upper-half/above), vs JBA box(es)
     (inside-middle/at-lower-edge/at-upper-edge/outside-near/outside-extended, per box), vs
     current daily value zone, and **origin** (failed look, building/accepted, approach
     failure, holding side, already-interacted — R5–R9) from the session-anchored exec bars
     measured in wall-clock minutes, HTF bars only for the volatility scale.
     Plus the two outputs the level-production procedure defines: the clustered **confluence
     bands** (step 1) and the **role-assigned reference set** (step 2 — `actionable-now` /
     `actionable-if-reached` / `destination`; far structure demotes in emphasis but keeps its
     on-arrival role). Origin facts are snapshot-observed with `asOf` stamps — the module
     never asserts live states.
     Every dimension carries machine-readable evidence and an `asOf` scope
     (overnight vs session-so-far). Data-quality status is a **separate field**,
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
     explicit "don't", and the rule IDs that fired. Runs are on demand and normally
     in-session, so the price location at run time is known and branch selection keys off
     it directly — there is no `appliesWhenOpen` applicability field and no open-location
     contingency tree (a pre-open run is the same planner with no session facts). The
     primary lean is the branch matching the snapshot-observed holding state weighted by
     origin (R12). Precedence: invalid/stale input → no
     plan; mid-box stand-down beats weak directional context; confirmed initiative beats
     responsive fades; failed-look + re-entry enables traversal; weekly context re-orders
     priority but never manufactures an entry. The persisted plan is **immutable**; a
     post-open "resolution" is a future, separate, linked artifact. No synthesized
     "confidence" field — explicit sufficiency flags only.

   Rules are named pure predicates with stable rule IDs and a single exported
   `PLANNER_REVISION`; no runtime doctrine markdown, no generic rule-catalog abstraction.
   Human-readable rule docs, if wanted, are generated from code/tests.

5. **Own schema + own table.** `knowledge/schema/job-plan.schema.ts` (`JobPlan`: meta,
   geometry refs, context, plays[] — each with staged destinations and qualifiers —
   standDownReasons[], warnings[]).
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
   Remaining columns: `plan jsonb`, `warnings jsonb`, `profile_nodes jsonb` (the vision
   read — consensus + raw samples + model/effort + `VISION_PROMPT_REVISION` + image hashes;
   null when no profile was read), `created_at`. The fingerprint also covers the rendered
   image hashes, `VISION_PROMPT_REVISION`, and the vision model id. RLS
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

## Profile node identification (vision)

**Decision (operator, 2026-08-22):** the planner's LVN / high-volume-edge references come
from an **LLM vision read of purpose-rendered profile images**, not from the code-owned
`lib/engine/lvnDetection.ts`. Rationale: the detector's measured ceiling is holdout LVN F1
≈ 0.44 at ±10 pts on the fixture set (`lvnDetection.ts:106-109`, "the architecture's #1
engine risk"); a vision model reading the profile the way Job reads his screen is, today,
better than any detector we will write; and since the planner has no other LLM spend, the
budget goes here. **Scope boundary:** this is the Job planner only — the Gekko briefing
pipeline's `lvnDetection` / `terrainZones` / `engineAnchorPrices` are untouched.

Ground truth, in priority order: (1) **the prep corpus** — `docs/jba-research/lvn-corpus.md`
(110 worked examples; section B is the criteria, section D the negatives), turned into a
golden set by Sierra **replay exports** of the profiles as of each prep (operator: feasible);
(2) `chart-data/lvn-fixtures/` (8 profiles, 34 LVN / 18 HVN operator labels under Gekko-era
criteria) as the backup regression floor.

### The perception contract

- **Input per call**: ONE rendered profile image (or one tile of it), plus text: instrument,
  profile name/lookback, price range, row step, POC/VAH/VAL, current price. **No structure**
  (no JBA boxes, MGI, pivots) — relating nodes to structure is planner math (R1/R2), and
  showing the boxes would invite the model to find LVNs where the boxes suggest. The call is
  perception only.
- **Output** `ProfileNodesRead` (Zod, flat — OpenAI rejects root unions):
  `nodes[]` ≤ 8 of `{ kind: 'lvn' | 'hvn-edge' | 'hvn-core' | 'exhaustive-node' | 'taper-tail',
  priceLow, priceHigh (a band; equal for a point), prominence 1–5 (1 = primary), primary
  (exactly one `lvn` per profile), position: 'top' | 'upper' | 'mid' | 'lower' | 'bottom',
  shape: 'valley' | 'shelf-edge' | 'wide-gap' | 'notch', rationale ≤ 20 words }`;
  `thinZones[]` ≤ 3 `{ low, high }` (the "wide LVN" / "kennel" spans, corpus B6);
  `profileShape: 'bell' | 'double' | 'multi' | 'trend-up' | 'trend-down' | 'thin'`;
  `unfinished: boolean` (no taper / exhaustive node at an extreme — corpus #69).
- **Criteria in the prompt** — distilled from `lvn-corpus.md` B1–B12 and D, each with one
  quoted example: deepest = primary, ranked **within this profile**; a notable LVN is a
  departure scar (thin shelf immediately outside a fat node's edge — the `hvn-edge` and the
  `lvn` are adjacent and both reported), not a dip inside a node; wide LVNs reported as a
  band, narrow ones as 2–4 pt bands; tiny "sticks" grouped into one mass with LVNs at its
  boundaries; exhaustive-node anatomy at the extremes (spike, small build, aggressive
  departure; taper tail); high-volume edges = distribution boundaries, reported on both
  sides of each fat node; `hvn-core` only for the POC-class peak of each distribution.
  Negatives: don't pad counts; don't label a trough inside the value-area bulk as primary;
  don't mark every minor local minimum.
- **Few-shot**: 2–3 golden-set images with their expected JSON, fixed (`VISION_PROMPT_REVISION`
  bumps when they change); the rest of the golden set is test-only and never tuned on.

### Rendering (pure, deterministic)

- `lib/job-plan/profile-vision/renderProfile.ts`: `VbpProfile` → SVG string (pure function
  of rows + meta + options); `rasterize.ts`: SVG → PNG via `@resvg/resvg-js` (prebuilt
  native binary — must be `external` in the trigger.dev build; font file shipped via
  `additionalFiles`). Fallback if resvg won't load in the trigger worker: `@napi-rs/canvas`.
  Verified against the trigger MCP docs at implementation time, not assumed.
- **Layout mirrors the screen Job and the operator read**: horizontal bars extending left
  from a right-hand price axis (the `lvn-fixtures/*.image.png` screenshots are the
  reference look), portrait ≈ 900 × 1400 px, long edge ≤ 1568 px so no provider downscales
  the labels.
- **Rows**: aggregate bins to ≤ ~700 rows (a 5-day NQ export at 1-pt bins → 2-pt rows),
  2 px per row; the effective `step` is passed in the text so the model knows the grid.
- **Price axis**: major labels every 20 pts NQ / 5 pts ES (per instrument, same ratio as R1),
  minor ticks at half, faint gridlines at majors, ≥ 14 px font. Label density is the lever
  for price accuracy — the model reads prices off the axis, we snap the rest.
- **Markers**: POC (solid, labeled), VAH/VAL (dashed, labeled), value area lightly shaded,
  current price (labeled). Nothing else on the image.
- **Bake-off variables** (implementation step 4): light vs dark theme; a thin smoothed
  envelope (≈ 9-row MA) overlaid on the raw bars vs raw only; single image vs two
  overlapping tiles (≥ 10 % overlap, own axis each) when rows exceed a threshold; bars
  right-anchored (Sierra) vs left-anchored.
- `sha256(svg)` is part of the run fingerprint.

### Calls, parallelism, consensus

- Per run: profiles **P = {5-day rolling, 4-hour rolling}** (extensible to the existing
  rotation / balance-area exports if the operator wants them), **S** samples per image
  (`config.profile_vision_samples`, default 3), **T** tiles (1–2). All |P| × S × T calls
  run concurrently via `Promise.all` under a small concurrency cap (6) with a per-call
  timeout (60 s), inside the job-plan task — comfortably within `maxDuration: 300`. No
  child tasks; a run is one trigger.dev run.
- **Consensus** (`consensus.ts`, pure): snap every price to the profile grid; drop anything
  outside the profile's range; cluster reads across samples within the **R1 merge
  tolerance** (ES 5 / NQ 20); keep clusters with agreement ≥ ⌈S/2⌉; price = median band,
  prominence = best, `primary` and `kind` by majority; record `agreement: k/S` per node.
  Tiles are de-duplicated in the same pass. Output `ProfileNodes` keyed by profile.
- **Model / effort**: new `config` columns `profile_vision_model_id`,
  `profile_vision_model_effort`, `profile_vision_samples` (+ a fallback tier in
  `fetchConfigRow`, + `/settings` exposure per the feat-055 pattern). Never hardcoded; the
  bake-off picks the default. The candidate list comes from the **OpenRouter MCP server**
  (`list-models` filtered to image-input models) at bench time, not from memory.
  Flash-tier models are excluded (they game validation floors —
  `docs/briefing-audit-2026-07-25.md`).
- **Cost**: ≈ 6–12 calls × ~8k input tokens (image + few-shot images + criteria) — small.
  Usage/cost surface to run metadata like the other tasks.
- **Failure**: a profile with fewer than ⌈S/2⌉ successful samples → `profileNodes[profile]
  = null`; the plan **proceeds** with a prominent `profile_nodes_unavailable` warning and
  R2 tiers 8/9 simply empty. Proceed-with-warning rather than fail-closed (profile nodes
  are one reference class among many; the G line / pivots / boxes / overnight extremes
  still plan) — **R14, ratified 2026-08-22**.

### Persistence and reproducibility

- `job_plans.profile_nodes jsonb`: the consensus `ProfileNodes` **plus** every raw sample
  read, model id + effort, `VISION_PROMPT_REVISION`, and the image hashes. The PNGs go to a
  `job-plan-images` storage bucket keyed by hash (operator grading, UI overlay of nodes on
  the rendered profile — the plan card shows the profile with the nodes it used).
- The fingerprint gains `{ imageHashes, VISION_PROMPT_REVISION, visionModelId }`. Replaying a
  persisted `ProfileNodes` through the planner is deterministic; replaying the vision read
  is not, which is exactly why the read is persisted as input.

### Ground truth and validation

- **Golden set (primary)** — `chart-data/job-lvn-golden/<prep-date>/`: Sierra **replay
  exports** of the 5-day and 4-hour rolling profiles **as of the prep's time** — convention:
  replay to the prep video's publish time when known, otherwise **09:15 ET**; the operator
  overrides individual dates — in the existing
  `.vbp.md` format, plus `labels.json`: `[{ profile: '5d' | '4h' | 'any', kind, priceLow,
  priceHigh, primary, corpusRef }]` transcribed from `lvn-corpus.md` A1. Profile-unspecified
  mentions are labeled `any` and scored leniently (a hit on either profile counts);
  named-profile mentions score strictly. Both ES and NQ dates are valid — the renderer is
  instrument-agnostic. Also export the overnight profile for the three dates that cite it
  (06-15, 06-18, 03-02) if the study exposes it. Split: 3 fixed few-shot dates (proposed:
  02-13 deepest-LVN-on-5-day, 08-07 primary-LVN-above-JBA-low, 06-02 exhaustive-node-on-
  top + LVN-under-HVE) / every other date is test.
- **Fixtures (backup)** — the 8 `lvn-fixtures` profiles, scored by the existing harness
  logic in a `--source=vision` mode; they keep the shape coverage (bell / double / multi /
  trend / thin) the golden set may lack and act as the regression floor.
- **Bench** — `scripts/profile-vision-bench.ts`, gated on `RUN_LLM_INTEGRATION=1` (never on
  key presence alone — `.env` leaks into the shell), responses cached in scratch by
  (image hash, prompt revision, model) so iteration is cheap. Reports per model × render
  variant: **recall of Job-named nodes** within tolerance (ES 5 / NQ 20 — R1; ±10 also
  reported for fixture comparability), **primary-agreement rate** (model's `primary` vs
  Job's on dates he names one), precision / count delta, self-agreement across samples,
  cost and latency — side by side with `lvnDetection` on both sets.
- **Exit criterion before the read is wired into the planner** (first guesses — operator
  ratifies after seeing the numbers): test-date recall ≥ 0.8 and primary agreement ≥ 0.7,
  strictly better than the detector on both sets, self-agreement ≥ 0.8 at the chosen S.
  The prompt is never tuned on the test dates.

## Implementation steps

Each step ≈ one `feature_list.json` entry, own branch + PR per repo rules. **Tracked as
feat-118 – feat-130 (added 2026-08-22)**: step 1 → feat-118 (exporter + companions + snapshot
archive, operator-side) and feat-119 (golden-set replay exports, operator-side); step 2 →
feat-121; step 3 → folded into feat-126's `rules.ts` (decision log by rule ID), feat-124 (R15
numbers) and feat-130 (replaying the numbers against snapshots); step 4 → feat-120 (golden
labels + split), feat-122 (renderer), feat-123 (schema / prompt / identify / consensus),
feat-124 (config + bench); step 5 → feat-125 (parser), feat-126 (classifyContext + rules),
feat-127 (buildPlan + schema); step 6 → feat-128; step 7 → feat-129; step 8 → feat-130;
step 9 is deliberately not tracked (out of MVP, operator opt-in). Operator-side entries carry
status `operator` rather than `not-started` so the unattended implement loop does not pick
them up. One deliberate deviation from the text below: the filename contract
(`job-study.json`, `five-day-rolling.vbp.md`, `four-hour-rolling.vbp.md`) is fixed in
feat-121 so the bundle plumbing does not wait on the DLL, and the `unused_bundles_before`
guard lands with the `job_plans` migration (feat-128) because that is where the table it
references is created.

1. **Sierra Job-study exporter + snapshot archive** — no repo TS changes.
   Files: new ACSIL exporter (own DLL, Windows side), `chart-data/job-study.json` sample
   checked in. Scope per the reference inventory: pivots/values/targets (every rung the
   study exposes — ±3 confirmed, possibly ±7), JBA boxes **read as chart-drawn rectangles**
   (anchor prices), **Autoplot high/low**; sibling `.vbp.md` exports for the **5-day
   rolling** and **4-hour rolling** profiles; **pwVAH/pwVAL** and the **instrument symbol**
   added to the MGI export. (The G line is the weekly open and the RP is the Rip — both
   already in MGI, nothing to export.) Atomic
   write; `schemaVersion`; verified against several known chart days (values eyeballed
   against the studies on screen). **Snapshot archive spec** (third-round finding — the
   evidence strategy depends on it): one immutable folder per trading day on the Windows
   side, containing the FULL export cycle (`job-study.json` + MGI + exec/HTF CSVs + all
   `.vbp.md` profiles) captured on every on-demand run (and optionally once pre-open),
   keyed `YYYY-MM-DD` + run time, never overwritten;
   operator labels expected outcomes when a day is used for ratification; a held-out subset
   is reserved for out-of-sample shadow evaluation. Archiving only `job-study.json` would
   not support origin, node-selection, or coherence testing.
   **Golden-set replay exports** (same exporter, Sierra chart replay): for each prep date in
   `docs/jba-research/lvn-corpus.md` A1, the 5-day and 4-hour rolling `.vbp.md` as of the
   prep's time → `chart-data/job-lvn-golden/<date>/`, with `labels.json` transcribed from
   the corpus (see "Ground truth and validation"). This sub-deliverable is independent of
   the Job-study DLL and unblocks step 4's bench; it can ship first.
   Dependencies: none.

2. **Bundle plumbing** — `supabase/migrations/*_job_study_ref.sql` (nullable
   `raw_bundles.job_study_ref`) **and** the `unused_bundles_before` update in one migration;
   `lib/ingest/manifest.ts` (+ record shape), `lib/uploader/bundle.ts`
   (`LOCAL_FILENAMES_BY_FIELD.job_study`), fixture builders; `gekko-db` skill update.
   Deploy note in PR: Windows checkout must pull + restart the uploader; until then bundles
   simply lack the ref and the task fails closed with the right message.
   Dependencies: step 1 (filename contract).

3. **Rule ratification** — **largely done 2026-08-22** (operator ratified R1–R13, see
   "Ratified rules" below; RP identity resolved = the Rip). Remaining: transcribe R1–R13
   into `docs/job-plan/` as the decision log with rule IDs, replay the numbers against
   archived snapshots once they exist (bumping via `PLANNER_REVISION` if a number is
   wrong in practice), and confirming the **R15 vision exit criterion** numbers once
   step 4's bench has produced them (R14 is ratified: proceed with warning). Each decision gets a rule ID. Evidence: archived snapshots +
   transcripts (graded), replays for sequencing.
   Dependencies: step 1 (snapshots exist). Can overlap step 2.

4. **Profile vision read — renderer, bench, identification module** —
   `lib/job-plan/profile-vision/`: `renderProfile.ts` (VbP → SVG, pure), `rasterize.ts`
   (SVG → PNG, `@resvg/resvg-js` + shipped font; trigger build `external` verified against
   the trigger MCP docs), `schema.ts` (`ProfileNodesRead`, flat Zod), `prompt.ts`
   (criteria from `lvn-corpus.md` B/D + fixed few-shot; `VISION_PROMPT_REVISION`),
   `identifyProfileNodes.ts` (|P| × S × T calls through `generateStructured` with
   `images`, concurrency cap, per-call timeout, partial failure), `consensus.ts` (snap /
   range / cluster / vote, pure), `types.ts` (`ProfileNodes`). `scripts/profile-vision-
   bench.ts` (golden set + fixtures, `--model`, `--variant`, `--samples`, cached,
   `RUN_LLM_INTEGRATION=1`-gated) and a `--source=vision` mode for the fixture scoring.
   `config` migration: `profile_vision_model_id`, `profile_vision_model_effort`,
   `profile_vision_samples` (+ `fetchConfigRow` fallback tier, `/settings` fields,
   `gekko-db` skill). Deliverable = the bench report (model × variant table) and the
   operator's pick; the module is not wired to the planner until the exit criterion is
   ratified. **Can start now** on the existing rotation / balance-area exports and the
   fixtures; the golden set lands when step 1's replay exports do.
   Dependencies: step 1's replay exports for the golden half of the bench; nothing else.

5. **Deterministic planner (pure)** — `lib/job-plan/`: `parseJobStudy.ts`,
   `classifyContext.ts`, `buildPlan.ts`, `types.ts`, `rules.ts` (named predicates +
   `PLANNER_REVISION`), `knowledge/schema/job-plan.schema.ts`. Takes `ProfileNodes | null`
   per profile as a plain input (step 4's output type) — the planner never calls the
   vision module. Tests per the Tests section.
   Dependencies: steps 1, 3, 4 (types only; the planner is testable with hand-built
   `ProfileNodes`).

6. **Task + persistence** — `supabase/migrations/*_job_plans.sql` (+ `gekko-db` skill);
   `trigger/jobPlanTask.ts` (`job-plan-task`, schemaTask, retry config mirroring analyze);
   `lib/job-plan/runJobPlan.ts` + `deps.ts` (`fetchBundleById`, `downloadObject`,
   `insertJobPlan` — injected, unit-testable); fresh-bundle binding by returned `bundleId`;
   error taxonomy; run metadata (status, planner revision, fingerprint, bundle wait outcome,
   vision model / samples / agreement / cost). The task renders the profiles, runs the
   vision read (step 4, gated on the ratified exit criterion), persists `profile_nodes` +
   images, then calls the planner. No other LLM use, no `entry_levels`, no push.
   Dependencies: steps 4, 5.

7. **Surface** — `app/api/job-plans/run/route.ts` (mirrors `briefings/run` incl. bundle
   request with reason `job-plan`; same local-only security posture — documented), a
   **header version picker** (`Gekko` | `Job`) that switches the dashboard between the
   existing briefing view and the Job plan view, and a minimal plan card (`DESIGN.md`
   applies): context header (the dimensions + disagreements), play
   cards with staged destinations and open-applicability, stand-down reasons, warnings,
   insufficient-state rendering, **and failed-run surfacing**: a non-retryable abort writes
   no `job_plans` row, so the card must read the trigger.dev run outcome (the existing
   `use-triggered-run` pattern) and show the remediation message — otherwise an aborted run
   looks like "nothing happened". The card also shows each **rendered profile with its
   nodes overlaid** (and agreement k/S), so the operator grades the vision read on every
   run without leaving the dashboard.
   Dependencies: step 6.

8. **Shadow evaluation** — run the planner over the accumulated snapshot archive
   (`scripts/` runner over fixtures, no task changes); operator grades context
   classifications and play cards against what Job's preps actually said on overlapping
   days; iterate thresholds via `PLANNER_REVISION` bumps. Exit criterion: operator signs off
   that states and plays match the method on a meaningful sample. The vision read is graded
   alongside (operator marks missed / spurious nodes on the card); misses feed prompt
   revisions, never per-day prompt edits.
   Dependencies: steps 5–7.

9. **(Optional, later, operator opt-in)** — non-fatal LLM prose renderer strictly from the
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
  exact-boundary and tolerance behavior; multiple boxes; per-symbol tolerance resolution
  (ES vs NQ); wall-clock windows on exec-bar timestamps (R5–R9) incl. in-progress-bar
  exclusion and the 90-min early window. Positive, negative, boundary case per rule ID.
- **Invariants**: determinism (same input + revision ⇒ identical output); long/short
  symmetry where intended; destinations ordered in play direction; invalidation on the
  correct side of activation; mid-box context can never arm an unconditional edge play;
  confirmed initiative and a fade at the same fresh edge cannot coexist; no output price
  outside supplied geometry unless explicitly derived and labeled; missing core geometry can
  never yield `ready`.
- **Golden corpus**: archived `job-study.json` days with operator-graded expected context +
  plays; replay-derived sequencing cases only where contemporaneous data can be joined.
  Transcript-only cases stay annotations, not goldens.
- **Profile vision (unit, no LLM)**: `renderProfile` snapshot tests (same rows + options ⇒
  byte-identical SVG; axis labels at the per-instrument interval; POC/VA/current markers
  at the right y; aggregation preserves total volume and range; tiling overlap and
  per-tile axes); `consensus` table-driven (snap to grid, out-of-range dropped, clusters
  at exactly the R1 tolerance, majority thresholds at S = 1/2/3/5, primary vote ties,
  tile de-dup, partial-failure → null); `identifyProfileNodes` with an injected
  `generate` (concurrency cap honored, per-call timeout, one failing sample tolerated,
  ⌈S/2⌉ − 1 successes → null + warning); schema rejects > 8 nodes, two `primary`s, bands
  with low > high. Planner tests cover `ProfileNodes = null` (tiers 8/9 empty, warning
  emitted, still `ready`).
- **Profile vision (bench, live, `RUN_LLM_INTEGRATION=1`)**: golden set + fixtures per the
  "Ground truth and validation" metrics; not in CI; the report is the deliverable.
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
  label uniqueness, weekly `weekOf` across holiday weeks, zone-collapse-to-one-tick, ladder
  depth, Autoplot read path). The parser's strictness is calibrated to real output first.
- **Calendar/session traps**: Sunday Globex belongs to Monday's trading day; holiday-short
  weeks; contract rollover mixing geometry across contracts (parser requires one contract,
  matching the bundle's); DST.
- **Overfitting the annotator**: rules ratified from reconstructed stories rather than data —
  contained by the evidence-grading rule and shadow evaluation on out-of-sample days.
- **Vision read — nondeterminism**: the same image can yield different nodes across calls.
  Contained by S-sample consensus with majority agreement, persistence of the consensus
  *and* the raw samples as planner input, and the fingerprint; the planner is replayable
  from the persisted read. Self-agreement is a bench metric with an exit floor.
- **Vision read — price misreads**: the model reads prices off the axis and can be off by
  a label interval. Contained by dense labels (20 NQ / 5 ES), grid snapping, range
  rejection, and the R1 tolerance in consensus; a misread that survives all three is a
  wrong level in the plan — the bench's recall-within-tolerance metric measures exactly
  this, and the card's overlay makes it visible per run.
- **Vision read — Job-parity is still measured, not assumed**: the corpus labels are Job's
  words on a chart we re-export by replay; replay-export skew (wrong replay time, session
  template differences) can put the golden profile out of register with the prep. The
  operator confirms the replay timestamp per date; a golden day whose profile clearly
  mismatches the prep is annotated, not force-fit.
- **Vision read — model drift / availability**: OpenRouter can substitute or retire a
  model. `assertModelMatch` already rejects substitution; the config column makes
  re-pointing a settings change; `VISION_PROMPT_REVISION` + model id in the fingerprint
  make drift auditable. A full outage degrades to `profile_nodes_unavailable` (R14).
- **Native rasterizer in the trigger build**: `@resvg/resvg-js` is a prebuilt native
  module; if it will not load in the worker, `@napi-rs/canvas` is the fallback. Verified
  in step 4 before anything depends on it.
- **Prompt overfitting to the few-shot dates**: contained by the fixed few-shot / test
  split and the rule that test dates are never tuned on; the fixtures' shape coverage
  guards against a prompt that only works on the corpus's profile shapes.
- **Prior-session discretionary structure** ("off yesterday's activity" levels, zones of
  initiation, distribution boundaries) may not be recoverable from the planned inputs at
  all; where it isn't, the plan on those days is knowingly reduced (scope statement).
- **Scope creep into live execution**: this task is on-demand planning from a snapshot.
  Origin facts (R5–R9) are computed once from the bundle's bars at run time; continuous
  live detection, deadline evaluation (R11), alerting, and trade management are explicitly
  out.
- **Ratified numbers are first guesses**: R1–R13 were set from the corpus and the operator's
  judgment before any snapshot existed; shadow evaluation (step 8) is where they get
  corrected, via `PLANNER_REVISION` bumps, never silently.

## Operator decisions (2026-08-22)

All seven open questions were answered by the operator; none remain open.

1. **JBA boxes** — rectangles drawn on the chart. The exporter enumerates chart drawings and
   emits each rectangle's anchor prices. There is no zone overlap and nothing to compute.
2. **Ladder depth** — the Job Pivots study draws at least ±3 rungs, possibly ±7; confirm when
   building the exporter and export whatever it exposes. Rungs are destination-only (R2).
3. **RP = the Rip** — already exported. Blocker cleared.
4. **Autoplot** — include it (MVP). Autoplot high/low = the traditional balance-area high/low;
   how to read it from the study is checked at exporter time.
5. **Cross-market (ES leads NQ)** — dropped permanently. One instrument; the process is
   instrument-agnostic.
6. **Run trigger** — on-demand only, from a header version picker (`Gekko` | `Job`). Usually
   run after the open, so the daily Job Pivot is fresh and prominent.
7. **Ratification** — done live, one rule at a time (below).
8. **Profile LVN / HVN identification (later on 2026-08-22)** — by **LLM vision** over
   purpose-rendered profile images, not the code detector ("at this point it's still just
   better than any code we're going to come up with"); the planner's unused LLM budget goes
   here; multiple profiles evaluated in parallel; the prompt grounded in the prep corpus
   (`docs/jba-research/lvn-corpus.md`), with the `lvn-fixtures` set demoted to backup; a
   Sierra **replay export** per prep date is feasible and becomes the golden set (replay
   to the prep's publish time, else 09:15 ET — the operator's own convention). **R14
   ratified**: a failed vision read degrades the plan with a warning, never blocks it.

## Ratified rules (2026-08-22)

Numbers are plain points unless stated; per-instrument values key off the instrument symbol
in the MGI export. Sigma = `computeVolatilityScale` session sigma (~130 NQ pts at the time of
writing). "Exec bars" = the 750-volume execution bars; windows are wall-clock on their
timestamps and the in-progress bar never counts.

| ID | Rule | Ratified default |
| --- | --- | --- |
| R1 | Confluence band — merge tolerance / chain cap (ES) | Merge references within **5 pts**; chain transitively, cap band width at **10 pts**, split wider clusters at the largest internal gap. Band quoted as [lowest member, highest member]; anchored on its highest-significance member |
| R1b | Same, NQ (~4× ES, matching the sigma ratio) | Merge **20 pts**, cap **40 pts** |
| R2 | Source significance (band anchor + tie-break) | G line > weekly Job Pivot > daily Job Pivot > JBA box edge > Rip > overnight H/L > previous day H/L > 5-day rolling LVN/HVN edge > 4-hour rolling LVN > Autoplot H/L > other MGI > weekly ladder rung > daily ladder rung. **Ladder rungs are destination-only, never trigger anchors** |
| R3 | "At" a band | Within one merge tolerance of its edge (ES 5 / NQ 20); otherwise approaching/away |
| R4 | Within reach (`actionable-if-reached` vs `destination`) | ≤ **1.0 session sigma** from price; further = destination-only, shown, never armed |
| R5 | Failed look | First exec-bar close back on the original side within **30 min** of the first print beyond the band edge; longer excursions hand off to R6. Qualifier **EARLY** if the excursion began within the first **90 min** of RTH (primary-lean grade), else **LATE** (emitted, lower weight) |
| R6 | Build / hold beyond (acceptance) | Every completed exec bar closing beyond the band for **20 continuous minutes** = accepted/building (continuation armed, don't-counter on); less = testing. A single close back inside resets the clock and hands off to R5. Single threshold — no testing/building/accepted ladder |
| R7 | Approach failure | Price came within **2× merge tolerance** (ES 10 / NQ 40) of a band without touching it, then retreated ≥ **1× tolerance** from its closest approach, closest approach within the last **60 min**. Arms the fade toward the opposite side |
| R8 | Holding side (Rip / G line / box edge) | Defined by the last **20 min** of completed exec-bar closes: ABOVE / BELOW if all on one side, else STRADDLING |
| R9 | Already-interacted | Any print inside the band during **this RTH session only** (overnight touches don't count). Touched bands stay destinations, demoted as fresh trigger anchors; a touched band that produced a failed look or a defense keeps full trigger status |
| R10 | Mid-zone ("purgatory") | More than **2× merge tolerance** (ES 10 / NQ 40) from every edge of the enclosing zone → two-way trade declared between the named edges, stand down in the middle; within that distance = edge play |
| R11 | Response deadline | Every hold/traverse branch carries a **30-min** deadline from arrival at the trigger band, **emitted in the plan text, never evaluated** by the planner |
| R12 | Actionable set + origin precedence | Arm ≤ **2 bands per side** (nearest-first; skip a band with no confluence AND lowest-tier source) plus the enclosing zone's edges; **max 4 branches**. Primary lean = branch backed by the freshest origin fact in order: failed look > approach failure > building/accepted > holding side > repeated defense |
| R13 | Export skew | Fail closed (`insufficient`, operator message) if any two of `job-study.json` / MGI / bar exports' `exportedAt` differ by **> 5 min**, or `tradingDay` ≠ the bundle's session |
| R14 *(ratified 2026-08-22)* | What the planner does when the vision read fails for a profile | **Still produce the plan**, minus that profile's LVN/HVN levels, with a loud `profile_nodes_unavailable` warning on the card (the G line / pivots / box edges / overnight extremes still plan). Never `insufficient` for this cause alone |
| R15 *(proposed — operator confirms or raises after seeing bench results)* | The bar the vision read must clear before it feeds the planner | On prep dates it has not seen: finds ≥ **80 %** of the LVNs Job named (within R1 tolerance), picks the same "primary" LVN ≥ **70 %** of the time, agrees with itself across repeated calls ≥ **80 %**, and beats `lvnDetection` on both the golden set and the fixtures |

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
- **Fourth round — operator Q&A (2026-08-22)**: all seven open questions answered and the
  thirteen rule defaults ratified one by one (operator accepted or corrected each
  proposal). Consequential corrections: band tolerances are per-instrument (the quoted
  bands were ES; NQ ≈ 4×), origin definitions are wall-clock on exec-bar timestamps rather
  than bar counts or 30-min-bar boundaries ("relying on 30 min bars makes it arbitrary"),
  the response deadline is emitted but never evaluated, ladder rungs rank below profile
  LVNs and are destination-only, and — because runs are on demand and in-session — the
  per-branch `appliesWhenOpen` applicability from the third round is **removed** (price
  location at run time is known). Cross-market conditioning went from "MVP exclusion" to
  permanent: one instrument, instrument-agnostic process.
- **Fifth round — LVN identification by vision (2026-08-22, later)**: the operator overrode
  the plan's assumption that `lvnDetection` over new 5-day / 4-hour exports would stand in
  for Job's "primary / deepest LVN" (the plan had it as an unvalidated parity risk). Repo
  facts that shaped the design: `generateStructured` already accepts `images` (base64 PNG)
  and the analyze task ships chart screenshots through it today; the detector's measured
  holdout LVN F1 is ≈ 0.44 at ±10 pts; no server-side rendering exists (no `sharp` /
  `resvg` / `canvas` dep — `sharp` is only a transitive optional dep of `next`); no task
  fans out parallel LLM calls yet; `maxDuration` is 300 s with no machine preset. The
  mined corpus (110 examples) supplied an explicit ranking rule ("deepest meaning
  primary"), the departure-scar / HVE-adjacent position rule, width-as-qualifier, the
  exhaustive-node anatomy, the visual grouping rule, and twelve counterexamples — all of
  which go into the prompt rather than into code. The zero-LLM principle is narrowed, not
  abandoned: the planner stays a pure function; the vision read is perception, persisted as
  input, replayable, fingerprinted.
