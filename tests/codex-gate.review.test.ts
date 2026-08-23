import { describe, expect, it } from 'vitest'
import {
  evaluateReview,
  parseBlockOn,
  parseCompanionPayload,
  parseReviewText,
} from '@/lib/codex-gate'

// Codex's native reviewer returns free text; these pin the shape we rely on.

const SAMPLE = `The hook can fail open for a normal Git force-push syntax.

Review comment:

- [P1] Detect force when short push flags are clustered — /repo/lib/x.ts:438-439
  When Git's clustered form is used, such as \`git push -fu origin branch\`, this regex does not recognize \`-f\`.
  Parse clustered short options.

- [P2] Stale comment — /repo/lib/y.ts:10
  The comment describes the old behaviour.
- [P3] Prefer const
`

describe('parseReviewText', () => {
  it('extracts the summary and each [Pn] finding with its location and body', () => {
    const review = parseReviewText(SAMPLE)
    expect(review.summary).toBe('The hook can fail open for a normal Git force-push syntax.')
    expect(review.findings).toEqual([
      {
        priority: 'P1',
        title: 'Detect force when short push flags are clustered',
        location: '/repo/lib/x.ts:438-439',
        body: "When Git's clustered form is used, such as `git push -fu origin branch`, this regex does not recognize `-f`. Parse clustered short options.",
      },
      {
        priority: 'P2',
        title: 'Stale comment',
        location: '/repo/lib/y.ts:10',
        body: 'The comment describes the old behaviour.',
      },
      { priority: 'P3', title: 'Prefer const', location: null, body: '' },
    ])
  })

  it('treats a review with no findings as clean', () => {
    const review = parseReviewText('No issues found. The change looks correct.\n')
    expect(review.summary).toBe('No issues found. The change looks correct.')
    expect(review.findings).toEqual([])
  })

  it('tolerates bullet and dash variations, and parses P0', () => {
    const review = parseReviewText('ok\n\n* [P1] A - src/a.ts:1\n[P2] B\n- [P0] C\n')
    expect(review.findings.map((f) => [f.priority, f.title, f.location])).toEqual([
      ['P1', 'A', 'src/a.ts:1'],
      ['P2', 'B', null],
      ['P0', 'C', null],
    ])
    expect(evaluateReview(review, ['P0', 'P1']).blocking.map((f) => f.priority)).toEqual([
      'P1',
      'P0',
    ])
  })
})

describe('parseBlockOn / evaluateReview', () => {
  it('defaults to P0+P1 and validates the list', () => {
    expect(parseBlockOn(undefined)).toEqual(['P0', 'P1'])
    expect(parseBlockOn('p1, P2,p1')).toEqual(['P1', 'P2'])
    expect(() => parseBlockOn('P1,high')).toThrow(/HIGH/)
  })

  it('blocks only on the configured priorities', () => {
    const review = parseReviewText(SAMPLE)
    expect(evaluateReview(review, ['P1'])).toMatchObject({ passed: false })
    expect(evaluateReview(review, ['P1']).blocking.map((f) => f.title)).toEqual([
      'Detect force when short push flags are clustered',
    ])
    expect(evaluateReview(parseReviewText('fine'), ['P1']).passed).toBe(true)
    const p2Only = parseReviewText('x\n\n- [P2] meh\n')
    expect(evaluateReview(p2Only, ['P1']).passed).toBe(true)
    expect(evaluateReview(p2Only, ['P1', 'P2']).passed).toBe(false)
  })
})

describe('parseCompanionPayload', () => {
  it('extracts the review text and thread id', () => {
    const parsed = parseCompanionPayload(
      JSON.stringify({ threadId: 't-1', codex: { status: 0, stdout: 'clean', stderr: '' } })
    )
    expect(parsed).toEqual({ ok: true, reviewText: 'clean', threadId: 't-1' })
  })

  it.each([
    ['non-JSON', 'boom', /did not return JSON/],
    ['a missing codex block', JSON.stringify({ threadId: 't' }), /payload shape/],
    [
      'a non-zero status',
      JSON.stringify({ codex: { status: 1, stdout: 'partial', stderr: 'auth expired' } }),
      /status 1\): auth expired/,
    ],
    [
      'a missing status',
      JSON.stringify({ codex: { stdout: 'review unavailable' } }),
      /status undefined/,
    ],
    ['a null status', JSON.stringify({ codex: { status: null, stdout: 'x' } }), /status null/],
    ['empty review text', JSON.stringify({ codex: { status: 0, stdout: '  ' } }), /no text/],
  ])('fails closed on %s', (_label, stdout, pattern) => {
    const parsed = parseCompanionPayload(stdout)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.reason).toMatch(pattern)
  })
})
