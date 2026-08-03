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

async function startDevServer(templatesDir: string, extraServerOptions: Record<string, unknown> = {}) {
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

  test('the templates dir carries the dev-artifact marker while the dev server is running', async () => {
    const marker = await readIfExists(join(templatesDir, '.barefootjs-dev-build'))
    expect(marker).not.toBeNull()
    expect(marker).toContain('DEV BUILD OUTPUT')
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

      expect(sent.some(m => (m as { type?: string }).type === 'full-reload')).toBe(true)
    } finally {
      restore()
      await writeFile(COUNTER_PATH, originalCounterSource)
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
