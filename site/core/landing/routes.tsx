/**
 * Landing page routes
 *
 * Renders the landing page at GET /. Page structure follows
 * design/lp-mock/barefootjs-lp-v3.html: five blocks only —
 * hero + input/output demo, the fork, CI matrix, for/not-for,
 * and quickstart (see design/LP-RENEWAL.md).
 */

import { Hono } from 'hono'
import { landingRenderer } from './renderer'
import { initHighlighter } from './components/shared/highlighter'
import { Hero, DemoSection } from './components/hero'
import { ForkSection, MatrixSection, FitSection, QuickstartSection } from './components/sections'

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
    const hostname = new URL(c.req.url).hostname
    const uiHref = hostname === 'localhost' ? 'http://localhost:3002/' : 'https://ui.barefootjs.dev'
    return c.render(
      <>
        <Hero uiHref={uiHref} />
        <DemoSection />
        <ForkSection />
        <MatrixSection uiHref={uiHref} />
        <FitSection />
        <QuickstartSection />
      </>,
      {
        title: 'BarefootJS — TSX in. Your stack out.',
        description:
          "Components without the Node server. BarefootJS compiles TSX components into your backend's native templates — Go, Rails, Django, Perl, PHP, Rust. No Node in production.",
      }
    )
  })

  return app
}
