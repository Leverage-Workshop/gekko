import { instrumentFromSymbol, type Instrument } from './profile-vision/instrument'

/**
 * Futures contract identity from a Sierra chart symbol (feat-125).
 *
 * Sierra reports the same contract in more than one spelling — the Job exporters
 * write `NQU6.CME`, the MGI exporter has been seen with `NQU26` — so equality is
 * on (root, month code, last year digit), never on the raw string. `MNQ` and `NQ`
 * are the same instrument (tolerances, tick) but different contracts.
 */

const MONTH_CODES = 'FGHJKMNQUVXZ'
const SYMBOL_RE = /^([A-Z]{1,4}?)([FGHJKMNQUVXZ])(\d{1,2})(?:\.[A-Z]+)?$/

export type ContractSymbol = {
  /** e.g. `NQ`, `MNQ`, `ES`. */
  readonly root: string
  /** Delivery month code (`FGHJKMNQUVXZ`). */
  readonly month: string
  /** Last digit of the delivery year — the only digit every spelling carries. */
  readonly yearDigit: number
  /** `${root}${month}${yearDigit}` — the comparison key. */
  readonly key: string
  /** The planner's instrument (null for a root the planner does not support). */
  readonly instrument: Instrument | null
}

/** Parse `NQU6.CME` / `NQU26` / `MNQU6` into a contract identity, or null when unrecognized. */
export function parseContractSymbol(symbol: string): ContractSymbol | null {
  const m = SYMBOL_RE.exec(symbol.trim().toUpperCase())
  if (!m) return null
  const [, root, month, year] = m
  if (!MONTH_CODES.includes(month)) return null
  const yearDigit = Number(year) % 10
  return {
    root,
    month,
    yearDigit,
    key: `${root}${month}${yearDigit}`,
    instrument: instrumentFromSymbol(root),
  }
}
