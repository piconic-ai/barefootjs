// Site-side MDX renderer.
//
// Pairs the shared MDX-lite parser (in `packages/cli/src/lib/mdx`)
// with the site's Marked + Shiki pipeline so a single `.mdx` source
// produces both the rendered docs page and the plain-markdown
// projection served at `/<slug>.md`.
//
// The renderer returns parts the caller can splice into JSX —
// markdown chunks come back as pre-rendered HTML strings, JSX nodes
// come back as `{ name, props }` so the caller can resolve them
// against a component registry it owns.

import { parseMdx, projectMdxToMarkdown, defaultMdxProjectors, type MdxProjector } from '../../../packages/cli/src/lib/mdx'
import { renderMarkdown, type Frontmatter, type TocItem } from './markdown'

export type { MdxProjector }
export { projectMdxToMarkdown, defaultMdxProjectors }

export type MdxRenderPart =
  | { type: 'html'; html: string }
  | { type: 'component'; name: string; props: Record<string, string> }

export interface RenderedMdx {
  frontmatter: Frontmatter
  toc: TocItem[]
  parts: MdxRenderPart[]
}

/**
 * Render an MDX-lite source: each markdown chunk is run through the
 * site's `renderMarkdown` (Marked + Shiki + heading IDs), each JSX
 * tag is returned as a component reference for the caller to
 * resolve against its registry.
 */
export async function renderMdx(source: string): Promise<RenderedMdx> {
  const parsed = parseMdx(source)
  const parts: MdxRenderPart[] = []
  const toc: TocItem[] = []
  const frontmatter: Frontmatter = { ...parsed.frontmatter }

  for (const node of parsed.nodes) {
    if (node.type === 'md') {
      const md = await renderMarkdown(node.text)
      if (md.html.trim()) parts.push({ type: 'html', html: md.html })
      toc.push(...md.toc)
      // The first chunk's frontmatter is empty (parseMdx already
      // peeled it off) but title-from-H1 still fires; promote it
      // when the source had no explicit title.
      if (!frontmatter.title && md.frontmatter.title) {
        frontmatter.title = md.frontmatter.title
      }
    } else {
      parts.push({ type: 'component', name: node.name, props: node.props })
    }
  }

  return { frontmatter, toc, parts }
}
