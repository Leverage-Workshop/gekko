import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'vitest'
import {
  JobStudyParseError,
  parseJobStudy,
  type JobStudy,
  type JobStudyErrorCode,
  type JobStudyWarningCode,
} from '@/lib/job-plan/parseJobStudy'

/** Shared fixtures + assertions for the feat-125 parser tests. */

export const FIXTURES = join(process.cwd(), 'tests/fixtures/job-study')
export const REAL_DAILY = join(process.cwd(), 'chart-data/job-study-daily.json')
export const REAL_WEEKLY = join(process.cwd(), 'chart-data/job-study-weekly.json')

export const fixture = (name: string) => readFileSync(join(FIXTURES, name), 'utf8')
export const DAILY = fixture('daily.json')
export const WEEKLY = fixture('weekly.json')

// Mutations poke arbitrary paths of the export document; a typed shape would fight that.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = Record<string, any>

/** Parse a fixture, apply a mutation to the plain object, and re-serialize. */
export function mutate(text: string, fn: (doc: Json) => void): string {
  const doc = JSON.parse(text) as Json
  fn(doc)
  return JSON.stringify(doc)
}

export function parseWith(daily: string = DAILY, weekly: string = WEEKLY): JobStudy {
  return parseJobStudy({ daily, weekly })
}

export function expectError(
  run: () => unknown,
  code: JobStudyErrorCode,
  messageFragment?: string
): JobStudyParseError {
  let caught: unknown
  try {
    run()
  } catch (e) {
    caught = e
  }
  expect(caught).toBeInstanceOf(JobStudyParseError)
  const err = caught as JobStudyParseError
  const codes = err.issues.map((i) => i.code)
  expect(codes, err.message).toContain(code)
  if (messageFragment) expect(err.message).toContain(messageFragment)
  return err
}

export const warningCodes = (study: JobStudy): JobStudyWarningCode[] =>
  study.warnings.map((w) => w.code)
