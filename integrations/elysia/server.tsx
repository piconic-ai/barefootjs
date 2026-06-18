/** @jsxImportSource @barefootjs/hono/jsx */
//
// BarefootJS on Elysia (Bun) — SSR + client hydration.
//
// Like the h3 integration, Elysia is just the HTTP host: BarefootJS
// components compiled with the Hono adapter are plain `hono/jsx`
// components, rendered to an HTML string with `renderToHtml` and returned
// from Elysia handlers. The render runtime (`@barefootjs/hono`, the
// hono/jsx engine) is imported the same way the Go `Echo` integration
// imports the framework-agnostic `bf` runtime from the go-template adapter.
//
// Deployment mirrors hono/h3: the default export is a WinterCG `fetch`
// handler, so the same file runs on Cloudflare Workers (`wrangler deploy`)
// and Bun (`bun run server.tsx`). On Workers it uses Elysia's official
// Cloudflare adapter (see below); static bundles come from the Workers
// Assets binding in production and from disk under Bun.

import { Elysia, type Cookie } from 'elysia'
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker'
import { join, normalize, isAbsolute } from 'node:path'
import { randomUUID } from 'node:crypto'
import { renderToHtml } from '@barefootjs/hono/render'
import { withRequestEnv } from '@barefootjs/hono/request-env'
import { Layout } from './renderer'
import manifest from './dist/components/manifest.json' with { type: 'json' }
import { Counter } from '@/components/Counter'
import { Toggle } from '@/components/Toggle'
import TodoApp from '@/components/TodoApp'
import TodoAppSSR from '@/components/TodoAppSSR'
import { AIChatInteractive } from '@/components/AIChatInteractive'

const PORT = Number(process.env.PORT ?? 3005)

// URL prefix everything is mounted under. Defaults to `/integrations/elysia`
// (the deploy path) so production works without relying on `[vars]` being
// surfaced on `process.env` at module-load — Cloudflare populates `[vars]`
// on the `env` binding, not necessarily `process.env`, so a non-empty
// default is what makes the Worker route correctly (same as hono/h3).
// Override via BASE_PATH to mount elsewhere. Client islands fetch the API
// with relative URLs ('api/todos'), which resolve under the prefix.
const BASE = process.env.BASE_PATH ?? '/integrations/elysia'
const link = (path: string) => `${BASE}${path}`

function html(markup: string): Response {
  return new Response('<!DOCTYPE html>' + markup, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

// Pages are plain `renderToHtml` — no per-render env plumbing. The whole fetch
// runs inside `withRequestEnv` (see the default export), so `searchParams()` SSR
// resolves this request's query (and future env signals ride along). #1922

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

// Use Elysia's reactive `cookie` API instead of hand-parsing the header —
// reading/writing `cookie[name]` emits the right `Set-Cookie` automatically.
// Like the other adapters, the cookie just carries an opaque id; the todos
// live in the server-side `sessions` map keyed by it.
function getSession(cookie: Record<string, Cookie<string | undefined>>): Session {
  let id = cookie[SESSION_COOKIE].value
  if (!id) {
    id = randomUUID()
    cookie[SESSION_COOKIE].set({
      value: id,
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

// ── AI chat dummy responses ─────────────────────────────────────────────────
const FAKE_RESPONSES = [
  '[Dummy] This text streams one character at a time over Server-Sent Events. Swap /api/ai-chat in server.tsx for a real LLM to make it functional.',
  '[Dummy] BarefootJS streams tokens with the SSE protocol — each character is its own "data:" event. Wire up OpenAI or Anthropic here for real responses.',
  '[Dummy] Elysia serves this stream as a ReadableStream; the BarefootJS island consumes it with EventSource and renders token-by-token on the client.',
]

// On Workers, use Elysia's official Cloudflare adapter (the blessed way to
// run on workerd — it handles the runtime's constraints around route
// compilation). It is Workers-only (routes 404 under plain Bun), so under
// Bun (dev / e2e / compose) we use the default adapter. `typeof Bun` is the
// runtime discriminator: defined under Bun, absent on workerd.
const onWorkers = typeof Bun === 'undefined'
const app = new Elysia(onWorkers ? { adapter: CloudflareAdapter } : {})

  // ── HTML pages ───────────────────────────────────────────────────────────
  .get(link('/'), async () =>
    html(
      await renderToHtml(
        <Layout title="BarefootJS + Elysia" manifest={manifest} base={BASE}>
          <h1>BarefootJS + Elysia Integration</h1>
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
    ),
  )

  .get(link('/counter'), async () =>
    html(
      await renderToHtml(
        <Layout title="Counter — BarefootJS + Elysia" manifest={manifest} base={BASE}>
          <h1>Counter</h1>
          <Counter initial={0} />
          <p><a href={link('/')}>← Back</a></p>
        </Layout>,
      ),
    ),
  )

  .get(link('/toggle'), async () =>
    html(
      await renderToHtml(
        <Layout title="Toggle — BarefootJS + Elysia" manifest={manifest} base={BASE}>
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

  .get(link('/todos'), async ({ cookie }) =>
    html(
      await renderToHtml(
        <Layout
          title="Todo (@client) — BarefootJS + Elysia"
          manifest={manifest}
          base={BASE}
          styles={[link('/shared/styles/todo-app.css')]}
        >
          <h1>Todo (@client)</h1>
          <div id="app">
            <TodoApp initialTodos={getSession(cookie).todos} />
          </div>
          <p><a href={link('/')}>← Back</a></p>
        </Layout>,
      ),
    ),
  )

  .get(link('/todos-ssr'), async ({ cookie }) =>
    html(
      await renderToHtml(
        <Layout
          title="Todo (SSR) — BarefootJS + Elysia"
          manifest={manifest}
          base={BASE}
          styles={[link('/shared/styles/todo-app.css')]}
        >
          <h1>Todo (no @client markers)</h1>
          <div id="app">
            <TodoAppSSR initialTodos={getSession(cookie).todos} />
          </div>
          <p><a href={link('/')}>← Back</a></p>
        </Layout>,
      ),
    ),
  )

  .get(link('/ai-chat'), async () =>
    html(
      await renderToHtml(
        <Layout
          title="AI Chat — BarefootJS + Elysia"
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

  // ── Todo API (relative `api/todos` from the page resolves here) ──────────
  .get(link('/api/todos'), ({ cookie }) => getSession(cookie).todos)

  .post(link('/api/todos'), ({ cookie, set, body }) => {
    const session = getSession(cookie)
    const text = (body as { text?: string })?.text ?? ''
    const todo: Todo = { id: session.nextId++, text, done: false }
    session.todos.push(todo)
    set.status = 201
    return todo
  })

  .put(link('/api/todos/:id'), ({ cookie, set, params, body }) => {
    const id = Number(params.id)
    const session = getSession(cookie)
    const todo = session.todos.find((t) => t.id === id)
    if (!todo) {
      set.status = 404
      return { error: 'not found' }
    }
    const patch = body as { text?: string; done?: boolean }
    if (patch?.text !== undefined) todo.text = patch.text
    if (patch?.done !== undefined) todo.done = patch.done
    return todo
  })

  .delete(link('/api/todos/:id'), ({ cookie, set, params }) => {
    const id = Number(params.id)
    const session = getSession(cookie)
    const i = session.todos.findIndex((t) => t.id === id)
    if (i === -1) {
      set.status = 404
      return { error: 'not found' }
    }
    session.todos.splice(i, 1)
    return { success: true }
  })

  .post(link('/api/todos/reset'), ({ cookie }) => {
    const session = getSession(cookie)
    session.todos = seedTodos()
    session.nextId = 4
    return { success: true }
  })

  // ── AI chat SSE ──────────────────────────────────────────────────────────
  .get(link('/api/ai-chat'), () => {
    const text = FAKE_RESPONSES[Math.floor(Math.random() * FAKE_RESPONSES.length)]
    // The EventSource closes the connection on `[DONE]` / navigation, so the
    // loop must stop on `cancel()` and swallow the enqueue-after-close race.
    // One JSON-encoded character per `data:` frame, then a literal `[DONE]`.
    let cancelled = false
    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder()
        try {
          for (const ch of [...text]) {
            if (cancelled) return
            controller.enqueue(enc.encode(`data: ${JSON.stringify(ch)}\n\n`))
            await new Promise((r) => setTimeout(r, 30))
          }
          if (!cancelled) {
            controller.enqueue(enc.encode('data: [DONE]\n\n'))
            controller.close()
          }
        } catch {
          // client disconnected mid-stream — nothing left to do
        }
      },
      cancel() {
        cancelled = true
      },
    })
    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    })
  })
  // The Cloudflare adapter requires `.compile()` before the app is exported;
  // it's a harmless no-op under the default (Bun) adapter.
  .compile()

// ── static assets ──────────────────────────────────────────────────────────
// {BASE}/static/components/* → ./dist/components/*  (barefoot.js + *.client.js)
// {BASE}/shared/styles/*     → ../shared/styles/*   (demo stylesheets)
//
// On Workers these are served by the Assets binding (see wrangler.toml);
// under Bun (dev container, e2e) there's no binding, so read from disk.
// `import.meta.dir` is resolved lazily inside serveFromDisk (Bun-only path).
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
  const rel = normalize(pathname.slice(prefix.length))
  if (rel.startsWith('..') || isAbsolute(rel)) return new Response('Not found', { status: 404 })
  const file = Bun.file(join(dir, rel))
  if (!(await file.exists())) return new Response('Not found', { status: 404 })
  return new Response(file) // Bun infers Content-Type from the extension
}

type Env = { ASSETS?: { fetch: (request: Request) => Promise<Response> } }

// `withRequestEnv` binds this request's env (the query behind `searchParams()`,
// and future signals) for the whole fetch, so every `renderToHtml` inside
// resolves it with no per-page plumbing — scoped per async context, race-free. #1922
export default {
  port: PORT,
  fetch: withRequestEnv(async (request: Request, env?: Env, ctx?: unknown): Promise<Response> => {
    const url = new URL(request.url)
    if (isStaticPath(url.pathname)) {
      // Production (Workers): serve from the Assets binding. Dev (Bun): disk.
      if (env?.ASSETS) return env.ASSETS.fetch(request)
      return serveFromDisk(url.pathname)
    }
    // Pass env/ctx through so the Cloudflare adapter can wire bindings; the
    // Bun adapter ignores the extra args.
    return (app.fetch as (r: Request, env?: unknown, ctx?: unknown) => Promise<Response>)(
      request,
      env,
      ctx,
    )
  }),
}

export type App = typeof app
