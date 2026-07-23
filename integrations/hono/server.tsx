/**
 * BarefootJS + Hono/JSX on Cloudflare Workers
 *
 * Static assets are served by Workers Assets (binding = ASSETS, directory = ./public).
 * The Worker only handles SSR and API routes.
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { createDevReloader } from '@barefootjs/hono/dev-worker'
import { renderer } from './renderer'
import { Counter } from '@/components/Counter'
import Toggle from '@/components/Toggle'
import TodoApp from '@/components/TodoApp'
import TodoAppSSR from '@/components/TodoAppSSR'
import { ReactiveProps, PropsReactivityComparison } from '@/components/ReactiveProps'
import { Form } from '@/components/Form'
import { PortalExample } from '@/components/PortalExample'
import ConditionalReturn from '@/components/ConditionalReturn'
import { Tetris } from '@/components/Tetris'
import { MarkdownEditor } from '@/components/MarkdownEditor'
import { AIChatPage } from './components/AIChatPage'
import { blog } from './blog'

const BASE_PATH = process.env.BASE_PATH ?? '/integrations/hono'
const link = (path: string) => `${BASE_PATH}${path}`

type Bindings = {
  ASSETS: { fetch: (req: Request) => Promise<Response> }
}

const app = new Hono<{ Bindings: Bindings }>().basePath(BASE_PATH)

app.use(renderer)

// Dev-only browser auto-reload. Detects Worker cold starts via a boot id
// sent in SSE Last-Event-ID — a code change restarts the isolate, the
// stream drops, the client reconnects, the boot id differs, reload fires.
// No-op in production (NODE_ENV=production).
app.get('/_bf/reload', createDevReloader())

// Blog — the `@barefootjs/router` showcase (partial navigation across nested /
// sibling regions). A sub-app with its own region-shell renderer, mounted under
// `${BASE_PATH}/blog`. Registered before the catalog routes so its renderer wins.
app.route('/blog', blog)

// Per-session in-memory todo storage. Each browser gets an opaque session
// id via a cookie scoped to BASE_PATH; the map is keyed by that id so one
// visitor's list is never visible to another. Workers isolates are
// ephemeral, so every cold start resets all sessions — acceptable for a
// demo and also a cheap way to evict stale data.
type Todo = { id: number; text: string; done: boolean }
type SessionState = { todos: Todo[]; nextId: number }

const SESSION_COOKIE = 'bf_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30d
const MAX_SESSIONS = 1000

const sessions = new Map<string, SessionState>()

function seedTodos(): Todo[] {
  return [
    { id: 1, text: 'Setup project', done: false },
    { id: 2, text: 'Create components', done: false },
    { id: 3, text: 'Write tests', done: true },
  ]
}

function seedSession(): SessionState {
  return { todos: seedTodos(), nextId: 4 }
}

function touchLRU(id: string, state: SessionState) {
  // Re-insert so Map iteration order reflects recency; the first key is
  // always the least-recently-used session.
  sessions.delete(id)
  sessions.set(id, state)
}

function evictIfNeeded() {
  while (sessions.size > MAX_SESSIONS) {
    const oldest = sessions.keys().next().value
    if (oldest === undefined) break
    sessions.delete(oldest)
  }
}

function getSession(c: Context): SessionState {
  let id = getCookie(c, SESSION_COOKIE)
  if (!id) {
    id = crypto.randomUUID()
    setCookie(c, SESSION_COOKIE, id, {
      path: BASE_PATH,
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: SESSION_TTL_SECONDS,
    })
  }
  let state = sessions.get(id)
  if (!state) {
    state = seedSession()
    sessions.set(id, state)
    evictIfNeeded()
  } else {
    touchLRU(id, state)
  }
  return state
}

app.get('/', (c) => {
  return c.render(
    <div>
      <h1>BarefootJS + Hono/JSX Integration</h1>
      <nav>
        <ul>
          <li><a href={link('/counter')}>Counter</a></li>
          <li><a href={link('/toggle')}>Toggle</a></li>
          <li><a href={link('/todos')}>Todo (@client)</a></li>
          <li><a href={link('/todos-ssr')}>Todo (no @client markers)</a></li>
          <li><a href={link('/ai-chat')}>AI Chat (SSE Streaming)</a></li>
          <li><a href={link('/tetris')}>Tetris (game loop + keyboard)</a></li>
          <li><a href={link('/editor')}>Markdown Editor (live preview)</a></li>
          <li><a href={link('/blog')}>Blog (@barefootjs/router — partial navigation)</a></li>
        </ul>
      </nav>
    </div>
  )
})

app.get('/counter', (c) => {
  return c.render(
    <div>
      <h1>Counter Example</h1>
      <Counter />
      <p><a href={link('/')}>← Back</a></p>
    </div>
  )
})

app.get('/toggle', (c) => {
  const toggleItems = [
    { label: 'Setting 1', defaultOn: true },
    { label: 'Setting 2', defaultOn: false },
    { label: 'Setting 3', defaultOn: false },
  ]
  return c.render(
    <div>
      <h1>Toggle Example</h1>
      <Toggle toggleItems={toggleItems} />
      <p><a href={link('/')}>← Back</a></p>
    </div>
  )
})

app.get('/todos', (c) => {
  const session = getSession(c)
  return c.render(
    <div id="app">
      <TodoApp initialTodos={session.todos} />
      <p><a href={link('/')}>← Back</a></p>
    </div>
  )
})

app.get('/todos-ssr', (c) => {
  const session = getSession(c)
  return c.render(
    <div id="app">
      <TodoAppSSR initialTodos={session.todos} />
      <p><a href={link('/')}>← Back</a></p>
    </div>
  )
})

app.get('/reactive-props', (c) => {
  return c.render(
    <div>
      <h1>Reactive Props Test</h1>
      <ReactiveProps />
      <p><a href={link('/')}>← Back</a></p>
    </div>
  )
})

app.get('/props-reactivity', (c) => {
  return c.render(
    <div>
      <h1>Props Reactivity Comparison</h1>
      <PropsReactivityComparison />
      <p><a href={link('/')}>← Back</a></p>
    </div>
  )
})

app.get('/form', (c) => {
  return c.render(
    <div>
      <h1>Form Example</h1>
      <Form />
      <p><a href={link('/')}>← Back</a></p>
    </div>
  )
})

app.get('/portal', (c) => {
  return c.render(
    <div>
      <h1>Portal Example</h1>
      <PortalExample />
      <p><a href={link('/')}>← Back</a></p>
    </div>
  )
})

app.get('/conditional-return', (c) => {
  return c.render(
    <div>
      <h1>Conditional Return Example</h1>
      <ConditionalReturn />
      <p><a href={link('/')}>← Back</a></p>
    </div>
  )
})

app.get('/conditional-return-link', (c) => {
  return c.render(
    <div>
      <h1>Conditional Return Example (Link)</h1>
      <ConditionalReturn variant="link" />
      <p><a href={link('/')}>← Back</a></p>
    </div>
  )
})

app.get('/tetris', (c) => {
  return c.render(
    <div>
      <h1>Tetris Example</h1>
      <p>A full game loop driven by BarefootJS signals — keyboard controls, a
        reactive 10×20 grid, line clears, and scoring. Click Start, then use the
        arrow keys.</p>
      <Tetris />
      <p><a href={link('/')}>← Back</a></p>
    </div>
  )
})

app.get('/editor', (c) => {
  return c.render(
    <div>
      <h1>Markdown Editor Example</h1>
      <p>Type Markdown on the left; a live preview and word/character counters
        update on the right — all derived from a single <code>text</code> signal.</p>
      <MarkdownEditor />
      <p><a href={link('/')}>← Back</a></p>
    </div>
  )
})

app.get('/ai-chat', (c) => {
  return c.render(<AIChatPage />)
})

const FAKE_RESPONSES = [
  '[Dummy response] This text is streaming one character at a time via Server-Sent Events. Replace /api/ai-chat in server.tsx with a real LLM API to make this chat functional.',
  '[Dummy response] BarefootJS streams tokens using the SSE protocol. Each character arrives as a separate "data:" event. Wire up OpenAI or Anthropic here for real AI responses.',
  '[Dummy response] This response is randomly selected from a fixed list in server.tsx — it does not understand your message. Swap the endpoint for a real streaming LLM to fix that.',
  '[Dummy response] Lorem ipsum dolor sit amet. This is placeholder content demonstrating token-by-token SSE delivery. See /api/ai-chat in server.tsx to connect a real model.',
  '[Dummy response] I am not a real AI. This demo exists only to show how BarefootJS handles SSE streaming on the client side. Replace me with a real LLM endpoint!',
]

app.get('/api/ai-chat', () => {
  const text = FAKE_RESPONSES[Math.floor(Math.random() * FAKE_RESPONSES.length)]
  const chars = [...text]

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder()
      for (const ch of chars) {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(ch)}\n\n`))
        await new Promise(r => setTimeout(r, 30))
      }
      controller.enqueue(enc.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})

app.get('/api/todos', (c) => c.json(getSession(c).todos))

app.post('/api/todos', async (c) => {
  const session = getSession(c)
  const body = await c.req.json()
  const newTodo: Todo = { id: session.nextId++, text: body.text, done: false }
  session.todos.push(newTodo)
  return c.json(newTodo, 201)
})

app.put('/api/todos/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)

  const session = getSession(c)
  const body = await c.req.json()
  const todo = session.todos.find(t => t.id === id)
  if (!todo) return c.json({ error: 'Todo not found' }, 404)

  if (body.text !== undefined) todo.text = body.text
  if (body.done !== undefined) todo.done = body.done
  return c.json(todo)
})

app.delete('/api/todos/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)

  const session = getSession(c)
  const index = session.todos.findIndex(t => t.id === id)
  if (index === -1) return c.json({ error: 'Todo not found' }, 404)

  session.todos.splice(index, 1)
  return c.json({ success: true })
})

app.post('/api/todos/reset', (c) => {
  const session = getSession(c)
  session.todos = seedTodos()
  session.nextId = 4
  return c.json({ success: true })
})

// Static file fallback for plain bun (dev compose container): when there's
// no Workers ASSETS binding, serve files from ./public/. Inlined with
// Bun.file rather than imported from `hono/bun` so the Workers bundle
// stays free of any module-level Bun references — `hono/bun`'s top-level
// code throws `ReferenceError: Bun is not defined` when loaded under
// workerd. `./public/` mirrors the URL space (including the basePath),
// matching how Workers Assets serves it in production.
app.use('*', async (c, next) => {
  if (c.env?.ASSETS) return next()
  if (typeof globalThis.Bun === 'undefined') return next()
  const { pathname } = new URL(c.req.url)
  if (pathname === BASE_PATH || pathname === `${BASE_PATH}/`) return next()
  const file = globalThis.Bun.file(`./public${pathname}`)
  if (await file.exists()) return new Response(file)
  return next()
})

// Fallthrough for anything not matched above. Two cases to handle:
//   1. `${BASE_PATH}/` (trailing slash on the home page): Hono's basePath
//      matches the no-slash variant only, and Workers Assets would try to
//      serve the directory and 404, so we redirect to the canonical
//      no-slash URL.
//   2. Workers / wrangler dev: forward to the ASSETS binding. This path
//      is reached because wrangler.toml sets `run_worker_first = true`,
//      giving the Worker first crack at every request.
app.all('*', (c) => {
  const url = new URL(c.req.url)
  if (url.pathname === `${BASE_PATH}/`) {
    return c.redirect(BASE_PATH + url.search, 308)
  }
  return c.env.ASSETS.fetch(c.req.raw)
})

export default app
