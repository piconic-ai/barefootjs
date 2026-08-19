/**
 * Worker shim that forwards every request under /integrations/fastapi/* to
 * the FastAPI app running inside a Cloudflare Container.
 */

import { Container } from '@cloudflare/containers'

type Env = {
  FASTAPI_CONTAINER: DurableObjectNamespace
}

export class FastapiContainer extends Container<Env> {
  defaultPort = 8080
  // Billing runs for every second the instance is up, idle included, so this
  // window is the cost knob. Short enough that one crawler hit does not keep
  // the instance warm for the rest of the hour, long enough that a visitor
  // reading a page still lands on a warm container for the next click.
  sleepAfter = '2m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.FASTAPI_CONTAINER.idFromName('singleton')
    const stub = env.FASTAPI_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
