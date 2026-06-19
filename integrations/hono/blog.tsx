/**
 * Blog routes for the Hono integration — the `@barefootjs/router` showcase.
 *
 * A sub-app mounted at `/blog` (under the integration's BASE_PATH) with its own
 * region-shell layout, so it doesn't share the catalog renderer. The islands are
 * the shared blog components in `../shared/blog`, compiled by this integration's
 * `bf build`; `client/router-entry.ts` (bundled to `router-entry.js`) boots the
 * client router. Links are base-path aware via `BASE`, so the same shared
 * components work under any adapter's mount point.
 */
import { Hono } from 'hono'
import { jsxRenderer } from 'hono/jsx-renderer'
import { BfScripts } from '@barefootjs/hono/scripts'
import { Sidebar } from '@/components/Sidebar'
import { PageShell } from '@/components/PageShell'
import { ThemeToggle } from '@/components/ThemeToggle'
import { NowPlaying } from '@/components/NowPlaying'
import { PostList } from '@/components/PostList'
import { PostArticle } from '@/components/PostArticle'
import { allTags, listItems, articleNav } from '../shared/blog/posts'

const BASE_PATH = process.env.BASE_PATH ?? '/integrations/hono'
const STATIC = `${BASE_PATH}/static/components`
/** Where the blog is mounted; every link is built relative to this. */
const BASE = `${BASE_PATH}/blog`

// `searchParams()` lives in the single physical `@barefootjs/client/reactive`
// module re-exported by every `@barefootjs/client*` entry, so the island and the
// router bootstrap share ONE signal instance just by resolving the bare
// specifiers to the same `barefoot.js`.
const importMap = JSON.stringify({
  imports: {
    '@barefootjs/client': `${STATIC}/barefoot.js`,
    '@barefootjs/client/runtime': `${STATIC}/barefoot.js`,
    '@barefootjs/client/reactive': `${STATIC}/barefoot.js`,
  },
})

const blogRenderer = jsxRenderer(({ children, title }) => {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title ?? 'Barefoot Blog'}</title>
        <script type="importmap" dangerouslySetInnerHTML={{ __html: importMap }} />
        <link rel="stylesheet" href={`${BASE_PATH}/shared/styles/blog.css`} />
      </head>
      <body>
        <header className="shell">
          <a className="shell-brand" href={BASE}>📰 Barefoot Blog</a>
          <div className="shell-island">
            <ThemeToggle />
          </div>
        </header>
        {/*
          Two ways to author a region, side by side. The sidebar's
          `bf-region="nav:0"` is hand-written (this is a plain Hono template, not
          a `bf build`-compiled tree, so `<Region>` would not lower here). The
          content area is a compiled `<PageShell>` whose nested `<Region>`s the
          compiler lowers to deterministic `bf-region="<file scope>:<index>"` ids.
          The router matches both by string equality.
        */}
        <div className="layout">
          <aside bf-region="nav:0">
            <Sidebar />
          </aside>
          <main>
            <PageShell>{children}</PageShell>
          </main>
        </div>
        <BfScripts />
        <script type="module" src={`${STATIC}/router-entry.js`} />
      </body>
    </html>
  )
})

export const blog = new Hono()
blog.use(blogRenderer)

// Index — the post list reacts to ?sort= / ?tag= via searchParams() with no
// region swap. SSR resolves the query per-request through the Hono adapter's
// auto-wired reader seam (active because the catalog renderer imports
// `@barefootjs/hono/app`), so the server render of a `?sort=` / `?tag=` URL
// matches the client with no manual priming.
blog.get('/', (c) => {
  const tag = c.req.query('tag')
  const items = listItems
  const title = tag ? `#${tag} — Barefoot Blog` : 'Barefoot Blog — Latest posts'
  return c.render(
    <>
      <PostList items={items} tags={allTags} base={BASE} />
      {/* v1: the player also lives in the content region on the index, marked
          `data-bf-permanent`, so the router moves the same live node between the
          list and a post — it keeps playing instead of resetting on "← All posts". */}
      <NowPlaying />
    </>,
    { title },
  )
})

blog.get('/posts/:slug', (c) => {
  const slug = c.req.param('slug')
  const nav = articleNav(slug)
  if (!nav) return c.notFound()
  const { post: p, position, total, prev, next } = nav
  // The whole article is the shared <PostArticle> island (its nested children
  // are LikeButton / ReadingTimer / NowPlaying), so every adapter renders the
  // same markup from post data instead of hand-authoring it.
  return c.render(
    <PostArticle
      slug={p.slug}
      title={p.title}
      date={p.date}
      tags={p.tags}
      body={p.body}
      position={position}
      total={total}
      base={BASE}
      prevSlug={prev?.slug}
      prevTitle={prev?.title}
      nextSlug={next?.slug}
      nextTitle={next?.title}
    />,
    { title: `${p.title} — Barefoot Blog` },
  )
})
