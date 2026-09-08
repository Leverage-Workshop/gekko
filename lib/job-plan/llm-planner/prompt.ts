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
 * it is recorded with every run so plans are attributable.
 *
 * 2026-09-01 operator corrections (feat-146, from the first production plan):
 *   - Plans are SCENARIO CATALOGS, not trade-now decisions — the mid-zone
 *     stand-down rule is removed entirely ("we're planning out possible
 *     scenarios that could occur, not trying to identify a trade to take
 *     this instant").
 *   - Edges-only plans "won't cut it": the play-the-edges clause and the
 *     demote-to-destination freshness wording collapsed every mid-zone plan
 *     to the two JBA borders. Zone edges now compete on the same
 *     significance test as internal structure, and an interacted area keeps
 *     its play at a lower rank (mirroring R9) instead of vanishing into the
 *     destinations.
 */

/**
 * 2026-09-07 operator ratification (feat-148): the frame is a BIAS LINE —
 * "at what level do I look for longs above and shorts below" — chosen from
 * candidate BANDS on a new ladder (current daily pivot first; weekly pivot /
 * G line at equal rank, reach-gated; JBA borders; distribution boundary
 * LVNs, balance-area before rotation), with weekly rungs and the overnight /
 * prior-day extremes as confluence-only members. A stacked band outranks a
 * lone line; beyond the gates the model keeps its latitude. "At" the band is
 * a legal state (the fork), never a reason to reach for a farther line.
 */
/**
 * 2026-09-07 eve (feat-149): plays are read against the FRAME, not price.
 * The first bias-line plan wrote a counter-bias short above price and nothing
 * below the line, because direction came from geometry and "both sides" meant
 * both sides of price. Now: bias side → bias direction (rebid on arrival, or
 * break-and-hold beyond price — "price has to break it and hold to get in");
 * the line carries both directions; the far side → fork direction, each level
 * conditional on the last; "both sides" = both sides of the LINE.
 */
/**
 * 2026-09-07 late (feat-150): a real important level is ANYTHING that can
 * frame the day — a pivot, the G line, a JBA border, a distribution boundary
 * LVN — plus the prior-day / overnight extremes and any stacked band. The
 * first plan under .2 wrote a 5-reference stack on the lower edge of the
 * day's second distribution (VRange High, IBH, a rotation hvn) as a long
 * break-and-hold only. Operator: "prime example of where it should be a
 * fade… at the very least a level that could be a long or short"; "if they
 * are allowed as trendline candidates, they are definitely important enough
 * to cause a countertrend trade"; "confluence of 5 makes it a strong level,
 * and more likely to trigger a countertrend trade". The payload names each
 * band's importance; the more stacked the level the more the fail is the
 * first read. .3 also GATED both reads or neither at such a level — the next
 * plan dropped the level altogether; operator: "I don't think it has to be
 * a two-way or no trade. That is unnecessary." .4 removes the gate: one
 * read or both, the model's call.
 */
export const LLM_PLANNER_REVISION = 'llm-planner/2026-09-07.4'

export const ROLE =
  'You are writing the trading-day plan for a futures session the way a professional prepares one before the session does anything: a frame, then a short list of forward conditionals — what to expect IF price reaches the few areas that matter. You are given everything already measured: the level inventory with importance ranks, the confluence bands, distances, the day’s volatility scale, and each area’s freshness. None of the measuring is your job. Your job is the judgment: which band is the day’s bias line, which areas deserve a play, and what to expect at each one.'

export const MECHANISM =
  'The levels in the inventory matter because participation dried up or concentrated there — the participants who built the volume beside a level have to defend it, and beyond it there is little volume to slow price down. So the plan is a set of FORWARD CONDITIONALS: each play names an area, the side price will approach it from, and the direction change to expect if price reaches it. You are naming the places where price will change direction, based on the facts you have — nothing more. What happens at the level itself — the entry pattern, the timing — is the operator’s craft, not yours; the plan supplies the level. And what the session has already done never justifies a play — it only tells you which areas are still fresh.'

type Rule = { readonly title: string; readonly text: string }

export const RULES: readonly Rule[] = [
  {
    title: 'FRAME FIRST: THE BIAS LINE',
    text: 'The frame answers one question — at what level do you look for longs above it and shorts below it? Positions never have to start at the line: above it every play is a long at an area that offers a rebid, below it every play is a short at an area that offers a reoffer. Choose from frameCandidates. Each is a band holding an eligible anchor, with its ladder tier: the current daily Job Pivot first (the session built it, and you run after the open); then the weekly Job Pivot and the G line at equal rank, when they are near; then the borders of the JBA price is inside, or the nearest border each side; then the boundary LVNs of the distribution price is inside, balance-area profile before rotation. Weekly rungs and the overnight and prior-day extremes never anchor, but they strengthen a band they sit in — a stacked band outranks a lone line. Reach is a wall for every tier but the daily pivot: a line a session away fixes the bias all day, which is no filter. Within those gates the choice is yours; say why in one sentence. When price sits at the band there is no bias yet — holding above it, longs at the areas above; losing it, shorts at the areas below — never reach for a farther line to manufacture a side.',
  },
  {
    title: 'BOTH SIDES OF THE LINE, ALWAYS',
    text: 'The two sides of the plan are the two sides of the FRAME, not of price. The BIAS side: with price above the line, the areas between the line and price are longs where a pullback will rebid, and so is the line itself. An area above price that has not been reached yet is a long where the trade is the hold after the break, never the break itself (price has to break it and hold to get in) — and when that area is a real important level it is ALSO a short on a fail there. A real important level is anything that could frame the day — a pivot, the G line, a JBA border, a distribution boundary LVN — plus a prior-day or overnight extreme, plus any stacked band; the payload marks each band important with its reasons. The more references stack into it, the stronger the level and the more likely the counter-trend trade: a five-reference stack on the edge of a distribution is a fade first and a breach-and-hold second (fadeFirst in the payload), a lone border is the hold first. Write whichever of the two reads you judge worth a line there — the fail alone, the hold alone, or both; an important level that gets no play at all needs a better reason than the cap. A level that is not important never gets the counter play — generally you do not go against the trend anywhere else. Trades at levels price has not reached are always one of those two — a fail against the line’s direction, or a breach-and-hold with it. The FORK side: what to do once price loses the line — the line itself becomes a reoffer on the pullback into it, then each significant level beyond it in turn, each conditional on the last (if price breaks the line, then another important level, the pullback into that level is the play); at a real important level out there the bounce against the new bias is worth a line too, as a fail only. Mirror all of it with price below the line. Lead with the bias side. A side with nothing worth writing gets a one-line reason instead of a filler play.',
  },
  {
    title: 'PICK AREAS BY WEIGHT, NOT DISTANCE ALONE',
    text: 'The area that gets the play on a side is where you judge price will actually change direction — significance meaning MGI importance, confluence (several references stacking into one band), and profile prominence together. The test for reaching past a nearer level to a farther, more significant one: is it more likely than not that price will breach the nearer level to reach the farther one? If yes, the farther level gets the play; if no, the nearer level IS the level — it is where the direction change happens. An enclosing zone’s edges compete on this same test like any other area — they never exhaust the plan: significant structure inside the zone gets its own play when it is where price would turn. Cover the areas that matter on each side — one play per side is rarely a full read. Ladder rungs are destinations to gauge along the way, never trigger areas. Three or four plays is a full plan.',
  },
  {
    title: 'EVERY PLAY IS A FORWARD CONDITIONAL, WRITTEN IN FUTURE TENSE',
    text: 'State the approach and the expected turn: price reaches the area, the area holds, and the traverse runs toward the destinations beyond it — or, for a level not yet reached, price breaks it, holds, and the pullback that respects it is the entry. Do not prescribe the entry price action at the level — no trigger patterns, no confirmation recipes; the operator trades the level, the plan names it. Direction comes from the FRAME, never from geometry alone: between the line and price every play is in the bias direction; the line carries both — the bias direction while it holds, the fork direction once it is lost; an unreached level beyond price carries the bias direction as a breach-and-hold and, when it is a real important level, the other direction as a fail — one read or both, your call; on the far side every play is the fork direction, conditional on the line being lost, plus the fail against it at a real important level. A plain counter-trend fade never exists anywhere. If the session has already interacted with an area without producing a fail or a defense, say so — it ranks behind fresh areas but KEEPS its play when it is still where price would turn; freshness is the only thing session history changes, and it never deletes an area from the plan.',
  },
  {
    title: 'STATE THE FORK',
    text: 'Every play carries its own failure: if price instead builds beyond the area — sustained closes beyond it, not a poke — the play is off. Don’t counter; go with it toward the next structure beyond. Past a major line, expect it to accelerate.',
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
- frame.bandId: the bandId of the frameCandidates entry that is the day’s bias line; frame.rationale: one sentence on why this band.
- plays: at most ${MAX_PLAYS}, ordered by precedence — the first play is the primary look, and the bias side and the fork side alternate starting from the bias side. Each play names its area by bandId (choose from bands); direction follows rule 4 — the bias direction between the line and price, the fork direction only beyond the line, and the frame band may appear TWICE, once per direction; so may an unreached important level beyond price (the payload’s important flag) — either read alone is fine too. text: the play in the register of the rules — the approach (or the break and hold), the expected turn, the traverse toward the structure beyond, and what happens if price builds through instead — naming levels by their labels (a numeric price you write must be one the payload carries — never invent one). rationale: why this area won its side, including the breach test whenever you reached past a nearer level.
- sidesWithoutPlay: one entry per side that carries no play, with the one-line reason — the sides are 'bias' and 'fork' (when the frame is at its band and has no direction yet, 'above' and 'below' price instead).
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
