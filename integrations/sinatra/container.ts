/**
 * Worker shim that forwards every request under /integrations/sinatra/* to
 * the Sinatra (Rack) app running inside a Cloudflare Container.
 */

import { Container } from '@cloudflare/containers'

type Env = {
  SINATRA_CONTAINER: DurableObjectNamespace
}

export class SinatraContainer extends Container<Env> {
  defaultPort = 8080
  sleepAfter = '10m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.SINATRA_CONTAINER.idFromName('singleton')
    const stub = env.SINATRA_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
