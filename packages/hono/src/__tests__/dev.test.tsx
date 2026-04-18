/** @jsxImportSource hono/jsx */
/**
 * BfDevReload / createDevReloader tests
 *
 * Verifies the dev-gate (no leak into production) and the basic SSE wire
 * format so a regression in the build-id watcher is caught before E2E.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderToString } from 'hono/jsx/dom/server'
import { BfDevReload, createDevReloader } from '../dev'

describe('BfDevReload', () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
  })

  it('renders the EventSource snippet when enabled', () => {
    const html = renderToString(<BfDevReload enabled={true} endpoint="/_bf/reload" />)
    expect(html).toContain('<script>')
    expect(html).toContain('new EventSource(\"/_bf/reload\")')
    expect(html).toContain("addEventListener('reload'")
  })

  it('renders nothing when explicitly disabled', () => {
    const html = renderToString(<BfDevReload enabled={false} />)
    expect(html).toBe('')
  })

  it('renders nothing when NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production'
    const html = renderToString(<BfDevReload />)
    expect(html).toBe('')
  })

  it('renders in non-production by default', () => {
    process.env.NODE_ENV = 'development'
    const html = renderToString(<BfDevReload />)
    expect(html).toContain('EventSource')
  })

  it('respects custom endpoint', () => {
    const html = renderToString(<BfDevReload enabled={true} endpoint="/__reload" />)
    expect(html).toContain('new EventSource(\"/__reload\")')
  })
})

describe('createDevReloader', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bf-dev-reloader-'))
    mkdirSync(join(dir, '.dev'), { recursive: true })
    writeFileSync(join(dir, '.dev', 'build-id'), '1000')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns 404 when disabled', async () => {
    const app = new Hono()
    app.get('/_bf/reload', createDevReloader({ distDir: dir, enabled: false }))

    const res = await app.request('/_bf/reload')
    expect(res.status).toBe(404)
  })

  it('streams initial hello with current build-id', async () => {
    const app = new Hono()
    app.get('/_bf/reload', createDevReloader({ distDir: dir, enabled: true }))

    const ctrl = new AbortController()
    const res = await app.request(new Request('http://localhost/_bf/reload', { signal: ctrl.signal }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/event-stream')

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let received = ''
    // Accumulate until the hello event lands (first two chunks should suffice).
    for (let i = 0; i < 4 && !received.includes('event: hello'); i++) {
      const { value, done } = await reader.read()
      if (done) break
      received += decoder.decode(value)
    }

    expect(received).toContain('retry: 1000')
    expect(received).toContain('event: hello')
    expect(received).toContain('data: 1000')

    ctrl.abort()
    try { await reader.cancel() } catch { /* already closed */ }
  })

  // Regression: when a client reconnects after a build happened during its
  // disconnected window, it must see `reload` (not `hello`), otherwise the
  // missed rebuild silently stays unpainted until the next change.
  it('emits reload on reconnect when Last-Event-ID is stale', async () => {
    const app = new Hono()
    app.get('/_bf/reload', createDevReloader({ distDir: dir, enabled: true }))

    const ctrl = new AbortController()
    const req = new Request('http://localhost/_bf/reload', {
      headers: { 'Last-Event-ID': '999' },
      signal: ctrl.signal,
    })
    const res = await app.request(req)

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let received = ''
    for (let i = 0; i < 4 && !received.includes('event: '); i++) {
      const { value, done } = await reader.read()
      if (done) break
      received += decoder.decode(value)
    }

    expect(received).toContain('event: reload')
    expect(received).not.toContain('event: hello')
    expect(received).toContain('data: 1000')

    ctrl.abort()
    try { await reader.cancel() } catch { /* already closed */ }
  })
})
