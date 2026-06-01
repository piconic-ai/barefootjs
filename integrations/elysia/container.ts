/**
 * Worker shim that forwards every request under /integrations/elysia/* to the
 * Elysia (Bun) server running inside a Cloudflare Container.
 *
 * Elysia compiles its route handlers with `new Function`, which the Workers
 * runtime forbids (`EvalError: Code generation from strings disallowed`), so —
 * unlike the hono and h3 integrations — it can't run natively on Workers. It
 * runs as a Bun process inside a Cloudflare Container instead (same pattern as
 * the Go/Echo and Perl/Mojolicious integrations); this Worker just routes to
 * it. The container is defined by the Dockerfile next to this file.
 */

import { Container } from '@cloudflare/containers'

type Env = {
  ELYSIA_CONTAINER: DurableObjectNamespace
}

export class ElysiaContainer extends Container<Env> {
  defaultPort = 3005
  sleepAfter = '10m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.ELYSIA_CONTAINER.idFromName('singleton')
    const stub = env.ELYSIA_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return stub.fetch(request)
  },
} satisfies ExportedHandler<Env>
