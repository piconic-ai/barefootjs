/**
 * `templates` is optional on `BarefootViteOptions` for an adapter whose
 * `generate()` output is ALWAYS empty (CSR — see `@barefootjs/client`'s
 * `CSRAdapter`). These tests pin both halves of that contract directly
 * against `plugin.ts`'s hooks (no real Vite build — see
 * `e2e-vite-build.test.ts` for that):
 *
 *   - a CSR-shaped project (CSRAdapter, `templates` omitted) builds clean:
 *     no template files, no manifest.json, no thrown error — even for a
 *     component whose `ssrDefaults` output IS real (proving the guard is
 *     scoped to `markedTemplate` content specifically, not any adapter
 *     output — see `plugin.ts`'s `assertNoRealTemplateOutput` docstring).
 *   - a non-CSR adapter (one that actually emits template text) with
 *     `templates` omitted refuses loudly instead of silently dropping that
 *     output.
 */
import { describe, test, expect, afterEach } from 'bun:test'
import { mkdtemp, rm, mkdir, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { testAdapter } from '@barefootjs/jsx'
import { CSRAdapter } from '@barefootjs/client/csr-adapter'
import { barefoot } from '../plugin.ts'

// biome-ignore lint: hooks are called directly, bypassing Vite's own
// dispatch/typing — casting to `any` is the standard way to unit-test a
// Vite plugin's hooks in isolation.
type AnyPlugin = any

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

describe('templates: optional for an adapter with always-empty output (CSR)', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('builds clean with no template files, no manifest.json, and no error — including a component with real ssrDefaults', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-templates-optional-csr-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })
    // A signal with a literal initializer produces non-empty `ssrDefaults`
    // regardless of adapter (that computation reads IR metadata, not
    // `generate()`'s output) — this is the case that would wrongly trip an
    // over-broad guard checking ANY adapter output, not just the template.
    await writeFile(
      join(dir, 'src/components/Counter.tsx'),
      '\'use client\'\nimport { createSignal } from \'@barefootjs/client\'\nexport function Counter() {\n  const [count, setCount] = createSignal(0)\n  return <button onClick={() => setCount(count() + 1)}>{count()}</button>\n}\n',
    )

    const plugin: AnyPlugin = barefoot({
      adapter: new CSRAdapter(),
      components: ['src/components'],
    })
    await plugin.config({ root: dir }, { command: 'build', mode: 'production' })
    plugin.configResolved({ root: dir, base: '/', build: { outDir: 'dist', manifest: true } })
    await mkdir(join(dir, 'dist/.vite'), { recursive: true })
    await writeFile(
      join(dir, 'dist/.vite/manifest.json'),
      JSON.stringify({ 'src/components/Counter.tsx': { file: 'assets/Counter-abc123.js', isEntry: true } }),
    )

    await expect(plugin.writeBundle()).resolves.toBeUndefined()

    // No `templates` option was given, so there is no directory this
    // plugin could have written a template/manifest into in the first
    // place — the absence of a stray output directory anywhere under the
    // project root is the observable half of "no template files".
    expect(await pathExists(join(dir, 'manifest.json'))).toBe(false)
  })

  test('dev pass also builds clean with `templates` omitted', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-templates-optional-csr-dev-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })
    await writeFile(join(dir, 'src/components/Greeting.tsx'), 'export function Greeting() { return <p>Hi</p> }')

    const plugin: AnyPlugin = barefoot({
      adapter: new CSRAdapter(),
      components: ['src/components'],
    })
    await plugin.config({ root: dir }, { command: 'serve', mode: 'development' })
    plugin.configResolved({ root: dir, base: '/', build: { outDir: 'dist', manifest: true } })

    // Drive `configureServer`'s middleware-mode path (no `httpServer`)
    // directly, matching how `e2e-vite-dev.test.ts` exercises this without
    // a real listening server.
    const watchedDirs: string[] = []
    const listeners: Record<string, (arg: string) => void> = {}
    plugin.configureServer({
      httpServer: null,
      config: { logger: { error: () => {} } },
      watcher: {
        add: (d: string) => watchedDirs.push(d),
        on: (event: string, cb: (arg: string) => void) => { listeners[event] = cb },
      },
      ws: { send: () => {} },
    })

    // The initial pass runs asynchronously (middleware-mode branch) —
    // give it a tick to complete and surface any thrown error.
    await new Promise(r => setTimeout(r, 50))
    expect(watchedDirs).toContain(join(dir, 'src/components'))
  })
})

describe('templates: refuses loudly when omitted but the adapter produces a real template', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('writeBundle throws a clear error naming the offending file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'barefoot-plugin-templates-optional-refuse-'))
    await mkdir(join(dir, 'src/components'), { recursive: true })
    // `testAdapter` (unlike CSRAdapter) emits a REAL, non-empty template —
    // exactly the output that would be silently dropped without this guard.
    await writeFile(join(dir, 'src/components/Greeting.tsx'), 'export function Greeting() { return <p>Hi</p> }')

    const plugin: AnyPlugin = barefoot({
      adapter: testAdapter,
      components: ['src/components'],
    })
    await plugin.config({ root: dir }, { command: 'build', mode: 'production' })
    plugin.configResolved({ root: dir, base: '/', build: { outDir: 'dist', manifest: true } })
    await mkdir(join(dir, 'dist/.vite'), { recursive: true })
    await writeFile(join(dir, 'dist/.vite/manifest.json'), '{}')

    await expect(plugin.writeBundle()).rejects.toThrow(/templates/)
    await expect(plugin.writeBundle()).rejects.toThrow(/Greeting\.tsx/)
  })
})
