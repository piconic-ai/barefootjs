/**
 * Quick Start page.
 *
 * Thin loader for `docs/core/quick-start.mdx` — the prose and the
 * `<PackageManagerTabs>` JSX node both live in the .mdx source so
 * there is one canonical Quick Start, regardless of whether you're
 * reading it on the site, via the `view as markdown` toggle, or
 * through `bf guide`.
 *
 * The `/docs/quick-start.md` synth route projects the .mdx down to
 * plain markdown (each JSX node is replaced with the projector's
 * default branch — `npm create barefootjs@latest` for the tabs) so
 * tooling that scrapes raw docs keeps working.
 */

import type { Hono } from 'hono'
import { renderMdx, projectMdxToMarkdown, defaultMdxProjectors } from '../lib/mdx'
import { getDocsNavLinks } from '../lib/navigation'
import { PackageManagerTabs } from '@/components/package-manager-tabs'

const SLUG = 'quick-start'

const COMPONENTS = {
  PackageManagerTabs: (props: Record<string, string>) => (
    <PackageManagerTabs
      command={props.command ?? ''}
      mode={(props.mode as 'dlx' | 'create') ?? 'dlx'}
      defaultPm={props.defaultPm}
    />
  ),
}

export function registerQuickStartRoutes(app: Hono, mdxSource: string): void {
  app.get(`/${SLUG}`, async (c) => {
    const { frontmatter, toc, parts } = await renderMdx(mdxSource)
    const navLinks = getDocsNavLinks(SLUG)
    return c.render(
      <>
        {parts.map((part) => {
          if (part.type === 'html') {
            return <div dangerouslySetInnerHTML={{ __html: part.html }} />
          }
          const Component = COMPONENTS[part.name as keyof typeof COMPONENTS]
          return Component ? <Component {...part.props} /> : null
        })}
      </>,
      {
        title: frontmatter.title,
        description: frontmatter.description,
        slug: SLUG,
        toc,
        prev: navLinks.prev,
        next: navLinks.next,
      },
    )
  })

  app.get(`/${SLUG}.md`, (c) => {
    c.header('Content-Type', 'text/markdown; charset=utf-8')
    return c.body(projectMdxToMarkdown(mdxSource, defaultMdxProjectors))
  })
}
