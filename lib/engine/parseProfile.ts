export type ProfileMeta = {
  tickSize: number
  binSize: number
  step: number
  pocPrice: number
  valueAreaHigh: number
  valueAreaLow: number
}

type ProfileType = 'vbp' | 'delta'

type SingleProfile = {
  type: ProfileType
  meta: ProfileMeta
  rows: { price: number; value: number; delta?: number }[]
}

function parseNum(s: string, label: string): number {
  const n = parseFloat(s.trim())
  if (isNaN(n)) throw new Error(`Invalid number for ${label}: "${s}"`)
  return n
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function extractMeta(content: string): { tickSize: number; binSize: number } {
  const tickMatch = content.match(/\*\*Tick Size\*\*:\s*([\d.]+)/)
  const binMatch = content.match(/\*\*Bin Size \(Ticks\)\*\*:\s*([\d.]+)/)
  if (!tickMatch) throw new Error('Missing "Tick Size" in Metadata section')
  if (!binMatch) throw new Error('Missing "Bin Size (Ticks)" in Metadata section')
  return {
    tickSize: parseNum(tickMatch[1], 'Tick Size'),
    binSize: parseNum(binMatch[1], 'Bin Size'),
  }
}

function extractSummary(content: string): {
  pocPrice: number
  valueAreaHigh: number
  valueAreaLow: number
} {
  const pocMatch = content.match(/\*\*POC Price\*\*:\s*([\d.]+)/)
  const vahMatch = content.match(/\*\*Value Area High\*\*:\s*([\d.]+)/)
  const valMatch = content.match(/\*\*Value Area Low\*\*:\s*([\d.]+)/)
  if (!pocMatch) throw new Error('Missing "POC Price" in Summary section')
  if (!vahMatch) throw new Error('Missing "Value Area High" in Summary section')
  if (!valMatch) throw new Error('Missing "Value Area Low" in Summary section')
  return {
    pocPrice: parseNum(pocMatch[1], 'POC Price'),
    valueAreaHigh: parseNum(vahMatch[1], 'Value Area High'),
    valueAreaLow: parseNum(valMatch[1], 'Value Area Low'),
  }
}

function extractCsvBlock(content: string): string {
  const match = content.match(/```csv\r?\n([\s\S]*?)```/)
  if (!match) throw new Error('No fenced ```csv block found in profile file')
  return match[1].trim()
}

function detectType(headerLine: string): { type: ProfileType; hasDelta: boolean } {
  const cols = headerLine.split(',').map(c => c.trim())
  if (cols.length < 2) throw new Error(`CSV header has fewer than 2 columns: "${headerLine}"`)
  const second = cols[1]
  if (second === 'Volume') {
    // feat-050: the structural vbp exports may carry a per-bin delta split.
    if (cols.length >= 3 && cols[2] !== 'Delta') {
      throw new Error(`Unknown 3rd CSV column header "${cols[2]}" — expected "Delta"`)
    }
    return { type: 'vbp', hasDelta: cols.length >= 3 }
  }
  if (second === 'Delta') {
    if (cols.length > 2) {
      throw new Error(`Delta profile header has unexpected extra columns: "${headerLine}"`)
    }
    return { type: 'delta', hasDelta: false }
  }
  throw new Error(`Unknown 2nd CSV column header "${second}" — expected "Volume" or "Delta"`)
}

function parseCsvRows(csv: string): {
  header: string
  rows: { price: number; value: number; delta?: number }[]
} {
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) throw new Error('CSV block has no data rows')
  const [header, ...dataLines] = lines
  const hasDelta = detectType(header).hasDelta
  const rows = dataLines.map((line, i) => {
    const parts = line.split(',')
    const expected = hasDelta ? 3 : 2
    if (parts.length < expected) {
      throw new Error(`CSV row ${i + 1} has fewer than ${expected} columns: "${line}"`)
    }
    const base = {
      price: parseNum(parts[0], `row ${i + 1} price`),
      value: parseNum(parts[1], `row ${i + 1} value`),
    }
    return hasDelta ? { ...base, delta: parseNum(parts[2], `row ${i + 1} delta`) } : base
  })
  return { header, rows }
}

type ParsedRow = { price: number; value: number; delta?: number }

/**
 * Enforce a contiguous price grid, optionally repairing it.
 *
 * The Sierra job-plan exporter (feat-118) OMITS zero-volume rows, so a profile
 * with a genuinely untraded price leaves a hole in the grid. That is not
 * corruption — the missing rows carry volume 0 by definition — but the strict
 * ingest contract cannot tell the two apart, so repair is opt-in:
 *
 *   - `fill = false` (default, the ingest contract): any gap throws.
 *   - `fill = true`: a gap that is an exact positive MULTIPLE of `step` is
 *     zero-filled. A gap that is not a multiple still throws — that is a real
 *     bin-size mismatch or a corrupt export, and silently interpolating it
 *     would put invented prices on the grid.
 */
function normalizeSpacing(rows: ParsedRow[], step: number, fill: boolean): ParsedRow[] {
  const out: ParsedRow[] = rows.length > 0 ? [rows[0]] : []
  const hasDelta = rows.some(r => r.delta !== undefined)
  for (let i = 1; i < rows.length; i++) {
    const gap = round4(rows[i - 1].price - rows[i].price)
    if (Math.abs(gap - step) <= 0.0001) {
      out.push(rows[i])
      continue
    }
    const multiple = gap / step
    const isPositiveMultiple =
      gap > 0 && Math.abs(multiple - Math.round(multiple)) <= 0.0001 && Math.round(multiple) > 1
    if (!fill || !isPositiveMultiple) {
      throw new Error(
        `Row spacing violation at price ${rows[i].price}: expected ${step}, got ${gap}`,
      )
    }
    for (let k = 1; k < Math.round(multiple); k++) {
      const price = round4(rows[i - 1].price - k * step)
      out.push(hasDelta ? { price, value: 0, delta: 0 } : { price, value: 0 })
    }
    out.push(rows[i])
  }
  return out
}

function parseProfileFile(content: string, fill: boolean): SingleProfile {
  const { tickSize, binSize } = extractMeta(content)
  const summary = extractSummary(content)
  const step = round4(tickSize * binSize)
  const csv = extractCsvBlock(content)
  const { header, rows } = parseCsvRows(csv)
  const { type } = detectType(header)
  return {
    type,
    meta: { tickSize, binSize, step, ...summary },
    rows: normalizeSpacing(rows, step, fill),
  }
}

export type VbpRow = {
  price: number
  volume: number
  /** Per-bin delta (ask − bid volume), present when the export carries the feat-050 Delta column. */
  delta?: number
}

export type VbpProfile = {
  rows: VbpRow[]
  meta: ProfileMeta
}

export type ParseProfileOptions = {
  /**
   * Zero-fill rows the exporter omitted because nothing traded there (feat-118's
   * Sierra job-plan exporter does this). Off by default: the briefing ingest
   * contract wants a hole to be an error. On for the job-plan / bench / render
   * paths, which read that exporter's output directly.
   */
  readonly fillMissingRows?: boolean
}

/**
 * Parse a standalone Volume (VbP) profile file (e.g. the 400-pt rotation or
 * balance-area HTF export, and the LVN/HVN fixtures' `.vbp.md`). The structural
 * exports may carry a third `Delta` column (feat-050); it is optional so
 * pre-delta exports keep parsing during the deploy window.
 */
export function parseVbpProfile(
  vbpContent: string,
  options: ParseProfileOptions = {},
): VbpProfile {
  const vbp = parseProfileFile(vbpContent, options.fillMissingRows === true)
  if (vbp.type !== 'vbp') {
    throw new Error('Expected a Volume (VbP) profile, got a Delta profile')
  }
  return {
    rows: vbp.rows.map(r =>
      r.delta === undefined
        ? { price: r.price, volume: r.value }
        : { price: r.price, volume: r.value, delta: r.delta },
    ),
    meta: vbp.meta,
  }
}

export type DeltaProfile = {
  rows: { price: number; delta: number }[]
  meta: ProfileMeta
}

/**
 * Parse a standalone Delta profile file (the half- / full-rotation execution
 * delta exports). There is deliberately no per-bin join against a volume
 * profile: the delta exports sit on their own bin grid, and their engine
 * consumer is absorption-stack detection (lib/engine/absorption.ts).
 */
export function parseDeltaProfile(deltaContent: string): DeltaProfile {
  const delta = parseProfileFile(deltaContent, false)
  if (delta.type !== 'delta') {
    throw new Error('Expected a Delta profile, got a Volume (VbP) profile')
  }
  return {
    rows: delta.rows.map(r => ({ price: r.price, delta: r.value })),
    meta: delta.meta,
  }
}
