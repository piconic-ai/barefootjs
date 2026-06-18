/** @jsxImportSource @barefootjs/hono/jsx */
//
// BarefootJS on h3 (UnJS) — SSR + client hydration.
//
// h3 is a pure HTTP framework with no JSX runtime: BarefootJS components
// compiled with the Hono adapter are plain `hono/jsx` components, rendered
// to an HTML string with `renderToHtml` (no Hono app) and returned from h3
// handlers. The render runtime (`@barefootjs/hono`, the hono/jsx engine) is
// imported the same way the Go `Echo` integration imports the
// framework-agnostic `bf` runtime from the go-template adapter.
//
// Deployment mirrors the Hono integration: the default export is a
// WinterCG `fetch` handler, so the same file runs on Cloudflare Workers
// (`wrangler deploy`) and Bun (`bun run server.tsx`, used by the dev
// compose container and the e2e webServer). Static client bundles come
// from the Workers Assets binding in production and from disk under Bun.

import {
  createApp,
  createRouter,
  eventHandler,
  getRouterParam,
  getCookie,
  setCookie,
  readBody,
  getQuery,
  getRequestURL,
  createEventStream,
  setResponseStatus,
  toWebHandler,
  type H3Event,
} from 'h3'
import { join, normalize, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { renderToHtml } from '@barefootjs/hono/render'
import { runWithRequestEnv } from '@barefootjs/hono/request-env'

// h3's `createEventStream` leaks an `undefined` unhandled rejection when an
// SSE client disconnects under the web handler (`onClosed` does not fire in
// web mode), which Bun/Node would treat as fatal and exit the process —
// taking every later request down with it. Swallow *only* that specific
// leak (reason is nullish) and surface anything else, so real bugs are not
// hidden. Guarded because on Cloudflare Workers `process.on` may be a no-op
// and a per-request rejection doesn't kill the isolate anyway.
if (typeof process !== 'undefined' && typeof process.on === 'function') {
  process.on('unhandledRejection', (reason) => {
    if (reason == null) return // the h3 SSE-disconnect leak — expected
    console.error('[h3] unhandledRejection:', reason)
  })
}
import { Layout } from './renderer'
import manifest from './dist/components/manifest.json' with { type: 'json' }
import { Counter } from '@/components/Counter'
import { Toggle } from '@/components/Toggle'
import TodoApp from '@/components/TodoApp'
import TodoAppSSR from '@/components/TodoAppSSR'
import { AIChatInteractive } from '@/components/AIChatInteractive'

const PORT = Number(process.env.PORT ?? 3003)

// URL prefix everything is mounted under. Defaults to `/integrations/h3`
// (the deploy path) so production works without relying on `[vars]` being
// surfaced on `process.env` at module-load — Cloudflare populates `[vars]`
// on the `env` binding, not necessarily `process.env`, so a non-empty
// default is what makes the Worker route correctly (same pattern as the
// Hono integration). Override via BASE_PATH to mount elsewhere. Client
// islands fetch the API with relative URLs ('api/todos'), which resolve
// under the prefix automatically.
const BASE = process.env.BASE_PATH ?? '/integrations/h3'
const link = (path: string) => `${BASE}${path}`

// ── per-session todo store ─────────────────────────────────────────────────
type Todo = { id: number; text: string; done: boolean }
type Session = { todos: Todo[]; nextId: number }

const SESSION_COOKIE = 'bf_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30d
const MAX_SESSIONS = 1000

const sessions = new Map<string, Session>()

function seedTodos(): Todo[] {
  return [
    { id: 1, text: 'Setup project', done: false },
    { id: 2, text: 'Create components', done: false },
    { id: 3, text: 'Write tests', done: true },
  ]
}

// Bound the in-memory store and evict least-recently-used sessions, like the
// hono / echo / mojolicious integrations. The Map's insertion order is the
// recency order — re-inserting on access keeps the oldest key at the front.
function touchLRU(id: string, session: Session) {
  sessions.delete(id)
  sessions.set(id, session)
}

function evictIfNeeded() {
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value
    if (oldest === undefined) break
    sessions.delete(oldest)
  }
}

function getSession(event: H3Event): Session {
  let id = getCookie(event, SESSION_COOKIE)
  if (!id) {
    id = randomUUID()
    setCookie(event, SESSION_COOKIE, id, {
      path: BASE || '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: SESSION_TTL_SECONDS,
    })
  }
  let session = sessions.get(id)
  if (!session) {
    session = { todos: seedTodos(), nextId: 4 }
    sessions.set(id, session)
    evictIfNeeded()
  } else {
    touchLRU(id, session)
  }
  return session
}

// ── HTML pages ───────────────────────────────────────────────────────────
// Bind the request's environment for SSR — here the query behind
// `searchParams()` (`renderToHtml` has no request context of its own, unlike
// Hono's jsxRenderer), scoped per async context so concurrent requests don't
// race. Future env signals (cookies, …) add a field to this object. #1922
async function page(event: H3Event, node: unknown): Promise<string> {
  const search = getRequestURL(event).search
  return (
    '<!DOCTYPE html>' +
    (await runWithRequestEnv({ search }, () => renderToHtml(node)))
  )
}

const router = createRouter()

const homeHandler = eventHandler(async (event) =>
  page(
    event,
    <Layout title="BarefootJS + h3" manifest={manifest} base={BASE}>
      <h1>BarefootJS + h3 Integration</h1>
      <nav>
        <ul>
          <li><a href={link('/counter')}>Counter</a></li>
          <li><a href={link('/toggle')}>Toggle</a></li>
          <li><a href={link('/todos')}>Todo (@client)</a></li>
          <li><a href={link('/todos-ssr')}>Todo (no @client markers)</a></li>
          <li><a href={link('/ai-chat')}>AI Chat (SSE Streaming)</a></li>
        </ul>
      </nav>
    </Layout>,
  ),
)
router.get(`${BASE}/`, homeHandler)
// Behind the proxy / on Workers the prefix arrives without a trailing slash
// too (e.g. the catalog links to `/integrations/h3`), so register that form.
if (BASE) router.get(BASE, homeHandler)

router.get(
  link('/counter'),
  eventHandler(async (event) =>
    page(
      event,
      <Layout title="Counter — BarefootJS + h3" manifest={manifest} base={BASE}>
        <h1>Counter</h1>
        <Counter initial={0} />
        <p><a href={link('/')}>← Back</a></p>
      </Layout>,
    ),
  ),
)

router.get(
  link('/toggle'),
  eventHandler(async (event) =>
    page(
      event,
      <Layout title="Toggle — BarefootJS + h3" manifest={manifest} base={BASE}>
        <h1>Toggle</h1>
        <Toggle
          toggleItems={[
            { label: 'Setting 1', defaultOn: true },
            { label: 'Setting 2', defaultOn: false },
            { label: 'Setting 3', defaultOn: false },
          ]}
        />
        <p><a href={link('/')}>← Back</a></p>
      </Layout>,
    ),
  ),
)

router.get(
  link('/todos'),
  eventHandler(async (event) =>
    page(
      event,
      <Layout
        title="Todo (@client) — BarefootJS + h3"
        manifest={manifest}
        base={BASE}
        styles={[link('/shared/styles/todo-app.css')]}
      >
        <h1>Todo (@client)</h1>
        <div id="app">
          <TodoApp initialTodos={getSession(event).todos} />
        </div>
        <p><a href={link('/')}>← Back</a></p>
      </Layout>,
    ),
  ),
)

router.get(
  link('/todos-ssr'),
  eventHandler(async (event) =>
    page(
      event,
      <Layout
        title="Todo (SSR) — BarefootJS + h3"
        manifest={manifest}
        base={BASE}
        styles={[link('/shared/styles/todo-app.css')]}
      >
        <h1>Todo (no @client markers)</h1>
        <div id="app">
          <TodoAppSSR initialTodos={getSession(event).todos} />
        </div>
        <p><a href={link('/')}>← Back</a></p>
      </Layout>,
    ),
  ),
)

router.get(
  link('/ai-chat'),
  eventHandler(async (event) =>
    page(
      event,
      <Layout
        title="AI Chat — BarefootJS + h3"
        manifest={manifest}
        base={BASE}
        styles={[link('/shared/styles/ai-chat.css')]}
      >
        <h1>AI Chat — SSE Streaming</h1>
        <p className="demo-notice">
          Demo only — responses are dummy content streamed via SSE. Replace{' '}
          <code>/api/ai-chat</code> in <code>server.tsx</code> with a real LLM API.
        </p>
        <AIChatInteractive />
        <p><a href={link('/')}>← Back</a></p>
      </Layout>,
    ),
  ),
)

// ── Todo API (relative `api/todos` from the page resolves here) ────────────
router.get(
  link('/api/todos'),
  eventHandler((event) => getSession(event).todos),
)

router.post(
  link('/api/todos'),
  eventHandler(async (event) => {
    const session = getSession(event)
    const body = (await readBody(event)) as { text?: string }
    const todo: Todo = { id: session.nextId++, text: body?.text ?? '', done: false }
    session.todos.push(todo)
    setResponseStatus(event, 201)
    return todo
  }),
)

router.put(
  link('/api/todos/:id'),
  eventHandler(async (event) => {
    const id = Number(getRouterParam(event, 'id'))
    const session = getSession(event)
    const todo = session.todos.find((t) => t.id === id)
    if (!todo) {
      setResponseStatus(event, 404)
      return { error: 'not found' }
    }
    const body = (await readBody(event)) as { text?: string; done?: boolean }
    if (body?.text !== undefined) todo.text = body.text
    if (body?.done !== undefined) todo.done = body.done
    return todo
  }),
)

router.delete(
  link('/api/todos/:id'),
  eventHandler((event) => {
    const id = Number(getRouterParam(event, 'id'))
    const session = getSession(event)
    const i = session.todos.findIndex((t) => t.id === id)
    if (i === -1) {
      setResponseStatus(event, 404)
      return { error: 'not found' }
    }
    session.todos.splice(i, 1)
    return { success: true }
  }),
)

router.post(
  link('/api/todos/reset'),
  eventHandler((event) => {
    const session = getSession(event)
    session.todos = seedTodos()
    session.nextId = 4
    return { success: true }
  }),
)

// ── AI chat SSE (relative `api/ai-chat` from the page resolves here) ───────
const FAKE_RESPONSES = [
  '[Dummy] This text streams one character at a time over Server-Sent Events. Swap /api/ai-chat in server.tsx for a real LLM to make it functional.',
  '[Dummy] BarefootJS streams tokens with the SSE protocol — each character is its own "data:" event. Wire up OpenAI or Anthropic here for real responses.',
  '[Dummy] h3 serves this stream via createEventStream; the BarefootJS island consumes it with EventSource and renders token-by-token on the client.',
]

router.get(
  link('/api/ai-chat'),
  eventHandler((event) => {
    void getQuery(event).q // the user's prompt — ignored by this dummy backend
    const text = FAKE_RESPONSES[Math.floor(Math.random() * FAKE_RESPONSES.length)]

    // h3's native SSE helper. The push loop stops on `onClosed` and the
    // try/catch handles the push-after-close race; the leaked `undefined`
    // rejection h3 emits on disconnect (web mode) is swallowed by the
    // process-level guard at the top of this file. Each frame is one
    // JSON-encoded character, then a literal `[DONE]` — what the island's
    // `EventSource.onmessage` expects.
    const eventStream = createEventStream(event)
    let closed = false
    eventStream.onClosed(() => {
      closed = true
    })
    ;(async () => {
      try {
        for (const ch of [...text]) {
          if (closed) break
          await eventStream.push(JSON.stringify(ch))
          await new Promise((r) => setTimeout(r, 30))
        }
        if (!closed) await eventStream.push('[DONE]')
      } catch {
        // client disconnected mid-stream — nothing left to do
      } finally {
        await eventStream.close().catch(() => {})
      }
    })()

    return eventStream.send()
  }),
)

const app = createApp()
app.use(router)
const webHandler = toWebHandler(app)

// ── static assets ──────────────────────────────────────────────────────────
// {BASE}/static/components/* → ./dist/components/*  (barefoot.js + *.client.js)
// {BASE}/shared/styles/*     → ../shared/styles/*   (demo stylesheets)
//
// On Workers these are served by the Assets binding (see wrangler.toml);
// under Bun (dev container, e2e) there's no binding, so read from disk.
// `import.meta.dir` is undefined on Workers, so the paths are resolved
// lazily inside serveFromDisk (only reached on the Bun branch) — computing
// them at module top level would crash the Worker on startup.
function isStaticPath(pathname: string): boolean {
  return (
    pathname.startsWith(`${BASE}/static/components/`) ||
    pathname.startsWith(`${BASE}/shared/styles/`)
  )
}

async function serveFromDisk(pathname: string): Promise<Response> {
  const [dir, prefix] = pathname.startsWith(`${BASE}/static/components/`)
    ? [join(import.meta.dir, 'dist/components'), `${BASE}/static/components/`]
    : [join(import.meta.dir, '../shared/styles'), `${BASE}/shared/styles/`]
  // normalize() collapses any `..` so a crafted path can't escape `dir`.
  const rel = normalize(pathname.slice(prefix.length))
  // Reject traversal: `..` segments (normalize floats them to the front) and
  // absolute paths (a `//` in the request can leave a leading `/`). `join`
  // doesn't actually let an absolute `rel` escape `dir` — that's `resolve` —
  // but the explicit guard keeps it safe against future refactors too.
  if (rel.startsWith('..') || isAbsolute(rel)) return new Response('Not found', { status: 404 })
  const file = Bun.file(join(dir, rel))
  if (!(await file.exists())) return new Response('Not found', { status: 404 })
  return new Response(file) // Bun infers Content-Type from the extension
}

type Env = { ASSETS?: { fetch: (request: Request) => Promise<Response> } }

export default {
  port: PORT,
  async fetch(request: Request, env?: Env): Promise<Response> {
    const url = new URL(request.url)
    if (isStaticPath(url.pathname)) {
      // Production (Workers): serve from the Assets binding. Dev (Bun): disk.
      if (env?.ASSETS) return env.ASSETS.fetch(request)
      return serveFromDisk(url.pathname)
    }
    return webHandler(request)
  },
}
