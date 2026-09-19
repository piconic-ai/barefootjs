/**
 * Worker shim that forwards every request under /integrations/rails/* to the
 * Rails (Rack) app running inside a Cloudflare Container.
 */

import { Container } from '@cloudflare/containers'
import { withCacheControl } from 'barefootjs-integrations-shared/lib/cache-control'

type Env = {
  RAILS_CONTAINER: DurableObjectNamespace
}

export class RailsContainer extends Container<Env> {
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
    // stop -- the Durable Object kept treating its container as running and
    // healthy while nothing listened on 8080 (500 "The container is not
    // listening"), and its alarm loop no longer ran to resync it. A copy of
    // this worker with the same image does not reproduce it, so move rails
    // onto a fresh Durable Object + container instance.
    const id = env.RAILS_CONTAINER.idFromName('singleton-2')
    const stub = env.RAILS_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return withCacheControl(request, await stub.fetch(request))
  },
} satisfies ExportedHandler<Env>
