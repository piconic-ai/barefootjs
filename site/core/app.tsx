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
import type { Page, ContentMap } from './lib/content'

/**
 * Create the unified Hono app.
 *
 * @param content - Map of slug → raw markdown content
 * @param pages   - List of page metadata (slug, name)
 */
export async function createApp(content: ContentMap, pages: Page[]): Promise<Hono> {
  const app = new Hono()

  // Landing page (GET /)
  const landingApp = await createLandingApp()
  app.route('/', landingApp)

  // Documentation (GET /docs/...)
  const docsApp = await createDocsApp(content, pages)
  app.route('/docs', docsApp)

  // Playground (GET /playground)
  app.route('/playground', createPlaygroundApp())

  // Integrations adapter index (GET /integrations). The adapter demos themselves
  // live on separate services, so this is just the catalog page.
  app.route('/integrations', createIntegrationsApp())

  return app
}
