/**
 * Parser for `daily-value-areas.csv` — the per-session value-area history
 * written by the Sierra study GekkoDailyValueAreasExporter (feat-048). Plain
 * CSV, one row per RTH session, most recent first, rolling ~20 sessions:
 * `Date,POC,VAH,VAL,SessionHigh,SessionLow,SessionVolume` with an OPTIONAL
 * trailing `IsComplete` flag (feat-089).
 *
 * The exporter contract (docs/data-todos.md §3) says the current in-progress
 * session is excluded. Bundle review 2026-08-07 D1 found it is NOT: the live
 * file ships the developing RTH session as row 1, and every consumer that
 * documents its input as "completed sessions" silently read it as the prior
 * day. Rather than dropping that row — it is the only VOLUME-based view of the
 * live session anywhere in the bundle — {@link partitionDailyValueAreas}
 * splits the history BY DATE into the developing session and the completed
 * remainder. Detection is by date and never by position: pre-open and
 * overnight bundles carry no in-progress row at all.
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
  /**
   * The export's optional `IsComplete` flag (feat-089, belt-and-braces).
   * Undefined when the export predates the column. The engine NEVER partitions
   * on this — {@link partitionDailyValueAreas} is date-driven and only uses the
   * flag to report a disagreement.
   */
  isComplete?: boolean
}

const CSV_HEADER = 'Date,POC,VAH,VAL,SessionHigh,SessionLow,SessionVolume'

/** Belt-and-braces variant (feat-089): the exporter may append a completeness flag. */
const CSV_HEADER_WITH_FLAG = `${CSV_HEADER},IsComplete`

const BASE_ROW =
  '^(\\d{4}-\\d{2}-\\d{2}),([-\\d.]+),([-\\d.]+),([-\\d.]+),([-\\d.]+),([-\\d.]+),(\\d+)'

const ROW_PATTERN = new RegExp(`${BASE_ROW}$`)
const ROW_PATTERN_WITH_FLAG = new RegExp(`${BASE_ROW},(0|1|true|false|TRUE|FALSE|True|False)$`)

function parseNum(s: string, label: string): number {
  const n = parseFloat(s)
  if (isNaN(n)) throw new Error(`Invalid number for ${label}: "${s}"`)
  return n
}

function parseFlag(s: string): boolean {
  return s === '1' || s.toLowerCase() === 'true'
}

/** Most recent session first, as exported. Throws on any malformed content. */
export function parseDailyValueAreas(content: string): DailyValueArea[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) {
    throw new Error('daily-value-areas.csv has no data rows')
  }
  const [header, ...dataLines] = lines
  const hasFlag = header.trim() === CSV_HEADER_WITH_FLAG
  if (!hasFlag && header.trim() !== CSV_HEADER) {
    throw new Error(
      `daily-value-areas.csv header mismatch: expected "${CSV_HEADER}" (optionally "${CSV_HEADER_WITH_FLAG}"), got "${header.trim()}"`,
    )
  }
  const pattern = hasFlag ? ROW_PATTERN_WITH_FLAG : ROW_PATTERN

  const rows = dataLines.map((line, i) => {
    const match = line.trim().match(pattern)
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
      ...(hasFlag ? { isComplete: parseFlag(match[8]) } : {}),
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

export type DailyValueAreaPartition = {
  /**
   * The row whose date IS the live session — the developing volume value area.
   * Null on a pre-open/overnight bundle (no in-progress row exists yet) or when
   * the exporter genuinely honours its completed-only contract.
   */
  developing: DailyValueArea | null
  /**
   * Every other row, order preserved (newest first) — the ONLY input
   * `computeValueMigration` / `computeDailyRanges` may consume.
   */
  completed: DailyValueArea[]
  /**
   * Set when the export's optional `IsComplete` flag contradicts the date
   * partition (a "complete" row dated today, or an "incomplete" row dated
   * earlier). Describes the disagreement for a warning; the DATE verdict always
   * wins — the engine must not depend on the flag.
   */
  flagDisagreement: string | null
}

/**
 * Split the history into the live developing session and the completed
 * remainder (feat-089; bundle review 2026-08-07 D1).
 *
 * @param rows parsed history, newest first.
 * @param liveSessionDate the trading day the bundle was exported inside
 *   (`tpo.sessionDate`, else the exec/HTF bars' trading day). Null when the
 *   bundle carries no way to know it — every row is then treated as completed,
 *   which is the pre-feat-089 behaviour and the only safe fallback.
 */
export function partitionDailyValueAreas(
  rows: readonly DailyValueArea[],
  liveSessionDate: string | null,
): DailyValueAreaPartition {
  // By date, never by position: the in-progress row is row 1 when it exists at
  // all, but a pre-open bundle has none and indexing would silently discard a
  // completed session.
  const developing =
    liveSessionDate === null ? null : (rows.find((r) => r.date === liveSessionDate) ?? null)
  const completed = rows.filter((r) => r !== developing)

  let flagDisagreement: string | null = null
  if (developing?.isComplete === true) {
    flagDisagreement = `row ${developing.date} is flagged IsComplete=true but is the live session — partitioned as developing on the date`
  } else {
    const stale = completed.find((r) => r.isComplete === false)
    if (stale) {
      flagDisagreement = `row ${stale.date} is flagged IsComplete=false but is not the live session${
        liveSessionDate === null ? '' : ` (${liveSessionDate})`
      } — partitioned as completed on the date`
    }
  }

  return { developing, completed, flagDisagreement }
}
