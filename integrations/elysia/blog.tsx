/** @jsxImportSource @barefootjs/hono/jsx */
//
// Blog routes for the Elysia integration — the `@barefootjs/router` showcase.
//
// Phase 4 of running the blog across every adapter (phase 2 → Hono #1933,
// phase 3 → h3 #1935), over the same `shared/blog` components. Like h3, Elysia
// is just the HTTP host with no `jsxRenderer`: this module exports the
// region-shell `BlogLayout` plus two JSX builders, and `server.tsx` wires them
// into the Elysia route chain (kept inline so the blog never introduces a
// second adapter instance — the Cloudflare adapter compiles one app). The
// islands are the shared blog components in `../shared/blog`, compiled into
// `dist/components` by this integration's `bf build`; links are base-path aware,
// so the same shared components work under any adapter's mount point.
//
// `searchParams()` SSR rides the adapter's existing reader seam: the whole
// fetch runs inside `withRequestEnv` (see server.tsx), so the index render of a
// `?sort=` / `?tag=` URL resolves the query per-request with no manual priming.

import { Sidebar } from '@/components/Sidebar'
import { PageShell } from '@/components/PageShell'
import { ThemeToggle } from '@/components/ThemeToggle'
import { NowPlaying } from '@/components/NowPlaying'
import { PostList } from '@/components/PostList'
import { PostArticle } from '@/components/PostArticle'
import { allTags, listItems, articleNav } from '../shared/blog/posts'
import { Assets } from './dist/bf-assets'
import { ComponentScripts } from './renderer'

interface LayoutProps {
  base: string
  title?: string
  children?: unknown
}

// No import map: `searchParams()` lives in the single physical
// `@barefootjs/client/reactive` module every `@barefootjs/client*` entry
// re-exports, so the island and the router bootstrap share ONE signal
// instance simply because Rollup bundles both through the same real module
// graph into one shared chunk — no specifier redirection needed (same
// conclusion gin/hono already proved).
function BlogLayout({ base, title, children }: LayoutProps) {
  const blog = `${base}/blog`
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ?? 'Barefoot Blog'}</title>
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
        {/* Elysia has no per-page script collector, so every discovered
            client component's script loads unconditionally (the same way
            every other Elysia page does — see renderer.tsx); the router
            bootstrap is appended once. */}
        <ComponentScripts />
        <script type="module" src={Assets.RouterEntry} />
      </body>
    </html>
  )
}

/** Index page node — the post list reacts to ?sort= / ?tag= via searchParams(). */
export function renderBlogIndex(base: string, tag?: string) {
  const blog = `${base}/blog`
  const items = listItems
  const title = tag ? `#${tag} — Barefoot Blog` : 'Barefoot Blog — Latest posts'
  return (
    <BlogLayout base={base} title={title}>
      <PostList items={items} tags={allTags} base={blog} />
      {/* v1: the player also lives in the content region on the index, marked
          `data-bf-permanent`, so the router moves the same live node between the
          list and a post — it keeps playing instead of resetting on "← All posts". */}
      <NowPlaying />
    </BlogLayout>
  )
}

/** Post page node, or `null` when the slug is unknown (caller returns 404). */
export function renderBlogPost(base: string, slug: string) {
  const nav = articleNav(slug)
  if (!nav) return null
  const blog = `${base}/blog`
  const { post: p, position, total, prev, next } = nav
  // The whole article is the shared <PostArticle> island (nested children:
  // LikeButton / ReadingTimer / NowPlaying), rendered from post data.
  return (
    <BlogLayout base={base} title={`${p.title} — Barefoot Blog`}>
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
    </BlogLayout>
  )
}
