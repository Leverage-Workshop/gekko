import { readFileSync } from 'fs'

export type ExecBar = {
  dateTime: Date
  open: number
  high: number
  low: number
  close: number
  legVWAP: number
  deltaIntensity: number
  /** Total contracts traded in the bar (volume bars: ~750, last bar partial). */
  volume: number
  /** Contracts traded at the bid (sell aggression). */
  bidVolume: number
  /** Contracts traded at the ask (buy aggression). */
  askVolume: number
  numberOfTrades: number
  /** Raw per-bar delta, convention askVolume − bidVolume (feat-047). */
  delta: number
}

const EXPECTED_HEADER =
  'DateTime,Open,High,Low,Close,LegVWAP,DeltaIntensity,Volume,BidVolume,AskVolume,NumberOfTrades'
const COLUMN_COUNT = EXPECTED_HEADER.split(',').length

function parseNum(s: string, label: string): number {
  const n = parseFloat(s.trim())
  if (isNaN(n)) throw new Error(`Invalid number for ${label}: "${s}"`)
  return n
}

export function parseExecBars(csvContent: string): ExecBar[] {
  const lines = csvContent.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) throw new Error('CSV has no data rows')

  const header = lines[0].trim()
  if (header !== EXPECTED_HEADER) {
    throw new Error(`Header mismatch — expected "${EXPECTED_HEADER}", got "${header}"`)
  }

  return lines.slice(1).map((line, i) => {
    const parts = line.split(',')
    if (parts.length !== COLUMN_COUNT) {
      throw new Error(`Row ${i + 1} has ${parts.length} columns, expected ${COLUMN_COUNT}: "${line}"`)
    }
    const [dateStr, open, high, low, close, legVWAP, deltaIntensity, volume, bidVolume, askVolume, numberOfTrades] =
      parts
    const dateTime = new Date(dateStr.trim())
    if (isNaN(dateTime.getTime())) {
      throw new Error(`Row ${i + 1} has invalid DateTime: "${dateStr}"`)
    }
    const bid = parseNum(bidVolume, `row ${i + 1} BidVolume`)
    const ask = parseNum(askVolume, `row ${i + 1} AskVolume`)
    return {
      dateTime,
      open: parseNum(open, `row ${i + 1} Open`),
      high: parseNum(high, `row ${i + 1} High`),
      low: parseNum(low, `row ${i + 1} Low`),
      close: parseNum(close, `row ${i + 1} Close`),
      legVWAP: parseNum(legVWAP, `row ${i + 1} LegVWAP`),
      deltaIntensity: parseNum(deltaIntensity, `row ${i + 1} DeltaIntensity`),
      volume: parseNum(volume, `row ${i + 1} Volume`),
      bidVolume: bid,
      askVolume: ask,
      numberOfTrades: parseNum(numberOfTrades, `row ${i + 1} NumberOfTrades`),
      delta: ask - bid,
    }
  })
}

export function parseExecBarsFromFile(csvPath: string): ExecBar[] {
  return parseExecBars(readFileSync(csvPath, 'utf-8'))
}
