/**
 * VAPID helper shared by the browser opt-in flow (feat-027). Pure — safe to
 * import from client components and unit tests alike.
 */

/**
 * Decode a URL-safe base64 VAPID public key into the Uint8Array
 * `pushManager.subscribe` expects as `applicationServerKey`.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}
