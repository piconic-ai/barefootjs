/**
 * Static generation for barefootjs.dev (runs after build.ts, as part of
 * `bun run build`).
 *
 * Every page on this site is fully determined at build time, so the whole
 * site is written to dist/ as files and served by Workers Assets alone —
 * wrangler.toml has no `main`, no request ever runs Worker code, and every
 * request is free. The same Hono app the dev server runs (app.tsx) is the
 * single source of the HTML: `hono/ssg`'s toSSG renders each static GET
 * route of it, so dev and production cannot drift.
 *
 * Besides the pages:
 *   - OG images: the renderer names each page's image by its title
 *     (lib/og-image.ts); after the pages are rendered, every title they
 *     asked for is rendered through the same `/og/*` route into dist/og/.
 *   - `_redirects`: the 301s docs-app.tsx answers for merged pages come from
 *     `redirects` in lib/navigation.ts; Workers Assets reads the same map as
 *     a `_redirects` file (toSSG itself skips non-200 responses).
 *
 * The build fails if a page in the sidebar navigation produced no file.
 */

import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolve, dirname, relative, sep } from 'node:path'
import { defaultExtensionMap, toSSG } from 'hono/ssg'
import type { Hono } from 'hono'
import { createApp } from '../app'
import { loadContentFromDisk } from '../lib/content-loader'
import { flattenNavigation, navigation, redirects } from '../lib/navigation'
import { ogImagePath, requestedOgTitles } from '../lib/og-image'

const ROOT = resolve(dirname(import.meta.path), '..')
const DIST_DIR = resolve(ROOT, 'dist')
const CONTENT_DIR = resolve(ROOT, '../../docs/core')

/**
 * The public origin the pages are rendered for. The layouts derive absolute
 * links (the ui site, OG image URLs) from the request's host
 * (@barefootjs/site-shared/lib/site-urls), and toSSG requests every route
 * as `http://localhost/<path>` — which the helpers treat as the dev setup.
 */
const SITE_ORIGIN = 'https://barefootjs.dev'

/**
 * toSSG renders each route with `app.request(path)`, which always resolves a
 * path against `http://localhost`. Resolve it against the public origin
 * instead; routing, `routes` and everything else are the app's own.
 */
function atOrigin(app: Hono, origin: string): Hono {
  const view = Object.create(app) as Hono
  view.request = (input, init, env, ctx) =>
    app.request(typeof input === 'string' ? new URL(input, origin).href : input, init, env, ctx)
  return view
}

// ── Drop the previous run's output ──────────────────────────
// dist/ is not cleaned between local builds; a page or OG title that no
// longer exists would otherwise stay behind and be deployed. toSSG writes a
// route either as an .html file directly under dist/ or somewhere under one
// of PAGE_DIRS; after the render, every file it wrote is checked against
// this, so a route at a new prefix fails the build instead of leaving its
// previous output unpruned.
const PAGE_DIRS = ['docs']
const isPrunedOutput = (file: string) => {
  const parts = relative(DIST_DIR, file).split(sep)
  return parts.length === 1 ? parts[0].endsWith('.html') : PAGE_DIRS.includes(parts[0])
}
for (const dir of [...PAGE_DIRS, 'og']) {
  await fs.rm(resolve(DIST_DIR, dir), { recursive: true, force: true })
}
for (const entry of await fs.readdir(DIST_DIR)) {
  if (entry.endsWith('.html')) await fs.rm(resolve(DIST_DIR, entry))
}

const { pages, content, mdx } = await loadContentFromDisk(CONTENT_DIR)
const app = await createApp(content, pages, mdx)

// ── 1. Pages ─────────────────────────────────────────────────
// `/docs/<slug>.md` answers `text/markdown`, which toSSG's default map does
// not know (it would write `<slug>.md.html`).
const extensionMap = { ...defaultExtensionMap, 'text/markdown': 'md' }
const result = await toSSG(atOrigin(app, SITE_ORIGIN), fs, { dir: DIST_DIR, extensionMap })
if (!result.success) throw result.error
const unpruned = result.files.filter((file) => !isPrunedOutput(resolve(DIST_DIR, file)))
if (unpruned.length > 0) {
  throw new Error(
    `toSSG wrote outside the locations pruned before each run (root *.html, ${PAGE_DIRS.map((d) => `${d}/`).join(', ')}); ` +
      `add the new location to PAGE_DIRS: ${unpruned.map((f) => relative(DIST_DIR, resolve(DIST_DIR, f))).join(', ')}`,
  )
}
console.log(`Generated: ${result.files.length} files (toSSG)`)

// ── 2. OG images ─────────────────────────────────────────────
const titles = requestedOgTitles()
for (const title of titles) {
  const path = ogImagePath(title)
  const res = await app.request(new URL(path, SITE_ORIGIN).href)
  if (!res.ok) throw new Error(`OG image ${path} (${JSON.stringify(title)}): HTTP ${res.status}`)
  const file = resolve(DIST_DIR, `.${path}`)
  await fs.mkdir(dirname(file), { recursive: true })
  await fs.writeFile(file, new Uint8Array(await res.arrayBuffer()))
}
console.log(`Generated: ${titles.length} OG images → dist/og/`)

// ── 3. _redirects ────────────────────────────────────────────
const redirectLines = Object.entries(redirects).flatMap(([from, to]) => [
  `/docs/${from} /docs/${to} 301`,
  `/docs/${from}.md /docs/${to}.md 301`,
])
await fs.writeFile(resolve(DIST_DIR, '_redirects'), redirectLines.join('\n') + '\n')
console.log(`Generated: dist/_redirects (${redirectLines.length} rules)`)

// ── 4. Every navigation page must exist as a file ────────────
const missing = flattenNavigation(navigation)
  .map(({ slug }) => slug)
  .filter((slug) => !existsSync(resolve(DIST_DIR, 'docs', `${slug}.html`)))
if (missing.length > 0) {
  throw new Error(`Static generation produced no page for: ${missing.map((s) => `/docs/${s}`).join(', ')}`)
}
