/**
 * Cloudflare Workers entry point for the BarefootJS documentation site.
 *
 * Content is bundled at build time (dist/content.json) since Workers
 * can't read from the filesystem.
 */

import { createApp } from './app'
import { pagesFromContentMap, type ContentMap, type MdxContentMap } from './lib/content'
import contentBundle from './dist/content.json' with { type: 'json' }

const bundle = contentBundle as { content: ContentMap; mdx: MdxContentMap }
const { content, mdx } = bundle
const pages = pagesFromContentMap(content)
const app = await createApp(content, pages, mdx)

export default app
