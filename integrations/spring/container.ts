/**
 * Worker shim that forwards every request under /integrations/spring/* to the
 * Spring Boot server running inside a Cloudflare Container.
 *
 * The container itself is defined by the Dockerfile next to this file; the
 * `SpringContainer` Durable Object class is what wrangler binds the container
 * lifecycle to.
 */

import { Container } from '@cloudflare/containers'
import { withCacheControl } from 'barefootjs-integrations-shared/lib/cache-control'

type Env = {
  SPRING_CONTAINER: DurableObjectNamespace
}

export class SpringContainer extends Container<Env> {
  defaultPort = 8080
  // Billing runs for every second the instance is up, idle included, so this
  // window is the cost knob. A JVM's cold start (class loading, Spring
  // context bootstrap) is noticeably heavier than a compiled Rust/Go binary's
  // near-instant startup -- this stack is closer in that respect to the
  // slower-booting rails/laravel/django examples (2m) than to axum/gin's own
  // floor (1m), so it holds the same longer window those examples use rather
  // than assuming a JVM warms up as fast as a native binary.
  sleepAfter = '2m'
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.SPRING_CONTAINER.idFromName('singleton')
    const stub = env.SPRING_CONTAINER.get(id) as unknown as { fetch: typeof fetch }
    return withCacheControl(request, await stub.fetch(request))
  },
} satisfies ExportedHandler<Env>
