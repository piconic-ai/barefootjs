import { renderBlogPage } from './blog.ts'

const routerEntry = new URL('../dist/index.js', import.meta.url)

Bun.serve({
  port: Number(Bun.env.PORT ?? 3000),
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/router.js') return new Response(Bun.file(routerEntry), { headers: { 'content-type': 'text/javascript' } })
    if (url.pathname === '/app.js') return new Response(`import { startRouter } from '/router.js';
const visits = document.querySelector('#shell-visits');
visits.textContent = ' · shell mounted once';
startRouter();`, { headers: { 'content-type': 'text/javascript' } })
    if (url.pathname === '/' || url.pathname.startsWith('/blog/')) return new Response(renderBlogPage(url.pathname), { headers: { 'content-type': 'text/html' } })
    return new Response('Not found', { status: 404 })
  },
})

console.log('Barefoot Router blog: http://localhost:3000/blog/first-route')
