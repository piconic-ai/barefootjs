/**
 * Real end-to-end coverage of `configureServer`: actually starts a Vite dev
 * server (via Vite's Node `createServer` API, the same function the `vite`
 * CLI itself calls) against `../../e2e-fixture-dev`, then drives it over
 * real HTTP/fs, mirroring `e2e-vite-build.test.ts`'s rigor for the build
 * half.
 *
 * The fixture's `components` dir is a SIBLING of the Vite project root
 * (`app/`), not a descendant — mirroring this monorepo's real layouts (an
 * app's `vite.config.ts` root is the backend app dir; components live in a
 * shared `ui/`-style directory next to it).
 *
 * The server-only regression (below) runs against its OWN dedicated server
 * that never fetches any `'use client'` component over HTTP. That isolation
 * matters: Vite's OWN internal `ensureWatchedFile` adds any file it has
 * transformed as a module to the watcher, regardless of this plugin. Fetch
 * Counter.tsx once and Vite itself starts watching THAT SPECIFIC FILE —
 * which would silently paper over a missing `server.watcher.add()` call the
 * moment a later test's "any change → full re-run" pass happens to also
 * pick up Greeting.tsx's already-edited-on-disk content. Keeping the
 * server-only regression on a server that never fetches Counter.tsx (or any
 * other client component) means the ONLY way Greeting.tsx's edit can ever
 * reach the watcher is this plugin's own explicit `server.watcher.add()` —
 * see `plugin.ts`'s `configureServer`.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { createServer, type ViteDevServer } from 'vite'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { GoTemplateAdapter } from '@barefootjs/go-template/adapter'
import { barefoot } from '../plugin.ts'
import { devRequestPath } from '../dev-server.ts'

const FIXTURE_ROOT = resolve(import.meta.dirname, '../../e2e-fixture-dev')
const APP_ROOT = join(FIXTURE_ROOT, 'app')
const COMPONENTS_DIR = join(FIXTURE_ROOT, 'components')
const COUNTER_PATH = join(COMPONENTS_DIR, 'Counter.tsx')
const GREETING_PATH = join(COMPONENTS_DIR, 'Greeting.tsx')

async function waitFor(check: () => Promise<boolean> | boolean, timeoutMs = 10_000): Promise<void> {
  const start = Date.now()
  for (;;) {
    if (await check()) return
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: condition not met within timeout')
    await new Promise(r => setTimeout(r, 50))
  }
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

function captureWsSends(server: ViteDevServer): { sent: unknown[]; restore: () => void } {
  const sent: unknown[] = []
  const originalSend = server.ws.send.bind(server.ws)
  server.ws.send = ((payload: unknown) => {
    sent.push(payload)
    return originalSend(payload as never)
  }) as typeof server.ws.send
  return { sent, restore: () => { server.ws.send = originalSend } }
}

function captureLoggerErrors(server: ViteDevServer): { errors: unknown[]; restore: () => void } {
  const errors: unknown[] = []
  const originalError = server.config.logger.error.bind(server.config.logger)
  server.config.logger.error = ((msg: string, opts?: unknown) => {
    errors.push(msg)
    return originalError(msg, opts as never)
  }) as typeof server.config.logger.error
  return { errors, restore: () => { server.config.logger.error = originalError } }
}

function countFullReloads(sent: unknown[]): number {
  return sent.filter(m => (m as { type?: string }).type === 'full-reload').length
}

async function startDevServer(
  templatesDir: string,
  extraServerOptions: Record<string, unknown> = {},
  afterEmit?: (ctx: { types: Map<string, string>; projectDir: string; templatesDir: string; outDir: string; mode: string }) => void,
) {
  const server = await createServer({
    configFile: false,
    root: APP_ROOT,
    logLevel: 'silent',
    server: {
      // Port 0 (OS-assigned) exercises the real requirement: the origin
      // this plugin bakes into templates MUST come from the actually
      // bound port (`httpServer.address()`), not the configured one.
      port: 0,
      strictPort: false,
      fs: { allow: [FIXTURE_ROOT] },
      // Polling sidesteps native fs-event flakiness some sandboxed /
      // containerized filesystems have with inotify.
      watch: { usePolling: true, interval: 30 },
      ...extraServerOptions,
    },
    plugins: [
      barefoot({
        adapter: new GoTemplateAdapter({ packageName: 'main' }),
        components: ['../components'],
        templates: templatesDir,
        afterEmit,
      }),
    ],
  })
  await server.listen()

  const address = server.httpServer!.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  const baseUrl = `http://localhost:${port}`
  return { server, baseUrl }
}

describe('e2e: vite dev server', () => {
  let server: ViteDevServer
  let templatesDir: string
  let baseUrl: string
  let originalCounterSource: string
  let originalGreetingSource: string

  beforeAll(async () => {
    templatesDir = await mkdtemp(join(tmpdir(), 'barefoot-vite-dev-views-'))
    originalCounterSource = await readFile(COUNTER_PATH, 'utf8')
    originalGreetingSource = await readFile(GREETING_PATH, 'utf8')
    ;({ server, baseUrl } = await startDevServer(templatesDir))

    // The initial eager pass runs off the httpServer's 'listening' event,
    // asynchronously with respect to `server.listen()` resolving — wait
    // for its output to actually land on disk before asserting on it.
    await waitFor(async () => (await readIfExists(join(templatesDir, 'Counter.tmpl'))) !== null)
    await waitFor(async () => (await readIfExists(join(templatesDir, 'Greeting.tmpl'))) !== null)
    await waitFor(async () => (await readIfExists(join(templatesDir, 'ServerParent.tmpl'))) !== null)
  }, 30_000)

  afterAll(async () => {
    // Always restore fixture sources and tear down the server, even if an
    // assertion above threw — a leaked dev server hangs the whole suite.
    await writeFile(COUNTER_PATH, originalCounterSource).catch(() => {})
    await writeFile(GREETING_PATH, originalGreetingSource).catch(() => {})
    await server?.close()
    await rm(templatesDir, { recursive: true, force: true })
  })

  test('fetching the "use client" component\'s module URL returns compiled client JS', async () => {
    const requestPath = devRequestPath({ root: APP_ROOT }, COUNTER_PATH)
    // Counter lives OUTSIDE the vite root, so this must resolve through
    // Vite's `/@fs/` absolute-path passthrough.
    expect(requestPath.startsWith('@fs/')).toBe(true)

    const res = await fetch(`${baseUrl}/${requestPath}`)
    expect(res.status).toBe(200)

    const body = await res.text()
    expect(body).toContain('createSignal')
    expect(body).toContain('hydrate(')
    expect(body).not.toContain('use client')
    expect(body).not.toMatch(/onClick=\{/)
  })

  test('emitted templates carry dev-origin URLs, including the @vite/client entry', async () => {
    const requestPath = devRequestPath({ root: APP_ROOT }, COUNTER_PATH)
    const template = await readFile(join(templatesDir, 'Counter.tmpl'), 'utf8')

    expect(template).toContain(`{{.Scripts.Register "${baseUrl}/@vite/client"}}`)
    expect(template).toContain(`{{.Scripts.Register "${baseUrl}/${requestPath}"}}`)
  })

  test('the server-only component has no script registration, dev or otherwise', async () => {
    const template = await readFile(join(templatesDir, 'Greeting.tmpl'), 'utf8')
    expect(template).not.toContain('Scripts.Register')
    expect(template).toContain('Hello')
  })

  // #2767: ServerParent has no 'use client' directive but renders Counter —
  // it must get its OWN dev-origin script registration (the `@vite/client`
  // entry plus its own `/@fs/…` module URL), mirroring the client-component
  // assertion above, and that module URL must actually serve compiled JS
  // whose init calls `initChild('Counter', ...)`.
  test('a server component that renders a client descendant also gets dev-origin script registration', async () => {
    const serverParentPath = join(COMPONENTS_DIR, 'ServerParent.tsx')
    const requestPath = devRequestPath({ root: APP_ROOT }, serverParentPath)
    const template = await readFile(join(templatesDir, 'ServerParent.tmpl'), 'utf8')

    expect(template).toContain(`{{.Scripts.Register "${baseUrl}/@vite/client"}}`)
    expect(template).toContain(`{{.Scripts.Register "${baseUrl}/${requestPath}"}}`)

    const res = await fetch(`${baseUrl}/${requestPath}`)
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('initChild("Counter"')
  })

  test('the templates dir carries the dev-artifact marker while the dev server is running', async () => {
    const marker = await readIfExists(join(templatesDir, '.barefootjs-dev-build'))
    expect(marker).not.toBeNull()
    expect(marker).toContain('DEV BUILD OUTPUT')
  })

  test('writes the cross-language dev-reload sentinel one directory above templates', async () => {
    const sentinel = await readIfExists(resolve(templatesDir, '..', '.dev', 'build-id'))
    expect(sentinel).not.toBeNull()
    expect(sentinel).toMatch(/^\d+$/)
  })

  test('editing a component updates the dev-reload sentinel value', async () => {
    const sentinelPath = resolve(templatesDir, '..', '.dev', 'build-id')
    const before = await readFile(sentinelPath, 'utf8')
    try {
      const edited = originalGreetingSource.replace('Hello', 'Hello!!!')
      await writeFile(GREETING_PATH, edited)

      await waitFor(async () => {
        const after = await readIfExists(sentinelPath)
        return after !== null && after !== before
      })
    } finally {
      await writeFile(GREETING_PATH, originalGreetingSource)
    }
  })

  test('a request with a cross-origin Origin header gets the localhost-only CORS default', async () => {
    const res = await fetch(`${baseUrl}/@vite/client`, {
      headers: { Origin: 'http://localhost:3010' },
    })
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3010')
  })

  test('editing a "use client" component re-emits its template and triggers full-reload', async () => {
    const { sent, restore } = captureWsSends(server)
    try {
      const edited = originalCounterSource.replace(
        '<button onClick=',
        '<button data-edited="counter-marker" onClick=',
      )
      await writeFile(COUNTER_PATH, edited)

      await waitFor(async () => {
        const tpl = await readIfExists(join(templatesDir, 'Counter.tmpl'))
        return tpl !== null && tpl.includes('data-edited="counter-marker"')
      })

      expect(countFullReloads(sent)).toBeGreaterThanOrEqual(1)
    } finally {
      restore()
      await writeFile(COUNTER_PATH, originalCounterSource)
    }
  })

  // The deterministic proof that passes never overlap and a mid-pass
  // trigger is coalesced into exactly one follow-up (not dropped, not
  // duplicated) is `debounced-serial-runner.test.ts` — it controls task
  // completion directly via manually-resolved promises, which a real e2e
  // test cannot: this fixture's eager pass finishes in low single-digit
  // milliseconds, far too fast to reliably force a real "change arrives
  // while a pass is in flight" race through wall-clock timing alone. This
  // test is the complementary end-to-end confirmation: real rapid disk
  // writes, through the real watcher, into the real debounced runner,
  // converge on the correct final state with no corruption and no crash.
  test('rapid successive edits converge on the final content with no corruption or errors', async () => {
    const { sent, restore: restoreWs } = captureWsSends(server)
    const { errors, restore: restoreLogger } = captureLoggerErrors(server)
    const EDIT_COUNT = 8

    try {
      // Fire edits back-to-back, faster than the 100ms watcher debounce —
      // simulates a save-twice-quickly / multi-file-save / `git checkout`.
      for (let i = 1; i <= EDIT_COUNT; i++) {
        await writeFile(
          COUNTER_PATH,
          originalCounterSource.replace('<button onClick=', `<button data-edit-n="${i}" onClick=`),
        )
      }

      // Give the debounce window plus a full eager pass time to settle.
      await waitFor(async () => {
        const tpl = await readIfExists(join(templatesDir, 'Counter.tmpl'))
        return tpl !== null && tpl.includes(`data-edit-n="${EDIT_COUNT}"`)
      })
      // Settle further: if an overlapping/racing pass were still in
      // flight and about to clobber the file with stale content, a short
      // wait would catch it reverting.
      await new Promise(r => setTimeout(r, 300))

      const finalTemplate = await readFile(join(templatesDir, 'Counter.tmpl'), 'utf8')
      expect(finalTemplate).toContain(`data-edit-n="${EDIT_COUNT}"`)
      // Not just the last edit "eventually" landing — no EARLIER edit's
      // marker should still be present either (that would mean two
      // template-writing passes raced and left mixed output).
      for (let i = 1; i < EDIT_COUNT; i++) {
        expect(finalTemplate).not.toContain(`data-edit-n="${i}"`)
      }

      expect(errors).toEqual([])
      const reloadCount = countFullReloads(sent)
      expect(reloadCount).toBeGreaterThanOrEqual(1)
      // A soft signal, not the proof (see the comment above the test): with
      // 8 back-to-back writes this fast, the underlying watcher's own
      // polling interval typically coalesces most of them into far fewer
      // raw events before this plugin's debounce even runs — so this
      // mainly guards against a REGRESSION to one-reload-per-write (e.g. a
      // watcher config change to non-polling native events), not against
      // debouncing being removed outright.
      expect(reloadCount).toBeLessThan(EDIT_COUNT)
    } finally {
      restoreWs()
      restoreLogger()
      await writeFile(COUNTER_PATH, originalCounterSource)
      await waitFor(async () => {
        const tpl = await readIfExists(join(templatesDir, 'Counter.tmpl'))
        return tpl !== null && !tpl.includes('data-edit-n=')
      })
    }
  })
})

describe('e2e: vite dev server — server-only component watcher regression', () => {
  // Deliberately its OWN server that never fetches ANY component over HTTP
  // (see this file's header comment for why that isolation is required for
  // this specific regression to be meaningful).
  let server: ViteDevServer
  let templatesDir: string
  let originalGreetingSource: string

  beforeAll(async () => {
    templatesDir = await mkdtemp(join(tmpdir(), 'barefoot-vite-dev-views-serveronly-'))
    originalGreetingSource = await readFile(GREETING_PATH, 'utf8')
    ;({ server } = await startDevServer(templatesDir))

    await waitFor(async () => (await readIfExists(join(templatesDir, 'Greeting.tmpl'))) !== null)
  }, 30_000)

  afterAll(async () => {
    await writeFile(GREETING_PATH, originalGreetingSource).catch(() => {})
    await server?.close()
    await rm(templatesDir, { recursive: true, force: true })
  })

  test('editing the server-only component (no "use client", never fetched over HTTP) still re-emits and reloads', async () => {
    // Greeting.tsx has no 'use client' directive, so it is NEVER part of
    // Rollup's module graph and Vite never transforms/serves it as a
    // module — the one path (`ensureWatchedFile`) that would otherwise get
    // it onto the watcher for free. It also lives outside the vite `root`,
    // so the default root-only chokidar watch doesn't cover it either. If
    // `plugin.ts` ever drops its `server.watcher.add(componentDirs)` call,
    // this test times out waiting for the reload.
    const { sent, restore } = captureWsSends(server)
    try {
      const edited = originalGreetingSource.replace('<p>', '<p data-edited="greeting-marker">')
      await writeFile(GREETING_PATH, edited)

      await waitFor(async () => {
        const tpl = await readIfExists(join(templatesDir, 'Greeting.tmpl'))
        return tpl !== null && tpl.includes('data-edited="greeting-marker"')
      })

      expect(sent.some(m => (m as { type?: string }).type === 'full-reload')).toBe(true)
    } finally {
      restore()
      await writeFile(GREETING_PATH, originalGreetingSource)
    }
  })
})

describe('e2e: vite dev server — afterEmit', () => {
  let server: ViteDevServer
  let templatesDir: string

  afterAll(async () => {
    await server?.close()
    await rm(templatesDir, { recursive: true, force: true })
  })

  test('fires with mode "dev" on the initial pass, and again on a tracked-file change', async () => {
    templatesDir = await mkdtemp(join(tmpdir(), 'barefoot-vite-dev-views-afteremit-'))
    const calls: Array<{ mode: string; projectDir: string; templatesDir: string; outDir: string; types: Map<string, string> }> = []
    ;({ server } = await startDevServer(templatesDir, {}, ctx => { calls.push(ctx as never) }))

    await waitFor(() => calls.length >= 1)
    expect(calls[0]?.mode).toBe('dev')
    expect(calls[0]?.templatesDir).toBe(templatesDir)
    expect(calls[0]?.projectDir).toBe(APP_ROOT)
    // No component in this fixture produces a `types` output (testAdapter-
    // shaped Go adapter with no Props needing a struct isn't guaranteed
    // either way) — the meaningful assertion is the narrow shape itself,
    // not that it's non-empty. Never carries client JS: the type alone
    // makes that impossible, this just pins the field set at runtime too.
    expect(Object.keys(calls[0] ?? {}).sort()).toEqual(['mode', 'outDir', 'projectDir', 'templatesDir', 'types'])

    const originalSource = await readFile(COUNTER_PATH, 'utf8')
    const callsBeforeEdit = calls.length
    const edited = originalSource.replace(
      '<button onClick=',
      '<button data-aftertemit-marker="1" onClick=',
    )
    await writeFile(COUNTER_PATH, edited)
    try {
      await waitFor(() => calls.length > callsBeforeEdit)
      expect(calls[calls.length - 1]?.mode).toBe('dev')
    } finally {
      await writeFile(COUNTER_PATH, originalSource)
    }
  })
})

describe('e2e: vite dev server — user-supplied server.cors is not overwritten', () => {
  let server: ViteDevServer
  let templatesDir: string

  afterAll(async () => {
    await server?.close()
    await rm(templatesDir, { recursive: true, force: true })
  })

  test('a user-configured server.cors survives untouched', async () => {
    templatesDir = await mkdtemp(join(tmpdir(), 'barefoot-vite-dev-views-cors-'))
    ;({ server } = await startDevServer(templatesDir, {
      cors: { origin: 'https://my-own-cors-policy.example.com' },
    }))

    expect(server.config.server.cors).toEqual({ origin: 'https://my-own-cors-policy.example.com' })
  })
})

describe('e2e: vite dev server — user-supplied server.cors: false is not overwritten', () => {
  let server: ViteDevServer
  let templatesDir: string

  afterAll(async () => {
    await server?.close()
    await rm(templatesDir, { recursive: true, force: true })
  })

  test('server.cors: false (explicitly disabled) survives untouched, unlike an unset value', async () => {
    templatesDir = await mkdtemp(join(tmpdir(), 'barefoot-vite-dev-views-cors-false-'))
    ;({ server } = await startDevServer(templatesDir, { cors: false }))

    // `!false` is `true` — a naive "fill in if falsy" check would replace
    // this with the localhost default. Only "fill in if unset" is correct.
    expect(server.config.server.cors).toBe(false)
  })
})

describe('e2e: vite dev server — creating and deleting a component file', () => {
  // Its own server + templates dir, and its own component file (never
  // touched by any other describe block), so these tests can freely
  // create/delete `.tsx` files without disturbing shared fixture state.
  let server: ViteDevServer
  let templatesDir: string
  const WIDGET_PATH = join(COMPONENTS_DIR, 'Widget.tsx')

  beforeAll(async () => {
    templatesDir = await mkdtemp(join(tmpdir(), 'barefoot-vite-dev-views-addunlink-'))
    ;({ server } = await startDevServer(templatesDir))
    await waitFor(async () => (await readIfExists(join(templatesDir, 'Counter.tmpl'))) !== null)
  }, 30_000)

  afterAll(async () => {
    await rm(WIDGET_PATH, { force: true })
    await server?.close()
    await rm(templatesDir, { recursive: true, force: true })
  })

  test('creating a new component file mid-session emits a template for it and reloads', async () => {
    const { sent, restore } = captureWsSends(server)
    try {
      await writeFile(WIDGET_PATH, 'export function Widget() { return <p>brand new</p> }\n')

      await waitFor(async () => (await readIfExists(join(templatesDir, 'Widget.tmpl'))) !== null)
      const template = await readFile(join(templatesDir, 'Widget.tmpl'), 'utf8')
      expect(template).toContain('brand new')
      expect(countFullReloads(sent)).toBeGreaterThanOrEqual(1)
    } finally {
      restore()
    }
  })

  test('deleting a component file removes its emitted template and reloads', async () => {
    // Widget.tsx and Widget.tmpl both exist already, from the previous
    // test (bun test runs a describe's tests in declaration order).
    expect(await readIfExists(join(templatesDir, 'Widget.tmpl'))).not.toBeNull()

    const { sent, restore } = captureWsSends(server)
    try {
      await rm(WIDGET_PATH)

      await waitFor(async () => (await readIfExists(join(templatesDir, 'Widget.tmpl'))) === null)
      expect(countFullReloads(sent)).toBeGreaterThanOrEqual(1)
    } finally {
      restore()
    }
  })
})
