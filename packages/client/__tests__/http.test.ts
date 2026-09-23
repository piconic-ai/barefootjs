/**
 * `http` request descriptors (spec/async.md §7.2, async layer 0 1/4, #3156).
 * Pure constructors + `requestKey` + `sendRequest`, all runtime-only.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { http, requestKey, isHttpDescriptor, isSafeMethod, HttpError, sendRequest } from '../src/http'
import type { HttpDescriptor } from '../src/http'

describe('http constructors do no I/O', () => {
  let fetchCalls = 0
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    fetchCalls = 0
    // @ts-expect-error — test stub
    globalThis.fetch = (...args: unknown[]) => {
      fetchCalls++
      throw new Error('fetch should never be called by a descriptor constructor')
    }
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('get/query/head/post/put/patch/delete never call fetch', () => {
    http.get('/api/posts', { page: 1 })
    http.query('/api/posts/search', { q: 'x' })
    http.head('/api/posts')
    http.post('/api/posts', { title: 'x' })
    http.put('/api/posts/1', { title: 'x' })
    http.patch('/api/posts/1', { title: 'x' })
    http.delete('/api/posts/1')
    expect(fetchCalls).toBe(0)
  })
})

describe('descriptors are frozen', () => {
  test('Object.isFrozen is true, and mutation is a no-op / throws in strict mode', () => {
    const d = http.get('/api/posts', { page: 1 })
    expect(Object.isFrozen(d)).toBe(true)
    expect(() => {
      // @ts-expect-error — intentional mutation attempt
      d.url = '/other'
    }).toThrow()
  })

  test('descriptor shape is { kind: "http", method, url, ... }', () => {
    const d = http.get('/api/posts')
    expect(d.kind).toBe('http')
    expect(d.method).toBe('GET')
    expect(d.url).toBe('/api/posts')
  })
})

describe('isHttpDescriptor / isSafeMethod', () => {
  test('recognises an http descriptor and rejects everything else', () => {
    expect(isHttpDescriptor(http.get('/x'))).toBe(true)
    expect(isHttpDescriptor(Promise.resolve(1))).toBe(false)
    expect(isHttpDescriptor(null)).toBe(false)
    expect(isHttpDescriptor(undefined)).toBe(false)
    expect(isHttpDescriptor('http')).toBe(false)
    expect(isHttpDescriptor({ kind: 'not-http' })).toBe(false)
  })

  test('GET/QUERY/HEAD are safe; POST/PUT/PATCH/DELETE are not', () => {
    expect(isSafeMethod('GET')).toBe(true)
    expect(isSafeMethod('QUERY')).toBe(true)
    expect(isSafeMethod('HEAD')).toBe(true)
    expect(isSafeMethod('POST')).toBe(false)
    expect(isSafeMethod('PUT')).toBe(false)
    expect(isSafeMethod('PATCH')).toBe(false)
    expect(isSafeMethod('DELETE')).toBe(false)
  })
})

describe('params omission and stringification', () => {
  test('null / undefined / empty string are omitted', () => {
    const d = http.get('/api/posts', { a: 'x', b: undefined, c: null, d: '', e: 'y' })
    expect(requestKey(d)).toBe('GET /api/posts?a=x&e=y ')
  })

  test('numbers and booleans are stringified, including 0 and false', () => {
    const d = http.get('/api/posts', { page: 0, active: false, limit: 10, verbose: true })
    expect(requestKey(d)).toBe('GET /api/posts?page=0&active=false&limit=10&verbose=true ')
  })

  test('arrays append one entry per member, skipping empty members', () => {
    const d = http.get('/api/posts', { tag: ['a', '', 'b', 2] })
    expect(requestKey(d)).toBe('GET /api/posts?tag=a&tag=b&tag=2 ')
  })

  test('no params and no surviving params both omit the query string', () => {
    expect(requestKey(http.get('/api/posts'))).toBe('GET /api/posts ')
    expect(requestKey(http.get('/api/posts', {}))).toBe('GET /api/posts ')
    expect(requestKey(http.get('/api/posts', { a: undefined }))).toBe('GET /api/posts ')
  })
})

describe('key stability', () => {
  test('object key reordering in body produces the same key', () => {
    const a = http.post('/api/comments', { a: 1, b: 2 })
    const b = http.post('/api/comments', { b: 2, a: 1 })
    expect(requestKey(a)).toBe(requestKey(b))
  })

  test('nested object key reordering also produces the same key', () => {
    const a = http.post('/api/comments', { outer: { x: 1, y: 2 }, z: 3 })
    const b = http.post('/api/comments', { z: 3, outer: { y: 2, x: 1 } })
    expect(requestKey(a)).toBe(requestKey(b))
  })

  test('array order in body is significant', () => {
    const a = http.post('/api/comments', { ids: [1, 2, 3] })
    const b = http.post('/api/comments', { ids: [3, 2, 1] })
    expect(requestKey(a)).not.toBe(requestKey(b))
  })

  test('headers and credentials are not part of the key', () => {
    const a = http.get('/api/posts', { page: 1 }, { headers: { Authorization: 'Bearer x' } })
    const b = http.get('/api/posts', { page: 1 }, { credentials: 'include' })
    expect(requestKey(a)).toBe(requestKey(b))
  })

  test('different methods on the same url/body produce different keys', () => {
    const a = http.post('/api/posts', { title: 'x' })
    const b = http.put('/api/posts', { title: 'x' })
    expect(requestKey(a)).not.toBe(requestKey(b))
  })
})

// --- sendRequest -----------------------------------------------------------

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): { calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = []
  // @ts-expect-error — test stub
  globalThis.fetch = (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return handler(url, init)
  }
  return { calls }
}

describe('sendRequest', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('sends a JSON body with Content-Type: application/json', async () => {
    const { calls } = stubFetch(() => new Response(JSON.stringify({ id: 1 }), { status: 200 }))
    const result = await sendRequest(http.post<{ id: number }>('/api/posts', { title: 'x' }))
    expect(result).toEqual({ id: 1 })
    expect(calls.length).toBe(1)
    expect(calls[0]!.init.method).toBe('POST')
    expect(calls[0]!.init.body).toBe(JSON.stringify({ title: 'x' }))
    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
  })

  test('a request with no body sends no Content-Type header', async () => {
    const { calls } = stubFetch(() => new Response(JSON.stringify([]), { status: 200 }))
    await sendRequest(http.get('/api/posts', { page: 1 }))
    const headers = (calls[0]!.init.headers ?? {}) as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
    expect(calls[0]!.url).toBe('/api/posts?page=1')
  })

  test('parses a 2xx JSON response', async () => {
    stubFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const result = await sendRequest(http.get<{ ok: boolean }>('/api/posts'))
    expect(result).toEqual({ ok: true })
  })

  test('a non-2xx response rejects with HttpError carrying status and JSON body', async () => {
    stubFetch(() => new Response(JSON.stringify({ message: 'not found' }), { status: 404 }))
    await expect(sendRequest(http.get('/api/posts/999'))).rejects.toMatchObject({
      status: 404,
      body: { message: 'not found' },
    })
  })

  test('a non-2xx response with a non-JSON body falls back to text', async () => {
    stubFetch(() => new Response('boom', { status: 500, headers: { 'Content-Type': 'text/plain' } }))
    try {
      await sendRequest(http.get('/api/posts'))
      throw new Error('expected sendRequest to reject')
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError)
      expect((err as HttpError).status).toBe(500)
      expect((err as HttpError).body).toBe('boom')
    }
  })

  test('HEAD resolves to undefined even on a 2xx with no body', async () => {
    stubFetch(() => new Response(null, { status: 200 }))
    const result = await sendRequest(http.head('/api/posts'))
    expect(result).toBeUndefined()
  })

  test('a network failure rejects with the underlying error unchanged', async () => {
    const networkError = new TypeError('Failed to fetch')
    // @ts-expect-error — test stub
    globalThis.fetch = () => Promise.reject(networkError)
    await expect(sendRequest(http.get('/api/posts'))).rejects.toBe(networkError)
  })

  test('init.headers can override the default Content-Type', async () => {
    const { calls } = stubFetch(() => new Response(JSON.stringify({}), { status: 200 }))
    await sendRequest(http.post('/api/posts', { a: 1 }, { headers: { 'Content-Type': 'application/vnd.api+json' } }))
    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/vnd.api+json')
  })
})
