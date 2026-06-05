/**
 * Worker shim that forwards every request under /integrations/xslate/* to
 * the Text::Xslate (Plack) app running inside a Cloudflare Container.
 */

import { Container } from '@cloudflare/containers'

type Env = {
  XSLATE_CONTAINER: DurableObjectNamespace
}

export class XslateContainer extends Container<Env> {
  defaultPort = 8080
  sleepAfter = '10m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.XSLATE_CONTAINER.idFromName('singleton')
    const stub = env.XSLATE_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
