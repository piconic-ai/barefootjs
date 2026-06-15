import { renderBlogPage } from './blog.ts'

const routerBuild = await Bun.build({
  entrypoints: [new URL('../src/index.ts', import.meta.url).pathname],
  target: 'browser',
  format: 'esm',
  external: ['@barefootjs/client/runtime'],
})
if (!routerBuild.success) throw new AggregateError(routerBuild.logs, 'Could not build the router example')
const routerBundle = await routerBuild.outputs[0].text()

Bun.serve({
  port: Number(Bun.env.PORT ?? 3000),
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/router.js') return new Response(routerBundle, { headers: { 'content-type': 'text/javascript' } })
    if (url.pathname === '/app.js') return new Response(`import { startRouter } from '/router.js';
window.__bf_hydrate_within = () => {};
window.__bf_dispose_within = () => {};
const visits = document.querySelector('#shell-visits');
visits.textContent = ' · shell mounted once';
startRouter();`, { headers: { 'content-type': 'text/javascript' } })
    if (url.pathname === '/' || url.pathname.startsWith('/blog/')) return new Response(renderBlogPage(url.pathname), { headers: { 'content-type': 'text/html' } })
    return new Response('Not found', { status: 404 })
  },
})

console.log('Barefoot Router blog: http://localhost:3000/blog/first-route')
