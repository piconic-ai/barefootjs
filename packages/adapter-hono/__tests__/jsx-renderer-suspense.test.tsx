/** @jsxImportSource @barefootjs/hono/jsx */
/**
 * Test jsxRenderer + Suspense with @barefootjs/hono/jsx
 */
import { describe, it, expect } from 'bun:test'
import { Hono } from 'hono'
import { jsxRenderer } from 'hono/jsx-renderer'
import { Suspense } from 'hono/jsx/streaming'

describe('@barefootjs/hono/jsx with jsxRenderer + Suspense', () => {
  it('renders simple JSX without Suspense', async () => {
    const app = new Hono()
    app.use(jsxRenderer(({ children }) => (
      <html><body>{children}</body></html>
    ), { stream: true }))

    app.get('/', (c) => c.render(<h1>Hello</h1>))

    const res = await app.request('/')
    const text = await res.text()
    expect(text).toContain('<h1>Hello</h1>')
  })

  it('renders Suspense with sync fallback and async content', async () => {
    const app = new Hono()
    app.use(jsxRenderer(({ children }) => (
      <html><body>{children}</body></html>
    ), { stream: true }))

    const AsyncContent = async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return <span>Loaded</span>
    }

    app.get('/', (c) => c.render(
      <Suspense fallback={<p>Loading...</p>}>
        <AsyncContent />
      </Suspense>
    ))

    const res = await app.request('/')
    const text = await res.text()

    // Should contain the resolved content
    expect(text).toContain('Loaded')
  })
})
