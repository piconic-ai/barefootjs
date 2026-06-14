export interface BlogPost {
  slug: string
  title: string
  summary: string
  body: string
}

export const posts: BlogPost[] = [
  { slug: 'first-route', title: 'The first route', summary: 'Why ordinary links are enough.', body: 'Barefoot Router progressively enhances normal server-rendered links.' },
  { slug: 'persistent-shell', title: 'A persistent shell', summary: 'Keep navigation state between pages.', body: 'Only the outlet changes, so state outside it survives navigation.' },
  { slug: 'backend-agnostic', title: 'Any backend', summary: 'Full HTML responses, no private protocol.', body: 'The router extracts its outlet from an ordinary HTML document.' },
]

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

export function renderBlogPage(pathname: string): string {
  const slug = pathname.split('/').filter(Boolean).at(-1)
  const post = posts.find((item) => item.slug === slug) ?? posts[0]
  const links = posts.map((item) => `<li><a href="/blog/${item.slug}">${escapeHtml(item.title)}</a></li>`).join('')

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(post.title)} · Barefoot Blog</title></head>
<body><header id="persistent-shell"><strong>Barefoot Blog</strong><span id="shell-visits"></span></header>
<nav><ul>${links}</ul></nav>
<main bf-outlet><article><h1>${escapeHtml(post.title)}</h1><p>${escapeHtml(post.body)}</p></article></main>
<script type="module" src="/app.js"></script></body></html>`
}
