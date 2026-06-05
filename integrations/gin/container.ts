/**
 * Worker shim that forwards every request under /integrations/gin/* to the
 * gin/Go server running inside a Cloudflare Container.
 *
 * The container itself is defined by the Dockerfile next to this file; the
 * `GinContainer` Durable Object class is what wrangler binds the container
 * lifecycle to.
 */

import { Container } from '@cloudflare/containers'

type Env = {
  GIN_CONTAINER: DurableObjectNamespace
}

export class GinContainer extends Container<Env> {
  defaultPort = 8081
  sleepAfter = '10m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.GIN_CONTAINER.idFromName('singleton')
    const stub = env.GIN_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
