# LLM Job Planner — proposal and draft prompt

**Status:** proposal, 2026-08-31 evening. Operator to review; nothing implemented.
**Feature:** feat-144 (shadow experiment only — the deterministic planner stays production).

## What this is

The deterministic planner (feat-126..129, corrected through PR #189/#190) computes every
data point that goes into a Job plan and then assembles the plays with fixed lexicographic
rules. This proposal keeps ALL of the computation in code and moves only the **judgment
core** — frame choice, which areas to write plays at, and precedence — to an LLM guided
by a short operator-voice rule set, the same shape that worked for the profile vision
read (feat-137: 18 mined criteria → mechanism + 4 rules).

Why we think there's something here: every recent planner fix is a hand-coded
approximation of a judgment call — the tier-one ladder replacing blind-nearest, the
historical-pivot exclusion the ladder immediately needed, reach filtering, the
side-alternating interleave. A model can weigh "more prominent MGI, slightly farther"
directly instead of us enumerating the cases one bug at a time.

This deliberately revisits the 2026-08-20 "deterministic, no-LLM planner" decision, with
the LVN vision result as the new evidence. Shadow A/B first; production cutover is a
separate, later decision.

## Architecture

**Code keeps (unchanged):** bundle loading, `classifyContext` and the full `JobContext` —
reference inventory with R2 significance, confluence bands (R1/R1b), roles and distances
(R3/R4), session sigma and reach, location dimensions (R10 mid-zone, boxes, value),
origin facts (R5–R9, computed as context only), data quality (R13/R14), chart clocks.
The vision read and its consensus stay exactly as they are.

**Model takes (replacing `planFrame` + `playCandidates`/`buildBandPlay` selection +
`planPrecedence` ordering):** which tier-one line frames the session, which bands get a
play, direction/stance per the geometry, ranking and the primary lean, and the composed
play text — under the rules below.

**Code validates (hard gate, retry-on-violation like the eval contract):**

- Output parses against the persisted `JobPlan` Zod schema (structured output, same
  pattern as briefings).
- Every price the plan quotes exists in the provided reference inventory / band list —
  the model never invents a level.
- The frame reference is tier-one (`g-line` / `weekly-job-pivot` / `weekly-rung` /
  current `daily-job-pivot`) and never a historical pivot.
- At most `MAX_PLAYS` (4) plays; ladder rungs appear only as destinations (R2).
- Both sides addressed: each side either carries a play or an explicit one-line reason
  it doesn't ("nothing significant within reach below" is a valid answer — padding
  is not).
- R13 insufficient data still fails closed in code before the model is ever called.

Downstream consumers (`job_plan_bands` view, Sierra study, play cards) are untouched —
the persisted shape is identical, plus a `plannerKind: 'llm-shadow'` marker and the
prompt revision in the fingerprint.

## Draft prompt

Everything below is written to be read with the serialized `JobContext` attached
(references with labels/prices/significance, bands with members and distances, roles,
reach, location, freshness facts). Numbers the code owns (tolerances, reach, caps) are
injected per-run like `execution_bar_volume` is for briefings — the prompt text itself
stays number-free where it can.

---

### ROLE

You are writing the trading-day plan for {instrument} futures the way a professional
prepares one before the session does anything: a frame, then a short list of forward
conditionals — what to expect **if** price reaches the few areas that matter. You are
given everything already measured: the level inventory with importance ranks, the
confluence bands, distances, the day's volatility scale, and what the session has done
so far. None of the measuring is your job. Your job is the judgment: which line frames
the day, which areas deserve a play, and what the expected behavior at each one is.

### MECHANISM

The levels in the inventory matter because participation dried up or concentrated
there — the participants who built the volume beside a level have to defend it, and
beyond it there is little volume to slow price down. So the plan is a set of
**forward conditionals**: each play names an area, the side price will approach it
from, and the direction change to expect **if price reaches it**. You are naming the
places where price will change direction, based on the facts you have — nothing more.
What happens at the level itself — the entry pattern, the timing — is the operator's
craft, not yours; the plan supplies the level. And what the session has already done
never justifies a play — it only tells you which areas are still fresh.

### RULES

1. **FRAME FIRST.** Situate price against the operative tier-one line — the G line,
   the weekly Job Pivot, the weekly pivot extensions, or the current daily Job Pivot
   (historical daily pivots never frame). Prefer the most important line price can
   realistically interact with today — the same likelihood test as rule 3, with the
   reach scale as guidance, not a hard wall. The side of the frame line price
   sits on names the productive direction; within the merge tolerance of the line
   there is no productive side — expect balance until price takes the line and
   holds it.

2. **BOTH SIDES, ALWAYS.** Outline what to expect if price goes **up** to the most
   significant area above, and if it goes **down** to the most significant area
   below. Lead with the frame side. A side with nothing worth writing gets a
   one-line reason instead of a filler play.

3. **PICK AREAS BY WEIGHT, NOT DISTANCE ALONE.** The area that gets the play on a
   side is where you judge price will actually change direction — significance
   meaning MGI importance, confluence (several references stacking into one band),
   and profile prominence together. The test for reaching past a nearer level to a
   farther, more significant one: **is it more likely than not that price will
   breach the nearer level to reach the farther one?** If yes, the farther level
   gets the play; if no, the nearer level IS the level — it is where the direction
   change happens. When price is enclosed in a zone, its edges are the natural
   play areas ("play the edges"). Ladder rungs are destinations to gauge along the
   way, never trigger areas. Three or four plays is a full plan; the cap is a
   ceiling, never a target.

4. **EVERY PLAY IS A FORWARD CONDITIONAL, WRITTEN IN FUTURE TENSE.** State the
   approach and the expected turn: price reaches the area from above or below, the
   area holds, and the traverse back runs staged along the destinations you are
   given, each stage gauged for continuation. Do not prescribe the entry price
   action at the level — no trigger patterns, no confirmation recipes; the operator
   trades the level, the plan names it. Direction comes from geometry: an area
   above price is watched for offer, below for bid; inside an area, lean with the
   frame. If the session has already interacted with an area without producing a
   fail or a defense, say so and demote it to a destination — freshness is the
   only thing session history changes.

5. **STATE THE FORK.** Every play carries its own failure: if price instead builds
   beyond the area — sustained closes beyond it, not a poke — the play is off.
   Don't counter; go with it to the flip destination. Past a major line, expect it
   to accelerate.

6. **MID-ZONE MEANS STAND DOWN.** When price is deep between the operative edges,
   say so and make the plan two-way at the edges. Don't manufacture a directional
   play from the middle of a zone.

### OUTPUT

JSON only, matching the schema. Name every area by its level labels — every price you
write must be one of the provided references or band edges, never an invented number.
Frame-side play first, sides alternating. Keep each play's text in the register of the
rules above: approach → expected turn → traverse → fork.

---

## Judgment granted vs. invariants kept

The point of the experiment is the gap between these two lists.

**The model MAY (this is the new latitude):**

- Prefer a more important frame line over a nearer one, and treat reach as soft.
- Choose a farther, more significant band over a nearer, weaker one for a play —
  when it judges price more likely than not to breach the nearer level to reach it.
- Decline to write a play on a side, with a stated reason.
- Weigh confluence, prominence, and freshness against distance without a fixed
  lexicographic order.

**The model may NOT (code-enforced or review-enforced):**

- Quote a price that isn't in the inventory, frame off a historical pivot or a
  non-tier-one source, or exceed the play cap (schema + validators, retry on
  violation).
- Arm or rank a play off a completed session fact — the prompt is written entirely
  in future tense so the origin-fact inversion (a tense misreading) cannot recur.
- Prescribe entry price action at a level (trigger patterns, confirmation recipes).
  The plan supplies the level; the operator trades it.
- Change any number: tolerances, reach, acceptance minutes, deadlines all stay
  code-owned and injected.

## Evaluation — shadow A/B

1. Extend the existing shadow-run script to run **both** planners over the same
   `JobContext` for the last ~10–15 real bundles (and the replay dates).
2. Diff per bundle: frame choice, play band set, direction/stance, ranking, primary
   lean. Agreements are baseline sanity; **disagreements are the experiment** — the
   operator adjudicates each one (which read is closer to what Job would write?).
3. Stability: run the LLM planner twice per bundle at temperature 0; frame or play-set
   flips between identical runs are failures, same discipline as the vision
   self-agreement runs.
4. Contract violations (schema, invented prices, cap) are counted; more than an
   occasional retry means the rules are ambiguous — fix the prompt, not the validator.
5. Exit: operator judges whether the model wins the judgment cases without losing the
   grammar. Win → plan a production cutover as its own feature (plus prompt-revision
   fingerprinting and cost accounting). Lose → deterministic planner keeps its job and
   this doc records why.

Model: `config.model_id` via OpenRouter like every other model call — never hardcoded.
Cost is negligible at plan cadence (one call per plan, JSON in/out).

## Open questions for the operator

1. **Play text: model-composed or code-composed?** The draft has the model writing the
   play prose under the register rules. The safer variant keeps `playText.ts` composing
   the strings from the model's structural choices (band, direction, condition,
   ranking). Draft assumes model-composed; easy to walk back.
2. **Should the R12 skip rule (no-confluence + lowest-tier → skip) stay code-side as a
   pre-filter,** or become judgment under rule 3? Draft leaves it to judgment.
3. **Reach as "guidance, not a wall"** — comfortable with the model reaching past 1σ
   for a G-line-class level, or should code clamp at some hard multiple (e.g. 1.5σ)?
