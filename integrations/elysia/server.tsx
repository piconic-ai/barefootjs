/** @jsxImportSource @barefootjs/hono/jsx */
//
// BarefootJS on Elysia (Bun) — SSR + client hydration.
//
// Like the h3 integration, Elysia is just the HTTP host here: BarefootJS
// components compiled with the Hono adapter are plain `hono/jsx`
// components, rendered to an HTML string with `renderToHtml` (no Hono app)
// and returned from Elysia handlers. The render runtime (`@barefootjs/hono`,
// the hono/jsx engine) is imported the same way the Go `Echo` integration
// imports the framework-agnostic `bf` runtime from the go-template adapter.

import { Elysia } from 'elysia'
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

const PORT = Number(process.env.PORT ?? 3005)

// URL prefix everything is mounted under. Empty for the standalone server
// (`bun run start`, e2e); `/integrations/elysia` behind the dev proxy, which
// forwards the prefix unchanged. Client islands fetch the API with relative
// URLs ('api/todos'), which resolve under the prefix automatically.
const BASE = process.env.BASE_PATH ?? ''
const link = (path: string) => `${BASE}${path}`

// Directories the static handlers read from. Overridable via env so the
// production container (where the server runs as a bundled single file)
// can point at the copied assets without depending on the source layout.
const COMPONENTS_DIR = process.env.BF_COMPONENTS_DIR ?? join(import.meta.dir, 'dist/components')
const STYLES_DIR = process.env.BF_STYLES_DIR ?? join(import.meta.dir, '../shared/styles')

// ── helpers ────────────────────────────────────────────────────────────────
async function serveFile(dir: string, rel: string, set: { status?: number }) {
  // normalize() collapses any `..` so a crafted path can't escape `dir`.
  const safe = normalize(rel)
  if (safe.startsWith('..')) {
    set.status = 404
    return 'Not found'
  }
  const file = Bun.file(join(dir, safe))
  if (!(await file.exists())) {
    set.status = 404
    return 'Not found'
  }
  return new Response(file) // Bun infers Content-Type from the extension
}

function html(markup: string): Response {
  return new Response('<!DOCTYPE html>' + markup, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

// ── per-session todo store ─────────────────────────────────────────────────
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

function getSession(request: Request, set: { headers: Record<string, string> }): Session {
  const cookieHeader = request.headers.get('cookie') ?? ''
  let id = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`).exec(cookieHeader)?.[1]
  if (!id) {
    id = randomUUID()
    set.headers['set-cookie'] =
      `${SESSION_COOKIE}=${id}; Path=${BASE || '/'}; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  }
  let session = sessions.get(id)
  if (!session) {
    session = { todos: seedTodos(), nextId: 4 }
    sessions.set(id, session)
  }
  return session
}

// ── AI chat dummy responses ─────────────────────────────────────────────────
const FAKE_RESPONSES = [
  '[Dummy] This text streams one character at a time over Server-Sent Events. Swap /api/ai-chat in server.tsx for a real LLM to make it functional.',
  '[Dummy] BarefootJS streams tokens with the SSE protocol — each character is its own "data:" event. Wire up OpenAI or Anthropic here for real responses.',
  '[Dummy] Elysia serves this stream as a ReadableStream; the BarefootJS island consumes it with EventSource and renders token-by-token on the client.',
]

const app = new Elysia()

  // ── static assets ──────────────────────────────────────────────────────
  // {BASE}/static/components/* → ./dist/components/*  (barefoot.js + *.client.js)
  // {BASE}/shared/styles/*     → ../shared/styles/*   (demo stylesheets)
  .get(`${link('/static/components')}/*`, ({ params, set }) =>
    serveFile(COMPONENTS_DIR, params['*'], set),
  )
  .get(`${link('/shared/styles')}/*`, ({ params, set }) =>
    serveFile(STYLES_DIR, params['*'], set),
  )

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

  .get(link('/todos'), async ({ request, set }) =>
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
            <TodoApp initialTodos={getSession(request, set).todos} />
          </div>
          <p><a href={link('/')}>← Back</a></p>
        </Layout>,
      ),
    ),
  )

  .get(link('/todos-ssr'), async ({ request, set }) =>
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
            <TodoAppSSR initialTodos={getSession(request, set).todos} />
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
  .get(link('/api/todos'), ({ request, set }) => getSession(request, set).todos)

  .post(link('/api/todos'), ({ request, set, body }) => {
    const session = getSession(request, set)
    const text = (body as { text?: string })?.text ?? ''
    const todo: Todo = { id: session.nextId++, text, done: false }
    session.todos.push(todo)
    set.status = 201
    return todo
  })

  .put(link('/api/todos/:id'), ({ request, set, params, body }) => {
    const id = Number(params.id)
    const session = getSession(request, set)
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

  .delete(link('/api/todos/:id'), ({ request, set, params }) => {
    const id = Number(params.id)
    const session = getSession(request, set)
    const i = session.todos.findIndex((t) => t.id === id)
    if (i === -1) {
      set.status = 404
      return { error: 'not found' }
    }
    session.todos.splice(i, 1)
    return { success: true }
  })

  .post(link('/api/todos/reset'), ({ request, set }) => {
    const session = getSession(request, set)
    session.todos = seedTodos()
    session.nextId = 4
    return { success: true }
  })

  // ── AI chat SSE ──────────────────────────────────────────────────────────
  .get(link('/api/ai-chat'), () => {
    const text = FAKE_RESPONSES[Math.floor(Math.random() * FAKE_RESPONSES.length)]
    // The EventSource closes the connection on `[DONE]` / navigation, so the
    // loop must stop on `cancel()` and swallow the enqueue-after-close race —
    // otherwise a disconnect throws and could take the process down. One
    // JSON-encoded character per `data:` frame, then a literal `[DONE]`.
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

  .listen(PORT, () => {
    console.log(`  ➜ http://localhost:${PORT}${BASE || '/'}`)
  })

export type App = typeof app
