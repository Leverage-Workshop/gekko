import { readFileSync } from 'fs'

export type ProfileRow = {
  price: number
  volume: number
  delta: number | null
}

export type ProfileMeta = {
  tickSize: number
  binSize: number
  step: number
  pocPrice: number
  valueAreaHigh: number
  valueAreaLow: number
}

export type ParsedProfiles = {
  rows: ProfileRow[]
  vbpMeta: ProfileMeta
  deltaMeta: ProfileMeta
}

type ProfileType = 'vbp' | 'delta'

type SingleProfile = {
  type: ProfileType
  meta: ProfileMeta
  rows: { price: number; value: number }[]
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

function detectType(headerLine: string): ProfileType {
  const cols = headerLine.split(',')
  if (cols.length < 2) throw new Error(`CSV header has fewer than 2 columns: "${headerLine}"`)
  const second = cols[1].trim()
  if (second === 'Volume') return 'vbp'
  if (second === 'Delta') return 'delta'
  throw new Error(`Unknown 2nd CSV column header "${second}" — expected "Volume" or "Delta"`)
}

function parseCsvRows(csv: string): { header: string; rows: { price: number; value: number }[] } {
  const lines = csv.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (lines.length < 2) throw new Error('CSV block has no data rows')
  const [header, ...dataLines] = lines
  const rows = dataLines.map((line, i) => {
    const parts = line.split(',')
    if (parts.length < 2) throw new Error(`CSV row ${i + 1} has fewer than 2 columns: "${line}"`)
    return {
      price: parseNum(parts[0], `row ${i + 1} price`),
      value: parseNum(parts[1], `row ${i + 1} value`),
    }
  })
  return { header, rows }
}

function validateSpacing(rows: { price: number }[], step: number): void {
  for (let i = 1; i < rows.length; i++) {
    const gap = round4(rows[i - 1].price - rows[i].price)
    if (Math.abs(gap - step) > 0.0001) {
      throw new Error(
        `Row spacing violation at price ${rows[i].price}: expected ${step}, got ${gap}`,
      )
    }
  }
}

function parseProfileFile(content: string): SingleProfile {
  const { tickSize, binSize } = extractMeta(content)
  const summary = extractSummary(content)
  const step = round4(tickSize * binSize)
  const csv = extractCsvBlock(content)
  const { header, rows } = parseCsvRows(csv)
  const type = detectType(header)
  validateSpacing(rows, step)
  return {
    type,
    meta: { tickSize, binSize, step, ...summary },
    rows,
  }
}

export function parseProfiles(vbpContent: string, deltaContent: string): ParsedProfiles {
  const vbp = parseProfileFile(vbpContent)
  const delta = parseProfileFile(deltaContent)

  if (vbp.type !== 'vbp') {
    throw new Error('First argument must be the Volume (VbP) profile, got Delta profile')
  }
  if (delta.type !== 'delta') {
    throw new Error('Second argument must be the Delta profile, got Volume (VbP) profile')
  }

  const deltaMap = new Map(delta.rows.map(r => [round4(r.price), r.value]))

  const rows: ProfileRow[] = vbp.rows.map(r => ({
    price: r.price,
    volume: r.value,
    delta: deltaMap.get(round4(r.price)) ?? null,
  }))

  return {
    rows,
    vbpMeta: vbp.meta,
    deltaMeta: delta.meta,
  }
}

export function parseProfilesFromFiles(vbpPath: string, deltaPath: string): ParsedProfiles {
  const vbpContent = readFileSync(vbpPath, 'utf-8')
  const deltaContent = readFileSync(deltaPath, 'utf-8')
  return parseProfiles(vbpContent, deltaContent)
}
