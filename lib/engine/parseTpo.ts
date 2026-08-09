/**
 * Parser for `tpo.data.md` — the numeric TPO / Market Profile export written by
 * the Sierra study GekkoTpoDataExporter (feat-046). Markdown with a Metadata
 * section, a Summary section and a fenced csv block of `Price,TPOCount,Letters`
 * (price descending, letters = the TPO period letters that traded each bin).
 *
 * The Metadata section may also carry the feat-092 period→clock anchor
 * (`First Period Letter` / `First Period Start`); it is optional, and bundles
 * exported before it existed still parse (`meta.firstPeriod === null`).
 *
 * Hard-rejects on a malformed file (missing sections, wrong csv header,
 * non-descending prices, off-grid spacing) — the same strictness as
 * parseProfile.ts / parseExecBars.ts, so a drifted study export fails loudly
 * instead of producing wrong facts. The *caller* decides whether TPO data is
 * required (computeEngineFacts treats it as best-effort and degrades to a
 * warning).
 */

/**
 * Clock anchor for the period letters (feat-092): the letter that opens the
 * session and the wall-clock instant that period starts. With
 * `tpoPeriodMinutes` this is everything needed to resolve any letter to a
 * time (see `tpoPeriodClock.ts`).
 *
 * OPTIONAL by design: exports written before the anchor lines existed carry
 * neither, and those bundles must keep parsing. `null` means "letters cannot
 * be placed on the clock", never "this file is broken".
 */
export type TpoPeriodAnchor = {
  /** Period letter of the session's first period — usually `A`. */
  letter: string
  /** Naive local start of that period, normalized to `YYYY-MM-DD HH:MM:SS`. */
  start: string
}

export type TpoMeta = {
  /** ISO date of the profiled session (`YYYY-MM-DD`). */
  sessionDate: string
  session: 'RTH' | 'ETH'
  tpoPeriodMinutes: number
  tickSize: number
  binSize: number
  /** Price distance between adjacent bins (`tickSize * binSize`). */
  step: number
  /**
   * Letter→clock anchor (feat-092); `null` on exports predating it. Backward
   * compatibility here is deliberate: absence degrades, it does not reject.
   */
  firstPeriod: TpoPeriodAnchor | null
}

export type TpoSummary = {
  pocPrice: number
  valueAreaHigh: number
  valueAreaLow: number
  ibHigh: number
  ibLow: number
  sessionHigh: number
  sessionLow: number
}

export type TpoRow = {
  price: number
  tpoCount: number
  /** TPO period letters that traded this bin, in period order (e.g. "BCD"). */
  letters: string
}

export type TpoProfile = {
  meta: TpoMeta
  summary: TpoSummary
  /** Price-descending; gaps allowed (untraded bins are absent) but on-grid. */
  rows: TpoRow[]
}

const CSV_HEADER = 'Price,TPOCount,Letters'

function parseNum(s: string, label: string): number {
  const n = parseFloat(s.trim())
  if (isNaN(n)) throw new Error(`Invalid number for ${label}: "${s}"`)
  return n
}

function metaNum(content: string, key: string): number {
  const match = content.match(new RegExp(`\\*\\*${key}\\*\\*:\\s*([-\\d.]+)`))
  if (!match) throw new Error(`Missing "${key}" in tpo.data.md`)
  return parseNum(match[1], key)
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** Raw text after `- **Key**:` on its metadata line, or null when absent. */
function metaText(content: string, key: string): string | null {
  const match = content.match(new RegExp(`\\*\\*${key}\\*\\*:[ \\t]*(.*)`))
  const value = match?.[1].trim()
  return value ? value : null
}

/**
 * The optional period→clock anchor. Absent (either line missing) → `null`, so
 * pre-feat-092 exports parse unchanged. Present but unreadable → throw, the
 * same loud failure the rest of this parser gives a drifted export.
 */
function extractFirstPeriod(content: string): TpoPeriodAnchor | null {
  const letter = metaText(content, 'First Period Letter')
  const start = metaText(content, 'First Period Start')
  if (letter === null || start === null) return null

  if (!/^[A-Za-z]$/.test(letter)) {
    throw new Error(`Invalid "First Period Letter" in tpo.data.md: "${letter}" (expected one letter A-Z or a-z)`)
  }
  // Accept the ISO `T` separator and a missing seconds field; normalize both.
  const stamp = start.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(:\d{2})?$/)
  if (!stamp) {
    throw new Error(`Invalid "First Period Start" in tpo.data.md: "${start}" (expected YYYY-MM-DD HH:MM:SS)`)
  }
  return { letter, start: `${stamp[1]} ${stamp[2]}${stamp[3] ?? ':00'}` }
}

function extractMeta(content: string): TpoMeta {
  const dateMatch = content.match(/\*\*Session Date\*\*:\s*(\d{4}-\d{2}-\d{2})/)
  if (!dateMatch) throw new Error('Missing "Session Date" in tpo.data.md Metadata section')
  const sessionMatch = content.match(/\*\*Session\*\*:\s*(RTH|ETH)/)
  if (!sessionMatch) throw new Error('Missing "Session" (RTH|ETH) in tpo.data.md Metadata section')
  const tickSize = metaNum(content, 'Tick Size')
  const binSize = metaNum(content, 'Bin Size \\(Ticks\\)')
  return {
    sessionDate: dateMatch[1],
    session: sessionMatch[1] as 'RTH' | 'ETH',
    tpoPeriodMinutes: metaNum(content, 'TPO Period Minutes'),
    tickSize,
    binSize,
    step: round4(tickSize * binSize),
    firstPeriod: extractFirstPeriod(content),
  }
}

function extractSummary(content: string): TpoSummary {
  return {
    pocPrice: metaNum(content, 'POC Price'),
    valueAreaHigh: metaNum(content, 'Value Area High'),
    valueAreaLow: metaNum(content, 'Value Area Low'),
    ibHigh: metaNum(content, 'IB High'),
    ibLow: metaNum(content, 'IB Low'),
    sessionHigh: metaNum(content, 'Session High'),
    sessionLow: metaNum(content, 'Session Low'),
  }
}

function parseRows(content: string, step: number): TpoRow[] {
  const block = content.match(/```csv\r?\n([\s\S]*?)```/)
  if (!block) throw new Error('No fenced ```csv block found in tpo.data.md')
  const lines = block[1].split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) throw new Error('tpo.data.md csv block has no data rows')
  const [header, ...dataLines] = lines
  if (header.trim() !== CSV_HEADER) {
    throw new Error(`tpo.data.md csv header mismatch: expected "${CSV_HEADER}", got "${header.trim()}"`)
  }
  const rows = dataLines.map((line, i) => {
    const match = line.match(/^([-\d.]+),(\d+),"([A-Za-z]*)"$/)
    if (!match) throw new Error(`tpo.data.md csv row ${i + 1} is malformed: "${line}"`)
    return {
      price: parseNum(match[1], `row ${i + 1} price`),
      tpoCount: parseInt(match[2], 10),
      letters: match[3],
    }
  })
  for (let i = 1; i < rows.length; i++) {
    const gap = round4(rows[i - 1].price - rows[i].price)
    if (gap <= 0) {
      throw new Error(`tpo.data.md prices not descending at ${rows[i].price}`)
    }
    // Untraded bins may be absent (a mid-session gap), but every gap must be a
    // whole number of grid steps — anything else is a bin-size mismatch.
    if (Math.abs(gap / step - Math.round(gap / step)) > 0.0001) {
      throw new Error(
        `tpo.data.md off-grid row spacing at price ${rows[i].price}: gap ${gap} is not a multiple of step ${step}`,
      )
    }
  }
  return rows
}

export function parseTpoProfile(content: string): TpoProfile {
  const meta = extractMeta(content)
  return {
    meta,
    summary: extractSummary(content),
    rows: parseRows(content, meta.step),
  }
}
