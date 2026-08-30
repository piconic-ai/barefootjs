import { describe, test, expect } from 'bun:test'
import { withCacheControl } from '../cache-control'

const req = (path: string, init?: RequestInit) => new Request(`https://barefootjs.dev${path}`, init)

describe('withCacheControl', () => {
  test('adds a long-lived Cache-Control to a cacheable HTML response', () => {
    const res = withCacheControl(req('/integrations/flask/'), new Response('<html></html>'))
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600, stale-while-revalidate=86400')
  })

  test('adds an immutable Cache-Control to a fingerprinted asset', () => {
    const res = withCacheControl(req('/integrations/flask/client/router-entry-abc123.js'), new Response(''))
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
  })

  test('leaves non-GET/HEAD requests untouched', () => {
    const res = withCacheControl(req('/integrations/flask/todos', { method: 'POST' }), new Response(''))
    expect(res.headers.has('Cache-Control')).toBe(false)
  })

  test('leaves error responses untouched', () => {
    const res = withCacheControl(req('/integrations/flask/missing'), new Response('not found', { status: 404 }))
    expect(res.headers.has('Cache-Control')).toBe(false)
  })

  test('does not override a Cache-Control the backend already set', () => {
    const backendResponse = new Response('', { headers: { 'Cache-Control': 'no-store' } })
    const res = withCacheControl(req('/integrations/flask/'), backendResponse)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  test('preserves status and body', async () => {
    const res = withCacheControl(req('/integrations/flask/'), new Response('hello', { status: 200 }))
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello')
  })
})
