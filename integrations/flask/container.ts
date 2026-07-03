/**
 * Worker shim that forwards every request under /integrations/flask/* to
 * the Flask app running inside a Cloudflare Container.
 */

import { Container } from '@cloudflare/containers'

type Env = {
  FLASK_CONTAINER: DurableObjectNamespace
}

export class FlaskContainer extends Container<Env> {
  defaultPort = 8080
  sleepAfter = '10m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.FLASK_CONTAINER.idFromName('singleton')
    const stub = env.FLASK_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
