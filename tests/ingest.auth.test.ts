import { describe, it, expect } from 'vitest'
import { isAuthorized } from '@/lib/ingest'

const TOKEN = 'super-secret-ingest-token'

describe('isAuthorized', () => {
  it('accepts a matching Bearer token', () => {
    expect(isAuthorized(`Bearer ${TOKEN}`, TOKEN)).toBe(true)
  })

  it('rejects a wrong token of equal length', () => {
    const wrong = 'x'.repeat(TOKEN.length)
    expect(isAuthorized(`Bearer ${wrong}`, TOKEN)).toBe(false)
  })

  it('rejects a wrong token of different length', () => {
    expect(isAuthorized('Bearer nope', TOKEN)).toBe(false)
  })

  it('rejects a missing header', () => {
    expect(isAuthorized(null, TOKEN)).toBe(false)
    expect(isAuthorized(undefined, TOKEN)).toBe(false)
  })

  it('rejects a non-Bearer scheme', () => {
    expect(isAuthorized(`Basic ${TOKEN}`, TOKEN)).toBe(false)
    expect(isAuthorized(TOKEN, TOKEN)).toBe(false)
  })

  it('rejects an empty Bearer credential', () => {
    expect(isAuthorized('Bearer ', TOKEN)).toBe(false)
  })
})
