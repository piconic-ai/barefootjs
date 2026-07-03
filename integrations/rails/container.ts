/**
 * Worker shim that forwards every request under /integrations/rails/* to the
 * Rails (Rack) app running inside a Cloudflare Container.
 */

import { Container } from '@cloudflare/containers'

type Env = {
  RAILS_CONTAINER: DurableObjectNamespace
}

export class RailsContainer extends Container<Env> {
  defaultPort = 8080
  sleepAfter = '10m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.RAILS_CONTAINER.idFromName('singleton')
    const stub = env.RAILS_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
