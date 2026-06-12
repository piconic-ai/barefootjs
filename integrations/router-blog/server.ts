/**
 * Router-blog reference server (stress edition).
 *
 * A plain Hono server returning HTML strings — no JSX, no JSON envelope.
 * It demonstrates that `@barefootjs/router` needs nothing special from
 * the backend, and grows enough surface area to stress the router:
 *
 *   - 10 posts + tag filtering via `?tag=` (query-string navigation)
 *   - outlet-side islands (a like button + a "time on page" timer) so
 *     re-hydration and disposal have something real to act on
 *   - a `?delay=<ms>` knob to force slow responses for the rapid-fire race
 *
 * Each route hands a `body`/`title` to `respond()`, which returns the
 * full page; the router extracts `[bf-outlet]` client-side (no server
 * content-negotiation).
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import { BF_OUTLET } from '@barefootjs/shared'
import { posts, postIndex, allTags } from './posts.ts'

const app = new Hono()

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

interface Page {
  title: string
  body: string
}

function shell(page: Page): string {
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(page.title)}</title>
<style>${STYLES}</style>
</head>
<body>
  <header class="shell">
    <div class="shell-brand">📰 Barefoot Blog</div>
    <div class="shell-island">
      <span class="chip">⏱ uptime <b id="shell-uptime">0.0s</b></span>
      <span class="chip">🔀 partial navs <b id="shell-navs">0</b></span>
      <span class="chip">🔮 prefetched <b id="shell-prefetched">0</b></span>
      <span class="chip">📥 last nav <b id="shell-lastnav">—</b></span>
      <span class="chip">🧩 live islands <b id="shell-live">0</b></span>
      <button id="theme-toggle" class="toggle" type="button">🌙 dark</button>
    </div>
  </header>
  <main ${BF_OUTLET}>${page.body}</main>
  <script type="module" src="/app.js"></script>
</body>
</html>`
}

async function respond(c: Context, page: Page): Promise<Response> {
  const delay = Number(c.req.query('delay') ?? 0)
  if (delay > 0) await new Promise((r) => setTimeout(r, Math.min(delay, 3000)))

  // Always return the full page. The router extracts [bf-outlet] client-side
  // — no content-negotiation header (it would only shave compressible shell
  // markup while hurting cache efficiency).
  return c.html(shell(page))
}

function tagBar(active?: string): string {
  const chip = (label: string, href: string, on: boolean) =>
    `<a class="tag${on ? ' on' : ''}" href="${href}">${esc(label)}</a>`
  return `<div class="tags">
    ${chip('all', '/', !active)}
    ${allTags.map((t) => chip(`#${t}`, `/?tag=${encodeURIComponent(t)}`, t === active)).join('')}
  </div>`
}

function postCard(slug: string): string {
  const p = posts.find((x) => x.slug === slug)!
  return `<article class="card">
    <a class="card-link" href="/posts/${p.slug}">
      <h2>${esc(p.title)}</h2>
      <div class="meta">${esc(p.date)} · ${p.tags.map((t) => `#${esc(t)}`).join(' ')}</div>
      <p>${esc(p.excerpt)}</p>
      <span class="read">Read →</span>
    </a>
  </article>`
}

function indexBody(tag?: string): string {
  const list = tag ? posts.filter((p) => p.tags.includes(tag)) : posts
  return `<div class="content" data-page="index">
    <h1 class="page-title">${tag ? `Posts tagged #${esc(tag)}` : 'Latest posts'}</h1>
    <p class="lede">Click a post or a tag. Only this region swaps — the header above keeps its state.</p>
    ${tagBar(tag)}
    <div class="cards">${list.map((p) => postCard(p.slug)).join('') || '<p class="empty">No posts.</p>'}</div>
  </div>`
}

/** A post body, including two outlet islands the client hydrates/disposes. */
function postBody(slug: string): string {
  const i = postIndex(slug)
  const p = posts[i]
  const prev = posts[i - 1]
  const next = posts[i + 1]
  const paras = p.body.map((para) => `<p>${esc(para)}</p>`).join('')
  return `<article class="content post" data-page="post" data-slug="${esc(slug)}">
    <a class="back" href="/">← All posts</a>
    <h1 class="page-title">${esc(p.title)}</h1>
    <div class="meta">${esc(p.date)} · post ${i + 1} of ${posts.length} · ${p.tags.map((t) => `<a class="tag-inline" href="/?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join(' ')}</div>
    <div class="islands">
      <button class="island like" data-island="like" data-id="${esc(slug)}:like" type="button">♥ <span class="v">0</span></button>
      <span class="island timer" data-island="timer" data-id="${esc(slug)}:timer">⏱ <span class="v">0.0</span>s on this page</span>
    </div>
    <div class="prose">${paras}</div>
    <nav class="pager">
      ${prev ? `<a id="prev-post" class="pager-link" href="/posts/${prev.slug}">← ${esc(prev.title)}</a>` : `<span class="pager-link disabled">← Start</span>`}
      ${next ? `<a id="next-post" class="pager-link next" href="/posts/${next.slug}">${esc(next.title)} →</a>` : `<a id="next-post" class="pager-link next" href="/">Back to start →</a>`}
    </nav>
  </article>`
}

app.get('/', (c) => {
  const tag = c.req.query('tag')
  const title = tag ? `#${tag} — Barefoot Blog` : 'Barefoot Blog — Latest posts'
  return respond(c, { title, body: indexBody(tag) })
})

app.get('/posts/:slug', (c) => {
  const slug = c.req.param('slug')
  if (postIndex(slug) < 0) return c.notFound()
  const p = posts.find((x) => x.slug === slug)!
  return respond(c, { title: `${p.title} — Barefoot Blog`, body: postBody(slug) })
})

app.get('/favicon.ico', (c) => c.body(null, 204))

app.get('/app.js', () =>
  new Response(Bun.file(new URL('./public/entry.js', import.meta.url)), {
    headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
  }),
)

const STYLES = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html[data-theme="light"] { color-scheme: light; }
  body { margin: 0; font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #0e1116; color: #e6edf3; }
  html[data-theme="light"] body { background: #f6f8fa; color: #1f2328; }
  .shell { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 24px; background: #161b22; border-bottom: 1px solid #30363d; }
  html[data-theme="light"] .shell { background: #fff; border-bottom-color: #d0d7de; }
  .shell-brand { font-weight: 700; font-size: 18px; }
  .shell-island { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; gap: 6px; background: #0d1117; border: 1px solid #30363d; border-radius: 999px; padding: 5px 12px; font-size: 13px; color: #9aa7b4; }
  html[data-theme="light"] .chip { background: #f6f8fa; border-color: #d0d7de; color: #57606a; }
  .chip b { color: #58a6ff; font-variant-numeric: tabular-nums; }
  .toggle { cursor: pointer; background: #0d1117; border: 1px solid #30363d; color: #e6edf3; border-radius: 999px; padding: 5px 12px; font-size: 13px; }
  html[data-theme="light"] .toggle { background: #f6f8fa; border-color: #d0d7de; color: #1f2328; }
  main { display: block; max-width: 760px; margin: 0 auto; padding: 32px 24px 80px; }
  .page-title { font-size: 28px; margin: 0 0 6px; }
  .lede, .meta { color: #8b949e; }
  html[data-theme="light"] .lede, html[data-theme="light"] .meta { color: #57606a; }
  .meta { font-size: 13px; margin-bottom: 12px; }
  .lede { margin: 0 0 18px; }
  .tags { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 22px; }
  .tag, .tag-inline { text-decoration: none; font-size: 13px; color: #9aa7b4; }
  .tag { border: 1px solid #30363d; border-radius: 999px; padding: 4px 11px; }
  .tag.on { background: #1f6feb; border-color: #1f6feb; color: #fff; }
  .tag-inline { color: #58a6ff; }
  .cards { display: grid; gap: 14px; }
  .card { border: 1px solid #30363d; border-radius: 12px; background: #161b22; transition: border-color .15s, transform .15s; }
  html[data-theme="light"] .card { background: #fff; border-color: #d0d7de; }
  .card:hover { border-color: #58a6ff; transform: translateY(-2px); }
  .card-link { display: block; padding: 18px 20px; color: inherit; text-decoration: none; }
  .card h2 { margin: 0 0 4px; font-size: 19px; }
  .card p { margin: 8px 0 10px; color: #c9d1d9; }
  html[data-theme="light"] .card p { color: #424a53; }
  .read { color: #58a6ff; font-weight: 600; font-size: 14px; }
  /* prefetch visualization: hovered (prefetched) links get a "ready" badge */
  .card-link[data-prefetched] { border-radius: 12px; box-shadow: inset 0 0 0 1px #f2cc60aa; }
  .card-link[data-prefetched] .read::after { content: ' ⚡ ready'; color: #f2cc60; }
  .pager-link[data-prefetched]::after { content: ' ⚡'; color: #f2cc60; }
  #shell-lastnav { color: #f2cc60; }
  .islands { display: flex; gap: 12px; align-items: center; margin: 4px 0 22px; }
  .island { font-size: 14px; }
  .island.like { cursor: pointer; background: #161b22; border: 1px solid #30363d; color: #f778ba; border-radius: 8px; padding: 6px 12px; }
  html[data-theme="light"] .island.like { background: #fff; border-color: #d0d7de; }
  .island.timer { color: #8b949e; font-variant-numeric: tabular-nums; }
  .post .prose p { margin: 0 0 18px; color: #d8e0e8; }
  html[data-theme="light"] .post .prose p { color: #424a53; }
  .back { display: inline-block; margin-bottom: 14px; color: #58a6ff; text-decoration: none; font-size: 14px; }
  .pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 32px; padding-top: 18px; border-top: 1px solid #30363d; }
  .pager-link { color: #58a6ff; text-decoration: none; font-weight: 600; font-size: 14px; max-width: 46%; }
  .pager-link.next { text-align: right; margin-left: auto; }
  .pager-link.disabled { color: #6e7681; }
`

export default { port: 8787, fetch: app.fetch }
