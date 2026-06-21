import { timingSafeEqual } from 'node:crypto'

/**
 * Timing-safe `Bearer <token>` check for the ingest route.
 *
 * Compares the presented credential against the configured token in constant
 * time so the endpoint does not leak the token length/prefix via response
 * timing. Returns false for any missing/malformed header.
 */
export function isAuthorized(
  authorizationHeader: string | null | undefined,
  expectedToken: string,
): boolean {
  if (!authorizationHeader) {
    return false
  }

  const match = /^Bearer (.+)$/.exec(authorizationHeader)
  if (!match) {
    return false
  }

  const presented = Buffer.from(match[1])
  const expected = Buffer.from(expectedToken)

  // timingSafeEqual throws on length mismatch; guard so a wrong-length token is
  // a plain false rather than an exception, while keeping equal-length compares
  // constant-time.
  if (presented.length !== expected.length) {
    return false
  }

  return timingSafeEqual(presented, expected)
}
