/**
 * Worker shim that forwards every request under /integrations/chi/* to the
 * chi/Go server running inside a Cloudflare Container.
 *
 * The container itself is defined by the Dockerfile next to this file; the
 * `ChiContainer` Durable Object class is what wrangler binds the container
 * lifecycle to.
 */

import { Container } from '@cloudflare/containers'

type Env = {
  CHI_CONTAINER: DurableObjectNamespace
}

export class ChiContainer extends Container<Env> {
  defaultPort = 8082
  sleepAfter = '10m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.CHI_CONTAINER.idFromName('singleton')
    const stub = env.CHI_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
