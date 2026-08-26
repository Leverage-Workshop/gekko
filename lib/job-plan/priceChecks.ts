import type { JobStudyIssue } from './types'

/**
 * Price invariants shared by every Job-study section (feat-125): a price must be
 * positive (Sierra writes `0.00` for an unset subgraph — the MGI ONH/ONL gotcha,
 * lib/engine/mgiPriority.ts) and must sit on the export's tick grid.
 */

const TICK_EPSILON = 1e-6

export function isOnTickGrid(price: number, tickSize: number): boolean {
  const ticks = price / tickSize
  return Math.abs(ticks - Math.round(ticks)) < TICK_EPSILON
}

/** Signed distance in whole ticks (rounded), for cross-checks and messages. */
export function ticksBetween(a: number, b: number, tickSize: number): number {
  return Math.round(Math.abs(a - b) / tickSize)
}

/**
 * Issues for one price: `price_sentinel` when it is not positive, else
 * `tick_misaligned` when it is off the grid. `where` names the price in messages.
 */
export function checkPrice(price: number, tickSize: number, where: string): JobStudyIssue[] {
  if (price <= 0) {
    return [{ code: 'price_sentinel', message: `${where} is ${price} (Sierra unset placeholder)` }]
  }
  if (!isOnTickGrid(price, tickSize)) {
    return [
      { code: 'tick_misaligned', message: `${where} ${price} is not on the ${tickSize} tick grid` },
    ]
  }
  return []
}

/** `checkPrice` over a labelled set, e.g. `{ pivot: 1, valueLow: 2 }`. */
export function checkPrices(
  prices: Readonly<Record<string, number>>,
  tickSize: number,
  wherePrefix: string
): JobStudyIssue[] {
  return Object.entries(prices).flatMap(([name, value]) =>
    checkPrice(value, tickSize, `${wherePrefix} ${name}`)
  )
}
