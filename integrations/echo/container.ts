/**
 * Worker shim that forwards every request under /integrations/echo/* to the
 * Echo/Go server running inside a Cloudflare Container.
 *
 * The container itself is defined by the Dockerfile next to this file; the
 * `EchoContainer` Durable Object class is what wrangler binds the container
 * lifecycle to.
 */

import { Container } from '@cloudflare/containers'

type Env = {
  ECHO_CONTAINER: DurableObjectNamespace
}

export class EchoContainer extends Container<Env> {
  defaultPort = 8080
  sleepAfter = '10m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.ECHO_CONTAINER.idFromName('singleton')
    const stub = env.ECHO_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
