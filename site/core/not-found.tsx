/**
 * The 404 page: the docs layout with a short way back into the docs.
 *
 * `createApp` mounts this last, so it answers any GET no other route
 * matches (what the dev server shows). scripts/generate-static.tsx writes
 * the same response to dist/404.html, which Workers Assets serves with a
 * 404 status for a path it has no file for (`not_found_handling` in
 * wrangler.toml).
 */

import { Hono } from 'hono'
import { renderer } from './renderer'

export function createNotFoundApp(): Hono {
  const app = new Hono()
  app.use(renderer)
  app.get('*', (c) => {
    c.status(404)
    return c.render(
      <p>
        There is no page at this address. Start from the{' '}
        <a href="/docs/introduction">Introduction</a>, pick a page from the sidebar,
        or search with <kbd>⌘K</kbd>.
      </p>,
      { title: 'Page Not Found' },
    )
  })
  return app
}
