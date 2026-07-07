/**
 * Hono application for the BarefootJS documentation site.
 *
 * Routes for each page:
 *   GET /{slug}     → Rendered HTML
 *   GET /{slug}.md  → Raw Markdown (plain projection for .mdx pages)
 *
 * .mdx pages (Quick Start, Introduction, etc.) have dedicated handlers
 * that render JSX components (`<PackageManagerTabs>`, `<Tabs>`) inline.
 */

import { Hono } from 'hono'
import { renderer } from './renderer'
import { initHighlighter, renderMarkdown } from './lib/markdown'
import { getDocsNavLinks } from './lib/navigation'
import type { Page, ContentMap, MdxContentMap } from './lib/content'
import { registerQuickStartRoutes } from './pages/quick-start'
import { registerMdxDocsRoutes } from './pages/mdx-docs-page'
import { registerCompatMatrixRoutes } from './pages/compat-matrix'

/**
 * Create the Hono app with routes for all documentation pages.
 *
 * @param content - Map of slug → raw markdown content (.md pages)
 * @param pages   - List of page metadata (slug, name)
 * @param mdx     - Map of slug → raw MDX source (.mdx pages)
 */
export async function createDocsApp(content: ContentMap, pages: Page[], mdx: MdxContentMap = {}): Promise<Hono> {
  await initHighlighter()

  const app = new Hono()
  app.use(renderer)

  const quickStartSource = mdx['quick-start']
  if (quickStartSource) registerQuickStartRoutes(app, quickStartSource)

  // Compatibility Matrix: rendered from the committed ui/compat.lock.json,
  // not backed by a docs/core/*.md file.
  registerCompatMatrixRoutes(app)

  // MDX pages with <Tabs> blocks
  for (const [slug, source] of Object.entries(mdx)) {
    if (slug === 'quick-start' || slug === '') continue
    registerMdxDocsRoutes(app, slug, source)
  }

  // README.mdx (index page)
  const readmeSource = mdx['']
  if (readmeSource) registerMdxDocsRoutes(app, '', readmeSource)

  // All pages: HTML version + raw Markdown version
  for (const page of pages.filter((p) => p.slug !== '')) {
    const pageContent = content[page.slug]
    if (pageContent === undefined) continue

    // HTML version
    app.get(`/${page.slug}`, async (c) => {
      const parsed = await renderMarkdown(pageContent)

      // Collect extra meta tags from frontmatter
      const meta: Record<string, string> = {}
      for (const [key, value] of Object.entries(parsed.frontmatter)) {
        if (key !== 'title' && key !== 'description' && value) {
          meta[key] = value
        }
      }

      const navLinks = getDocsNavLinks(page.slug)

      return c.render(
        <div dangerouslySetInnerHTML={{ __html: parsed.html }} />,
        {
          title: parsed.frontmatter.title,
          description: parsed.frontmatter.description,
          meta: Object.keys(meta).length > 0 ? meta : undefined,
          slug: page.slug,
          toc: parsed.toc,
          prev: navLinks.prev,
          next: navLinks.next,
        }
      )
    })

    // Raw Markdown version
    app.get(`/${page.slug}.md`, (c) => {
      c.header('Content-Type', 'text/markdown; charset=utf-8')
      return c.body(pageContent)
    })
  }

  return app
}
