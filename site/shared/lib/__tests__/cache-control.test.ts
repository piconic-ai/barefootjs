import { describe, test, expect } from 'bun:test'
import { Hono } from 'hono'
import { cacheControl } from '../cache-control'

function buildApp() {
  const app = new Hono()
  app.use('*', cacheControl)
  app.get('/docs/quick-start', (c) => c.body('<html></html>', 200, { 'Content-Type': 'text/html' }))
  app.get('/og', (c) => c.body('png', 200, { 'Cache-Control': 'public, max-age=86400, immutable' }))
  app.get('/missing', (c) => c.body('not found', 404))
  app.post('/api/echo', (c) => c.body('ok'))
  app.get('/login', (c) => c.body('<html></html>', 200, { 'Set-Cookie': 'session=abc; HttpOnly' }))
  app.get('/account', (c) => c.body('<html></html>'))
  return app
}

describe('cacheControl middleware', () => {
  test('sets a default Cache-Control on a GET route with none', async () => {
    const res = await buildApp().request('/docs/quick-start')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=3600')
  })

  test('leaves a route that already set its own Cache-Control alone', async () => {
    const res = await buildApp().request('/og')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400, immutable')
  })

  test('does not cache error responses', async () => {
    const res = await buildApp().request('/missing')
    expect(res.headers.has('Cache-Control')).toBe(false)
  })

  test('does not cache non-GET/HEAD responses', async () => {
    const res = await buildApp().request('/api/echo', { method: 'POST' })
    expect(res.headers.has('Cache-Control')).toBe(false)
  })

  test('does not cache a response that sets a session cookie', async () => {
    const res = await buildApp().request('/login')
    expect(res.headers.has('Cache-Control')).toBe(false)
  })

  test('does not cache a request that already carries a session cookie', async () => {
    const res = await buildApp().request('/account', { headers: { Cookie: 'session=abc' } })
    expect(res.headers.has('Cache-Control')).toBe(false)
  })
})
