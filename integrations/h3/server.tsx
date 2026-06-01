/** @jsxImportSource @barefootjs/hono/jsx */
//
// BarefootJS on h3 (UnJS) — SSR + client hydration.
//
// h3 is a pure HTTP framework: it has no JSX runtime, you just return a
// value from a handler. BarefootJS components compiled with the Hono
// adapter are plain `hono/jsx` components, so we render them to an HTML
// string with `renderToHtml` (no Hono app involved) and return that
// string. Static client bundles are served straight off disk.
//
// This mirrors the Go `Echo` integration: the framework (h3) lives only
// here, and the render runtime (`@barefootjs/hono`, the hono/jsx engine)
// is imported the same way Echo imports the framework-agnostic `bf`
// runtime shipped by the go-template adapter.

import {
  createApp,
  createRouter,
  eventHandler,
  getRequestPath,
  getRouterParam,
  getCookie,
  setCookie,
  readBody,
  getQuery,
  createEventStream,
  setResponseHeader,
  setResponseStatus,
  toNodeListener,
  type H3Event,
} from 'h3'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { randomUUID } from 'node:crypto'
import { renderToHtml } from '@barefootjs/hono/render'
import { Layout } from './renderer'
import manifest from './dist/components/manifest.json'
import { Counter } from '@/components/Counter'
import { Toggle } from '@/components/Toggle'
import TodoApp from '@/components/TodoApp'
import TodoAppSSR from '@/components/TodoAppSSR'
import { AIChatInteractive } from '@/components/AIChatInteractive'

const PORT = Number(process.env.PORT ?? 3003)

// ── static assets ──────────────────────────────────────────────────────────
// /static/components/* → ./dist/components/*   (barefoot.js + *.client.js)
// /shared/styles/*     → ../shared/styles/*    (demo stylesheets)
const STATIC_MOUNTS: Array<{ prefix: string; dir: string }> = [
  { prefix: '/static/components/', dir: join(import.meta.dir, 'dist/components') },
  { prefix: '/shared/styles/', dir: join(import.meta.dir, '../shared/styles') },
]

const CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

async function tryServeStatic(path: string): Promise<{ body: Buffer; type: string } | null> {
  for (const { prefix, dir } of STATIC_MOUNTS) {
    if (!path.startsWith(prefix)) continue
    // normalize() collapses any `..` so a crafted path can't escape `dir`.
    const rel = normalize(path.slice(prefix.length))
    if (rel.startsWith('..')) return null
    const file = join(dir, rel)
    try {
      const body = await readFile(file)
      const ext = rel.slice(rel.lastIndexOf('.'))
      return { body, type: CONTENT_TYPES[ext] ?? 'application/octet-stream' }
    } catch {
      return null
    }
  }
  return null
}

// ── per-session todo store ─────────────────────────────────────────────────
// Each browser gets an opaque id via a cookie; the in-memory map is keyed
// on it so one visitor's list is never visible to another. Process-local
// and ephemeral — fine for a demo.
type Todo = { id: number; text: string; done: boolean }
type Session = { todos: Todo[]; nextId: number }

const SESSION_COOKIE = 'bf_session'
const sessions = new Map<string, Session>()

function seedTodos(): Todo[] {
  return [
    { id: 1, text: 'Setup project', done: false },
    { id: 2, text: 'Create components', done: false },
    { id: 3, text: 'Write tests', done: true },
  ]
}

function getSession(event: H3Event): Session {
  let id = getCookie(event, SESSION_COOKIE)
  if (!id) {
    id = randomUUID()
    setCookie(event, SESSION_COOKIE, id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    })
  }
  let session = sessions.get(id)
  if (!session) {
    session = { todos: seedTodos(), nextId: 4 }
    sessions.set(id, session)
  }
  return session
}

// ── HTML pages ───────────────────────────────────────────────────────────
async function page(node: unknown): Promise<string> {
  return '<!DOCTYPE html>' + (await renderToHtml(node))
}

const router = createRouter()

router.get(
  '/',
  eventHandler(async () =>
    page(
      <Layout title="BarefootJS + h3" manifest={manifest}>
        <h1>BarefootJS + h3 Integration</h1>
        <nav>
          <ul>
            <li><a href="/counter">Counter</a></li>
            <li><a href="/toggle">Toggle</a></li>
            <li><a href="/todos">Todo (@client)</a></li>
            <li><a href="/todos-ssr">Todo (no @client markers)</a></li>
            <li><a href="/ai-chat">AI Chat (SSE Streaming)</a></li>
          </ul>
        </nav>
      </Layout>,
    ),
  ),
)

router.get(
  '/counter',
  eventHandler(async () =>
    page(
      <Layout title="Counter — BarefootJS + h3" manifest={manifest}>
        <h1>Counter</h1>
        <Counter initial={0} />
        <p><a href="/">← Back</a></p>
      </Layout>,
    ),
  ),
)

router.get(
  '/toggle',
  eventHandler(async () =>
    page(
      <Layout title="Toggle — BarefootJS + h3" manifest={manifest}>
        <h1>Toggle</h1>
        <Toggle
          toggleItems={[
            { label: 'Setting 1', defaultOn: true },
            { label: 'Setting 2', defaultOn: false },
            { label: 'Setting 3', defaultOn: false },
          ]}
        />
        <p><a href="/">← Back</a></p>
      </Layout>,
    ),
  ),
)

router.get(
  '/todos',
  eventHandler(async (event) =>
    page(
      <Layout
        title="Todo (@client) — BarefootJS + h3"
        manifest={manifest}
        styles={['/shared/styles/todo-app.css']}
      >
        <h1>Todo (@client)</h1>
        <div id="app">
          <TodoApp initialTodos={getSession(event).todos} />
        </div>
        <p><a href="/">← Back</a></p>
      </Layout>,
    ),
  ),
)

router.get(
  '/todos-ssr',
  eventHandler(async (event) =>
    page(
      <Layout
        title="Todo (SSR) — BarefootJS + h3"
        manifest={manifest}
        styles={['/shared/styles/todo-app.css']}
      >
        <h1>Todo (no @client markers)</h1>
        <div id="app">
          <TodoAppSSR initialTodos={getSession(event).todos} />
        </div>
        <p><a href="/">← Back</a></p>
      </Layout>,
    ),
  ),
)

router.get(
  '/ai-chat',
  eventHandler(async () =>
    page(
      <Layout
        title="AI Chat — BarefootJS + h3"
        manifest={manifest}
        styles={['/shared/styles/ai-chat.css']}
      >
        <h1>AI Chat — SSE Streaming</h1>
        <p className="demo-notice">
          Demo only — responses are dummy content streamed via SSE. Replace{' '}
          <code>/api/ai-chat</code> in <code>server.tsx</code> with a real LLM API.
        </p>
        <AIChatInteractive />
        <p><a href="/">← Back</a></p>
      </Layout>,
    ),
  ),
)

// ── Todo API (relative `api/todos` from the page resolves here) ────────────
router.get(
  '/api/todos',
  eventHandler((event) => getSession(event).todos),
)

router.post(
  '/api/todos',
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
  '/api/todos/:id',
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
  '/api/todos/:id',
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
  '/api/todos/reset',
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
  '/api/ai-chat',
  eventHandler((event) => {
    void getQuery(event).q // the user's prompt — ignored by this dummy backend
    const text = FAKE_RESPONSES[Math.floor(Math.random() * FAKE_RESPONSES.length)]
    const stream = createEventStream(event)

    // Push after `send()` returns the stream — createEventStream keeps the
    // connection open. Each push frames the payload as `data: <msg>\n\n`,
    // which is exactly what the island's `EventSource.onmessage` expects:
    // a JSON-encoded character per token, then a literal `[DONE]`.
    ;(async () => {
      for (const ch of [...text]) {
        await stream.push(JSON.stringify(ch))
        await new Promise((r) => setTimeout(r, 30))
      }
      await stream.push('[DONE]')
      await stream.close()
    })()

    return stream.send()
  }),
)

const app = createApp()

// Static first: short-circuit asset requests before the router runs.
app.use(
  eventHandler(async (event) => {
    const hit = await tryServeStatic(getRequestPath(event))
    if (!hit) return // fall through to the router
    setResponseHeader(event, 'Content-Type', hit.type)
    return hit.body
  }),
)

app.use(router)

createServer(toNodeListener(app)).listen(PORT, () => {
  console.log(`  ➜ http://localhost:${PORT}`)
})
