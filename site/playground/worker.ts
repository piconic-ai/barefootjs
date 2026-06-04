/**
 * BarefootJS Playground — host Worker.
 *
 * Receives requests and dispatches them into a *dynamically loaded* Worker
 * (Cloudflare Dynamic Workers / the `worker_loaders` binding). The loaded
 * Worker runs in a fresh, isolated V8 isolate with no network access
 * (`globalOutbound: null`), which is where the user's compiled app code runs.
 *
 * Live recompile loop (Phase 4):
 *   1. The browser collects every editor file and posts them to the in-browser
 *      compile worker (served at /_pg/compile-worker.js), which runs
 *      compileAppCore + @barefootjs/jsx + UnoCSS + esbuild-wasm and returns the
 *      USER modules (server, renderer, compiled component, inline assets).
 *   2. The browser POSTs those to `/_pg/build`; the host stashes them per
 *      session (cookie `bf_pg_session`).
 *   3. `/_preview` + the app catch-all merge the session's user modules with the
 *      FIXED vendor modules (object-form, from generated/vendor-bundle) and load
 *      them into a Dynamic Worker keyed by the session id, then dispatch.
 *
 * Routing (order matters):
 *   - /__host_health   served by the host worker itself.
 *   - /__spike         loads a trivial module (proves the Loader machinery).
 *   - GET /            the playground UI shell.
 *   - GET /_pg/files | /_pg/types-bundle.json | /_pg/app.js  UI feeds.
 *   - GET /_pg/compile-worker.js | /_pg/barefoot-runtime.js  browser-compile assets.
 *   - POST /_pg/build  stash a session's compiled user modules + assets.
 *   - /__rt-static/*   host-served static assets (barefoot.js, <Name>.client.js,
 *                      uno.css) from the session's stored assets.
 *   - /_preview[/]     rewritten to `/` and dispatched into the session app.
 *   - everything else  dispatched UNCHANGED into the session app (page routes
 *                      like /, /counter, /todo from the preview URL bar). If the
 *                      session has not built yet, the default multi-route app
 *                      (compiled by compileApp at build time, embedded as
 *                      generated/rt-counter.ts) is loaded instead.
 *
 * NOTE: sessions live in an in-memory Map. A V8 isolate is ephemeral, so this
 * is fine for local dev / a single warm isolate; production must persist
 * sessions in a Durable Object (the Map would be lost on isolate eviction and
 * would not be shared across isolates).
 */

import { APP_FILES } from './generated/app-files'
import { TYPES_BUNDLE } from './generated/types-bundle'
import {
  RT_COUNTER_MAIN,
  RT_COUNTER_MODULES,
  RT_COUNTER_ASSETS,
  type RtAppAssets,
} from './generated/rt-counter'
import { COMPILE_WORKER_JS, BAREFOOT_RUNTIME_JS } from './generated/compile-worker'
import { VENDOR_JS, VENDOR_SHIMS } from './generated/vendor-bundle'
import {
  REGISTRY_MODULES,
  REGISTRY_CLIENT_JS,
} from './generated/registry-bundle'
import { TOKENS_CSS } from './generated/tokens-bundle'
import { UI_SHELL_HTML, UI_CLIENT_JS } from './ui'
import { handleChat, type AiBinding } from './agent'
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { DurableObject } from 'cloudflare:workers'

interface WorkerLoaderModules {
  // Plain string = ESM source (key must end .js/.py). Object form
  // ({ js } / { text } / …) lets a module be keyed by ANY name, including a
  // bare specifier — which is how the pre-bundled framework is provided.
  [path: string]: string | { js: string }
}

interface WorkerCode {
  compatibilityDate: string
  compatibilityFlags?: string[]
  mainModule: string
  modules: WorkerLoaderModules
  // null fully severs outbound network for the loaded (untrusted) code.
  globalOutbound?: unknown | null
  env?: Record<string, unknown>
}

interface WorkerStub {
  getEntrypoint(): { fetch(request: Request): Promise<Response> }
}

interface WorkerLoader {
  get(id: string, supplier: () => Promise<WorkerCode>): WorkerStub
  load(code: WorkerCode): WorkerStub
}

interface Env {
  LOADER: WorkerLoader
  // Workers AI binding (see wrangler.jsonc). Absent in local dev, which routes
  // the chat endpoint into MOCK mode (see agent.ts).
  AI?: AiBinding
  // Per-session state (one DO instance per session id). See PlaygroundSession.
  PLAYGROUND_SESSION: DurableObjectNamespace<PlaygroundSession>
}

// A compiled session, persisted in a Durable Object. barefoot.js is NOT stored
// here — it is the fixed DOM runtime, served from BAREFOOT_RUNTIME_JS — which
// keeps the stored value well under the 128 KiB DO value limit.
interface StoredSession {
  mainModule: string
  userModules: Record<string, string>
  // The app's generated UnoCSS (user-dependent: only the classes this app uses).
  unoCss: string
  // Per-user-component hydration JS, keyed by component name. (Registry
  // components' client JS is fixed — served from REGISTRY_CLIENT_JS.)
  clientJs: Record<string, string>
  // Monotonic build counter, appended to the Loader cache key so each Run loads
  // a fresh isolate rather than reusing the previous build for the same session.
  generation: number
}

// Evict a session this long after its last build (the alarm is refreshed on
// every build).
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Per-session state — one DO instance per session id (`idFromName`). Strongly
 * consistent and isolate-independent: a build is immediately visible to the
 * next preview request and survives isolate eviction, unlike the in-memory Map
 * this replaces (which was lost on every cold start and not shared across
 * isolates).
 */
export class PlaygroundSession extends DurableObject {
  async putBuild(build: Omit<StoredSession, 'generation'>): Promise<void> {
    const prev = await this.ctx.storage.get<StoredSession>('session')
    await this.ctx.storage.put('session', {
      ...build,
      generation: (prev?.generation ?? 0) + 1,
    })
    await this.ctx.storage.setAlarm(Date.now() + SESSION_TTL_MS)
  }

  async getSession(): Promise<StoredSession | null> {
    return (await this.ctx.storage.get<StoredSession>('session')) ?? null
  }

  // TTL cleanup: drop the session once the alarm fires without a newer build.
  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
  }
}

// Static asset URL convention. MUST match compile-app-core.ts's STATIC_BASE /
// UNO_CSS_PATH (the renderer's import map + the per-component script tags point
// here). Duplicated as plain constants rather than imported so the host worker
// bundle does not pull in the compiler (@unocss/core, @barefootjs/jsx, …).
const STATIC_BASE = '/__rt-static/components/'
const UNO_CSS_PATH = '/__rt-static/uno.css'
const TOKENS_CSS_PATH = '/__rt-static/tokens.css'

/**
 * Serve a session's (or the default app's) static asset if `pathname` is one of
 * the host-owned asset routes. Returns null for non-asset paths so the caller
 * falls through to dispatching into the app.
 */
function serveAsset(
  pathname: string,
  unoCss: string,
  clientJs: Record<string, string>,
): Response | null {
  // tokens.css and barefoot.js are FIXED across sessions — served from embedded
  // constants (not the per-session store), so they never bloat a session value.
  if (pathname === TOKENS_CSS_PATH) {
    return new Response(TOKENS_CSS, {
      headers: { 'content-type': 'text/css; charset=utf-8' },
    })
  }
  if (pathname === `${STATIC_BASE}barefoot.js`) {
    return new Response(BAREFOOT_RUNTIME_JS, {
      headers: { 'content-type': 'text/javascript; charset=utf-8' },
    })
  }
  if (pathname === UNO_CSS_PATH) {
    return new Response(unoCss, {
      headers: { 'content-type': 'text/css; charset=utf-8' },
    })
  }
  // /__rt-static/components/<Name>.client.js → the session's own user component
  // client JS (keyed by PascalCase component name) OR a FIXED registry
  // component's combined client JS (keyed by lowercase folder name, e.g.
  // `button`). The two key spaces don't collide; a registry component's SSR
  // template emits a `<script src=".../button.client.js">` tag, so this is how
  // its hydration (`hydrate('Button', …)`) reaches the page.
  if (pathname.startsWith(STATIC_BASE) && pathname.endsWith('.client.js')) {
    const name = pathname.slice(STATIC_BASE.length, -'.client.js'.length)
    const js = clientJs[name] ?? REGISTRY_CLIENT_JS[name]
    if (js != null) {
      return new Response(js, {
        headers: { 'content-type': 'text/javascript; charset=utf-8' },
      })
    }
  }
  return null
}

const SESSION_COOKIE = 'bf_pg_session'

// Fetch a session's persisted state from its Durable Object (null if none yet).
function getSession(
  env: Env,
  sessionId: string | null,
): Promise<StoredSession | null> {
  if (!sessionId) return Promise.resolve(null)
  const ns = env.PLAYGROUND_SESSION
  return ns.get(ns.idFromName(sessionId)).getSession()
}

function readSessionId(request: Request): string | null {
  const cookie = request.headers.get('cookie')
  if (!cookie) return null
  for (const part of cookie.split(';')) {
    const [k, v] = part.trim().split('=')
    if (k === SESSION_COOKIE && v) return v
  }
  return null
}

function newSessionId(): string {
  return crypto.randomUUID()
}

// The FIXED vendor + pre-compiled registry modules, shared by every session.
// Built once. Vendor shims are object-form, keyed by bare specifier. The
// registry modules are ROOT-keyed plain-string ESM (`ui_<name>.js`) so their
// own bare `hono/*` imports resolve against the vendor shims (the loader
// resolves bare specifiers relative to the importer's key-as-path, so registry
// modules must sit at the root — see build-registry.ts). The user's compiled
// app imports the registry as `./ui_<name>.js` (compile-app-core rewrites the
// `@/components/ui/<name>` specifier), resolving to these modules.
function fixedModules(): Record<string, string | { js: string }> {
  const modules: Record<string, string | { js: string }> = {
    'vendor.js': { js: VENDOR_JS },
  }
  for (const [specifier, shim] of Object.entries(VENDOR_SHIMS)) {
    modules[specifier] = { js: shim }
  }
  for (const [key, js] of Object.entries(REGISTRY_MODULES)) {
    modules[key] = js
  }
  return modules
}

// A minimal module that exports a fetch handler. No bare imports — the loaded
// isolate has no node_modules, so everything it references must live in
// `modules`. Kept to isolate the Worker Loader machinery itself.
const TRIVIAL_MODULE = /* js */ `
export default {
  async fetch(request) {
    const url = new URL(request.url)
    return new Response(
      '<!doctype html><html><head><meta charset="utf-8"><title>Dynamic Worker</title></head>' +
        '<body><h1>Hello from a Dynamic Worker</h1>' +
        '<p>path: ' + url.pathname + '</p></body></html>',
      { headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  },
}
`

// Dispatch a request into the app for an ALREADY-FETCHED session (callers fetch
// once via getSession and pass it in, so a single request never hits the DO
// twice). If the session has no build yet, fall back to the default app
// compiled at build time (generated/rt-counter.ts), so a fresh visitor sees a
// working preview before their first Run.
//
// The loaded app contains ONLY page routes — static assets (barefoot.js,
// <Name>.client.js, uno.css, tokens.css) are served by the host (see
// serveAsset), so requests for them never reach the loaded isolate.
function loadAndDispatch(
  env: Env,
  sessionId: string | null,
  session: StoredSession | null,
  request: Request,
): Promise<Response> {
  if (!session) {
    // No build yet → the prebuilt default app (same module shape as a session,
    // just compiled offline). Keyed distinctly so it never collides with a real
    // session's isolate.
    const app = env.LOADER.get('rt-counter-default', async () => ({
      compatibilityDate: '2025-05-01',
      mainModule: RT_COUNTER_MAIN,
      modules: RT_COUNTER_MODULES,
      globalOutbound: null,
    }))
    return app.getEntrypoint().fetch(request)
  }

  // The cache key embeds the build generation so each Run loads fresh code.
  const cacheKey = `${sessionId}@${session.generation}`
  const app = env.LOADER.get(cacheKey, async () => ({
    compatibilityDate: '2025-05-01',
    mainModule: session.mainModule,
    modules: { ...session.userModules, ...fixedModules() },
    globalOutbound: null,
  }))
  return app.getEntrypoint().fetch(request)
}

const app = new Hono<{ Bindings: Env }>()

// Health/diagnostic endpoint served by the host worker itself.
app.get('/__host_health', (c) =>
  c.json({ ok: true, hasLoader: typeof c.env.LOADER?.get === 'function' }),
)

// Spike path: trivial module, kept to isolate the Loader machinery.
app.all('/__spike', (c) => {
  const spike = c.env.LOADER.get('spike-trivial', async () => ({
    compatibilityDate: '2025-05-01',
    mainModule: 'index.js',
    modules: { 'index.js': TRIVIAL_MODULE },
    globalOutbound: null,
  }))
  return spike.getEntrypoint().fetch(c.req.raw)
})

// Playground UI shell. Issues a session cookie so the very first preview /
// build share one opaque session id.
//
// `/` is overloaded: the top-level document is the playground UI, but the
// PREVIEW APP's own home is also `/`. A request for `/` originating from inside
// the preview iframe — e.g. the app's `<a href="/">` Home link, or the URL bar
// navigating Home — must render the APP's home, NOT the UI, otherwise the whole
// playground nests inside its own preview. The browser tags iframe-context
// document loads with `Sec-Fetch-Dest: iframe`, which distinguishes them from
// the top-level page load.
app.get('/', async (c) => {
  if (c.req.header('Sec-Fetch-Dest') === 'iframe') {
    const sid = readSessionId(c.req.raw)
    return loadAndDispatch(c.env, sid, await getSession(c.env, sid), c.req.raw)
  }
  if (!readSessionId(c.req.raw)) {
    setCookie(c, SESSION_COOKIE, newSessionId(), { path: '/', sameSite: 'Lax' })
  }
  return c.html(UI_SHELL_HTML)
})

// Explorer feed: the app's embedded source files.
app.get('/_pg/files', (c) => c.json({ files: APP_FILES }))

// Monaco TypeScript .d.ts bundle.
app.get('/_pg/types-bundle.json', (c) => c.json(TYPES_BUNDLE))

// UI client script.
app.get('/_pg/app.js', (c) =>
  c.body(UI_CLIENT_JS, 200, { 'content-type': 'text/javascript; charset=utf-8' }),
)

// Browser compile worker (compileAppCore + @barefootjs/jsx + UnoCSS +
// esbuild-wasm). Spawned by the UI as a module web worker.
app.get('/_pg/compile-worker.js', (c) =>
  c.body(COMPILE_WORKER_JS, 200, { 'content-type': 'text/javascript; charset=utf-8' }),
)

// The fixed barefoot.js DOM runtime, fetched by the compile worker to bake the
// inline _assets.js module.
app.get('/_pg/barefoot-runtime.js', (c) =>
  c.body(BAREFOOT_RUNTIME_JS, 200, { 'content-type': 'text/javascript; charset=utf-8' }),
)

// AI chat: stream an agent reply (Workers AI, or MOCK mode locally) as SSE. The
// browser parses fenced file-edit blocks from the reply and runs the existing
// compile→/_pg/build→reload-preview loop.
app.post('/_pg/chat', (c) => handleChat(c.req.raw, c.env.AI))

// Stash a session's compiled user modules (posted by the UI after a Run).
app.post('/_pg/build', async (c) => {
  let sessionId = readSessionId(c.req.raw)
  const issueCookie = !sessionId
  if (!sessionId) sessionId = newSessionId()

  let body: {
    userModules?: Record<string, string>
    mainModule?: string
    assets?: RtAppAssets
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON body' }, 400)
  }
  if (!body.userModules || !body.mainModule || !body.assets) {
    return c.json({ ok: false, error: 'Missing userModules/mainModule/assets' }, 400)
  }

  // Persist in the session's DO. barefoot.js is dropped (served from the fixed
  // embedded constant), keeping the stored value small.
  const ns = c.env.PLAYGROUND_SESSION
  await ns.get(ns.idFromName(sessionId)).putBuild({
    mainModule: body.mainModule,
    userModules: body.userModules,
    unoCss: body.assets.unoCss,
    clientJs: body.assets.clientJs,
  })

  if (issueCookie) {
    setCookie(c, SESSION_COOKIE, sessionId, { path: '/', sameSite: 'Lax' })
  }
  return c.json({ ok: true })
})

// Everything else: host-owned static assets, the preview iframe entry, and the
// live app's own page routes. Order matters — assets are checked before any app
// dispatch.
app.all('*', async (c) => {
  const url = new URL(c.req.url)
  const sessionId = readSessionId(c.req.raw)
  // Fetch the session once; reuse it for both asset serving and dispatch.
  const session = await getSession(c.env, sessionId)
  const unoCss = session ? session.unoCss : RT_COUNTER_ASSETS.unoCss
  const clientJs = session ? session.clientJs : RT_COUNTER_ASSETS.clientJs

  // Host-owned static assets (barefoot.js + tokens.css are fixed constants;
  // uno.css + per-component client.js come from the session). The AI's
  // server.tsx only contains page routes.
  const asset = serveAsset(url.pathname, unoCss, clientJs)
  if (asset) return asset

  // Preview iframe entry document. Rewrite to the app's root and dispatch into
  // the session app (or the default app if no build yet). The mini-browser URL
  // bar navigates the iframe to arbitrary app paths (e.g. /counter), which hit
  // the unchanged dispatch below.
  if (url.pathname === '/_preview' || url.pathname === '/_preview/') {
    const rewritten = new URL(c.req.url)
    rewritten.pathname = '/'
    return loadAndDispatch(c.env, sessionId, session, new Request(rewritten, c.req.raw))
  }

  // HTML page routes (/, /counter, /todo … typed in the URL bar): dispatch
  // UNCHANGED into the session app.
  return loadAndDispatch(c.env, sessionId, session, c.req.raw)
})

export default app
