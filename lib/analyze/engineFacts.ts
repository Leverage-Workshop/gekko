import { scanAbsorption } from '@/lib/engine/absorption'
import { confirmStalls } from '@/lib/engine/stallConfirmation'
import type { ConfirmedAbsorptionScanResult } from '@/lib/engine/stallConfirmation'
import { computeDeltaTelemetry } from '@/lib/engine/deltaTelemetry'
import type { DeltaTelemetry } from '@/lib/engine/deltaTelemetry'
import { detectLvnHvn } from '@/lib/engine/lvnDetection'
import { detectFakeoutTails } from '@/lib/engine/fakeoutTails'
import type { FakeoutTailFact } from '@/lib/engine/fakeoutTails'
import { annotateNodeBuilds, withBuild } from '@/lib/engine/nodeBuild'
import type { BuiltLvnDetectionResult } from '@/lib/engine/nodeBuild'
import { collectMagnets, evaluateMagnetCheck } from '@/lib/engine/magnetCheck'
import type { MagnetCheck, ProfileSummary } from '@/lib/engine/magnetCheck'
import { computeMgiPriority } from '@/lib/engine/mgiPriority'
import type { MgiPriority, MgiStaticLevels } from '@/lib/engine/mgiPriority'
import { parseExecBars } from '@/lib/engine/parseExecBars'
import { parseDeltaProfile, parseVbpProfile } from '@/lib/engine/parseProfile'
import { computeRipStatus } from '@/lib/engine/ripStatus'
import type { RipStatus } from '@/lib/engine/ripStatus'
import { assessStaleness } from '@/lib/engine/staleness'
import type { StalenessAssessment } from '@/lib/engine/staleness'
import { assembleTerrain } from '@/lib/engine/terrainZones'
import type { TerrainZonesResult } from '@/lib/engine/terrainZones'
import { parseTpoProfile } from '@/lib/engine/parseTpo'
import { computeTpoFacts } from '@/lib/engine/tpoFacts'
import type { TpoFacts } from '@/lib/engine/tpoFacts'
import { parseDailyValueAreas, partitionDailyValueAreas } from '@/lib/engine/parseDailyValueAreas'
import type { DailyValueArea } from '@/lib/engine/parseDailyValueAreas'
import { computeDevelopingSession } from '@/lib/engine/developingSession'
import type { DevelopingSessionFacts } from '@/lib/engine/developingSession'
import { tradingDayOf } from '@/lib/engine/overnightSession'
import { computeValueMigration } from '@/lib/engine/valueMigration'
import type { ValueMigrationFacts } from '@/lib/engine/valueMigration'
import { computeDailyRanges } from '@/lib/engine/dailyRanges'
import type { DailyRangeFacts } from '@/lib/engine/dailyRanges'
import { parseHtfBars } from '@/lib/engine/parseHtfBars'
import type { HtfBar } from '@/lib/engine/parseHtfBars'
import { computeHtfStructure } from '@/lib/engine/htfStructure'
import type { HtfStructureFacts } from '@/lib/engine/htfStructure'
import { computeVolatilityScale } from '@/lib/engine/volatilityScale'
import type { StructureReference, VolatilityScaleFacts } from '@/lib/engine/volatilityScale'
import { computeOvernightSession } from '@/lib/engine/overnightSession'
import type { OvernightSessionFacts } from '@/lib/engine/overnightSession'
import { computeMultiDayTpo } from '@/lib/engine/multiDayTpo'
import type { MultiDayTpoFacts } from '@/lib/engine/multiDayTpo'
import { computeSessionIntraday } from '@/lib/engine/sessionIntraday'
import type { SessionIntradayFacts } from '@/lib/engine/sessionIntraday'
import { computeIntradayTrend } from '@/lib/engine/intradayTrend'
import type { IntradayTrendFacts } from '@/lib/engine/intradayTrend'
import { computeRelativeVolume } from '@/lib/engine/relativeVolume'
import type { RelativeVolumeFacts } from '@/lib/engine/relativeVolume'

/**
 * Deterministic engine pass over one export bundle: every computed fact the
 * model receives (and must not re-derive) in the analyze-task prompt.
 * LVN/HVN node prices (per volume profile), terrain borders, magnet set,
 * absorption-candidate stacks, MGI tiering, Rip condition and staleness are
 * all code-owned — the model supplies perception/judgment.
 */

export interface EngineFactsInput {
  /** HTF volume profile anchored to the current 400-pt rotation (`four-hundred-rotation.vbp.md`). */
  rotationVbpContent: string
  /** HTF volume profile anchored to the current Balance Area (`balance-area.vbp.md`). */
  balanceAreaVbpContent: string
  /** Execution delta profile, ~35-pt / half-rotation anchor (`half-rotation-delta.vbp.md`). */
  halfRotationDeltaContent: string
  /** Execution delta profile, ~75-pt / full-rotation anchor (`full-rotation-delta.vbp.md`). */
  fullRotationDeltaContent: string
  /** Execution-bar CSV export (`execution_bar_data.globex.csv`, full session since Globex open). */
  execCsvContent: string
  /**
   * Numeric TPO export (`tpo.data.md`, feat-046). Best-effort: absent or
   * malformed content degrades to `tpo: null` + a warning instead of failing
   * the run (pre-study bundles carry no TPO file).
   */
  tpoDataContent?: string | null
  /**
   * Daily value-area history (`daily-value-areas.csv`, feat-048). Best-effort
   * like the TPO export: absent or malformed content degrades to
   * `valueMigration: null` + a warning.
   */
  dailyVaContent?: string | null
  /**
   * HTF 30-min bars (`htf_bar_data.rolling.csv`, feat-049). Best-effort like
   * the TPO export: absent or malformed content degrades to
   * `htfStructure: null` + a warning.
   */
  htfCsvContent?: string | null
  /** Parsed `mgi_json` from the bundle row. */
  mgi: MgiStaticLevels
  /** `raw_bundles.received_at` — feeds the staleness assessment. */
  receivedAt: string | null
  /** Evaluation instant; defaults to the wall clock. */
  now?: string | number | Date
}

export interface EngineFacts {
  currentPrice: number
  staleness: StalenessAssessment
  deltaTelemetry: DeltaTelemetry
  mgi: MgiPriority
  /** Resolved Vanguard condition, or null when `mgi.daily.rip` is absent. */
  ripStatus: RipStatus | null
  /**
   * LVN/HVN nodes per volume profile. The balance-area nodes are structurally
   * MORE significant than rotation nodes (longer-term acceptance). The terrain
   * zone stack stays anchored to the rotation profile's geometry; the magnet
   * set is anchored to the balance-area profile (feat-037). Each node carries
   * a `build` annotation (feat-050) — one-sided vs balanced construction from
   * the profile's delta split; null when the export has no Delta column.
   */
  lvn: { rotation: BuiltLvnDetectionResult; balanceArea: BuiltLvnDetectionResult }
  /**
   * Code-owned formation test (feat-075): High/Low-type MGI extremes whose
   * print sits at the far end of a thin low-volume tail on the rotation
   * profile — the geometry a pre-reversal fakeout leaves behind — each with
   * the LVN acceptance edge where retests actually stall. The finding is
   * engine fact; the model owns only the judgment of where to anchor.
   */
  fakeoutTails: FakeoutTailFact[]
  /**
   * Absorption-candidate stacks from the half/full-rotation delta exports,
   * each annotated with a code-owned stall confirmation computed from the
   * enriched execution bars (feat-047): heavy participation at the stack with
   * no meaningful price progress. `stall.confirmed` candidates ARE absorption;
   * unconfirmed ones are stacks with no stall visible in the rolling bar
   * window (possibly aged out — not refuted).
   */
  absorption: ConfirmedAbsorptionScanResult
  magnetCheck: MagnetCheck
  terrain: TerrainZonesResult
  /** POC/VAH/VAL per volume profile. */
  profileSummary: { rotation: ProfileSummary; balanceArea: ProfileSummary }
  /**
   * Code-owned TPO / Market Profile reads (feat-046): single-print zones,
   * poor high/low, excess tails at the extremes (feat-091), POC prominence,
   * IB. Null when the bundle has no (or a malformed) `tpo.data.md` — flagged
   * in `warnings`.
   */
  tpo: TpoFacts | null
  /**
   * Code-owned value-migration read (feat-048): POC drift, value-day streaks,
   * prior-day value overlap, current price vs prior-day value. Null when the
   * bundle has no (or a malformed) `daily-value-areas.csv` — flagged in
   * `warnings`.
   */
  valueMigration: ValueMigrationFacts | null
  /**
   * Code-owned daily-range read (feat-060): per-session range series and the
   * contraction/expansion verdict, in plain points (the overview must never
   * cite ATR). Null when the bundle has no (or a malformed)
   * `daily-value-areas.csv` — flagged in `warnings`.
   */
  dailyRanges: DailyRangeFacts | null
  /**
   * Code-owned DEVELOPING-session read (feat-089): the live in-progress RTH
   * session's VOLUME value area (developing POC/VAH/VAL, session high/low,
   * volume so far) split out of the value-area history by date, plus a maturity
   * qualifier — elapsed RTH minutes, volume so far against the time-of-day
   * expectation, and range used so far against the completed-session median.
   * The only volume-based view of the live session in the bundle, and the
   * companion to the time-based `tpo` read on the same day. Null when the
   * history carries no row for the live session (pre-open/overnight bundles, or
   * an exporter that honours its completed-only contract) — flagged in
   * `warnings` either way, so the split is visible in the trace.
   */
  developingSession: DevelopingSessionFacts | null
  /**
   * Code-owned HTF structure read (feat-049): trend state from the swing
   * sequence, recent swing highs/lows, rotation extent and measured 30-min
   * ATR — `meta.htfTrend` verifies against this instead of being a pure
   * vision read. Null when the bundle has no (or a malformed)
   * `htf_bar_data.rolling.csv` — flagged in `warnings`.
   */
  htfStructure: HtfStructureFacts | null
  /**
   * Code-owned volatility SCALE read (feat-095), computed from the same 30-min
   * bars: Parkinson (high/low) and Garman-Klass (OHLC) range estimators — ~5x
   * more efficient per bar than close-to-close — aggregated into one session
   * sigma in points (`volatilityScale.sessionSigmaPts`), plus the distance from
   * current price to the nearest structure in points AND sigma. The scale
   * number that tells the model whether "29 pts away" is a gap or noise. Null
   * when the bundle has no HTF bar export or under 3 complete RTH sessions —
   * flagged in `warnings`.
   */
  volatilityScale: VolatilityScaleFacts | null
  /**
   * Code-owned overnight-session read (feat-060): the Globex session's
   * high/low/range plus RTH-so-far extremes from the 30-min bars. Null when
   * the bundle has no HTF bar export OR the export carries no overnight bars
   * (RTH-only chart) — flagged in `warnings`.
   */
  overnightSession: OvernightSessionFacts | null
  /**
   * Code-owned multi-day TPO composite (feat-071): the last ~5 RTH sessions'
   * TPO profiles reconstructed from the 30-min bars (one bar = one TPO
   * period) and merged — composite POC/value area/range, HVN shelves,
   * interior LVN valleys, per-session POC walk. The numeric multi-day Market
   * Profile behind `overview.mtfView`. Null when the bundle has no HTF bar
   * export or it holds fewer than two RTH sessions — flagged in `warnings`.
   */
  multiDayTpo: MultiDayTpoFacts | null
  /**
   * Code-owned relative-volume read (feat-094): today's 30-min slot volumes
   * against a per-slot median built from the HTF export's own history, the
   * cumulative RTH volume against the time-of-day expectation, and the
   * day-level `SessionVolume` companion — reduced to one `participation`
   * scalar (with a band and a confidence `gate`) that every other order-flow
   * fact is read through. Null when the bundle has no (or a malformed)
   * `htf_bar_data.rolling.csv` — flagged in `warnings`.
   */
  relativeVolume: RelativeVolumeFacts | null
  /**
   * Code-owned session-anchored intraday read (feat-063), computed from the
   * full-session Globex exec-bar export (feat-062): session VWAP (Globex- and
   * RTH-anchored) with slope, session cumulative delta, and 15-min
   * one-timeframing. Each VWAP carries its volume-weighted sigma envelope
   * (feat-097: `sigmaBands`, computed over the same exec bars — no export
   * change), flattened into `vwapRungs` for entry/stop/target-rung anchoring.
   * VWAP/cum-delta anchors — and with them the bands and rungs — are null/empty
   * when the export starts mid-session (`coverage: 'partial'`, e.g. the retired
   * rolling export) — flagged in `warnings`.
   */
  sessionIntraday: SessionIntradayFacts
  /**
   * Code-owned composite intraday trend (feat-064) — the trend read at the
   * operator's trade horizon: direction from a majority of structural votes
   * (15-min one-timeframing, micro swing structure with a Dow break rule,
   * multi-window momentum), conviction from the confirming reads (session
   * cumulative delta, Rip, session-VWAP position), character
   * trending/transitioning/rotational, with disagreements listed explicitly.
   */
  intradayTrend: IntradayTrendFacts
  /** Non-fatal degradations (missing rip, terrain issues, ...). */
  warnings: string[]
}

/** Every engine zone border price (deduped, price-descending). */
export function engineZoneBorders(terrain: TerrainZonesResult): number[] {
  const borders = terrain.zones.flatMap((zone) => [zone.top, zone.bottom])
  return [...new Set(borders)].sort((a, b) => b - a)
}

/**
 * Every engine price an entry may legitimately anchor on: zone borders, level
 * verdicts, composite border band members and — when the per-profile node
 * facts are supplied — detector LVN node prices (feat-074: the doctrine's
 * fakeout-formed-extreme fade anchors at the tail's near-edge acceptance
 * boundary, a taper-edge or valley LVN that carries no MGI name and so never
 * becomes terrain structure) and — when the session-intraday fact is supplied —
 * the session-VWAP rungs (feat-097: the Globex/RTH VWAP centerlines and their
 * volume-weighted sigma bands, which are real intraday structure the profile
 * geometry never mints). HVN peaks stay excluded — they are the middle of
 * value, never an entry. Profile data edges are filtered out, as they are data
 * artifacts the doctrine forbids trading (feat-040 G2). Deduped,
 * price-descending. Feeds `ValidateOptions.anchorPrices`.
 */
export function engineAnchorPrices(
  terrain: TerrainZonesResult,
  lvn?: EngineFacts['lvn'],
  sessionIntraday?: SessionIntradayFacts,
): number[] {
  const lvnNodes = lvn ? [...lvn.rotation.lvn, ...lvn.balanceArea.lvn] : []
  const anchors = [
    ...terrain.zones.flatMap((zone) => [zone.top, zone.bottom]),
    ...terrain.levels.map((verdict) => verdict.level.price),
    ...terrain.borders.flatMap((border) =>
      border.members.map((member) => member.level.price),
    ),
    ...lvnNodes.map((node) => node.price),
  ].filter((price) => !terrain.dataEdges.includes(price))
  // Session-VWAP rungs are empty on partial coverage, so they simply drop out
  // of the anchor set rather than needing a guard here.
  const vwapRungs = sessionIntraday?.vwapRungs.map((rung) => rung.price) ?? []
  return [...new Set([...anchors, ...vwapRungs])].sort((a, b) => b - a)
}

/**
 * The structure a sigma-normalized distance is worth quoting against
 * (feat-095): the nearest Tier-1 campaign border each side and the nearest
 * engine zone border each side. Deliberately narrow — the point of the fact is
 * "is the next thing that matters inside the noise?", and dumping the whole map
 * in sigma would bury that answer.
 */
function sigmaStructureRefs(
  mgi: MgiPriority,
  terrain: TerrainZonesResult,
  price: number,
): StructureReference[] {
  const refs: StructureReference[] = []
  if (mgi.nearestTier1Above) {
    refs.push({
      label: `${mgi.nearestTier1Above.level.label} (nearest Tier-1 above)`,
      price: mgi.nearestTier1Above.level.price,
    })
  }
  if (mgi.nearestTier1Below) {
    refs.push({
      label: `${mgi.nearestTier1Below.level.label} (nearest Tier-1 below)`,
      price: mgi.nearestTier1Below.level.price,
    })
  }
  // engineZoneBorders is price-DESCENDING: the nearest border above is the last
  // one over price; the nearest below is the first one under it.
  const borders = engineZoneBorders(terrain)
  const borderAbove = borders.filter((b) => b > price).at(-1)
  const borderBelow = borders.find((b) => b < price)
  if (borderAbove !== undefined) {
    refs.push({ label: 'nearest zone border above', price: borderAbove })
  }
  if (borderBelow !== undefined) {
    refs.push({ label: 'nearest zone border below', price: borderBelow })
  }
  return refs
}

/**
 * Run the full deterministic engine over one bundle's raw exports.
 *
 * @throws when a required input fails to parse (malformed bundle) — the
 *   trigger.dev retry policy handles transient cases; a malformed bundle fails
 *   every attempt by design rather than producing a briefing from bad facts.
 */
export function computeEngineFacts(input: EngineFactsInput): EngineFacts {
  const warnings: string[] = []

  const rotationVbp = parseVbpProfile(input.rotationVbpContent)
  const balanceAreaVbp = parseVbpProfile(input.balanceAreaVbpContent)
  const halfRotationDelta = parseDeltaProfile(input.halfRotationDeltaContent)
  const fullRotationDelta = parseDeltaProfile(input.fullRotationDeltaContent)

  const bars = parseExecBars(input.execCsvContent)
  const deltaTelemetry = computeDeltaTelemetry(bars)
  const mgi = computeMgiPriority(input.mgi)
  const sessionIntraday = computeSessionIntraday(bars, mgi.currentPrice)
  if (sessionIntraday.coverage === 'partial') {
    warnings.push(
      `exec export starts ${sessionIntraday.firstBarTime}, well after the Globex open — session VWAP and cumulative delta not computed (partial session coverage)`,
    )
  }
  // Node build quality (feat-050): the canonical node lists are annotated with
  // the raw delta that built them when the profile export carries the Delta
  // column. Terrain and the magnet verdicts consume the UNannotated objects —
  // they embed magnet/node references throughout their output, and duplicating
  // the build objects there balloons the prompt payload for no new information.
  const lvnRaw = {
    rotation: detectLvnHvn(rotationVbp.rows),
    balanceArea: detectLvnHvn(balanceAreaVbp.rows),
  }
  const lvn = {
    rotation: annotateNodeBuilds(lvnRaw.rotation, rotationVbp.rows),
    balanceArea: annotateNodeBuilds(lvnRaw.balanceArea, balanceAreaVbp.rows),
  }
  for (const [name, profile] of [
    ['four-hundred-rotation', rotationVbp],
    ['balance-area', balanceAreaVbp],
  ] as const) {
    if (!profile.rows.some(r => r.delta !== undefined)) {
      warnings.push(`${name} profile has no Delta column — node build quality not computed`)
    }
  }
  const absorption = confirmStalls(
    scanAbsorption({
      halfRotation: halfRotationDelta.rows,
      fullRotation: fullRotationDelta.rows,
    }),
    bars,
  )
  const staleness = assessStaleness({ receivedAt: input.receivedAt, now: input.now })

  let tpo: TpoFacts | null = null
  if (input.tpoDataContent) {
    try {
      tpo = computeTpoFacts(parseTpoProfile(input.tpoDataContent))
    } catch (error) {
      warnings.push(
        `tpo.data.md failed to parse — TPO facts not computed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  } else {
    warnings.push('bundle has no numeric TPO export — TPO facts not computed')
  }

  // ONE notion of "which trading day is live" for the whole engine (feat-089).
  // `tpo.sessionDate` is the designated source (the TPO export states the day it
  // profiled); the execution bars — always present — are the fallback, using the
  // same Globex-reopen roll rule as `overnightSession`.
  const execSessionDate = bars.length > 0 ? tradingDayOf(bars[bars.length - 1]) : null
  const liveSessionDate = tpo?.sessionDate ?? execSessionDate
  if (tpo !== null && execSessionDate !== null && tpo.sessionDate !== execSessionDate) {
    warnings.push(
      `live-session date mismatch: tpo.data.md is dated ${tpo.sessionDate} but the execution bars run into ${execSessionDate} — the export's date wins`,
    )
  }

  let valueMigration: ValueMigrationFacts | null = null
  let dailyRanges: DailyRangeFacts | null = null
  let developingSession: DevelopingSessionFacts | null = null
  // Held outside the block: the relative-volume read (feat-094) pairs the
  // per-slot intraday baseline with this history's `SessionVolume` column, and
  // the developing-session read (feat-089) needs both halves of the partition.
  let completedSessions: DailyValueArea[] | null = null
  let developingRow: DailyValueArea | null = null
  if (input.dailyVaContent) {
    try {
      const parsed = parseDailyValueAreas(input.dailyVaContent)
      // Partition, never discard (feat-089): the live row is the only
      // volume-based view of the developing session in the bundle, and leaving
      // it in the history made `priorDay` resolve to TODAY.
      const partition = partitionDailyValueAreas(parsed, liveSessionDate)
      completedSessions = partition.completed
      developingRow = partition.developing
      if (partition.flagDisagreement !== null) {
        warnings.push(
          `daily value-area export's IsComplete flag disagrees with the dates: ${partition.flagDisagreement}`,
        )
      }
      if (developingRow !== null) {
        warnings.push(
          `value-area history row ${developingRow.date} is the live session — split out as developingSession; ${completedSessions.length} completed sessions feed the migration/range reads`,
        )
      } else {
        warnings.push(
          `value-area history carries no row for the live session${liveSessionDate === null ? '' : ` ${liveSessionDate}`} — no developing value area (pre-open/overnight, or a completed-only export)`,
        )
      }
      if (completedSessions.length === 0) {
        warnings.push(
          'daily value-area history holds only the live session — migration and range reads not computed',
        )
      } else {
        valueMigration = computeValueMigration(completedSessions, mgi.currentPrice)
        dailyRanges = computeDailyRanges(completedSessions)
      }
    } catch (error) {
      completedSessions = null
      developingRow = null
      warnings.push(
        `daily-value-areas.csv failed to parse — value migration and daily ranges not computed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  } else {
    warnings.push(
      'bundle has no daily value-area history — value migration and daily ranges not computed',
    )
  }

  let htfStructure: HtfStructureFacts | null = null
  let overnightSession: OvernightSessionFacts | null = null
  let multiDayTpo: MultiDayTpoFacts | null = null
  let relativeVolume: RelativeVolumeFacts | null = null
  // Held for the volatility-scale pass (feat-095), which runs after terrain so
  // its sigma-normalized distances can quote the assembled zone borders.
  let htfBars: HtfBar[] | null = null
  if (input.htfCsvContent) {
    try {
      htfBars = parseHtfBars(input.htfCsvContent)
      htfStructure = computeHtfStructure(htfBars, mgi.currentPrice)
      relativeVolume = computeRelativeVolume({
        bars: htfBars,
        completedSessions,
        developingSession: developingRow,
      })
      if (relativeVolume.participation === null) {
        warnings.push(
          'no intraday slot or session has enough volume history for a relative-volume read — RVOL not computed',
        )
      }
      overnightSession = computeOvernightSession(htfBars, mgi.currentPrice)
      if (overnightSession === null) {
        warnings.push(
          'HTF export carries no overnight bars — overnight session facts not computed',
        )
      }
      multiDayTpo = computeMultiDayTpo(htfBars, mgi.currentPrice)
      if (multiDayTpo === null) {
        warnings.push(
          'HTF export holds fewer than two RTH sessions — multi-day TPO composite not computed',
        )
      }
    } catch (error) {
      warnings.push(
        `htf_bar_data.rolling.csv failed to parse — HTF structure and relative volume not computed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  } else {
    warnings.push(
      'bundle has no HTF bar data — HTF structure and relative volume not computed',
    )
  }

  // Computed after the HTF block: the maturity qualifier's volume leg reuses
  // feat-094's time-of-day expectation rather than forking the baseline, and the
  // clock comes from the freshest execution bar (chart time).
  if (developingRow !== null) {
    developingSession = computeDevelopingSession({
      developing: developingRow,
      completed: completedSessions ?? [],
      currentPrice: mgi.currentPrice,
      chartNow: bars.length > 0 ? bars[bars.length - 1].dateTime : null,
      expectedVolumeFraction: relativeVolume?.sessionSoFar?.expectedFraction ?? null,
    })
  }

  const summaryOf = (meta: {
    pocPrice: number
    valueAreaHigh: number
    valueAreaLow: number
  }): ProfileSummary => ({
    pocPrice: meta.pocPrice,
    valueAreaHigh: meta.valueAreaHigh,
    valueAreaLow: meta.valueAreaLow,
  })
  const profileSummary = {
    rotation: summaryOf(rotationVbp.meta),
    balanceArea: summaryOf(balanceAreaVbp.meta),
  }

  const rip = input.mgi.daily?.rip
  let ripStatus: RipStatus | null = null
  if (typeof rip === 'number' && Number.isFinite(rip)) {
    // Red flip is count-based: the mean is display context only; the flip needs
    // RED_BUILDING_MIN_BARS red-extreme prints clustered in the recent window.
    ripStatus = computeRipStatus({
      currentPrice: mgi.currentPrice,
      rip,
      deltaIntensity: deltaTelemetry.recentMeanDelta,
      redExtremeCount: deltaTelemetry.recentRedExtremeCount,
    })
  } else {
    warnings.push('mgi.daily.rip missing — Rip/Vanguard condition not computed')
  }

  const intradayTrend = computeIntradayTrend({
    bars,
    sessionIntraday,
    ripCondition: ripStatus?.condition ?? null,
    currentPrice: mgi.currentPrice,
  })

  // Magnet set: built ONCE from the BALANCE-AREA profile (feat-037 — the Gem's
  // Magnet Check reads the HTF chart's balance-area VbP) and shared by the
  // magnetCheck fact and terrain border classification, so there is exactly one
  // magnet definition. The terrain zone stack itself stays anchored to the
  // rotation profile's geometry (it must partition one profile's range).
  const magnets = collectMagnets({
    summary: profileSummary.balanceArea,
    hvn: lvnRaw.balanceArea.hvn,
  })
  // The top-level magnet list carries the build annotation (feat-050), computed
  // against the balance-area profile the magnets are anchored to; the verdicts'
  // embedded magnet refs stay lean (cross-reference by price).
  const magnetCheck = {
    ...evaluateMagnetCheck({
      magnets,
      levels: mgi.tier1,
    }),
    magnets: withBuild(magnets, balanceAreaVbp.rows),
  }

  // Campaign extent (gem-comparison F3): the outermost span of BOTH volume profiles is the
  // "visible HTF structure" the campaign envelope must cover; assembleTerrain then anchors the
  // ceiling/floor to the innermost Tier-1 level at-or-beyond each edge.
  const extentOf = (rows: readonly { price: number }[]) => {
    let top = -Infinity
    let bottom = Infinity
    for (const r of rows) {
      if (r.price > top) top = r.price
      if (r.price < bottom) bottom = r.price
    }
    return top >= bottom ? { top, bottom } : null
  }
  const rotationExtent = extentOf(rotationVbp.rows)
  const balanceExtent = extentOf(balanceAreaVbp.rows)
  const campaignExtent =
    rotationExtent && balanceExtent
      ? {
          top: Math.max(rotationExtent.top, balanceExtent.top),
          bottom: Math.min(rotationExtent.bottom, balanceExtent.bottom),
        }
      : (rotationExtent ?? balanceExtent ?? undefined)

  const terrain = assembleTerrain({
    profile: rotationVbp.rows,
    lvn: lvnRaw.rotation,
    // The balance-area profile is the SENIOR classification read (operator doctrine
    // 2026-07-22): a balance-area promotion (AAA) outranks a rotation promotion (A), and it
    // covers anchors beyond the rotation range (e.g. the structural floor when price sits at
    // the session low).
    balanceAreaProfile: balanceAreaVbp.rows,
    balanceAreaLvn: lvnRaw.balanceArea,
    magnets,
    mgi,
    campaignExtent,
  })
  if (!terrain.contiguityValid) {
    warnings.push(`terrain contiguity invalid: ${terrain.issues.join('; ')}`)
  }

  // Volatility scale (feat-095): the session sigma, plus the distance to the
  // structure that actually bounds the next move — read in points AND sigma.
  let volatilityScale: VolatilityScaleFacts | null = null
  if (htfBars) {
    volatilityScale = computeVolatilityScale({
      bars: htfBars,
      currentPrice: mgi.currentPrice,
      structure: sigmaStructureRefs(mgi, terrain, mgi.currentPrice),
    })
    if (volatilityScale === null) {
      warnings.push(
        'HTF export holds under 3 complete RTH sessions — session sigma not computed',
      )
    }
  }
  // Formation test on the rotation profile only (feat-075): the session-lens
  // doctrine says the trade-horizon profile governs where retests stall; the
  // balance-area composite is the lens that launders fakeout tails under
  // multi-day acceptance.
  const fakeoutTails = detectFakeoutTails(mgi.levels, rotationVbp.rows, lvnRaw.rotation)
  if (staleness.isStale) {
    warnings.push(staleness.warning ?? 'bundle is stale')
  }

  return {
    currentPrice: mgi.currentPrice,
    staleness,
    deltaTelemetry,
    mgi,
    ripStatus,
    lvn,
    fakeoutTails,
    absorption,
    magnetCheck,
    terrain,
    profileSummary,
    tpo,
    valueMigration,
    dailyRanges,
    developingSession,
    htfStructure,
    volatilityScale,
    overnightSession,
    multiDayTpo,
    relativeVolume,
    sessionIntraday,
    intradayTrend,
    warnings,
  }
}
