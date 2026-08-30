/**
 * Worker shim that forwards every request under /integrations/django/* to
 * the Django app running inside a Cloudflare Container.
 */

import { Container } from '@cloudflare/containers'
import { withCacheControl } from 'barefootjs-integrations-shared/lib/cache-control'

type Env = {
  DJANGO_CONTAINER: DurableObjectNamespace
}

export class DjangoContainer extends Container<Env> {
  defaultPort = 8080
  // Billing runs for every second the instance is up, idle included, so this
  // window is the cost knob. Held at 2m where the other examples use 1m:
  // startup reads settings and builds the app registry, so a cold start is felt.
  // A visitor reading one page should still get a warm container next click.
  sleepAfter = '2m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.DJANGO_CONTAINER.idFromName('singleton')
    const stub = env.DJANGO_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return withCacheControl(request, await stub.fetch(request))
  },
} satisfies ExportedHandler<Env>
