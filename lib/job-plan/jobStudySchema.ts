import { z } from 'zod'
import { isCalendarDate } from './exchangeTime'

/**
 * Shape schemas for feat-118's two Job-study export files (feat-125). These check
 * SHAPE and SIZE only; the domain invariants (tick alignment, zone order, ladders,
 * sessions, cross-file agreement) live in jobStudyMeta.ts / jobStudyRows.ts.
 *
 * Objects are strict: an unknown key is a schema error, so an additive exporter
 * change must bump `schemaVersion` rather than slip past the parser. The free-form
 * `studySettings.*`, `diagnostics` and `extras` maps are the deliberate exceptions
 * (their keys are Sierra input names) and carry key-count caps instead.
 */

/** Per-file byte cap (the real exports are ~4 KB / ~1.5 KB). */
export const JOB_STUDY_MAX_FILE_BYTES = 512 * 1024
/** Daily sessions / weekly rows per file (observed 5 / 1). */
export const JOB_STUDY_MAX_PIVOT_ROWS = 64
/** Ladder rungs per row (observed 12 daily / 6 weekly). */
export const JOB_STUDY_MAX_TARGETS = 32
/** Chart-drawn JBA rectangles (observed 2). */
export const JOB_STUDY_MAX_BALANCE_AREAS = 64
/** Keys in any of the free-form maps (observed ≤ 22). */
export const JOB_STUDY_MAX_MAP_KEYS = 128

const MAX_SHORT = 64
const MAX_TEXT = 512

const WALL_CLOCK_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/

const price = z.number()
const shortString = z.string().max(MAX_SHORT)
const isoDate = z.string().refine(isCalendarDate, { message: 'must be a real YYYY-MM-DD date' })
const wallClock = z.string().regex(WALL_CLOCK_RE, 'must be YYYY-MM-DDTHH:MM:SS (exchange-local)')

const cappedKeys = <T extends Record<string, unknown>>(map: T): boolean =>
  Object.keys(map).length <= JOB_STUDY_MAX_MAP_KEYS
const CAP_MESSAGE = { message: `more than ${JOB_STUDY_MAX_MAP_KEYS} keys` }

const extras = z.record(shortString, z.number()).refine(cappedKeys, CAP_MESSAGE)
const settings = z
  .record(shortString, z.union([z.string().max(MAX_TEXT), z.number()]))
  .refine(cappedKeys, CAP_MESSAGE)
const diagnostics = z
  .record(shortString, z.union([z.string().max(MAX_TEXT), z.number(), z.boolean()]))
  .refine(cappedKeys, CAP_MESSAGE)

export const targetSchema = z.strictObject({
  label: z.string().min(1).max(8),
  price,
})
export type RawTarget = z.infer<typeof targetSchema>

const pivotRowFields = {
  pivot: price,
  valueLow: price,
  valueHigh: price,
  targets: z.array(targetSchema).max(JOB_STUDY_MAX_TARGETS),
  extras,
  complete: z.boolean(),
}

export const dailyPivotRowSchema = z.strictObject({ sessionDate: isoDate, ...pivotRowFields })
export type RawDailyPivot = z.infer<typeof dailyPivotRowSchema>

export const weeklyPivotRowSchema = z.strictObject({ weekOf: isoDate, ...pivotRowFields })
export type RawWeeklyPivot = z.infer<typeof weeklyPivotRowSchema>

const metaFields = {
  contract: shortString.min(1),
  schemaVersion: z.number().int(),
  symbol: shortString.min(1),
  exchangeTz: shortString.min(1),
  exportedAt: wallClock,
  lastBarTime: wallClock,
  tradingDay: isoDate,
  weekOf: isoDate,
  tickSize: z.number().positive(),
  currentPrice: price,
  diagnostics: diagnostics.default({}),
}

export const dailyMetaSchema = z.strictObject({
  ...metaFields,
  studySettings: z.strictObject({
    sessionTemplate: z.string().min(1).max(MAX_TEXT),
    daily: settings,
  }),
})
export type RawDailyMeta = z.infer<typeof dailyMetaSchema>

export const weeklyMetaSchema = z.strictObject({
  ...metaFields,
  studySettings: z.strictObject({
    sessionTemplate: z.string().min(1).max(MAX_TEXT),
    weekly: settings,
  }),
})
export type RawWeeklyMeta = z.infer<typeof weeklyMetaSchema>

export const balanceAreaSchema = z.strictObject({
  low: price,
  high: price,
  drawingId: z.number().int(),
  source: shortString,
  anchorTimes: z.strictObject({ begin: wallClock, end: wallClock }),
  color: shortString,
  text: z.string().max(MAX_TEXT),
})
export type RawBalanceArea = z.infer<typeof balanceAreaSchema>

export const autoplotSchema = z
  .strictObject({
    high: price,
    low: price,
    source: shortString,
    drawingId: z.number().int().nullable().default(null),
    color: shortString.nullable().default(null),
  })
  .nullable()
export type RawAutoplot = z.infer<typeof autoplotSchema>

export const dailyFileSchema = z.strictObject({
  meta: dailyMetaSchema,
  dailyPivots: z.array(dailyPivotRowSchema).max(JOB_STUDY_MAX_PIVOT_ROWS),
  balanceAreas: z.array(balanceAreaSchema).max(JOB_STUDY_MAX_BALANCE_AREAS),
})
export type RawDailyFile = z.infer<typeof dailyFileSchema>

export const weeklyFileSchema = z.strictObject({
  meta: weeklyMetaSchema,
  weeklyPivots: z.array(weeklyPivotRowSchema).max(JOB_STUDY_MAX_PIVOT_ROWS),
  autoplot: autoplotSchema,
})
export type RawWeeklyFile = z.infer<typeof weeklyFileSchema>

/** Loose envelope read before the full schema, so a version mismatch is reported as such. */
export const envelopeSchema = z.object({
  meta: z.object({ schemaVersion: z.number() }),
})
