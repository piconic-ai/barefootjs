/**
 * Router-blog reference server.
 *
 * A plain Bun + Hono server that renders full HTML pages with real,
 * compiled BarefootJS `"use client"` islands. It needs nothing special
 * from the backend: every route returns the complete document and
 * `@barefootjs/router` extracts `[bf-outlet]` client-side — no
 * content-negotiation header, no route table.
 *
 *   - `/`            the post index (a reactive `searchParams()` list)
 *   - `/posts/:slug` a post page with two outlet islands (♥ like + ⏱ timer)
 *   - `/static/*`    the compiled bundles (barefoot.js, *.client.js, …)
 */
import { Hono } from 'hono'
import { renderer } from './renderer'
import { posts, postIndex, allTags } from './posts'
import { LikeButton } from '@/components/LikeButton'
import { ReadingTimer } from '@/components/ReadingTimer'
import { PostList } from '@/components/PostList'
import { setSearch } from '@barefootjs/router/signals'

const app = new Hono()

app.use('*', renderer)

// Index — the post list reacts to ?sort= / ?tag= via searchParams() with no
// outlet swap. The signal has no SSR request-awareness of its own, so we prime
// it from the request URL before rendering (see README "searchParams + SSR").
app.get('/', (c) => {
  const tag = c.req.query('tag')
  const sort = c.req.query('sort') ?? 'date'
  const search = new URL(c.req.url).search
  setSearch(search)
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
  const path = new URL(`./dist/components/${file}`, import.meta.url)
  const f = Bun.file(path)
  if (!(await f.exists())) return c.notFound()
  const type = file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream'
  return new Response(f, { headers: { 'Content-Type': type } })
})

app.get('/favicon.ico', (c) => c.body(null, 204))

export default { port: Number(process.env.PORT ?? 8788), fetch: app.fetch }
