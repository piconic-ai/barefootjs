/**
 * Worker shim that forwards every request under /integrations/rails/* to the
 * Rails (Rack) app running inside a Cloudflare Container.
 */

import { SelfHealingContainer } from 'barefootjs-integrations-shared/lib/self-healing-container'
import { withCacheControl } from 'barefootjs-integrations-shared/lib/cache-control'

type Env = {
  RAILS_CONTAINER: DurableObjectNamespace
}

export class RailsContainer extends SelfHealingContainer<Env> {
  defaultPort = 8080
  // Billing runs for every second the instance is up, idle included, so this
  // window is the cost knob. Held at 2m where the other examples use 1m:
  // Puma has to boot railties and every initializer, so a cold start is felt.
  // A visitor reading one page should still get a warm container next click.
  sleepAfter = '2m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Not 'singleton': the instance under that name got stuck after an idle
    // stop -- it went on holding the running-instance slot although it had
    // stopped, so this Durable Object skipped the start and proxied into a
    // dead port (500 "The container is not listening"), and the first
    // requests under the new name were refused for six minutes with
    // "Maximum number of running container instances exceeded" until the
    // platform let the old one go. Not reproducible on a copy of this worker
    // with the same image and instance type, so it is the instance that is
    // stuck, not anything this repo controls.
    const id = env.RAILS_CONTAINER.idFromName('singleton-2')
    const stub = env.RAILS_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return withCacheControl(request, await stub.fetch(request))
  },
} satisfies ExportedHandler<Env>
