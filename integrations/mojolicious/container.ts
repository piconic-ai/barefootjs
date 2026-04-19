/**
 * Worker shim that forwards every request under /integrations/mojolicious/* to
 * the Mojolicious app running inside a Cloudflare Container.
 */

import { Container } from '@cloudflare/containers'

type Env = {
  MOJO_CONTAINER: DurableObjectNamespace
}

export class MojoContainer extends Container<Env> {
  defaultPort = 8080
  sleepAfter = '10m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.MOJO_CONTAINER.idFromName('singleton')
    const stub = env.MOJO_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
