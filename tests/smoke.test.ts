import { describe, expect, it } from 'vitest'

// Baseline smoke test so the verification pipeline (`vitest run`) has at least one
// passing test from feat-001. Real engine/parser tests arrive in feat-002 onward.
describe('verification baseline', () => {
  it('runs the test pipeline', () => {
    expect(1 + 1).toBe(2)
  })
})
