/**
 * BarefootJS Components Renderer
 *
 * Uses hono/jsx-renderer with UnoCSS.
 * BfScripts component renders collected script tags at body end.
 */

import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'

declare module 'hono' {
  interface ContextRenderer {
    (
      content: string | Promise<string>,
      props?: {
        title?: string
        description?: string
      }
    ): Response | Promise<Response>
  }
}
import { BfScripts } from '../../packages/hono/src/scripts'
import { BfPortals } from '../../packages/hono/src/portals'
import { BfPreload, type Manifest } from '../../packages/hono/src/preload'
import { SidebarNav, type SidebarEntry } from '../shared/components/sidebar-page-nav'
import { Header } from '../shared/components/header'
import { MobileMenu } from '@/components/mobile-menu'
import { MobilePageNav } from '../shared/components/mobile-page-nav'
import { getNavLinks } from '@/components/shared/PageNavigation'
import { SearchButton } from '@/components/search-button'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { CommandPalette } from '@/components/command-palette'

// Import manifest for dependency-aware preloading
// This enables BfPreload to automatically preload the full dependency chain
// Example: If Button depends on Slot, preloading Button will also preload Slot
import manifest from './dist/components/manifest.json'

/**
 * Predictable instance ID generator for E2E testing.
 * Generates IDs like "ComponentName_0", "ComponentName_1" for stable selectors.
 * The _N suffix is required because client JS uses prefix matching with underscore.
 */
const createPredictableIdGenerator = () => {
  const counters = new Map<string, number>()
  return (name: string) => {
    const count = counters.get(name) || 0
    counters.set(name, count + 1)
    return `${name}_${count}`
  }
}

/**
 * Wrapper component to set up predictable ID generator in context
 */
function WithPredictableIds({ children }: { children: any }) {
  const c = useRequestContext()
  c.set('bfInstanceIdGenerator', createPredictableIdGenerator())
  return <>{children}</>
}

import { themeInitScript } from '@barefootjs/site-shared/lib/theme-init'
import { categoryOrder, categoryLabels, getComponentsByCategory, blockEntries } from './components/shared/component-registry'

// Sidebar menu data — split into sections with visual separators
const startEntries: SidebarEntry[] = [
  {
    title: 'Docs',
    defaultOpen: true,
    links: [
      { title: 'Introduction', href: '/' },
    ],
  },
]

// Component categories + Charts generated from registry
const componentEntries: SidebarEntry[] = [
  ...categoryOrder.map((category) => ({
    title: categoryLabels[category],
    defaultOpen: false,
    links: getComponentsByCategory(category).map((entry) => ({
      title: entry.title,
      href: `/components/${entry.slug}`,
    })),
  })),
  {
    title: 'Charts',
    links: [
      { title: 'Area Chart', href: '/charts/area-chart' },
      { title: 'Bar Chart', href: '/charts/bar-chart' },
      { title: 'Line Chart', href: '/charts/line-chart' },
      { title: 'Pie Chart', href: '/charts/pie-chart' },
      { title: 'Radar Chart', href: '/charts/radar-chart' },
      { title: 'Radial Chart', href: '/charts/radial-chart' },
    ],
  },
]

// Patterns — composition guides and page-level layouts
const patternEntries: SidebarEntry[] = [
  {
    title: 'Forms',
    links: [
      { title: 'Controlled Input', href: '/docs/forms/controlled-input' },
      { title: 'createForm', href: '/docs/forms/create-form' },
      { title: 'Field Arrays', href: '/docs/forms/field-arrays' },
      { title: 'Submit', href: '/docs/forms/submit' },
      { title: 'Validation', href: '/docs/forms/validation' },
    ],
  },
  {
    title: 'Blocks',
    defaultOpen: false,
    links: blockEntries.map((entry) => ({
      title: entry.title,
      href: `/components/${entry.slug}`,
    })),
  },
]

// Gallery — multi-page demo apps (see issue #929)
const galleryEntries: SidebarEntry[] = [
  {
    title: 'Apps',
    defaultOpen: false,
    links: [
      { title: 'Admin Dashboard', href: '/gallery/admin' },
    ],
  },
]

// Tools — CLI and design system utilities
const toolEntries: SidebarEntry[] = [
  { title: 'CLI', href: '/docs/cli' },
  { title: 'Studio', href: '/studio' },
]

// Import map for resolving bare module specifiers in client JS
const importMapScript = JSON.stringify({
  imports: {
    '@barefootjs/client': '/static/components/barefoot.js',
    '@barefootjs/client/runtime': '/static/components/barefoot.js',
    '@barefootjs/form': '/static/components/barefoot-form.js',
    '@barefootjs/chart': '/static/components/barefoot-chart.js',
    'zod': '/static/lib/zod.esm.js',
    'embla-carousel': '/static/lib/embla-carousel.esm.js',
  },
})

export const renderer = jsxRenderer(
  ({ children, title, description }) => {
    const c = useRequestContext()
    const currentPath = c.req.path
    const hostname = new URL(c.req.url).hostname
    const logoHref = hostname === 'localhost' ? 'http://localhost:4000/' : 'https://barefootjs.dev'
    const coreHref = hostname === 'localhost' ? 'http://localhost:4000/docs/introduction' : 'https://barefootjs.dev/docs/introduction'
    const playgroundHref = hostname === 'localhost' ? 'http://localhost:4000/playground' : 'https://barefootjs.dev/playground'
    const integrationsHref = hostname === 'localhost' ? 'http://localhost:4000/integrations' : 'https://barefootjs.dev/integrations'

    const pageTitle = title || 'BarefootJS Components'

    // Resolve prev/next links for mobile page navigation
    const slugMatch = currentPath.match(/\/(?:docs\/)?components\/([^/]+)/)
    const navLinks = slugMatch ? getNavLinks(slugMatch[1]) : {}
    const isGallery = currentPath.startsWith('/gallery/')
    const isChrome = currentPath !== '/studio' && !isGallery
    return (
      <WithPredictableIds>
        <html lang="en">
          <head>
            <script type="importmap" dangerouslySetInnerHTML={{ __html: importMapScript }} />
            <BfPreload
              manifest={manifest as Manifest}
              components={['Button', 'CopyButton', 'Toggle', 'ThemeToggle']}
            />
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <link rel="icon" type="image/png" sizes="32x32" href="/static/icon-32.png" />
            <link rel="icon" type="image/png" sizes="64x64" href="/static/icon-64.png" />
            <title>{pageTitle}</title>
            {description && <meta name="description" content={description} />}
            <link rel="author" href="https://kobaken.co" />
            <meta name="author" content="kobaken a.k.a @kfly8" />
            <meta name="creator" content="kobaken a.k.a @kfly8" />
            <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
            <link rel="stylesheet" href="/static/globals.css" />
            <link rel="stylesheet" href="/static/uno.css" />
            <style>{`
              body {
                padding: 5rem 0.3rem 3rem;
              }
              @media (min-width: 640px) {
                body {
                  padding: 5rem 1.5rem 3rem;
                }
              }
            `}</style>
          </head>
          <body>
            <Header activePage="ui" logoHref={logoHref} coreHref={coreHref} uiHref="/" playgroundHref={playgroundHref} integrationsHref={integrationsHref} searchSlot={<SearchButton />} themeSwitcher={<ThemeSwitcher />} />
            <MobileMenu />
            <MobilePageNav prev={navLinks.prev} next={navLinks.next} />
            <CommandPalette />
            {isChrome && (
              <nav
                className="hidden sm:block fixed top-14 left-0 w-56 h-[calc(100vh-56px)] overflow-y-auto border-r bg-background p-4"
                aria-label="Main navigation"
                data-sidebar-menu
              >
                <SidebarNav entries={startEntries} currentPath={currentPath} />
                <div className="pt-3 mt-3 border-t">
                  <span className="block px-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Components</span>
                </div>
                <SidebarNav entries={componentEntries} currentPath={currentPath} />
                <div className="pt-3 mt-3 border-t">
                  <span className="block px-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Patterns</span>
                </div>
                <SidebarNav entries={patternEntries} currentPath={currentPath} />
                <div className="pt-3 mt-3 border-t">
                  <span className="block px-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Gallery</span>
                </div>
                <SidebarNav entries={galleryEntries} currentPath={currentPath} />
                <div className="pt-3 mt-3 border-t">
                  <span className="block px-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tools</span>
                </div>
                <SidebarNav entries={toolEntries} currentPath={currentPath} />
              </nav>
            )}
            <div className={isChrome ? 'sm:pl-56' : ''}>
              <main
                className={
                  currentPath === '/studio'
                    ? ''
                    : isGallery
                    ? 'max-w-[1200px] mx-auto px-2 sm:px-4 py-4'
                    : 'max-w-[1000px] mx-auto px-0 sm:px-4'
                }
              >
                {children}
              </main>
            </div>
            <BfPortals />
            <BfScripts />
          </body>
        </html>
      </WithPredictableIds>
    )
  },
  { stream: true }
)
