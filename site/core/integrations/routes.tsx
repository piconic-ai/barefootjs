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
  language: string
}

// 2nd field is the implementation language only (the framework is the bold
// name on the left, so platform/runtime detail would just be noise here).
const ADAPTERS: Adapter[] = [
  { slug: 'hono',        name: 'Hono',        language: 'TypeScript' },
  { slug: 'h3',          name: 'h3',          language: 'TypeScript' },
  { slug: 'elysia',      name: 'Elysia',      language: 'TypeScript' },
  { slug: 'echo',        name: 'Echo',        language: 'Go' },
  { slug: 'gin',         name: 'Gin',         language: 'Go' },
  { slug: 'chi',         name: 'Chi',         language: 'Go' },
  { slug: 'nethttp',     name: 'net/http',    language: 'Go' },
  { slug: 'flask',       name: 'Flask',       language: 'Python' },
  { slug: 'fastapi',     name: 'FastAPI',     language: 'Python' },
  { slug: 'sinatra',     name: 'Sinatra',     language: 'Ruby' },
  { slug: 'rails',       name: 'Rails',       language: 'Ruby' },
  { slug: 'mojolicious', name: 'Mojolicious', language: 'Perl' },
  { slug: 'xslate',      name: 'Text::Xslate', language: 'Perl' },
  { slug: 'php',         name: 'Twig',        language: 'PHP' },
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
            <span className="text-sm text-muted-foreground">{a.language}</span>
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
        'Same JSX components running on Hono, h3 and Elysia (TypeScript), Echo, Gin, Chi and net/http (Go), Flask and FastAPI (Python), Sinatra and Rails (Ruby), Mojolicious and Text::Xslate (Perl), and Twig (PHP).',
    }),
  )

  return app
}
