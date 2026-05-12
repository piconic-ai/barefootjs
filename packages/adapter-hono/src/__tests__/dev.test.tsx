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
// `BfDevReload` lives in `app.ts` (runtime-agnostic, html-tagged-template
// based); `createDevReloader` lives in `dev.tsx` (Node fs-watch based).
import { BfDevReload } from '../app'
import { createDevReloader } from '../dev'

describe('BfDevReload', () => {
  // The runtime gate lives in `barefootDevReload` (middleware). When
  // it's mounted with `enabled: false` it never publishes the endpoint
  // to the request context, so <BfDevReload /> falls back to `null`.
  // Tests below exercise the component directly, which means the
  // "endpoint provided" branch is the snippet branch and the
  // "no endpoint, no context" branch is the null branch.

  it('renders the EventSource snippet when an endpoint is provided', () => {
    const html = renderToString(<BfDevReload endpoint="/_bf/reload" />)
    expect(html).toContain('<script>')
    expect(html).toContain('new EventSource(\"/_bf/reload\")')
    expect(html).toContain("addEventListener('reload'")
  })

  it('renders nothing when no endpoint is available (no context, no prop)', () => {
    const html = renderToString(<BfDevReload />)
    expect(html).toBe('')
  })

  it('respects a custom endpoint passed as a prop', () => {
    const html = renderToString(<BfDevReload endpoint="/__reload" />)
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
