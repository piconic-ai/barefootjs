/**
 * Router-blog reference server.
 *
 * A plain Hono server that returns HTML strings — no JSX, no JSON
 * envelope, no build-time route manifest. It demonstrates that
 * `@barefootjs/router` needs nothing special from the backend.
 *
 * Each route builds a content `body` and hands it to `respond()`, which:
 *   - returns the FULL page on a normal request, and
 *   - returns just the `<main bf-outlet>` fragment (plus a `<title>`)
 *     when the router's `X-Barefoot-Navigate` header is present, to cut
 *     payload. Both shapes are valid input to the router.
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import { BF_OUTLET, BF_NAVIGATE_HEADER } from '@barefootjs/shared'
import { posts, postIndex } from './posts.ts'

const app = new Hono()

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

interface Page {
  title: string
  body: string
}

function shell(page: Page): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(page.title)}</title>
<style>${STYLES}</style>
</head>
<body>
  <header class="shell">
    <div class="shell-brand">📰 Barefoot Blog</div>
    <div class="shell-island" title="This header is never reloaded — its state survives every navigation.">
      <span class="chip">⏱ uptime <b id="shell-uptime">0.0s</b></span>
      <span class="chip">🔀 partial navs <b id="shell-navs">0</b></span>
      <span class="shell-note">shell stays mounted ↓</span>
    </div>
  </header>
  <main ${BF_OUTLET}>${page.body}</main>
  <script type="module" src="/app.js"></script>
</body>
</html>`
}

function respond(c: Context, page: Page): Response {
  if (c.req.header(BF_NAVIGATE_HEADER)) {
    // Payload-optimized partial response: only the outlet + a title.
    c.header('Vary', BF_NAVIGATE_HEADER)
    return c.html(`<title>${esc(page.title)}</title><main ${BF_OUTLET}>${page.body}</main>`)
  }
  return c.html(shell(page))
}

function postCard(slug: string): string {
  const p = posts.find((x) => x.slug === slug)!
  return `<article class="card">
    <a class="card-link" href="/posts/${p.slug}">
      <h2>${esc(p.title)}</h2>
      <div class="meta">${esc(p.date)}</div>
      <p>${esc(p.excerpt)}</p>
      <span class="read">Read →</span>
    </a>
  </article>`
}

function indexBody(): string {
  return `<div class="content">
    <h1 class="page-title">Latest posts</h1>
    <p class="lede">Click a post. Only this region swaps — the header above keeps ticking.</p>
    <div class="cards">${posts.map((p) => postCard(p.slug)).join('')}</div>
  </div>`
}

function postBody(slug: string): string {
  const i = postIndex(slug)
  const p = posts[i]
  const prev = posts[i - 1]
  const next = posts[i + 1]
  const paras = p.body.map((para) => `<p>${esc(para)}</p>`).join('')
  return `<article class="content post">
    <a class="back" href="/">← All posts</a>
    <h1 class="page-title">${esc(p.title)}</h1>
    <div class="meta">${esc(p.date)} · post ${i + 1} of ${posts.length}</div>
    <div class="prose">${paras}</div>
    <nav class="pager">
      ${prev ? `<a id="prev-post" class="pager-link" href="/posts/${prev.slug}">← ${esc(prev.title)}</a>` : `<span class="pager-link disabled">← Start</span>`}
      ${next ? `<a id="next-post" class="pager-link next" href="/posts/${next.slug}">${esc(next.title)} →</a>` : `<a id="next-post" class="pager-link next" href="/">Back to start →</a>`}
    </nav>
  </article>`
}

app.get('/', (c) => respond(c, { title: 'Barefoot Blog — Latest posts', body: indexBody() }))

app.get('/posts/:slug', (c) => {
  const slug = c.req.param('slug')
  if (postIndex(slug) < 0) return c.notFound()
  const p = posts.find((x) => x.slug === slug)!
  return respond(c, { title: `${p.title} — Barefoot Blog`, body: postBody(slug) })
})

app.get('/app.js', () =>
  new Response(Bun.file(new URL('./public/entry.js', import.meta.url)), {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
  }),
)

const STYLES = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: #0e1116; color: #e6edf3;
  }
  .shell {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 14px 24px; background: #161b22; border-bottom: 1px solid #30363d;
    box-shadow: 0 1px 0 rgba(0,0,0,.4);
  }
  .shell-brand { font-weight: 700; font-size: 18px; letter-spacing: .2px; }
  .shell-island { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: #0d1117; border: 1px solid #30363d; border-radius: 999px;
    padding: 5px 12px; font-size: 13px; color: #9aa7b4;
  }
  .chip b { color: #58a6ff; font-variant-numeric: tabular-nums; }
  .shell-note { font-size: 12px; color: #6e7681; }
  main { display: block; max-width: 760px; margin: 0 auto; padding: 36px 24px 80px; }
  .page-title { font-size: 30px; margin: 0 0 6px; }
  .lede, .meta { color: #8b949e; }
  .meta { font-size: 13px; margin-bottom: 4px; }
  .lede { margin: 0 0 24px; }
  .cards { display: grid; gap: 16px; }
  .card { border: 1px solid #30363d; border-radius: 12px; background: #161b22; transition: border-color .15s, transform .15s; }
  .card:hover { border-color: #58a6ff; transform: translateY(-2px); }
  .card-link { display: block; padding: 20px 22px; color: inherit; text-decoration: none; }
  .card h2 { margin: 0 0 4px; font-size: 20px; }
  .card p { margin: 8px 0 10px; color: #c9d1d9; }
  .read { color: #58a6ff; font-weight: 600; font-size: 14px; }
  .post .prose p { margin: 0 0 18px; color: #d8e0e8; }
  .back { display: inline-block; margin-bottom: 18px; color: #58a6ff; text-decoration: none; font-size: 14px; }
  .pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 36px; padding-top: 20px; border-top: 1px solid #30363d; }
  .pager-link { color: #58a6ff; text-decoration: none; font-weight: 600; font-size: 14px; max-width: 46%; }
  .pager-link.next { text-align: right; margin-left: auto; }
  .pager-link.disabled { color: #6e7681; }
`

export default { port: 8787, fetch: app.fetch }
