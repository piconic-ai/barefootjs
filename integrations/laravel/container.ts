/**
 * Worker shim that forwards every request under /integrations/laravel/* to
 * the Laravel app running inside a Cloudflare Container.
 */

import { Container } from '@cloudflare/containers'
import { withCacheControl } from 'barefootjs-integrations-shared/lib/cache-control'

type Env = {
  LARAVEL_CONTAINER: DurableObjectNamespace
}

export class LaravelContainer extends Container<Env> {
  defaultPort = 8080
  // Billing runs for every second the instance is up, idle included, so this
  // window is the cost knob. Held at 2m where the other examples use 1m:
  // `artisan serve` boots the framework kernel first, so a cold start is felt.
  // A visitor reading one page should still get a warm container next click.
  sleepAfter = '2m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.LARAVEL_CONTAINER.idFromName('singleton')
    const stub = env.LARAVEL_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return withCacheControl(request, await stub.fetch(request))
  },
} satisfies ExportedHandler<Env>
