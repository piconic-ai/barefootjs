/**
 * Minimal test server for @barefootjs/xyflow E2E tests.
 * Bundles xyflow + @barefootjs/client (main and ./runtime subpath) on the fly
 * and serves a test page.
 */

import { resolve } from 'path'

const ROOT = resolve(import.meta.dir, '..')
const CLIENT_ROOT = resolve(ROOT, '../client')

// Bundle @barefootjs/client/reactive — the leaf module that owns
// reactive primitives. Both client/index and client/runtime re-export
// from this subpath, so for the browser we serve it as its own file
// (matching the package's three-output build).
const reactiveBuild = await Bun.build({
  entrypoints: [resolve(CLIENT_ROOT, 'src/reactive.ts')],
  format: 'esm',
})

// Bundle @barefootjs/client (main entry). Externalizes reactive so the
// reactive module exists once in the browser.
const clientBuild = await Bun.build({
  entrypoints: [resolve(CLIENT_ROOT, 'src/index.ts')],
  format: 'esm',
  external: ['@barefootjs/client/reactive'],
})

// Bundle the compiler-emit runtime entry (`@barefootjs/client/runtime`).
// Externalizes both main + reactive so the reactive module is shared.
const runtimeBuild = await Bun.build({
  entrypoints: [resolve(CLIENT_ROOT, 'src/runtime/index.ts')],
  format: 'esm',
  external: ['@barefootjs/client', '@barefootjs/client/reactive'],
})

// Bundle @barefootjs/xyflow for the browser (external client + runtime + reactive)
const xyflowBuild = await Bun.build({
  entrypoints: [resolve(ROOT, 'src/index.ts')],
  format: 'esm',
  external: ['@barefootjs/client', '@barefootjs/client/runtime', '@barefootjs/client/reactive'],
})

const reactiveJs = await reactiveBuild.outputs[0].text()
const clientJs = await clientBuild.outputs[0].text()
const runtimeJs = await runtimeBuild.outputs[0].text()
const xyflowJs = await xyflowBuild.outputs[0].text()

// Read the test HTML
const testHtml = await Bun.file(resolve(ROOT, 'e2e/test-page.html')).text()

const port = Number(process.env.PORT) || 3099

Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url)

    if (url.pathname === '/barefoot-client.js') {
      return new Response(clientJs, { headers: { 'Content-Type': 'application/javascript' } })
    }
    if (url.pathname === '/barefoot-client-reactive.js') {
      return new Response(reactiveJs, { headers: { 'Content-Type': 'application/javascript' } })
    }
    if (url.pathname === '/barefoot-client-runtime.js') {
      return new Response(runtimeJs, { headers: { 'Content-Type': 'application/javascript' } })
    }
    if (url.pathname === '/barefoot-xyflow.js') {
      return new Response(xyflowJs, { headers: { 'Content-Type': 'application/javascript' } })
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return new Response(testHtml, { headers: { 'Content-Type': 'text/html' } })
    }

    return new Response('Not found', { status: 404 })
  },
})

console.log(`Test server running at http://localhost:${port}`)
