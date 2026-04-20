/**
 * Landing page renderer
 *
 * Minimal layout for the landing page (no sidebar, no TOC).
 * Shares the same import map, theme init, and BfScripts as the docs renderer.
 */

import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import { Header } from '../../shared/components/header'
import { SearchPlaceholder } from '../../shared/components/search-placeholder'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { BfScripts } from '../../../packages/hono/src/scripts'
import { themeInitScript } from '@barefootjs/site-shared/lib/theme-init'

/**
 * Predictable instance ID generator for consistent SSR.
 */
const createPredictableIdGenerator = () => {
  const counters = new Map<string, number>()
  return (name: string) => {
    const count = counters.get(name) || 0
    counters.set(name, count + 1)
    return `${name}_${count}`
  }
}

function WithPredictableIds({ children }: { children: any }) {
  const c = useRequestContext()
  c.set('bfInstanceIdGenerator', createPredictableIdGenerator())
  return <>{children}</>
}

// Import map for resolving @barefootjs/client in client JS
const importMapScript = JSON.stringify({
  imports: {
    '@barefootjs/client': '/static/components/barefoot.js',
    '@barefootjs/client/runtime': '/static/components/barefoot.js',
  },
})

export const landingRenderer = jsxRenderer(
  ({ children, title, description }) => {
    const c = useRequestContext()
    const hostname = new URL(c.req.url).hostname
    const uiHref = hostname === 'localhost' ? 'http://localhost:3002/' : 'https://ui.barefootjs.dev'

    const pageTitle = title || 'Barefoot.js'
    const pageDescription = description || 'Reactive JSX for any backend'
    return (
      <WithPredictableIds>
        <html lang="en">
          <head>
            <script type="importmap" dangerouslySetInnerHTML={{ __html: importMapScript }} />
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <link rel="icon" type="image/png" sizes="32x32" href="/static/icon-32.png" />
            <link rel="icon" type="image/png" sizes="64x64" href="/static/icon-64.png" />
            <title>{pageTitle}</title>
            <meta name="description" content={pageDescription} />
            <link rel="author" href="https://kobaken.co" />
            <meta name="author" content="kobaken a.k.a @kfly8" />
            <meta name="creator" content="kobaken a.k.a @kfly8" />
            {/* OGP meta tags */}
            <meta property="og:title" content={pageTitle} />
            <meta property="og:description" content={pageDescription} />
            <meta property="og:type" content="website" />
            <meta property="og:image" content="/static/og-image.png" />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={pageTitle} />
            <meta name="twitter:description" content={pageDescription} />
            <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
            <link rel="stylesheet" href="/static/globals.css" />
            <link rel="stylesheet" href="/static/uno.css" />
          </head>
          <body>
            <Header logoHref="/" coreHref="/docs/introduction" uiHref={uiHref} playgroundHref="/playground" integrationsHref="/integrations" searchSlot={<SearchPlaceholder />} themeSwitcher={<ThemeSwitcher />} />
            <main>
              {children}
            </main>
            <BfScripts />
          </body>
        </html>
      </WithPredictableIds>
    )
  },
  { stream: true }
)
