/**
 * BarefootJS + SSG (Static Site Generation) + Cloudflare Workers
 *
 * Every page is statically generated at build time via toSSG, and Workers Assets
 * (binding = ASSETS, directory = ./public) serves it directly. This Worker only
 * handles `/api/*` (wrangler.toml's run_worker_first = ["/api/*"]) — no SSR at all,
 * not even for the todos page itself (CSR fresh mount, client/pages/todos.ts
 * fetches 'api/todos' on mount).
 *
 * Session management mirrors integrations/hono/server.tsx: multiple Workers
 * isolates run concurrently in production, so a single global array would cross
 * todo lists between visitors. An in-memory Map keyed by cookie (bf_session)
 * separates each visitor's state.
 */
import { Hono } from 'hono'
import type { Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { BASE_PATH } from './constants.ts'

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

const app = new Hono().basePath(BASE_PATH)

app.get('/api/todos', (c) => c.json(getSession(c).todos))

app.post('/api/todos', async (c) => {
  const session = getSession(c)
  const body = await c.req.json()
  const newTodo: Todo = { id: session.nextId++, text: body.text, done: false }
  session.todos.push(newTodo)
  return c.json(newTodo, 201)
})

app.put('/api/todos/:id', async (c) => {
  const id = Number.parseInt(c.req.param('id'), 10)
  if (Number.isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)

  const session = getSession(c)
  const body = await c.req.json()
  const todo = session.todos.find((t) => t.id === id)
  if (!todo) return c.json({ error: 'Todo not found' }, 404)

  if (body.text !== undefined) todo.text = body.text
  if (body.done !== undefined) todo.done = body.done
  return c.json(todo)
})

app.delete('/api/todos/:id', (c) => {
  const id = Number.parseInt(c.req.param('id'), 10)
  if (Number.isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)

  const session = getSession(c)
  const index = session.todos.findIndex((t) => t.id === id)
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

// Demo only — responses are canned, not a real LLM call. Ported verbatim from
// integrations/hono/server.tsx to show that the same SSE pattern (a plain Web
// Streams ReadableStream + Response, no hono/streaming) runs unmodified in a
// Cloudflare Worker whether the rest of the integration is SSR or CSR/SSG.
const FAKE_RESPONSES = [
  '[Dummy response] This text is streaming one character at a time via Server-Sent Events. Replace /api/ai-chat in worker.ts with a real LLM API to make this chat functional.',
  '[Dummy response] BarefootJS streams tokens using the SSE protocol. Each character arrives as a separate "data:" event. Wire up OpenAI or Anthropic here for real AI responses.',
  '[Dummy response] This response is randomly selected from a fixed list in worker.ts — it does not understand your message. Swap the endpoint for a real streaming LLM to fix that.',
  '[Dummy response] Lorem ipsum dolor sit amet. This is placeholder content demonstrating token-by-token SSE delivery. See /api/ai-chat in worker.ts to connect a real model.',
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
        await new Promise((r) => setTimeout(r, 30))
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

// run_worker_first: ["/api/*"] means anything outside /api/* never reaches this
// Worker (Workers Assets responds directly). This is just a fallback for the
// unlikely case of an unmatched /api/* subpath.
app.notFound((c) => c.json({ error: 'Not Found' }, 404))

export default app
