/**
 * Parser for `daily-value-areas.csv` — the per-session value-area history
 * written by the Sierra study GekkoDailyValueAreasExporter (feat-048). Plain
 * CSV, one row per COMPLETED RTH session, most recent first, rolling ~20
 * sessions: `Date,POC,VAH,VAL,SessionHigh,SessionLow,SessionVolume`.
 *
 * Hard-rejects on a malformed file (wrong header, malformed row, dates not
 * strictly descending, value area outside the session range) — the same
 * strictness as parseTpo.ts / parseExecBars.ts, so a drifted study export
 * fails loudly instead of producing a wrong migration read. The *caller*
 * decides whether the history is required (computeEngineFacts treats it as
 * best-effort and degrades to a warning).
 */

export type DailyValueArea = {
  /** ISO trading-day date (`YYYY-MM-DD`). */
  date: string
  poc: number
  vah: number
  val: number
  sessionHigh: number
  sessionLow: number
  sessionVolume: number
}

const CSV_HEADER = 'Date,POC,VAH,VAL,SessionHigh,SessionLow,SessionVolume'

const ROW_PATTERN =
  /^(\d{4}-\d{2}-\d{2}),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+),(\d+)$/

function parseNum(s: string, label: string): number {
  const n = parseFloat(s)
  if (isNaN(n)) throw new Error(`Invalid number for ${label}: "${s}"`)
  return n
}

/** Most recent session first, as exported. Throws on any malformed content. */
export function parseDailyValueAreas(content: string): DailyValueArea[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) {
    throw new Error('daily-value-areas.csv has no data rows')
  }
  const [header, ...dataLines] = lines
  if (header.trim() !== CSV_HEADER) {
    throw new Error(
      `daily-value-areas.csv header mismatch: expected "${CSV_HEADER}", got "${header.trim()}"`,
    )
  }

  const rows = dataLines.map((line, i) => {
    const match = line.trim().match(ROW_PATTERN)
    if (!match) {
      throw new Error(`daily-value-areas.csv row ${i + 1} is malformed: "${line}"`)
    }
    const row: DailyValueArea = {
      date: match[1],
      poc: parseNum(match[2], `row ${i + 1} POC`),
      vah: parseNum(match[3], `row ${i + 1} VAH`),
      val: parseNum(match[4], `row ${i + 1} VAL`),
      sessionHigh: parseNum(match[5], `row ${i + 1} SessionHigh`),
      sessionLow: parseNum(match[6], `row ${i + 1} SessionLow`),
      sessionVolume: parseInt(match[7], 10),
    }
    if (row.vah < row.val) {
      throw new Error(`daily-value-areas.csv row ${i + 1} (${row.date}): VAH ${row.vah} < VAL ${row.val}`)
    }
    if (row.sessionHigh < row.sessionLow) {
      throw new Error(
        `daily-value-areas.csv row ${i + 1} (${row.date}): SessionHigh ${row.sessionHigh} < SessionLow ${row.sessionLow}`,
      )
    }
    if (row.vah > row.sessionHigh || row.val < row.sessionLow) {
      throw new Error(
        `daily-value-areas.csv row ${i + 1} (${row.date}): value area ${row.val}-${row.vah} outside session range ${row.sessionLow}-${row.sessionHigh}`,
      )
    }
    if (row.poc < row.val || row.poc > row.vah) {
      throw new Error(
        `daily-value-areas.csv row ${i + 1} (${row.date}): POC ${row.poc} outside value area ${row.val}-${row.vah}`,
      )
    }
    return row
  })

  for (let i = 1; i < rows.length; i++) {
    // ISO dates compare lexicographically; the export is most recent first.
    if (rows[i].date >= rows[i - 1].date) {
      throw new Error(
        `daily-value-areas.csv dates not strictly descending at row ${i + 1} (${rows[i].date})`,
      )
    }
  }

  return rows
}
