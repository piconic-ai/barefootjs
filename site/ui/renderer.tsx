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
import { SidebarNav, type SidebarEntry } from '../shared/components/sidebar'
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

// Sidebar menu data
const menuEntries: SidebarEntry[] = [
  {
    title: 'Get Started',
    defaultOpen: true,
    links: [
      { title: 'Introduction', href: '/' },
    ],
  },
  {
    title: 'Components',
    links: [
      { title: 'Accordion', href: '/docs/components/accordion' },
      { title: 'Alert', href: '/docs/components/alert' },
      { title: 'Alert Dialog', href: '/docs/components/alert-dialog' },
      { title: 'Aspect Ratio', href: '/docs/components/aspect-ratio' },
      { title: 'Avatar', href: '/docs/components/avatar' },
      { title: 'Badge', href: '/docs/components/badge' },
      { title: 'Breadcrumb', href: '/docs/components/breadcrumb' },
      { title: 'Button', href: '/docs/components/button' },
      { title: 'Card', href: '/docs/components/card' },
      { title: 'Carousel', href: '/docs/components/carousel' },
      { title: 'Checkbox', href: '/docs/components/checkbox' },
      { title: 'Collapsible', href: '/docs/components/collapsible' },
      { title: 'Command', href: '/docs/components/command' },
      { title: 'Context Menu', href: '/docs/components/context-menu' },
      { title: 'Data Table', href: '/docs/components/data-table' },
      { title: 'Dialog', href: '/docs/components/dialog' },
      { title: 'Drawer', href: '/docs/components/drawer' },
      { title: 'Dropdown Menu', href: '/docs/components/dropdown-menu' },
      { title: 'Hover Card', href: '/docs/components/hover-card' },
      { title: 'Input', href: '/docs/components/input' },
      { title: 'Label', href: '/docs/components/label' },
      { title: 'Menubar', href: '/docs/components/menubar' },
      { title: 'Navigation Menu', href: '/docs/components/navigation-menu' },
      { title: 'Pagination', href: '/docs/components/pagination' },
      { title: 'Popover', href: '/docs/components/popover' },
      { title: 'Progress', href: '/docs/components/progress' },
      { title: 'Radio Group', href: '/docs/components/radio-group' },
      { title: 'Resizable', href: '/docs/components/resizable' },
      { title: 'Scroll Area', href: '/docs/components/scroll-area' },
      { title: 'Select', href: '/docs/components/select' },
      { title: 'Sidebar', href: '/docs/components/sidebar' },
      { title: 'Separator', href: '/docs/components/separator' },
      { title: 'Skeleton', href: '/docs/components/skeleton' },
      { title: 'Sheet', href: '/docs/components/sheet' },
      { title: 'Slider', href: '/docs/components/slider' },
      { title: 'Spinner', href: '/docs/components/spinner' },
      { title: 'Switch', href: '/docs/components/switch' },
      { title: 'Table', href: '/docs/components/table' },
      { title: 'Tabs', href: '/docs/components/tabs' },
      { title: 'Textarea', href: '/docs/components/textarea' },
      { title: 'Toast', href: '/docs/components/toast' },
      { title: 'Toggle', href: '/docs/components/toggle' },
      { title: 'Toggle Group', href: '/docs/components/toggle-group' },
      { title: 'Tooltip', href: '/docs/components/tooltip' },
    ],
  },
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
    links: [],
  },
  {
    title: 'Charts',
    links: [],
  },
]

// Import map for resolving bare module specifiers in client JS
const importMapScript = JSON.stringify({
  imports: {
    '@barefootjs/dom': '/static/components/barefoot.js',
    '@barefootjs/form': '/static/components/barefoot-form.js',
    'zod': '/static/lib/zod.esm.js',
    'embla-carousel': '/static/lib/embla-carousel.esm.js',
  },
})

export const renderer = jsxRenderer(
  ({ children, title, description }) => {
    const c = useRequestContext()
    const currentPath = c.req.path
    const hostname = new URL(c.req.url).hostname
    const logoHref = hostname === 'localhost' ? 'http://localhost:3001/' : 'https://barefootjs.dev'
    const coreHref = hostname === 'localhost' ? 'http://localhost:3001/docs/introduction' : 'https://barefootjs.dev/docs/introduction'

    const pageTitle = title || 'BarefootJS Components'

    // Resolve prev/next links for mobile page navigation
    const slugMatch = currentPath.match(/\/docs\/components\/([^/]+)/)
    const navLinks = slugMatch ? getNavLinks(slugMatch[1]) : {}
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
            <Header activePage="ui" logoHref={logoHref} coreHref={coreHref} uiHref="/" searchSlot={<SearchButton />} themeSwitcher={<ThemeSwitcher />} />
            <MobileMenu />
            <MobilePageNav prev={navLinks.prev} next={navLinks.next} />
            <CommandPalette />
            <nav
              className="hidden sm:block fixed top-14 left-0 w-56 h-[calc(100vh-56px)] overflow-y-auto border-r border-border bg-background p-4"
              aria-label="Main navigation"
              data-sidebar-menu
            >
              <SidebarNav entries={menuEntries} currentPath={currentPath} />
            </nav>
            <div className="sm:pl-56">
              <main className="max-w-[1000px] mx-auto px-0 sm:px-4">
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
