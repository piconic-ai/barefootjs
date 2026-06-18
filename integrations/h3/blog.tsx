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
import { LikeButton } from '@/components/LikeButton'
import { ReadingTimer } from '@/components/ReadingTimer'
import { NowPlaying } from '@/components/NowPlaying'
import { PostList } from '@/components/PostList'
import { posts, postIndex, allTags } from '../shared/blog/posts'

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
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
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
    const items = posts.map((p) => ({ slug: p.slug, title: p.title, date: p.date, tags: p.tags }))
    const title = tag ? `#${tag} — Barefoot Blog` : 'Barefoot Blog — Latest posts'
    return renderPage(
      <BlogLayout base={base} manifest={manifest} title={title}>
        <PostList items={items} tags={allTags} base={blog} />
      </BlogLayout>,
    )
  })
  router.get(blog, indexHandler)
  router.get(`${blog}/`, indexHandler)

  router.get(
    `${blog}/posts/:slug`,
    eventHandler(async (event) => {
      const slug = getRouterParam(event, 'slug')
      const i = slug ? postIndex(slug) : -1
      if (i < 0) {
        setResponseStatus(event, 404)
        return 'Not found'
      }
      const p = posts[i]
      const prev = posts[i - 1]
      const next = posts[i + 1]
      return renderPage(
        <BlogLayout base={base} manifest={manifest} title={`${p.title} — Barefoot Blog`}>
          <article className="post" data-slug={p.slug}>
            <a className="back" href={blog}>← All posts</a>
            <h1 className="page-title">{p.title}</h1>
            <div className="meta">
              {p.date} · post {i + 1} of {posts.length} ·{' '}
              {p.tags.map((t) => (
                <a className="tag-inline" href={`${blog}?tag=${encodeURIComponent(t)}`}>#{t} </a>
              ))}
            </div>
            <div className="islands">
              <LikeButton />
              <ReadingTimer />
            </div>
            {/* v1: a docked "Now playing" bar. It reads as a global player but
                lives in the swappable content region marked `data-bf-permanent`,
                so the router moves its live node (play state + progress) into the
                next post instead of disposing it — contrast ReadingTimer above,
                which resets. */}
            <NowPlaying />
            <div className="prose">
              {p.body.map((para) => (
                <p>{para}</p>
              ))}
            </div>
            <nav className="pager">
              {prev ? (
                <a className="pager-link" href={`${blog}/posts/${prev.slug}`}>← {prev.title}</a>
              ) : (
                <span className="pager-link disabled">← Start</span>
              )}
              {next ? (
                <a className="pager-link next" href={`${blog}/posts/${next.slug}`}>{next.title} →</a>
              ) : (
                <a className="pager-link next" href={blog}>Back to start →</a>
              )}
            </nav>
          </article>
        </BlogLayout>,
      )
    }),
  )
}

const STYLES = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html[data-theme="light"] { color-scheme: light; }
  body { margin: 0; font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #0e1116; color: #e6edf3; }
  html[data-theme="light"] body { background: #f6f8fa; color: #1f2328; }
  a { color: #58a6ff; }
  .shell { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 24px; background: #161b22; border-bottom: 1px solid #30363d; }
  html[data-theme="light"] .shell { background: #fff; border-bottom-color: #d0d7de; }
  .shell-brand { font-weight: 700; font-size: 18px; text-decoration: none; color: inherit; }
  .shell-island { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .toggle { cursor: pointer; background: #0d1117; border: 1px solid #30363d; color: #e6edf3; border-radius: 999px; padding: 5px 12px; font-size: 13px; }
  html[data-theme="light"] .toggle { background: #f6f8fa; border-color: #d0d7de; color: #1f2328; }
  .layout { display: flex; gap: 28px; align-items: flex-start; max-width: 1000px; margin: 0 auto; padding: 32px 24px 80px; }
  .layout main { flex: 1; min-width: 0; }
  .layout aside { position: sticky; top: 78px; width: 210px; flex: none; }
  html[data-theme="light"] .sidebar { background: #fff; border-color: #d0d7de; }
  .sidebar { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 16px; }
  .sidebar-title { font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #8b949e; margin-bottom: 12px; }
  .sidebar-pin { cursor: pointer; width: 100%; background: #0d1117; border: 1px solid #30363d; color: #f2cc60; border-radius: 8px; padding: 8px 12px; font-size: 14px; font-variant-numeric: tabular-nums; }
  html[data-theme="light"] .sidebar-pin { background: #f6f8fa; border-color: #d0d7de; }
  .sidebar-note { font-size: 12px; color: #6e7681; margin: 12px 0 0; }
  @media (max-width: 720px) { .layout { flex-direction: column; } .layout aside { position: static; width: 100%; } }
  .page-title { font-size: 28px; margin: 0 0 6px; }
  .lede, .meta { color: #8b949e; }
  html[data-theme="light"] .lede, html[data-theme="light"] .meta { color: #57606a; }
  .meta { font-size: 13px; margin-bottom: 12px; }
  .lede { margin: 0 0 18px; }
  .controls, .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
  .ctl-label { font-size: 13px; color: #6e7681; }
  .tag, .tag-inline, .sort { text-decoration: none; font-size: 13px; color: #9aa7b4; }
  .tag, .sort { border: 1px solid #30363d; border-radius: 999px; padding: 4px 11px; }
  .tag.on, .sort.on { background: #1f6feb; border-color: #1f6feb; color: #fff; }
  .tag-inline { color: #58a6ff; }
  .status { font-size: 13px; color: #8b949e; margin-bottom: 12px; min-height: 1.2em; font-variant-numeric: tabular-nums; }
  .sortable-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .sortable-list li { display: flex; align-items: center; gap: 10px; border: 1px solid #30363d; border-radius: 10px; background: #161b22; padding: 10px 14px; }
  html[data-theme="light"] .sortable-list li { background: #fff; border-color: #d0d7de; }
  .sortable-list li.pinned { border-color: #f2cc60; box-shadow: inset 3px 0 0 #f2cc60; }
  .pin { cursor: pointer; background: none; border: none; font-size: 16px; color: #f2cc60; padding: 0; line-height: 1; }
  .item-link { color: #e6edf3; text-decoration: none; font-weight: 600; font-size: 15px; }
  html[data-theme="light"] .item-link { color: #1f2328; }
  .item-link:hover { color: #58a6ff; }
  .item-meta { margin-left: auto; font-size: 12px; color: #6e7681; }
  .islands { display: flex; gap: 12px; align-items: center; margin: 4px 0 22px; }
  .island { font-size: 14px; }
  .island.like { cursor: pointer; background: #161b22; border: 1px solid #30363d; color: #f778ba; border-radius: 8px; padding: 6px 12px; }
  html[data-theme="light"] .island.like { background: #fff; border-color: #d0d7de; }
  .island.timer { color: #8b949e; font-variant-numeric: tabular-nums; }
  .now-playing-bar { position: fixed; left: 50%; transform: translateX(-50%); bottom: 18px; z-index: 50; display: inline-flex; align-items: center; gap: 12px; background: #161b22; border: 1px solid #30363d; border-radius: 999px; padding: 8px 16px; box-shadow: 0 8px 28px rgba(0,0,0,.45); color: #3fb950; font-size: 13px; font-variant-numeric: tabular-nums; }
  html[data-theme="light"] .now-playing-bar { background: #fff; border-color: #d0d7de; box-shadow: 0 8px 28px rgba(140,149,159,.35); }
  .np-toggle { cursor: pointer; background: none; border: none; color: inherit; font-size: 15px; padding: 0; line-height: 1; }
  .np-title { color: #8b949e; }
  .np-bar { display: inline-block; width: 120px; height: 6px; background: #30363d; border-radius: 999px; overflow: hidden; }
  html[data-theme="light"] .np-bar { background: #d0d7de; }
  .np-fill { display: block; height: 100%; background: #3fb950; transition: width .1s linear; }
  .reader-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; padding: 6px 12px; border: 1px solid #30363d; border-radius: 8px; background: #161b22; font-size: 13px; color: #8b949e; }
  html[data-theme="light"] .reader-toolbar { background: #fff; border-color: #d0d7de; }
  .rt-label { text-transform: uppercase; letter-spacing: .04em; font-size: 11px; }
  .rt-btn { cursor: pointer; background: #0d1117; border: 1px solid #30363d; color: #e6edf3; border-radius: 6px; padding: 2px 8px; font-size: 12px; }
  html[data-theme="light"] .rt-btn { background: #f6f8fa; border-color: #d0d7de; color: #1f2328; }
  .rt-level { color: #58a6ff; font-variant-numeric: tabular-nums; min-width: 1ch; text-align: center; }
  .prose p { margin: 0 0 18px; color: #d8e0e8; }
  html[data-theme="light"] .prose p { color: #424a53; }
  .back { display: inline-block; margin-bottom: 14px; text-decoration: none; font-size: 14px; }
  .pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 32px; padding-top: 18px; border-top: 1px solid #30363d; }
  .pager-link { color: #58a6ff; text-decoration: none; font-weight: 600; font-size: 14px; max-width: 46%; }
  .pager-link.next { text-align: right; margin-left: auto; }
  .pager-link.disabled { color: #6e7681; }
`
