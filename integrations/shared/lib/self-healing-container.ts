import { Container } from '@cloudflare/containers'
import { isStuckContainerResponse } from './stuck-container-response'

/**
 * A stopped Container instance sometimes goes on holding the running-instance
 * slot. The Durable Object still sees `container.running === true` with a
 * `healthy` state, so `containerFetch` skips the start and proxies into a port
 * nothing listens on -- every request 500s with "The container is not
 * listening in the TCP address ...", and the alarm loop that would resync the
 * state no longer runs. Observed in production on more than one integration,
 * with and without tini, starting at the first idle stop after a deploy and
 * lasting hours; a copy of the same image and instance type never reproduced
 * it, so it is not the image or the Worker that is wrong.
 *
 * This subclass recognizes that response and gives the stuck instance a
 * SIGKILL (`destroy()`) before replaying the request once, which drops the DO
 * back to a state where the next `containerFetch` starts a fresh instance.
 * That is a workaround for a platform-side inconsistency, not a fix: when
 * Cloudflare stops leaking the slot, this class and its uses go away.
 */
export class SelfHealingContainer<Env = unknown> extends Container<Env> {
  async fetch(request: Request): Promise<Response> {
    // Taken before the first attempt consumes the body: a replay needs its own
    // copy. `clone()` is declared as returning the Request generics unresolved
    // (`Request<CfHostMetadata, Cf>`), which does not line up with this
    // parameter's type even though it is the very same request.
    const replay = request.clone() as typeof request
    const response = await super.fetch(request)

    // Reading the body is only safe on the clone, and only worth it for a 500.
    if (response.status !== 500) return response
    if (!isStuckContainerResponse(response.status, await response.clone().text())) return response

    try {
      await this.destroy()
    } catch {
      // The instance the platform is holding may refuse to die; the replay
      // below is still worth a try, and its own failure is what the caller sees.
    }

    return super.fetch(replay)
  }
}
