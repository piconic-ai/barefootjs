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
  // Billing runs for every second the instance is up, idle included, so this
  // window is the cost knob. Short enough that one crawler hit does not keep
  // the instance warm for the rest of the hour, long enough that a visitor
  // reading a page still lands on a warm container for the next click.
  sleepAfter = '2m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.NETHTTP_CONTAINER.idFromName('singleton')
    const stub = env.NETHTTP_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
