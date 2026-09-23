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

  test('freezing is deep: nested body/params/init objects are frozen too, not just the descriptor', () => {
    const body = { title: 'x', tags: ['a', 'b'], author: { name: 'y' } }
    const d = http.post('/api/posts', body)
    expect(Object.isFrozen(d.body)).toBe(true)
    expect(Object.isFrozen((d.body as typeof body).tags)).toBe(true)
    expect(Object.isFrozen((d.body as typeof body).author)).toBe(true)

    const params = { page: 1 }
    const withParams = http.get('/api/posts', params)
    expect(Object.isFrozen(withParams.params)).toBe(true)

    const init = { headers: { Authorization: 'x' } }
    const withInit = http.get('/api/posts', undefined, init)
    expect(Object.isFrozen(withInit.init)).toBe(true)
    expect(Object.isFrozen(withInit.init?.headers)).toBe(true)
  })

  test("the caller's own objects are copied, not frozen in place", () => {
    const body = { title: 'x', tags: ['a'] }
    const params = { page: 1 }
    const init = { headers: { Authorization: 'x' } }
    http.post('/api/posts', body, init)
    http.get('/api/posts', params)
    expect(Object.isFrozen(body)).toBe(false)
    expect(Object.isFrozen(body.tags)).toBe(false)
    expect(Object.isFrozen(params)).toBe(false)
    expect(Object.isFrozen(init.headers)).toBe(false)
    // A later in-place write (strict mode) must not throw.
    expect(() => {
      body.title = 'y'
      body.tags.push('b')
    }).not.toThrow()
  })

  test('a later write to the caller object changes neither the descriptor nor its key', () => {
    const body = { title: 'x' }
    const d = http.post('/api/posts', body)
    const keyBefore = requestKey(d)
    body.title = 'changed'
    expect((d.body as typeof body).title).toBe('x')
    expect(requestKey(d)).toBe(keyBefore)
  })
})

describe('public entry', () => {
  test('HttpError is exported from @barefootjs/client for instanceof checks on error()', async () => {
    const entry = await import('../src/index')
    expect(entry.HttpError).toBe(HttpError)
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
    expect(requestKey(d)).toBe('GET /api/posts?active=false&limit=10&page=0&verbose=true ')
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

  test('params key reordering produces the same key', () => {
    const a = http.get('/api/posts', { page: 1, sort: 'date' })
    const b = http.get('/api/posts', { sort: 'date', page: 1 })
    expect(requestKey(a)).toBe(requestKey(b))
  })

  test('a circular body raises a TypeError instead of overflowing the call stack', () => {
    const circular: Record<string, unknown> = { title: 'x' }
    circular.self = circular
    expect(() => requestKey(http.post('/api/posts', circular))).toThrow(TypeError)
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

  test('sends a JSON body with Content-Type: application/json; charset=utf-8', async () => {
    const { calls } = stubFetch(() => new Response(JSON.stringify({ id: 1 }), { status: 200 }))
    const result = await sendRequest(http.post<{ id: number }>('/api/posts', { title: 'x' }))
    expect(result).toEqual({ id: 1 })
    expect(calls.length).toBe(1)
    expect(calls[0]!.init.method).toBe('POST')
    expect(calls[0]!.init.body).toBe(JSON.stringify({ title: 'x' }))
    expect(new Headers(calls[0]!.init.headers).get('content-type')).toBe('application/json; charset=utf-8')
  })

  test('a request with no body sends no Content-Type header', async () => {
    const { calls } = stubFetch(() => new Response(JSON.stringify([]), { status: 200 }))
    await sendRequest(http.get('/api/posts', { page: 1 }))
    expect(new Headers(calls[0]!.init.headers).has('content-type')).toBe(false)
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

  test('a non-2xx HEAD rejects with HttpError, like any other method', async () => {
    stubFetch(() => new Response(null, { status: 404 }))
    await expect(sendRequest(http.head('/api/posts'))).rejects.toMatchObject({ status: 404 })
    await expect(sendRequest(http.head('/api/posts'))).rejects.toBeInstanceOf(HttpError)
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
    expect(new Headers(calls[0]!.init.headers).get('content-type')).toBe('application/vnd.api+json')
  })

  // Header names are case-insensitive: an override spelled `content-type`
  // must replace the default, not be sent alongside it as
  // "application/json, text/plain".
  test('an init.headers override of Content-Type is case-insensitive', async () => {
    const { calls } = stubFetch(() => new Response(JSON.stringify({}), { status: 200 }))
    await sendRequest(http.post('/api/posts', { a: 1 }, { headers: { 'content-type': 'application/vnd.api+json' } }))
    expect(new Headers(calls[0]!.init.headers).get('content-type')).toBe('application/vnd.api+json')
  })

  test('every request asks for JSON with Accept: application/json, */*;q=0.5', async () => {
    const { calls } = stubFetch(() => new Response(JSON.stringify({}), { status: 200 }))
    await sendRequest(http.get('/api/posts'))
    await sendRequest(http.post('/api/upload', new URLSearchParams({ a: '1' })))
    expect(calls.map((c) => new Headers(c.init.headers).get('accept'))).toEqual([
      'application/json, */*;q=0.5',
      'application/json, */*;q=0.5',
    ])
  })

  test('an init.headers Accept, in any casing, replaces the default', async () => {
    const { calls } = stubFetch(() => new Response(JSON.stringify({}), { status: 200 }))
    await sendRequest(http.get('/api/posts', undefined, { headers: { accept: 'application/vnd.api+json' } }))
    expect(new Headers(calls[0]!.init.headers).get('accept')).toBe('application/vnd.api+json')
  })

  test('other init.headers are sent alongside the default Content-Type', async () => {
    const { calls } = stubFetch(() => new Response(JSON.stringify({}), { status: 200 }))
    await sendRequest(http.post('/api/posts', { a: 1 }, { headers: { Authorization: 'Bearer x' } }))
    const headers = new Headers(calls[0]!.init.headers)
    expect(headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(headers.get('authorization')).toBe('Bearer x')
  })
})

// --- non-JSON bodies ---------------------------------------------------------
//
// JSON is the default; any other body fetch can send is sent the way fetch
// would send it. Each case builds the real `Request` fetch would build from
// `sendRequest`'s arguments, so the asserted `Content-Type` and bytes are what
// goes on the wire, not what `sendRequest` happened to pass along.

describe('non-JSON bodies', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  async function sent(descriptor: HttpDescriptor<unknown>): Promise<Request> {
    let request: Request | undefined
    // @ts-expect-error — test stub
    globalThis.fetch = (url: string, init: RequestInit) => {
      request = new Request(`http://localhost${url}`, init)
      return Promise.resolve(new Response('{}', { status: 200 }))
    }
    await sendRequest(descriptor)
    return request!
  }

  test('a string is sent as-is, as text/plain;charset=UTF-8', async () => {
    const req = await sent(http.post('/api/notes', 'hello'))
    expect(req.headers.get('content-type')).toBe('text/plain;charset=UTF-8')
    expect(await req.text()).toBe('hello')
  })

  test('a string with a Content-Type override is sent as-is under that type', async () => {
    const json = JSON.stringify({ a: 1 })
    const req = await sent(http.post('/api/notes', json, { headers: { 'content-type': 'application/json' } }))
    expect(req.headers.get('content-type')).toBe('application/json')
    expect(await req.text()).toBe('{"a":1}')
  })

  test('FormData is sent as multipart with the boundary fetch chose', async () => {
    const form = new FormData()
    form.append('title', 'x')
    form.append('file', new File(['abc'], 'a.txt', { type: 'text/plain' }))
    const req = await sent(http.post('/api/upload', form))
    expect(req.headers.get('content-type')).toMatch(/^multipart\/form-data; ?boundary=/)
    const received = await req.formData()
    expect(received.get('title')).toBe('x')
    expect(await (received.get('file') as File).text()).toBe('abc')
  })

  test('URLSearchParams is sent as application/x-www-form-urlencoded', async () => {
    const req = await sent(http.post('/api/login', new URLSearchParams({ user: 'a', pass: 'b c' })))
    expect(req.headers.get('content-type')).toMatch(/^application\/x-www-form-urlencoded/)
    expect(await req.text()).toBe('user=a&pass=b+c')
  })

  test("a Blob is sent with the Blob's own type", async () => {
    const req = await sent(http.put('/api/avatar', new Blob(['png-bytes'], { type: 'image/png' })))
    expect(req.headers.get('content-type')).toBe('image/png')
    expect(await req.text()).toBe('png-bytes')
  })

  test('bytes (ArrayBuffer and views) are sent unchanged', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const req = await sent(http.put('/api/raw', bytes, { headers: { 'Content-Type': 'application/octet-stream' } }))
    expect(req.headers.get('content-type')).toBe('application/octet-stream')
    expect(new Uint8Array(await req.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    const fromBuffer = await sent(http.put('/api/raw', new Uint8Array([4, 5]).buffer))
    expect(new Uint8Array(await fromBuffer.arrayBuffer())).toEqual(new Uint8Array([4, 5]))
  })

  test("later writes to the caller's FormData, URLSearchParams or bytes do not reach the request", async () => {
    const form = new FormData()
    form.append('a', '1')
    const params = new URLSearchParams({ a: '1' })
    const bytes = new Uint8Array([1])
    const dForm = http.post('/x', form)
    const dParams = http.post('/x', params)
    const dBytes = http.post('/x', bytes)
    const keys = [requestKey(dForm), requestKey(dParams), requestKey(dBytes)]
    form.append('b', '2')
    params.append('b', '2')
    bytes[0] = 9
    expect([requestKey(dForm), requestKey(dParams), requestKey(dBytes)]).toEqual(keys)
    expect([...(await (await sent(dForm)).formData()).keys()]).toEqual(['a'])
    expect(await (await sent(dParams)).text()).toBe('a=1')
    expect(new Uint8Array(await (await sent(dBytes)).arrayBuffer())).toEqual(new Uint8Array([1]))
  })

  test('a ReadableStream body is refused where the descriptor is built', () => {
    const stream = new ReadableStream({ start: (c) => c.close() })
    expect(() => http.post('/api/upload', stream)).toThrow(TypeError)
    expect(() => http.post('/api/upload', stream)).toThrow(/http\.post: a ReadableStream body is not supported/)
  })
})

describe('requestKey for non-JSON bodies', () => {
  test('a string and the JSON body it spells out get different keys', () => {
    expect(requestKey(http.post('/x', '{"a":1}'))).not.toBe(requestKey(http.post('/x', { a: 1 })))
  })

  test('equal string-only FormData / URLSearchParams contents give equal keys; different contents do not', () => {
    const form = (title: string) => {
      const f = new FormData()
      f.append('title', title)
      f.append('tag', 'a')
      return f
    }
    expect(requestKey(http.post('/x', form('x')))).toBe(requestKey(http.post('/x', form('x'))))
    expect(requestKey(http.post('/x', form('y')))).not.toBe(requestKey(http.post('/x', form('x'))))
    expect(requestKey(http.post('/x', new URLSearchParams('a=1')))).toBe(requestKey(http.post('/x', new URLSearchParams('a=1'))))
    expect(requestKey(http.post('/x', new URLSearchParams('a=2')))).not.toBe(requestKey(http.post('/x', new URLSearchParams('a=1'))))
  })

  test('FormData holding a file never shares a key, even with the same file or the same file metadata', () => {
    const withFile = (file: File) => {
      const f = new FormData()
      f.append('file', file)
      return f
    }
    const file = new File(['abc'], 'a.txt', { type: 'text/plain', lastModified: 0 })
    expect(requestKey(http.post('/x', withFile(file)))).not.toBe(requestKey(http.post('/x', withFile(file))))
    const sameMeta = new File(['xyz'], 'a.txt', { type: 'text/plain', lastModified: 0 })
    expect(requestKey(http.post('/x', withFile(file)))).not.toBe(requestKey(http.post('/x', withFile(sameMeta))))
    // …but one descriptor's key is stable, so it can still be matched against itself.
    const d = http.post('/x', withFile(file))
    expect(requestKey(d)).toBe(requestKey(d))
  })

  test('the same Blob gives the same key; bytes never share a key', () => {
    const blob = new Blob(['x'])
    expect(requestKey(http.put('/x', blob))).toBe(requestKey(http.put('/x', blob)))
    expect(requestKey(http.put('/x', new Blob(['x'])))).not.toBe(requestKey(http.put('/x', new Blob(['x']))))
    const bytes = new Uint8Array([1])
    expect(requestKey(http.put('/x', bytes))).not.toBe(requestKey(http.put('/x', bytes)))
  })
})
