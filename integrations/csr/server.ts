/**
 * BarefootJS CSR example server
 *
 * Serves static HTML pages + compiled client JS.
 * Each page contains an empty mount point where components render via CSR.
 */

import { resolve, dirname } from 'node:path'

const ROOT_DIR = dirname(import.meta.path)
const PAGES_DIR = resolve(ROOT_DIR, 'pages')
const DIST_DIR = resolve(ROOT_DIR, 'dist')
const SHARED_DIR = resolve(ROOT_DIR, '../shared')

// In-memory todo storage (same as Hono server)
type Todo = { id: number; text: string; done: boolean }
let todos: Todo[] = [
  { id: 1, text: 'Setup project', done: false },
  { id: 2, text: 'Create components', done: false },
  { id: 3, text: 'Write tests', done: true },
]
let nextId = 4

const server = Bun.serve({
  port: 3002,
  async fetch(req) {
    const url = new URL(req.url)
    const path = url.pathname

    // Static files: compiled JS
    if (path.startsWith('/static/')) {
      const filePath = resolve(DIST_DIR, path.slice('/static/'.length))
      if (!filePath.startsWith(DIST_DIR + '/') && filePath !== DIST_DIR) {
        return new Response('Forbidden', { status: 403 })
      }
      const file = Bun.file(filePath)
      if (await file.exists()) {
        const ext = filePath.split('.').pop()
        const contentType = ext === 'js' ? 'application/javascript' : 'text/plain'
        return new Response(file, { headers: { 'Content-Type': contentType } })
      }
      return new Response('Not Found', { status: 404 })
    }

    // Shared styles
    if (path.startsWith('/shared/')) {
      const filePath = resolve(SHARED_DIR, path.slice('/shared/'.length))
      if (!filePath.startsWith(SHARED_DIR + '/') && filePath !== SHARED_DIR) {
        return new Response('Forbidden', { status: 403 })
      }
      const file = Bun.file(filePath)
      if (await file.exists()) {
        const ext = filePath.split('.').pop()
        const contentType = ext === 'css' ? 'text/css' : 'text/plain'
        return new Response(file, { headers: { 'Content-Type': contentType } })
      }
      return new Response('Not Found', { status: 404 })
    }

    // REST API for todos
    if (path.startsWith('/api/todos')) {
      return handleTodoApi(req, path)
    }

    // HTML pages
    const pageName = path === '/' ? 'index' : path.slice(1)
    const htmlPath = resolve(PAGES_DIR, `${pageName}.html`)
    const htmlFile = Bun.file(htmlPath)
    if (await htmlFile.exists()) {
      return new Response(htmlFile, { headers: { 'Content-Type': 'text/html' } })
    }

    return new Response('Not Found', { status: 404 })
  },
})

function handleTodoApi(req: Request, path: string): Response {
  const method = req.method

  // POST /api/todos/reset
  if (path === '/api/todos/reset' && method === 'POST') {
    todos = [
      { id: 1, text: 'Setup project', done: false },
      { id: 2, text: 'Create components', done: false },
      { id: 3, text: 'Write tests', done: true },
    ]
    nextId = 4
    return Response.json({ success: true })
  }

  // GET /api/todos
  if (path === '/api/todos' && method === 'GET') {
    return Response.json(todos)
  }

  // POST /api/todos
  if (path === '/api/todos' && method === 'POST') {
    return (async () => {
      const body = await req.json()
      const newTodo: Todo = { id: nextId++, text: body.text, done: false }
      todos.push(newTodo)
      return Response.json(newTodo, { status: 201 })
    })()
  }

  // PUT /api/todos/:id
  const putMatch = path.match(/^\/api\/todos\/(\d+)$/)
  if (putMatch && method === 'PUT') {
    return (async () => {
      const id = parseInt(putMatch[1], 10)
      const body = await req.json()
      const todo = todos.find(t => t.id === id)
      if (!todo) return Response.json({ error: 'Todo not found' }, { status: 404 })

      if (body.text !== undefined) todo.text = body.text
      if (body.done !== undefined) todo.done = body.done
      return Response.json(todo)
    })()
  }

  // DELETE /api/todos/:id
  const deleteMatch = path.match(/^\/api\/todos\/(\d+)$/)
  if (deleteMatch && method === 'DELETE') {
    const id = parseInt(deleteMatch[1], 10)
    const index = todos.findIndex(t => t.id === id)
    if (index === -1) return Response.json({ error: 'Todo not found' }, { status: 404 })

    todos.splice(index, 1)
    return Response.json({ success: true })
  }

  return Response.json({ error: 'Not Found' }, { status: 404 })
}

console.log(`CSR example server running on http://localhost:${server.port}`)
