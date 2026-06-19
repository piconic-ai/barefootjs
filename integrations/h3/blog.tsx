/** @jsxImportSource @barefootjs/hono/jsx */
//
// Blog routes for the h3 integration — the `@barefootjs/router` showcase.
//
// Phase 3 of running the blog across every adapter (phase 2 folded it into
// Hono, #1933). h3 has no JSX runtime and no `jsxRenderer`, so unlike the Hono
// sub-app this is a plain `registerBlog(router, ...)` that adds `/blog` +
// `/blog/posts/:slug` to the existing h3 router. Each route is a `renderToHtml`
// of `BlogLayout` — its own region-shell layout (hand-authored sidebar
// `nav:0` + the compiled `<PageShell>` nested content regions + a shell
// `ThemeToggle` + the `router-entry` bootstrap), separate from the catalog
// `Layout`. The islands are the shared blog components in `../shared/blog`,
// compiled into `dist/components` by this integration's `bf build`; links are
// base-path aware via `BLOG`, so the same shared components work under any
// adapter's mount point.
//
// `searchParams()` SSR rides the adapter's existing reader seam: the whole
// fetch runs inside `withRequestEnv` (see server.tsx), so the index render of a
// `?sort=` / `?tag=` URL resolves the query per-request with no manual priming.

import {
  eventHandler,
  getRouterParam,
  getQuery,
  setResponseStatus,
  createRouter,
} from 'h3'
import { renderToHtml } from '@barefootjs/hono/render'
import { BfScripts } from '@barefootjs/hono/app'
import type { BarefootBuildManifest } from '@barefootjs/hono/app'
import { Sidebar } from '@/components/Sidebar'
import { PageShell } from '@/components/PageShell'
import { ThemeToggle } from '@/components/ThemeToggle'
import { NowPlaying } from '@/components/NowPlaying'
import { PostList } from '@/components/PostList'
import { PostArticle } from '@/components/PostArticle'
import { allTags, listItems, articleNav } from '../shared/blog/posts'

interface LayoutProps {
  base: string
  manifest: BarefootBuildManifest
  title?: string
  children?: unknown
}

function BlogLayout({ base, manifest, title, children }: LayoutProps) {
  const componentsBase = `${base}/static/components`
  const blog = `${base}/blog`
  // `searchParams()` lives in the single physical `@barefootjs/client/reactive`
  // module re-exported by every `@barefootjs/client*` entry, so the island and
  // the router bootstrap share ONE signal instance just by resolving the bare
  // specifiers to the same `barefoot.js`. `BfImportMap` only emits the
  // `/client` + `/runtime` keys, so the blog writes its own map to add
  // `/reactive` (same as the Hono integration).
  const importMap = JSON.stringify({
    imports: {
      '@barefootjs/client': `${componentsBase}/barefoot.js`,
      '@barefootjs/client/runtime': `${componentsBase}/barefoot.js`,
      '@barefootjs/client/reactive': `${componentsBase}/barefoot.js`,
    },
  })
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ?? 'Barefoot Blog'}</title>
        <script type="importmap" dangerouslySetInnerHTML={{ __html: importMap }} />
        <link rel="stylesheet" href={`${base}/shared/styles/blog.css`} />
      </head>
      <body>
        <header className="shell">
          <a className="shell-brand" href={blog}>📰 Barefoot Blog</a>
          <div className="shell-island">
            <ThemeToggle />
          </div>
        </header>
        {/*
          Two ways to author a region, side by side. The sidebar's
          `bf-region="nav:0"` is hand-written (this is a plain hono/jsx template,
          not a `bf build`-compiled tree, so `<Region>` would not lower here).
          The content area is a compiled `<PageShell>` whose nested `<Region>`s
          the compiler lowers to deterministic `bf-region="<file scope>:<index>"`
          ids. The router matches both by string equality.
        */}
        <div className="layout">
          <aside bf-region="nav:0">
            <Sidebar />
          </aside>
          <main>
            <PageShell>{children}</PageShell>
          </main>
        </div>
        {/* h3 has no per-page script collector, so BfScripts emits every island
            in the manifest (the same way every other h3 page does); the router
            bootstrap is appended once. */}
        <BfScripts base={componentsBase} manifest={manifest} />
        <script type="module" src={`${componentsBase}/router-entry.js`} />
      </body>
    </html>
  )
}

async function renderPage(node: unknown): Promise<string> {
  return '<!DOCTYPE html>' + (await renderToHtml(node))
}

/**
 * Register the blog routes on the h3 router. `base` is the integration's
 * BASE_PATH; the blog mounts at `${base}/blog` and every link is built relative
 * to it. `manifest` is the shared `dist/components/manifest.json` (now including
 * the blog islands, compiled via `barefoot.config.ts`).
 */
export function registerBlog(
  router: ReturnType<typeof createRouter>,
  base: string,
  manifest: BarefootBuildManifest,
): void {
  const blog = `${base}/blog`

  // Index — the post list reacts to ?sort= / ?tag= via searchParams() with no
  // region swap. SSR resolves the query per-request through the reader seam
  // (active because this module imports `@barefootjs/hono/app`), so the server
  // render of a `?sort=` / `?tag=` URL matches the client with no priming.
  const indexHandler = eventHandler(async (event) => {
    const tag = getQuery(event).tag as string | undefined
    const items = listItems
    const title = tag ? `#${tag} — Barefoot Blog` : 'Barefoot Blog — Latest posts'
    return renderPage(
      <BlogLayout base={base} manifest={manifest} title={title}>
        <PostList items={items} tags={allTags} base={blog} />
        {/* v1: the player also lives in the content region on the index, marked
            `data-bf-permanent`, so the router moves the same live node between
            the list and a post — it keeps playing instead of resetting on
            "← All posts". */}
        <NowPlaying />
      </BlogLayout>,
    )
  })
  router.get(blog, indexHandler)
  router.get(`${blog}/`, indexHandler)

  router.get(
    `${blog}/posts/:slug`,
    eventHandler(async (event) => {
      const slug = getRouterParam(event, 'slug')
      const nav = slug ? articleNav(slug) : undefined
      if (!nav) {
        setResponseStatus(event, 404)
        return 'Not found'
      }
      const { post: p, position, total, prev, next } = nav
      // The whole article is the shared <PostArticle> island (nested children:
      // LikeButton / ReadingTimer / NowPlaying), rendered from post data.
      return renderPage(
        <BlogLayout base={base} manifest={manifest} title={`${p.title} — Barefoot Blog`}>
          <PostArticle
            slug={p.slug}
            title={p.title}
            date={p.date}
            tags={p.tags}
            body={p.body}
            position={position}
            total={total}
            base={blog}
            prevSlug={prev?.slug}
            prevTitle={prev?.title}
            nextSlug={next?.slug}
            nextTitle={next?.title}
          />
        </BlogLayout>,
      )
    }),
  )
}
