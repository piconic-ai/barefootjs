/**
 * Recognizes the 500 a Durable Object returns while its Container instance is
 * stuck -- see self-healing-container.ts for what that state is and what is
 * done about it. Kept apart from the Container subclass so it can be tested
 * outside the Workers runtime.
 */

const NOT_LISTENING = 'The container is not listening'

/**
 * Whether a proxied response carries the stuck-instance signature, rather than
 * being a 500 the app itself produced.
 */
export function isStuckContainerResponse(status: number, body: string): boolean {
  return status === 500 && body.includes(NOT_LISTENING)
}
