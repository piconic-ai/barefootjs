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

import { BfScripts } from '@barefootjs/hono/app'
import type { BarefootBuildManifest } from '@barefootjs/hono/app'
import { Sidebar } from '@/components/Sidebar'
import { PageShell } from '@/components/PageShell'
import { ThemeToggle } from '@/components/ThemeToggle'
import { NowPlaying } from '@/components/NowPlaying'
import { PostList } from '@/components/PostList'
import { PostArticle } from '@/components/PostArticle'
import { posts, postIndex, allTags, listItems } from '../shared/blog/posts'

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
  // `/reactive` (same as the Hono / h3 integrations).
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
        {/* Elysia has no per-page script collector, so BfScripts emits every
            island in the manifest (the same way every other Elysia page does);
            the router bootstrap is appended once. */}
        <BfScripts base={componentsBase} manifest={manifest} />
        <script type="module" src={`${componentsBase}/router-entry.js`} />
      </body>
    </html>
  )
}

/** Index page node — the post list reacts to ?sort= / ?tag= via searchParams(). */
export function renderBlogIndex(base: string, manifest: BarefootBuildManifest, tag?: string) {
  const blog = `${base}/blog`
  const items = listItems
  const title = tag ? `#${tag} — Barefoot Blog` : 'Barefoot Blog — Latest posts'
  return (
    <BlogLayout base={base} manifest={manifest} title={title}>
      <PostList items={items} tags={allTags} base={blog} />
      {/* v1: the player also lives in the content region on the index, marked
          `data-bf-permanent`, so the router moves the same live node between the
          list and a post — it keeps playing instead of resetting on "← All posts". */}
      <NowPlaying />
    </BlogLayout>
  )
}

/** Post page node, or `null` when the slug is unknown (caller returns 404). */
export function renderBlogPost(base: string, manifest: BarefootBuildManifest, slug: string) {
  const i = postIndex(slug)
  if (i < 0) return null
  const blog = `${base}/blog`
  const p = posts[i]
  const prev = posts[i - 1]
  const next = posts[i + 1]
  // The whole article is the shared <PostArticle> island (nested children:
  // LikeButton / ReadingTimer / NowPlaying), rendered from post data.
  return (
    <BlogLayout base={base} manifest={manifest} title={`${p.title} — Barefoot Blog`}>
      <PostArticle
        slug={p.slug}
        title={p.title}
        date={p.date}
        tags={p.tags}
        body={p.body}
        position={i + 1}
        total={posts.length}
        base={blog}
        prevSlug={prev?.slug}
        prevTitle={prev?.title}
        nextSlug={next?.slug}
        nextTitle={next?.title}
      />
    </BlogLayout>
  )
}
