/**
 * Integrations index routes.
 *
 * GET /integrations renders a catalog of the adapter demos. Each card links to
 * the adapter's home page (served by the adapter itself under
 * /integrations/<slug>/), so visitors can compare how the same JSX runs on
 * different backends.
 */

import { Hono } from 'hono'
import { landingRenderer } from '../landing/renderer'

type Adapter = {
  slug: string
  name: string
  runtime: string
}

const ADAPTERS: Adapter[] = [
  { slug: 'hono',        name: 'Hono',        runtime: 'TypeScript · Cloudflare Workers' },
  { slug: 'echo',        name: 'Echo',        runtime: 'Go · Labstack Echo' },
  { slug: 'mojolicious', name: 'Mojolicious', runtime: 'Perl · Mojolicious::Lite' },
]

function IntegrationsIndex() {
  return (
    <section className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold mb-8">Integrations</h1>

      <ul className="list-none p-0 m-0">
        {ADAPTERS.map((a) => (
          <li className="py-3 border-b border-border last:border-b-0">
            <a href={`/integrations/${a.slug}`} className="font-semibold">{a.name}</a>
            {' '}
            <span className="text-sm text-muted-foreground">{a.runtime}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function createIntegrationsApp() {
  const app = new Hono()
  app.use(landingRenderer)

  app.get('/', (c) =>
    c.render(<IntegrationsIndex />, {
      title: 'Integrations — Barefoot.js',
      description:
        'Same JSX components running on Hono (Workers), Echo (Go), and Mojolicious (Perl).',
    }),
  )

  return app
}
