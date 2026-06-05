/**
 * Worker shim that forwards every request under /integrations/nethttp/* to the
 * nethttp/Go server running inside a Cloudflare Container.
 *
 * The container itself is defined by the Dockerfile next to this file; the
 * `NethttpContainer` Durable Object class is what wrangler binds the container
 * lifecycle to.
 */

import { Container } from '@cloudflare/containers'

type Env = {
  NETHTTP_CONTAINER: DurableObjectNamespace
}

export class NethttpContainer extends Container<Env> {
  defaultPort = 8083
  sleepAfter = '10m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.NETHTTP_CONTAINER.idFromName('singleton')
    const stub = env.NETHTTP_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
