/**
 * Worker shim that forwards every request under /integrations/laravel/* to
 * the Laravel app running inside a Cloudflare Container.
 */

import { Container } from '@cloudflare/containers'

type Env = {
  LARAVEL_CONTAINER: DurableObjectNamespace
}

export class LaravelContainer extends Container<Env> {
  defaultPort = 8080
  sleepAfter = '10m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.LARAVEL_CONTAINER.idFromName('singleton')
    const stub = env.LARAVEL_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
