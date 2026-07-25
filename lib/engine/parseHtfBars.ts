/**
 * Parser for `htf_bar_data.rolling.csv` (feat-049) — the 30-min HTF planning
 * chart's bars, exported by the Sierra study GekkoHtfBarDataExporter: one row
 * per bar, chronological (oldest first), rolling 90 calendar days, the current
 * in-progress bar included as the last row.
 *
 * Strict on structure (hard-rejects a drifted export: header, column count,
 * numeric fields, chronological order) so a silently reshaped file can never
 * feed the HTF structure read with garbage.
 */

export type HtfBar = {
  dateTime: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
  /** Contracts traded at the bid (sell aggression). */
  bidVolume: number
  /** Contracts traded at the ask (buy aggression). */
  askVolume: number
  /** Raw per-bar delta, convention askVolume − bidVolume. */
  delta: number
}

const EXPECTED_HEADER = 'DateTime,Open,High,Low,Close,Volume,BidVolume,AskVolume'
const COLUMN_COUNT = EXPECTED_HEADER.split(',').length

function parseNum(s: string, label: string): number {
  const n = parseFloat(s.trim())
  if (isNaN(n)) throw new Error(`Invalid number for ${label}: "${s}"`)
  return n
}

export function parseHtfBars(csvContent: string): HtfBar[] {
  const lines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) throw new Error('HTF bars CSV has no data rows')

  const header = lines[0].trim()
  if (header !== EXPECTED_HEADER) {
    throw new Error(`Header mismatch — expected "${EXPECTED_HEADER}", got "${header}"`)
  }

  const bars = lines.slice(1).map((line, i) => {
    const parts = line.split(',')
    if (parts.length !== COLUMN_COUNT) {
      throw new Error(
        `Row ${i + 1} has ${parts.length} columns, expected ${COLUMN_COUNT}: "${line}"`,
      )
    }
    const [dateStr, open, high, low, close, volume, bidVolume, askVolume] = parts
    const dateTime = new Date(dateStr.trim())
    if (isNaN(dateTime.getTime())) {
      throw new Error(`Row ${i + 1} has invalid DateTime: "${dateStr}"`)
    }
    const bid = parseNum(bidVolume, `row ${i + 1} BidVolume`)
    const ask = parseNum(askVolume, `row ${i + 1} AskVolume`)
    const bar: HtfBar = {
      dateTime,
      open: parseNum(open, `row ${i + 1} Open`),
      high: parseNum(high, `row ${i + 1} High`),
      low: parseNum(low, `row ${i + 1} Low`),
      close: parseNum(close, `row ${i + 1} Close`),
      volume: parseNum(volume, `row ${i + 1} Volume`),
      bidVolume: bid,
      askVolume: ask,
      delta: ask - bid,
    }
    if (bar.high < bar.low) {
      throw new Error(`Row ${i + 1} has High < Low: "${line}"`)
    }
    return bar
  })

  for (let i = 1; i < bars.length; i++) {
    if (bars[i].dateTime.getTime() <= bars[i - 1].dateTime.getTime()) {
      throw new Error(
        `Rows are not in chronological order at row ${i + 1} (${bars[i].dateTime.toISOString()} follows ${bars[i - 1].dateTime.toISOString()})`,
      )
    }
  }

  return bars
}
