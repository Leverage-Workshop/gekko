import { z } from 'zod'

/**
 * Operator directive (feat-061): a short free-text steer the operator typed
 * into an objective card's header on the dashboard — a symbolic anchor
 * ("ONL"), a price ("move the entry to 27950"), or short prose. It rides the
 * update path as INPUT only (route body → update-task payload → the update
 * prompt's user message → the `briefings.operator_directive` audit column);
 * it is never part of a model-facing output schema.
 *
 * Single-line only: the text is quoted verbatim inside a markdown prompt
 * block, so newlines would let a directive break out of its quote line.
 */
export const OperatorDirective = z.object({
  objective: z.enum(['primary', 'secondary']),
  text: z.string().trim().min(1).max(280).regex(/^[^\n\r]*$/, {
    message: 'directive must be a single line',
  }),
})

export type OperatorDirective = z.infer<typeof OperatorDirective>
