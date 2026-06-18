/**
 * Router-blog reference server.
 *
 * A plain Bun + Hono server that renders full HTML pages with real,
 * compiled BarefootJS `"use client"` islands. It needs nothing special
 * from the backend: every route returns the complete document and
 * `@barefootjs/router` extracts the `[bf-region]` content client-side — no
 * content-negotiation header, no route table.
 *
 *   - `/`            the post index (a reactive `searchParams()` list)
 *   - `/posts/:slug` a post page with three region islands (♥ like, ⏱ timer,
 *                    and a ▶ NowPlaying mini-player marked `data-bf-permanent`
 *                    so its live node + state survive a post→post swap, v1)
 *   - `/static/*`    the compiled bundles (barefoot.js, *.client.js, …)
 */
import { basename } from 'node:path'
import { Hono } from 'hono'
// Side-effect import: auto-wires request-scoped `searchParams()` for SSR
// (the keyed `globalThis.__bf_serverEnvReader` seam, resolved per-request via
// Hono's `useRequestContext`), so the initial server render of `?sort=` /
// `?tag=` matches what the client signal reads — no manual priming needed.
import '@barefootjs/hono/app'
import { renderer } from './renderer'
import { posts, postIndex, allTags } from '../shared/components/blog/posts'
import { LikeButton } from '@/components/LikeButton'
import { ReadingTimer } from '@/components/ReadingTimer'
import { NowPlaying } from '@/components/NowPlaying'
import { PostList } from '@/components/PostList'

const app = new Hono()

app.use('*', renderer)

// Index — the post list reacts to ?sort= / ?tag= via searchParams() with no
// region swap. SSR resolves the query per-request through the auto-wired
// `__bf_serverEnvReader` seam (imported above), so the server render of a
// `?sort=` / `?tag=` URL matches the client with no manual priming.
app.get('/', (c) => {
  const tag = c.req.query('tag')
  const items = posts.map((p) => ({ slug: p.slug, title: p.title, date: p.date, tags: p.tags }))
  const title = tag ? `#${tag} — Barefoot Blog` : 'Barefoot Blog — Latest posts'
  return c.render(<PostList items={items} tags={allTags} />, { title })
})

app.get('/posts/:slug', (c) => {
  const slug = c.req.param('slug')
  const i = postIndex(slug)
  if (i < 0) return c.notFound()
  const p = posts[i]
  const prev = posts[i - 1]
  const next = posts[i + 1]
  return c.render(
    <article className="post" data-slug={p.slug}>
      <a className="back" href="/">← All posts</a>
      <h1 className="page-title">{p.title}</h1>
      <div className="meta">
        {p.date} · post {i + 1} of {posts.length} ·{' '}
        {p.tags.map((t) => (
          <a className="tag-inline" href={`/?tag=${encodeURIComponent(t)}`}>#{t} </a>
        ))}
      </div>
      <div className="islands">
        <LikeButton />
        <ReadingTimer />
        {/* v1: marked `data-bf-permanent` (in NowPlaying's root), so its LIVE
            node — and its play state + elapsed time — is moved into the next
            post instead of disposed/recreated. Contrast ReadingTimer above,
            which resets every swap. */}
        <NowPlaying />
      </div>
      <div className="prose">
        {p.body.map((para) => (
          <p>{para}</p>
        ))}
      </div>
      <nav className="pager">
        {prev ? (
          <a className="pager-link" href={`/posts/${prev.slug}`}>← {prev.title}</a>
        ) : (
          <span className="pager-link disabled">← Start</span>
        )}
        {next ? (
          <a className="pager-link next" href={`/posts/${next.slug}`}>{next.title} →</a>
        ) : (
          <a className="pager-link next" href="/">Back to start →</a>
        )}
      </nav>
    </article>,
    { title: `${p.title} — Barefoot Blog` },
  )
})

// Serve the compiled bundles from ./dist/components at /static/components/*.
app.get('/static/components/:file', async (c) => {
  const file = c.req.param('file')
  // Only ever serve a plain filename out of dist/components — reject anything
  // with a path separator or `..` so the segment can't escape the directory
  // (path traversal). The bundles are flat, so a basename is all we need.
  if (file !== basename(file) || file === '..') return c.notFound()
  const path = new URL(`./dist/components/${file}`, import.meta.url)
  const f = Bun.file(path)
  if (!(await f.exists())) return c.notFound()
  const type = file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream'
  return new Response(f, { headers: { 'Content-Type': type } })
})

app.get('/favicon.ico', (c) => c.body(null, 204))

export default { port: Number(process.env.PORT ?? 8788), fetch: app.fetch }
