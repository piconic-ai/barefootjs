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
  // Billing runs for every second the instance is up, idle included, so this
  // window is the cost knob. This stack starts fast enough that a cold start
  // is barely visible, so the tail is kept at the floor. The slower-booting
  // examples (rails, laravel, django) hold 2m instead.
  sleepAfter = '1m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.XSLATE_CONTAINER.idFromName('singleton')
    const stub = env.XSLATE_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
