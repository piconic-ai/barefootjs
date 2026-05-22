/**
 * Build/dev-time content loading (requires Node.js APIs).
 *
 * This module uses node:fs and node:path to read markdown files from disk.
 * It must NOT be imported in Cloudflare Worker bundles.
 */

import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

import type { Page, ContentMap, MdxContentMap } from './content'
export type { Page, ContentMap, MdxContentMap }

/**
 * Recursively discover all .md and .mdx files under a directory.
 */
async function discoverFiles(dir: string): Promise<{ path: string; kind: 'md' | 'mdx' }[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: { path: string; kind: 'md' | 'mdx' }[] = []
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await discoverFiles(fullPath))
    } else if (entry.name.endsWith('.mdx')) {
      files.push({ path: fullPath, kind: 'mdx' })
    } else if (entry.name.endsWith('.md')) {
      files.push({ path: fullPath, kind: 'md' })
    }
  }
  return files
}

function slugFor(rel: string, kind: 'md' | 'mdx'): { slug: string; name: string } {
  const ext = kind === 'mdx' ? /\.mdx$/ : /\.md$/
  const noExt = rel.replace(ext, '')
  const name = noExt.split('/').pop() || ''
  const slug = rel === 'README.md' ? '' : noExt
  return { slug, name }
}

/**
 * Build page list and content maps by reading from the filesystem.
 * Used by: dev server (reads fresh on startup) and build script (generates bundle).
 *
 * Pages are .md files only — .mdx pages have dedicated handlers
 * (`registerQuickStartRoutes` etc.) that pull from `mdx` and own
 * their routing.
 */
export async function loadContentFromDisk(contentDir: string): Promise<{
  pages: Page[]
  content: ContentMap
  mdx: MdxContentMap
}> {
  const files = await discoverFiles(contentDir)
  const pages: Page[] = []
  const content: ContentMap = {}
  const mdx: MdxContentMap = {}

  for (const { path, kind } of files) {
    const rel = relative(contentDir, path)
    const { slug, name } = slugFor(rel, kind)

    if (kind === 'mdx') {
      mdx[slug] = await Bun.file(path).text()
      continue
    }

    pages.push({ slug, name })
    content[slug] = await Bun.file(path).text()
  }

  // Sort: index first, then alphabetically
  pages.sort((a, b) => {
    if (a.slug === '') return -1
    if (b.slug === '') return 1
    return a.slug.localeCompare(b.slug)
  })

  return { pages, content, mdx }
}
