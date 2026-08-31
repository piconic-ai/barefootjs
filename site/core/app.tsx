/**
 * Top-level Hono application for the BarefootJS site.
 *
 * Mounts sub-apps:
 *   GET /              → Landing page
 *   GET /docs/...      → Documentation
 *   GET /playground    → In-browser compiler playground
 */

import { Hono } from 'hono'
import { createDocsApp } from './docs-app'
import { createLandingApp } from './landing/routes'
import { createPlaygroundApp } from './playground/routes'
import { createIntegrationsApp } from './integrations/routes'
import { createOgRoute } from './og-route'
import { cacheControl } from '@barefootjs/site-shared/lib/cache-control'
import type { Page, ContentMap, MdxContentMap } from './lib/content'

/**
 * Create the unified Hono app.
 *
 * @param content - Map of slug → raw markdown content (.md pages)
 * @param pages   - List of page metadata (slug, name)
 * @param mdx     - Map of slug → raw MDX source (.mdx pages)
 */
export async function createApp(content: ContentMap, pages: Page[], mdx: MdxContentMap = {}): Promise<Hono> {
  const app = new Hono()

  // Sets Cache-Control on every route below that doesn't set its own. Inert
  // today — wrangler.toml deliberately leaves `[cache]` off (see the
  // comment there) — but mounted first so enabling it later is a one-line
  // wrangler.toml change with the middleware already wired and tested.
  app.use('*', cacheControl)

  // Landing page (GET /)
  const landingApp = await createLandingApp()
  app.route('/', landingApp)

  // Documentation (GET /docs/...)
  const docsApp = await createDocsApp(content, pages, mdx)
  app.route('/docs', docsApp)

  // Playground (GET /playground)
  app.route('/playground', createPlaygroundApp())

  // Integrations adapter index (GET /integrations). The adapter demos themselves
  // live on separate services, so this is just the catalog page.
  app.route('/integrations', createIntegrationsApp())

  // OG image generator (GET /og?title=...)
  app.route('/og', createOgRoute())

  return app
}
