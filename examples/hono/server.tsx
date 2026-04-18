/**
 * BarefootJS + Hono/JSX SSR Server
 *
 * Uses hono/jsx with BarefootJS components.
 * Components are imported as JSX and rendered server-side.
 */

import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { createDevReloader } from '@barefootjs/hono/dev'
import { renderer } from './renderer'
import Counter from '@/components/Counter'
import Toggle from '@/components/Toggle'
import TodoApp from '@/components/TodoApp'
import TodoAppSSR from '@/components/TodoAppSSR'
import ReactiveProps, { PropsReactivityComparison } from '@/components/ReactiveProps'
import Form from '@/components/Form'
import PortalExample from '@/components/PortalExample'
import ConditionalReturn from '@/components/ConditionalReturn'
import { AIChatPage } from './components/AIChatPage'

const app = new Hono()

app.use(renderer)

app.use('/static/*', serveStatic({
  root: './dist',
  rewriteRequestPath: (path) => path.replace('/static', ''),
}))

// Serve shared styles
app.use('/shared/*', serveStatic({
  root: '../shared',
  rewriteRequestPath: (path) => path.replace('/shared', ''),
}))

// Dev-only browser auto-reload (no-op in production).
app.get('/_bf/reload', createDevReloader({ distDir: './dist' }))

// In-memory todo storage
type Todo = { id: number; text: string; done: boolean }
let todos: Todo[] = [
  { id: 1, text: 'Setup project', done: false },
  { id: 2, text: 'Create components', done: false },
  { id: 3, text: 'Write tests', done: true },
]
let nextId = 4

// Pages - using JSX components directly
app.get('/', (c) => {
  return c.render(
    <div>
      <h1>BarefootJS + Hono/JSX Examples</h1>
      <nav>
        <ul>
          <li><a href="/counter">Counter</a></li>
          <li><a href="/toggle">Toggle</a></li>
          <li><a href="/todos">Todo (@client)</a></li>
          <li><a href="/todos-ssr">Todo (no @client markers)</a></li>
          <li><a href="/ai-chat">AI Chat (SSE Streaming)</a></li>
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
      <p><a href="/">← Back</a></p>
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
      <p><a href="/">← Back</a></p>
    </div>
  )
})

app.get('/todos', (c) => {
  return c.render(
    <div id="app">
      <TodoApp initialTodos={todos} />
      <p><a href="/">← Back</a></p>
    </div>
  )
})

app.get('/todos-ssr', (c) => {
  return c.render(
    <div id="app">
      <TodoAppSSR initialTodos={todos} />
      <p><a href="/">← Back</a></p>
    </div>
  )
})

// Reactive Props test page (verifies reactivity model from spec/compiler.md)
app.get('/reactive-props', (c) => {
  return c.render(
    <div>
      <h1>Reactive Props Test</h1>
      <ReactiveProps />
      <p><a href="/">← Back</a></p>
    </div>
  )
})

// Props Reactivity Comparison test page
// Demonstrates difference between props.xxx (reactive) and destructured (not reactive)
app.get('/props-reactivity', (c) => {
  return c.render(
    <div>
      <h1>Props Reactivity Comparison</h1>
      <PropsReactivityComparison />
      <p><a href="/">← Back</a></p>
    </div>
  )
})

// Form example (checkbox + button interaction)
app.get('/form', (c) => {
  return c.render(
    <div>
      <h1>Form Example</h1>
      <Form />
      <p><a href="/">← Back</a></p>
    </div>
  )
})

// Portal example
app.get('/portal', (c) => {
  return c.render(
    <div>
      <h1>Portal Example</h1>
      <PortalExample />
      <p><a href="/">← Back</a></p>
    </div>
  )
})

// Conditional return (if/else JSX branches)
app.get('/conditional-return', (c) => {
  return c.render(
    <div>
      <h1>Conditional Return Example</h1>
      <ConditionalReturn />
      <p><a href="/">← Back</a></p>
    </div>
  )
})

app.get('/conditional-return-link', (c) => {
  return c.render(
    <div>
      <h1>Conditional Return Example (Link)</h1>
      <ConditionalReturn variant="link" />
      <p><a href="/">← Back</a></p>
    </div>
  )
})

// AI Chat with SSE streaming
app.get('/ai-chat', (c) => {
  return c.render(<AIChatPage />)
})

// SSE endpoint: streams a dummy response token by token.
// Replace this endpoint with a real LLM streaming API (e.g. OpenAI, Anthropic) for production use.
const FAKE_RESPONSES = [
  '[Dummy response] This text is streaming one character at a time via Server-Sent Events. Replace /api/ai-chat in server.tsx with a real LLM API to make this chat functional.',
  '[Dummy response] BarefootJS streams tokens using the SSE protocol. Each character arrives as a separate "data:" event. Wire up OpenAI or Anthropic here for real AI responses.',
  '[Dummy response] This response is randomly selected from a fixed list in server.tsx — it does not understand your message. Swap the endpoint for a real streaming LLM to fix that.',
  '[Dummy response] Lorem ipsum dolor sit amet. This is placeholder content demonstrating token-by-token SSE delivery. See /api/ai-chat in server.tsx to connect a real model.',
  '[Dummy response] I am not a real AI. This demo exists only to show how BarefootJS handles SSE streaming on the client side. Replace me with a real LLM endpoint!',
]

app.get('/api/ai-chat', () => {
  const text = FAKE_RESPONSES[Math.floor(Math.random() * FAKE_RESPONSES.length)]
  const chars = [...text] // Unicode-safe split

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

// REST API
app.get('/api/todos', (c) => c.json(todos))

app.post('/api/todos', async (c) => {
  const body = await c.req.json()
  const newTodo: Todo = { id: nextId++, text: body.text, done: false }
  todos.push(newTodo)
  return c.json(newTodo, 201)
})

app.put('/api/todos/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)

  const body = await c.req.json()
  const todo = todos.find(t => t.id === id)
  if (!todo) return c.json({ error: 'Todo not found' }, 404)

  if (body.text !== undefined) todo.text = body.text
  if (body.done !== undefined) todo.done = body.done
  return c.json(todo)
})

app.delete('/api/todos/:id', (c) => {
  const id = parseInt(c.req.param('id'), 10)
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400)

  const index = todos.findIndex(t => t.id === id)
  if (index === -1) return c.json({ error: 'Todo not found' }, 404)

  todos.splice(index, 1)
  return c.json({ success: true })
})

// Reset todos to initial state (for testing)
app.post('/api/todos/reset', (c) => {
  todos = [
    { id: 1, text: 'Setup project', done: false },
    { id: 2, text: 'Create components', done: false },
    { id: 3, text: 'Write tests', done: true },
  ]
  nextId = 4
  return c.json({ success: true })
})

export default { port: 3001, fetch: app.fetch }
