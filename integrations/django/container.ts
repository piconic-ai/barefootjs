/**
 * Worker shim that forwards every request under /integrations/django/* to
 * the Django app running inside a Cloudflare Container.
 */

import { Container } from '@cloudflare/containers'

type Env = {
  DJANGO_CONTAINER: DurableObjectNamespace
}

export class DjangoContainer extends Container<Env> {
  defaultPort = 8080
  sleepAfter = '10m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.DJANGO_CONTAINER.idFromName('singleton')
    const stub = env.DJANGO_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
