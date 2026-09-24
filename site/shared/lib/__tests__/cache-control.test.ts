import { describe, test, expect } from 'bun:test'
import { Hono } from 'hono'
import { cacheControl, workersCacheControl } from '../cache-control'

function buildApp(middleware = cacheControl) {
  const app = new Hono()
  app.use('*', middleware)
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

  test('never sets an edge TTL: a Worker without Workers Cache must not carry one', async () => {
    const res = await buildApp().request('/docs/quick-start')
    expect(res.headers.has('Cloudflare-CDN-Cache-Control')).toBe(false)
  })

  test('explicitly opts error responses out of caching', async () => {
    const res = await buildApp().request('/missing')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  test('does not cache non-GET/HEAD responses', async () => {
    const res = await buildApp().request('/api/echo', { method: 'POST' })
    expect(res.headers.has('Cache-Control')).toBe(false)
  })

  test('explicitly opts out a response that sets a session cookie', async () => {
    const res = await buildApp().request('/login')
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })

  test('explicitly opts out a request that already carries a session cookie (regression pin for barefootjs#2784/#2790)', async () => {
    // Same shape that leaked in production for the integrations' copy of
    // this helper: a repeat visit sends Cookie but the response has no
    // fresh Set-Cookie and no Cache-Control, so Cloudflare's
    // heuristic-freshness default would cache it. Must come back explicitly
    // no-store, never merely headerless.
    const res = await buildApp().request('/account', { headers: { Cookie: 'session=abc' } })
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
  })
})

describe('workersCacheControl middleware', () => {
  test('sets the same browser Cache-Control as cacheControl', async () => {
    const res = await buildApp(workersCacheControl).request('/docs/quick-start')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=3600')
  })

  test('gives the edge (Workers Cache) a longer TTL than browsers on a cacheable response', async () => {
    const res = await buildApp(workersCacheControl).request('/docs/quick-start')
    expect(res.headers.get('Cloudflare-CDN-Cache-Control')).toBe('public, max-age=86400, stale-while-revalidate=604800')
  })

  test('never gives the edge a TTL on a response that is not cacheable', async () => {
    for (const [path, init] of [
      ['/missing', undefined],
      ['/login', undefined],
      ['/account', { headers: { Cookie: 'session=abc' } }],
    ] as const) {
      const res = await buildApp(workersCacheControl).request(path, init)
      expect(res.headers.get('Cache-Control')).toBe('private, no-store')
      expect(res.headers.has('Cloudflare-CDN-Cache-Control')).toBe(false)
    }
  })

  test('leaves the edge TTL of a route that set its own Cache-Control alone', async () => {
    const res = await buildApp(workersCacheControl).request('/og')
    expect(res.headers.has('Cloudflare-CDN-Cache-Control')).toBe(false)
  })
})
