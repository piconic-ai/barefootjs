/**
 * Landing page routes
 *
 * Renders the landing page at GET /.
 */

import { Hono } from 'hono'
import { landingRenderer } from './renderer'
import { initHighlighter } from './components/shared/highlighter'
import { Hero } from './components/hero'
import { FeaturesSection, UIComponentsSection } from './components/features'

/**
 * Create the landing page app with routes.
 * Initializes the LP-specific highlighter for code demos.
 */
export async function createLandingApp() {
  await initHighlighter()

  const app = new Hono()

  app.use(landingRenderer)

  // Landing page
  app.get('/', (c) => {
    return c.render(
      <>
        <Hero />
        <FeaturesSection />
        <UIComponentsSection />
      </>,
      {
        title: 'Barefoot.js - Reactive TSX for any backend',
        description:
          'Type-safe TSX with signals and selective hydration for server-first applications.',
      }
    )
  })

  return app
}
