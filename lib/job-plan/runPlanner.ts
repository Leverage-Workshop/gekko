import { z } from 'zod'
import type { JobPlan } from '@/knowledge/schema/job-plan.schema'
import type { MgiStaticLevels } from '@/lib/engine/mgiPriority'
import { parseExecBars } from '@/lib/engine/parseExecBars'
import { parseHtfBars } from '@/lib/engine/parseHtfBars'
import { buildPlan, type PlanMetaInput } from './buildPlan'
import { classifyContext } from './classifyContext'
import { parseJobStudy } from './parseJobStudy'
import type { ProfileNodes } from './profile-vision/types'

/**
 * `runPlanner` (feat-127): the ONE pure entry point the job-plan task
 * (feat-128) and the shadow runner (feat-130) call — parse → classify → build.
 *
 * INPUT CONTRACT: the raw bundle file TEXT as downloaded (the task does no
 * parsing itself), the vision read (or null, R14), the run's `asOf` on the
 * exchange wall clock (`YYYY-MM-DDTHH:MM:SS`, America/Chicago — every origin
 * fact keys off it), and the meta placeholders the task already knows
 * (bundle id, fingerprint, per-source hashes, vision revision / model).
 *
 * FAILURE CONTRACT (the task's error taxonomy, plan "Key decisions" 3):
 *   - a file that does not PARSE throws — `JobStudyParseError` from the
 *     job-study pair (every issue attached), `PlannerInputError` for the MGI
 *     JSON / bar CSVs — the task maps these to a non-retryable abort;
 *   - geometry that parses but is INSUFFICIENT (R13 skew, trading-day
 *     mismatch, instrument mismatch, missing core geometry) RETURNS a plan
 *     with `status: 'insufficient'` and the reasons — the task persists it.
 *
 * Pure and deterministic: no clock reads, no randomness, no I/O.
 */

const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/

/** A sane MGI export is a few hundred bytes; a broken exporter cannot DoS the run. */
export const MGI_MAX_BYTES = 64 * 1024

export type PlannerInputErrorCode = 'mgi_too_large' | 'mgi_invalid' | 'exec_bars_invalid' | 'htf_bars_invalid' | 'input_invalid'

export class PlannerInputError extends Error {
  readonly code: PlannerInputErrorCode
  constructor(code: PlannerInputErrorCode, message: string) {
    super(`${code}: ${message}`)
    this.name = 'PlannerInputError'
    this.code = code
  }
}

export type RunPlannerFiles = {
  /** `job-study-daily.json` text. */
  readonly jobStudyDaily: string
  /** `job-study-weekly.json` text. */
  readonly jobStudyWeekly: string
  /** `mgi_static_levels.json` text. */
  readonly mgi: string
  /** `execution_bar_data.rolling.csv` text (750-volume bars, in-progress bar last). */
  readonly execBars: string
  /** `htf_bar_data.rolling.csv` text (30-min bars). */
  readonly htfBars: string
}

export type RunPlannerInput = {
  readonly files: RunPlannerFiles
  readonly profileNodes: ProfileNodes | null
  readonly asOf: string
  readonly meta?: PlannerMetaInput
}

export type PlannerMetaInput = PlanMetaInput

export type RunPlannerResult = {
  readonly plan: JobPlan
  /** `plan.warnings`, surfaced separately for run metadata. */
  readonly warnings: readonly string[]
}

const numbers = z.record(z.string(), z.number().finite()).optional()

const mgiFileSchema = z.looseObject({
  symbol: z.string().optional(),
  current: z.looseObject({ time: z.string().optional(), price: z.number().finite().optional() }).optional(),
  daily: numbers,
  atr: numbers,
  weekly: numbers,
  monthly: numbers,
  vRange: numbers,
})

const runPlannerInputSchema = z.object({
  files: z.object({
    jobStudyDaily: z.string().min(1),
    jobStudyWeekly: z.string().min(1),
    mgi: z.string().min(1),
    execBars: z.string().min(1),
    htfBars: z.string().min(1),
  }),
  profileNodes: z.looseObject({ profiles: z.looseObject({}) }).nullable(),
  asOf: z.string().regex(WALL_CLOCK, 'asOf must be an exchange wall clock YYYY-MM-DDTHH:MM:SS'),
  meta: z
    .object({
      bundleId: z.string().nullable().optional(),
      inputFingerprint: z.string().nullable().optional(),
      sourceHashes: z.record(z.string(), z.string().nullable()).optional(),
      visionPromptRevision: z.string().nullable().optional(),
      visionModelId: z.string().nullable().optional(),
    })
    .optional(),
})

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function parseMgiJson(text: string): MgiStaticLevels {
  if (Buffer.byteLength(text, 'utf8') > MGI_MAX_BYTES) {
    throw new PlannerInputError('mgi_too_large', `MGI export exceeds ${MGI_MAX_BYTES} bytes`)
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new PlannerInputError('mgi_invalid', `MGI export is not JSON: ${describe(error)}`)
  }
  const parsed = mgiFileSchema.safeParse(raw)
  if (!parsed.success) {
    throw new PlannerInputError('mgi_invalid', `MGI export shape: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`)
  }
  return parsed.data
}

function parseBars<T>(text: string, parse: (csv: string) => T, code: 'exec_bars_invalid' | 'htf_bars_invalid'): T {
  try {
    return parse(text)
  } catch (error) {
    throw new PlannerInputError(code, describe(error))
  }
}

export function runPlanner(input: RunPlannerInput): RunPlannerResult {
  const checked = runPlannerInputSchema.safeParse(input)
  if (!checked.success) {
    throw new PlannerInputError('input_invalid', checked.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; '))
  }
  const { files, profileNodes, asOf } = input

  const jobStudy = parseJobStudy({ daily: files.jobStudyDaily, weekly: files.jobStudyWeekly })
  const mgi = parseMgiJson(files.mgi)
  const execBars = parseBars(files.execBars, parseExecBars, 'exec_bars_invalid')
  const htfBars = parseBars(files.htfBars, parseHtfBars, 'htf_bars_invalid')

  const context = classifyContext({ jobStudy, mgi, execBars, htfBars, profileNodes, asOf })
  const plan = buildPlan({
    context,
    meta: {
      ...input.meta,
      visionPromptRevision: input.meta?.visionPromptRevision ?? profileNodes?.promptRevision ?? null,
      visionModelId: input.meta?.visionModelId ?? profileNodes?.modelId ?? null,
    },
  })
  return { plan, warnings: plan.warnings }
}
