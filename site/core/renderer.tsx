/**
 * HTML layout renderer for the documentation site.
 * Provides the shell: <html>, <head> with meta tags, sidebar navigation, and content area.
 *
 * Modernized: uses @barefootjs/hono/jsx, BfScripts, import map, UnoCSS,
 * compiled ThemeSwitcher and Logo components.
 */

import { jsxRenderer, useRequestContext } from 'hono/jsx-renderer'
import { navigation, type NavItem } from './lib/navigation'
import { SidebarNav, type SidebarEntry, type SidebarGroup, type SidebarLink } from '../shared/components/sidebar-page-nav'
import { PageNav, type PageNavLink } from '../shared/components/page-nav'
import { PageNavigation } from '../shared/components/page-navigation'
import { BfScripts } from '../../packages/hono/src/scripts'
import { TableOfContents } from '@/components/table-of-contents'
import type { TocItem } from '../shared/components/table-of-contents'

declare module 'hono' {
  interface ContextRenderer {
    (
      content: string | Promise<string>,
      props?: {
        title?: string
        description?: string
        meta?: Record<string, string>
        slug?: string
        toc?: TocItem[]
        prev?: PageNavLink
        next?: PageNavLink
      }
    ): Response | Promise<Response>
  }
}

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

import { themeInitScript } from '@barefootjs/site-shared/lib/theme-init'

// Import map for resolving @barefootjs/client in client JS
const importMapScript = JSON.stringify({
  imports: {
    '@barefootjs/client': '/static/components/barefoot.js',
    '@barefootjs/client/runtime': '/static/components/barefoot.js',
  },
})

/**
 * Convert docs NavItem[] to shared SidebarEntry[].
 * - Items without children → SidebarLink
 * - Items with children → SidebarGroup (parent added as first link)
 */
function navToSidebarEntries(items: NavItem[]): SidebarEntry[] {
  return items.map((item): SidebarEntry => {
    if (!item.children || item.children.length === 0) {
      return { title: item.title, href: `/docs/${item.slug}` } satisfies SidebarLink
    }
    const parentLink: SidebarLink = { title: item.title, href: `/docs/${item.slug}` }
    const childLinks: SidebarLink[] = item.children.map(child => ({
      title: child.title,
      href: `/docs/${child.slug}`,
    }))
    return {
      title: item.title,
      links: [parentLink, ...childLinks],
    } satisfies SidebarGroup
  })
}

function Sidebar({ currentSlug }: { currentSlug: string }) {
  const entries = navToSidebarEntries(navigation)
  const currentPath = currentSlug === '' ? '/docs' : `/docs/${currentSlug}`

  return (
    <aside id="sidebar" class="sidebar">
      <nav className="sidebar-nav p-4">
        <SidebarNav entries={entries} currentPath={currentPath} />
      </nav>
    </aside>
  )
}

function MdToggleButton({ slug }: { slug: string }) {
  const mdPath = slug === '' ? '/docs/README.md' : `/docs/${slug}.md`
  return (
    <a href={mdPath} class="md-toggle-btn" title="View as Markdown">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M14.85 3H1.15C.52 3 0 3.52 0 4.15v7.69C0 12.48.52 13 1.15 13h13.69c.64 0 1.15-.52 1.15-1.15V4.15C16 3.52 15.48 3 14.85 3zM9 11H7V8L5.5 9.92 4 8v3H2V5h2l1.5 2L7 5h2v6zm2.99.5L9.5 8H11V5h2v3h1.5l-2.51 3.5z" />
      </svg>
    </a>
  )
}

// Import shared components
import { Header } from '../shared/components/header'
import { SearchPlaceholder } from '../shared/components/search-placeholder'
import { ThemeSwitcher } from '@/components/theme-switcher'
import { MobileMenu } from '@/components/mobile-menu'
import { MobilePageNav } from '../shared/components/mobile-page-nav'

export const renderer = jsxRenderer(
  ({ children, title, description, meta, slug, toc, prev, next }) => {
    const c = useRequestContext()
    const hostname = new URL(c.req.url).hostname
    const uiHref = hostname === 'localhost' ? 'http://localhost:3002/' : 'https://ui.barefootjs.dev'

    const pageTitle = title ? `${title} — BarefootJS` : 'BarefootJS Documentation'
    const currentSlug = slug || ''

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
            {description && <meta name="description" content={description} />}
            {meta && Object.entries(meta).map(([key, value]) => {
              if (key.startsWith('og:')) {
                return <meta property={key} content={value} />
              }
              return <meta name={key} content={value} />
            })}
            <meta name="author" content="kobaken a.k.a @kfly8" />
            <link rel="author" href="https://kobaken.co" />
            <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
            <link rel="stylesheet" href="/static/globals.css" />
            <link rel="stylesheet" href="/static/uno.css" />
          </head>
          <body>
            <Header
              activePage="core"
              logoHref="/"
              coreHref="/docs/introduction"
              uiHref={uiHref}
              playgroundHref="/playground"
              searchSlot={<SearchPlaceholder />}
              themeSwitcher={<ThemeSwitcher />}
            />

            <MobileMenu />
            <MobilePageNav prev={prev} next={next} />
            <Sidebar currentSlug={currentSlug} />

            <main class="main-content">
              <div class="doc-content-wrapper">
                <div class="doc-main-column">
                  <div class="doc-title-bar">
                    <h1 class="doc-title">{title}</h1>
                    <MdToggleButton slug={currentSlug} />
                    <PageNav prev={prev} next={next} />
                  </div>
                  <article class="doc-article">
                    {children}
                  </article>
                  <PageNavigation prev={prev} next={next} />
                </div>
                {toc && toc.length > 0 && <TableOfContents items={toc} />}
              </div>
            </main>

            <BfScripts />
          </body>
        </html>
      </WithPredictableIds>
    )
  },
  { stream: true }
)
