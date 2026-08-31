/**
 * Worker shim that forwards every request under /integrations/chi/* to the
 * chi/Go server running inside a Cloudflare Container.
 *
 * The container itself is defined by the Dockerfile next to this file; the
 * `ChiContainer` Durable Object class is what wrangler binds the container
 * lifecycle to.
 */

import { Container } from '@cloudflare/containers'
import { withCacheControl } from 'barefootjs-integrations-shared/lib/cache-control'

type Env = {
  CHI_CONTAINER: DurableObjectNamespace
}

export class ChiContainer extends Container<Env> {
  defaultPort = 8082
  // Billing runs for every second the instance is up, idle included, so this
  // window is the cost knob. This stack starts fast enough that a cold start
  // is barely visible, so the tail is kept at the floor. The slower-booting
  // examples (rails, laravel, django) hold 2m instead.
  sleepAfter = '1m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.CHI_CONTAINER.idFromName('singleton')
    const stub = env.CHI_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return withCacheControl(request, await stub.fetch(request))
  },
} satisfies ExportedHandler<Env>
