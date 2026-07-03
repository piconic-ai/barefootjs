/**
 * Worker shim that forwards every request under /integrations/axum/* to the
 * axum/Rust server running inside a Cloudflare Container.
 *
 * The container itself is defined by the Dockerfile next to this file; the
 * `AxumContainer` Durable Object class is what wrangler binds the container
 * lifecycle to.
 */

import { Container } from '@cloudflare/containers'

type Env = {
  AXUM_CONTAINER: DurableObjectNamespace
}

export class AxumContainer extends Container<Env> {
  defaultPort = 8080
  sleepAfter = '10m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.AXUM_CONTAINER.idFromName('singleton')
    const stub = env.AXUM_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
