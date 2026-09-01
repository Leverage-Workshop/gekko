import { MAX_PLAYS } from '../rules'

/**
 * The LLM shadow planner's prompt (feat-144, docs/job-plan-llm-planner-proposal.md,
 * operator-ratified 2026-08-31). Code computes EVERYTHING (`JobContext`); the
 * model takes only the judgment core: which tier-one line frames the day, which
 * areas deserve a play, direction, ranking, and the lean.
 *
 * Operator-authored register, same shape as the profile-vision prompt
 * (feat-137): a MECHANISM first, then a handful of rules. Two constraints the
 * operator set directly:
 *
 *   - NO entry price action anywhere — "I don't need the model to tell me what
 *     type of price action to look for at an entry level. I just need the
 *     level." The plan names levels; the operator trades them.
 *   - Every rule is FUTURE TENSE. The feat-127 origin-fact inversion came from
 *     reading Job's tense wrong; written prospectively there is no tense to
 *     misread, and session history's only legal effect is freshness.
 *
 * LLM_PLANNER_REVISION bumps whenever the rules or the payload shape change —
 * it is recorded with every shadow run so reports are attributable.
 */

export const LLM_PLANNER_REVISION = 'llm-planner/2026-08-31.2'

export const ROLE =
  'You are writing the trading-day plan for a futures session the way a professional prepares one before the session does anything: a frame, then a short list of forward conditionals — what to expect IF price reaches the few areas that matter. You are given everything already measured: the level inventory with importance ranks, the confluence bands, distances, the day’s volatility scale, and each area’s freshness. None of the measuring is your job. Your job is the judgment: which line frames the day, which areas deserve a play, and what to expect at each one.'

export const MECHANISM =
  'The levels in the inventory matter because participation dried up or concentrated there — the participants who built the volume beside a level have to defend it, and beyond it there is little volume to slow price down. So the plan is a set of FORWARD CONDITIONALS: each play names an area, the side price will approach it from, and the direction change to expect if price reaches it. You are naming the places where price will change direction, based on the facts you have — nothing more. What happens at the level itself — the entry pattern, the timing — is the operator’s craft, not yours; the plan supplies the level. And what the session has already done never justifies a play — it only tells you which areas are still fresh.'

type Rule = { readonly title: string; readonly text: string }

export const RULES: readonly Rule[] = [
  {
    title: 'FRAME FIRST',
    text: 'Situate price against the operative tier-one line — the G line, the weekly Job Pivot, the weekly pivot extensions, or the current daily Job Pivot (historical daily pivots never frame). Prefer the most important line price can realistically interact with today — the same likelihood test as rule 3, with the reach scale as guidance, not a hard wall. The side of the frame line price sits on names the productive direction; within the merge tolerance of the line there is no productive side — expect balance until price takes the line and holds it.',
  },
  {
    title: 'BOTH SIDES, ALWAYS',
    text: 'Outline what to expect if price goes UP to the most significant area above, and if it goes DOWN to the most significant area below. Lead with the frame side. A side with nothing worth writing gets a one-line reason instead of a filler play.',
  },
  {
    title: 'PICK AREAS BY WEIGHT, NOT DISTANCE ALONE',
    text: 'The area that gets the play on a side is where you judge price will actually change direction — significance meaning MGI importance, confluence (several references stacking into one band), and profile prominence together. The test for reaching past a nearer level to a farther, more significant one: is it more likely than not that price will breach the nearer level to reach the farther one? If yes, the farther level gets the play; if no, the nearer level IS the level — it is where the direction change happens. When price is enclosed in a zone, its edges are the natural play areas ("play the edges"). Ladder rungs are destinations to gauge along the way, never trigger areas. Three or four plays is a full plan; the cap is a ceiling, never a target.',
  },
  {
    title: 'EVERY PLAY IS A FORWARD CONDITIONAL, WRITTEN IN FUTURE TENSE',
    text: 'State the approach and the expected turn: price reaches the area from above or below, the area holds, and the traverse back runs toward the destinations beyond it. Do not prescribe the entry price action at the level — no trigger patterns, no confirmation recipes; the operator trades the level, the plan names it. Direction comes from geometry: an area above price is watched for offer, below for bid; inside an area, lean with the frame. If the session has already interacted with an area without producing a fail or a defense, say so and demote it — freshness is the only thing session history changes.',
  },
  {
    title: 'STATE THE FORK',
    text: 'Every play carries its own failure: if price instead builds beyond the area — sustained closes beyond it, not a poke — the play is off. Don’t counter; go with it toward the next structure beyond. Past a major line, expect it to accelerate.',
  },
  {
    title: 'MID-ZONE MEANS STAND DOWN',
    text: 'When price is deep between the operative edges, say so and make the plan two-way at the edges. Don’t manufacture a directional play from the middle of a zone.',
  },
] as const

/** Canary phrases pinned by the prompt snapshot test — one per rule. */
export const RULE_CANARIES = RULES.map((r) => r.title)

/**
 * Entry-action vocabulary the prompt must NEVER contain (operator, 2026-08-31:
 * plans name levels, never the price action to trade them with). Pinned by a
 * negative canary test so it cannot creep back in.
 */
export const FORBIDDEN_PHRASES: readonly string[] = [
  'peak above',
  'peak below',
  'look above',
  'look below',
  'and fail',
  'failed look',
  'first close back',
  'green light',
]

function rulesText(): string {
  return RULES.map((r, i) => `${i + 1}. ${r.title}. ${r.text}`).join('\n')
}

const OUTPUT_RULES = `Output JSON only, matching the schema. Rules:
- frame.referenceId: the id of the tier-one line (choose from frameCandidates) that frames the day; frame.rationale: one sentence on why this line.
- plays: at most ${MAX_PLAYS}, ordered by precedence — the first play is the primary look, and sides alternate starting from the frame side. Each play names its area by bandId (choose from bands); direction is 'long' for an area below price, 'short' for an area above (inside an area, lean with the frame). text: the play in the register of the rules — the approach, the expected turn, the traverse toward the structure beyond, and the fork if price builds through instead — naming levels by their labels (a numeric price you write must be one the payload carries — never invent one). rationale: why this area won its side, including the breach test whenever you reached past a nearer level.
- sidesWithoutPlay: one entry per side (above / below) that carries no play, with the one-line reason.
- standDown: true only when the mid-zone rule applies; then standDownText declares the two-way at the named edges. Otherwise false with standDownText null.
- lean: one line naming the primary look and the side to lean with.
- Every bandId and referenceId must come from the payload — never invent an id, a level, or a price. Do not restate session history as justification for any play.`

/**
 * Build the full prompt: doctrine + the serialized context payload
 * (`contextPayload.ts`) as the only per-run content.
 */
export function buildLlmPlannerPrompt(payloadJson: string): string {
  return [
    ROLE,
    MECHANISM,
    'RULES:',
    rulesText(),
    OUTPUT_RULES,
    `CONTEXT (everything already measured — judge from this and nothing else):\n${payloadJson}`,
    'Write the plan now and return the JSON.',
  ].join('\n\n')
}
