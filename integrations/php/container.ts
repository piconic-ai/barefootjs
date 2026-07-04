/**
 * Worker shim that forwards every request under /integrations/php/* to the
 * PHP app running inside a Cloudflare Container.
 */

import { Container } from '@cloudflare/containers'

type Env = {
  PHP_CONTAINER: DurableObjectNamespace
}

export class PhpContainer extends Container<Env> {
  defaultPort = 8080
  sleepAfter = '10m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.PHP_CONTAINER.idFromName('singleton')
    const stub = env.PHP_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
